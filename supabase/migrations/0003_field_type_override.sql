-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0003 — field type override (Change Data Type feature)
-- Run in Supabase SQL Editor AFTER 0002_dataset_rows.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Backfill inferredType on all existing datasets.fields ─────────────────
-- For every DatasetField in the JSONB array, snapshot the current type as
-- inferredType so "Default" can always reset back to the original inference.

update datasets
set fields = (
  select jsonb_agg(
    f || jsonb_build_object('inferredType', f->>'type')
  order by ordinality)
  from jsonb_array_elements(fields) with ordinality as f
)
where fields is not null
  and fields != '[]'::jsonb;

-- ── 2. check_field_type_compatibility ────────────────────────────────────────
-- Returns { total, compatible, incompatible, examples } for a proposed type
-- change. Used by the API to decide whether to require a force-flag.

create or replace function check_field_type_compatibility(
  p_dataset_id  uuid,
  p_field       text,
  p_target_type text   -- 'integer' | 'decimal' | 'string' | 'date' | 'datetime'
)
returns jsonb
language plpgsql
set search_path = public
as $func$
declare
  v_total        bigint;
  v_incompatible bigint;
  v_examples     jsonb;
begin
  -- Count non-empty values
  select count(*) into v_total
  from dataset_rows
  where dataset_id = p_dataset_id
    and data->>p_field is not null
    and data->>p_field != '';

  case p_target_type

    when 'integer', 'decimal' then
      -- Incompatible = value cannot be parsed as a number
      -- Allows: integers, decimals, negative, scientific notation basics
      select count(*) into v_incompatible
      from dataset_rows
      where dataset_id = p_dataset_id
        and data->>p_field is not null
        and data->>p_field != ''
        and (data->>p_field) !~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$';

      select coalesce(jsonb_agg(v), '[]'::jsonb) into v_examples
      from (
        select distinct data->>p_field as v
        from dataset_rows
        where dataset_id = p_dataset_id
          and data->>p_field is not null
          and data->>p_field != ''
          and (data->>p_field) !~ '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$'
        limit 5
      ) t;

    when 'date', 'datetime' then
      -- Incompatible = value does not start with a recognisable date pattern
      -- Accepts: YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY, Month names
      select count(*) into v_incompatible
      from dataset_rows
      where dataset_id = p_dataset_id
        and data->>p_field is not null
        and data->>p_field != ''
        and (data->>p_field) !~ '^\d{4}[-/]\d{2}[-/]\d{2}'
        and (data->>p_field) !~ '^\d{2}[-/]\d{2}[-/]\d{4}'
        and (data->>p_field) !~ '^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

      select coalesce(jsonb_agg(v), '[]'::jsonb) into v_examples
      from (
        select distinct data->>p_field as v
        from dataset_rows
        where dataset_id = p_dataset_id
          and data->>p_field is not null
          and data->>p_field != ''
          and (data->>p_field) !~ '^\d{4}[-/]\d{2}[-/]\d{2}'
          and (data->>p_field) !~ '^\d{2}[-/]\d{2}[-/]\d{4}'
          and (data->>p_field) !~ '^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
        limit 5
      ) t;

    else
      -- 'string' — always fully compatible
      v_incompatible := 0;
      v_examples := '[]'::jsonb;

  end case;

  return jsonb_build_object(
    'total',        v_total,
    'compatible',   v_total - v_incompatible,
    'incompatible', v_incompatible,
    'examples',     v_examples
  );
end;
$func$;

grant execute on function check_field_type_compatibility to service_role;

-- ── 3. update_field_type ──────────────────────────────────────────────────────
-- Updates a single field's type within datasets.fields JSONB array.
-- Preserves all other field properties (name, sample, inferredType, etc.).
-- Ownership is enforced via user_id check.

create or replace function update_field_type(
  p_dataset_id uuid,
  p_user_id    uuid,
  p_field      text,
  p_new_type   text
)
returns jsonb   -- returns the updated fields array
language plpgsql
set search_path = public
as $func$
declare
  v_fields jsonb;
