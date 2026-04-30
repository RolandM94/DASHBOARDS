-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002 — scalable row storage + server-side aggregation
-- Run this in your Supabase project's SQL Editor AFTER 0001_init.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Dedicated rows table (replaces the jsonb array on datasets) ────────────

create table if not exists dataset_rows (
  id         uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references datasets on delete cascade,
  row_index  integer not null,
  data       jsonb not null
);

create index if not exists dataset_rows_dataset_idx on dataset_rows (dataset_id);
create index if not exists dataset_rows_order_idx   on dataset_rows (dataset_id, row_index);

-- RLS: row access mirrors dataset ownership
alter table dataset_rows enable row level security;

drop policy if exists "dataset_rows: owner only" on dataset_rows;

create policy "dataset_rows: owner only"
  on dataset_rows for all
  using  (exists (select 1 from datasets where id = dataset_id and user_id = auth.uid()))
  with check (exists (select 1 from datasets where id = dataset_id and user_id = auth.uid()));

-- ── 2. Drop the old inline rows column from datasets ─────────────────────────

alter table datasets drop column if exists rows;

-- ── 3. aggregate_dataset — server-side GROUP BY in plpgsql ───────────────────

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
        v_sel := array_append(v_sel,
          format($q$avg(nullif(data->>%L,'')::numeric) as %I$q$,
            v_met->>'field', v_met->>'label'));
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

-- ── 4. get_distinct_values — for filter block dropdowns ───────────────────────

create or replace function get_distinct_values(
  p_dataset_ids uuid[],
  p_field       text,
  p_limit       integer default 500
)
returns jsonb
language plpgsql
set search_path = public
as $func$
declare
  v_result jsonb;
begin
  execute format(
    $q$
    select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
    from (
      select distinct data->>%L as v
      from dataset_rows
      where dataset_id = any(%L::uuid[])
        and data->>%L is not null
        and data->>%L != ''
      limit %s
    ) t
    $q$,
    p_field, p_dataset_ids, p_field, p_field, p_limit
  ) into v_result;

  return coalesce(v_result, '[]'::jsonb);
end;
$func$;