begin
  -- Verify ownership
  select fields into v_fields
  from datasets
  where id = p_dataset_id
    and user_id = p_user_id
  for update;

  if v_fields is null then
    raise exception 'dataset_not_found';
  end if;

  -- Patch the type on the matching field, leave all others unchanged
  select jsonb_agg(
    case when f->>'name' = p_field
      then f || jsonb_build_object('type', p_new_type)
      else f
    end
  order by ordinality)
  into v_fields
  from jsonb_array_elements(v_fields) with ordinality as f;

  -- Persist
  update datasets
  set fields = v_fields
  where id = p_dataset_id
    and user_id = p_user_id;

  return v_fields;
end;
$func$;

grant execute on function update_field_type to service_role;

-- ── 4. aggregate_dataset — updated to support integer AVG rounding ────────────
-- Re-creates the function from 0002 with one change: if a metric carries
-- fieldType = 'integer', AVG is wrapped in ROUND(..., 0) so whole-number
-- fields don't return decimals.

create or replace function aggregate_dataset(
  p_dataset_id        uuid,
  p_dimensions        jsonb default '[]'::jsonb,
  p_metrics           jsonb default '[]'::jsonb,
  p_worksheet_filters jsonb default '[]'::jsonb,
  p_global_filters    jsonb default '{}'::jsonb,
  p_sort              text  default 'natural'
)
returns jsonb
language plpgsql
set search_path = public
as $func$
declare
  v_sql         text;
  v_result      jsonb;
  v_sel         text[] := '{}';
  v_grp         text[] := '{}';
  v_where       text[] := '{}';
  v_dim         jsonb;
  v_met         jsonb;
  v_flt         jsonb;
  v_key         text;
  v_val         jsonb;
  v_first_met   text := '';
  v_first_dim   text := '';
  v_limit       text := '';
begin
  -- Base filter
  v_where := array_append(v_where, format($q$dataset_id = %L$q$, p_dataset_id));

  -- Dimensions
  for v_dim in select value from jsonb_array_elements(p_dimensions) loop
    v_sel := array_append(v_sel,
      format($q$coalesce(data->>%L, '') as %I$q$, v_dim->>'field', v_dim->>'label'));
    v_grp := array_append(v_grp, format($q$data->>%L$q$, v_dim->>'field'));
    if v_first_dim = '' then v_first_dim := v_dim->>'field'; end if;
  end loop;

  -- Metrics
  for v_met in select value from jsonb_array_elements(p_metrics) loop
    if v_first_met = '' then v_first_met := v_met->>'label'; end if;
    case upper(v_met->>'aggregation')
      when 'SUM' then
        v_sel := array_append(v_sel,
          format($q$sum(coalesce(nullif(data->>%L,'')::numeric,0)) as %I$q$,
            v_met->>'field', v_met->>'label'));
      when 'COUNT' then
        v_sel := array_append(v_sel,
          format($q$count(case when data->>%L is not null and data->>%L != '' then 1 end) as %I$q$,
            v_met->>'field', v_met->>'field', v_met->>'label'));
      when 'AVG' then
        -- For integer fields, round the average to the nearest whole number
        if (v_met->>'fieldType') = 'integer' then
          v_sel := array_append(v_sel,
            format($q$round(avg(nullif(data->>%L,'')::numeric), 0) as %I$q$,
              v_met->>'field', v_met->>'label'));
        else
          v_sel := array_append(v_sel,
            format($q$avg(nullif(data->>%L,'')::numeric) as %I$q$,
              v_met->>'field', v_met->>'label'));
        end if;
      when 'MIN' then
        v_sel := array_append(v_sel,
          format($q$min(nullif(data->>%L,'')::numeric) as %I$q$,
            v_met->>'field', v_met->>'label'));
      when 'MAX' then
        v_sel := array_append(v_sel,
          format($q$max(nullif(data->>%L,'')::numeric) as %I$q$,
            v_met->>'field', v_met->>'label'));
      else
        v_sel := array_append(v_sel,
          format($q$sum(coalesce(nullif(data->>%L,'')::numeric,0)) as %I$q$,
            v_met->>'field', v_met->>'label'));
    end case;
  end loop;

  -- Nothing to select → return empty
  if array_length(v_sel, 1) is null then
    return '[]'::jsonb;
  end if;

  -- Worksheet filters
  for v_flt in select value from jsonb_array_elements(p_worksheet_filters) loop
    case v_flt->>'operator'
      when 'equals' then
        v_where := array_append(v_where,
          format($q$data->>%L = %L$q$, v_flt->>'field', v_flt->>'value'));
      when 'not_equals' then
        v_where := array_append(v_where,
          format($q$(data->>%L is distinct from %L)$q$, v_flt->>'field', v_flt->>'value'));
      when 'contains' then
        v_where := array_append(v_where,
          format($q$data->>%L ilike %L$q$, v_flt->>'field', '%' || (v_flt->>'value') || '%'));
      when 'gt' then
        v_where := array_append(v_where,
          format($q$nullif(data->>%L,'')::numeric > %L::numeric$q$, v_flt->>'field', v_flt->>'value'));
      when 'gte' then
        v_where := array_append(v_where,
          format($q$nullif(data->>%L,'')::numeric >= %L::numeric$q$, v_flt->>'field', v_flt->>'value'));
      when 'lt' then
        v_where := array_append(v_where,
          format($q$nullif(data->>%L,'')::numeric < %L::numeric$q$, v_flt->>'field', v_flt->>'value'));
      when 'lte' then
        v_where := array_append(v_where,
          format($q$nullif(data->>%L,'')::numeric <= %L::numeric$q$, v_flt->>'field', v_flt->>'value'));
      when 'in' then
        v_where := array_append(v_where,
          format($q$data->>%L = any(array(select jsonb_array_elements_text(%L::jsonb)))$q$,
            v_flt->>'field', v_flt->'value'));
      else null;
    end case;
  end loop;

  -- Global canvas filters
  for v_key, v_val in select * from jsonb_each(p_global_filters) loop
    if jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) > 0 then
      v_where := array_append(v_where,
        format($q$data->>%L = any(array(select jsonb_array_elements_text(%L::jsonb)))$q$,
          v_key, v_val));
    elsif jsonb_typeof(v_val) = 'string' and (v_val #>> '{}') != '' then
      v_where := array_append(v_where,
        format($q$data->>%L = %L$q$, v_key, v_val #>> '{}'));
    end if;
  end loop;

  -- Assemble core SQL
  v_sql := format(
    $q$select %s from dataset_rows where %s$q$,
    array_to_string(v_sel,   ', '),
    array_to_string(v_where, ' and ')
  );

  if array_length(v_grp, 1) is not null then
    v_sql := v_sql || format($q$ group by %s$q$, array_to_string(v_grp, ', '));
  end if;

  -- Sort order
  case p_sort
    when 'value_asc' then
      if v_first_met != '' then
        v_sql := v_sql || format($q$ order by %I asc nulls last$q$, v_first_met);
      end if;
    when 'value_desc' then
      if v_first_met != '' then
        v_sql := v_sql || format($q$ order by %I desc nulls last$q$, v_first_met);
      end if;
    when 'top_5' then
      if v_first_met != '' then
        v_sql := v_sql || format($q$ order by %I desc nulls last$q$, v_first_met);
        v_limit := ' limit 5';
      end if;
    when 'top_10' then
      if v_first_met != '' then
        v_sql := v_sql || format($q$ order by %I desc nulls last$q$, v_first_met);
        v_limit := ' limit 10';
      end if;
    when 'top_20' then
      if v_first_met != '' then
        v_sql := v_sql || format($q$ order by %I desc nulls last$q$, v_first_met);
        v_limit := ' limit 20';
      end if;
    when 'alpha_asc' then
      if v_first_dim != '' then
        v_sql := v_sql || format($q$ order by data->>%L asc nulls last$q$, v_first_dim);
      end if;
    when 'alpha_desc' then
      if v_first_dim != '' then
        v_sql := v_sql || format($q$ order by data->>%L desc nulls last$q$, v_first_dim);
      end if;
    else null;
  end case;

  -- top_N sorts carry their own LIMIT; all other sorts get a 50k safety cap
  if v_limit != '' then
    v_sql := v_sql || v_limit;
  else
    v_sql := v_sql || ' limit 50000';
  end if;

  execute format(
    $q$select coalesce(jsonb_agg(t), '[]'::jsonb) from (%s) t$q$, v_sql
  ) into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$func$;
