-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0020 — Fix aggregate query timeouts on large datasets
-- 1. Increases statement_timeout in aggregate_dataset (120s instead of default 30s)
-- 2. Adds GIN index on dataset_rows.data for faster JSONB operations
-- 3. Increases statement_timeout in get_distinct_values
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Increase statement_timeout in aggregate_dataset ────────────────────
-- The default Supabase timeout (30s) is too low for large datasets where
-- JSONB extraction + grouping needs more time. No behavioural change —
-- identical logic, just a higher timeout.

create or replace function aggregate_dataset(
  p_dataset_id              uuid,
  p_dimensions              jsonb default '[]'::jsonb,
  p_metrics                 jsonb default '[]'::jsonb,
  p_worksheet_filters       jsonb default '[]'::jsonb,
  p_global_filters          jsonb default '{}'::jsonb,
  p_smart_filter_conditions text[] default '{}'::text[],
  p_sort                    text  default 'natural'
)
returns jsonb
language plpgsql
set search_path = public
set statement_timeout = '120s'
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
  v_num_regex   text := '^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$';
  i             integer;
begin
  v_where := array_append(v_where, format($q$dataset_id = %L$q$, p_dataset_id));

  for v_dim in select value from jsonb_array_elements(p_dimensions) loop
    v_sel := array_append(v_sel,
      format($q$coalesce(data->>%L, '') as %I$q$, v_dim->>'field', v_dim->>'label'));
    v_grp := array_append(v_grp, format($q$data->>%L$q$, v_dim->>'field'));
    if v_first_dim = '' then v_first_dim := v_dim->>'field'; end if;
  end loop;

  for v_met in select value from jsonb_array_elements(p_metrics) loop
    if v_first_met = '' then v_first_met := v_met->>'label'; end if;
    case upper(v_met->>'aggregation')
      when 'SUM' then
        v_sel := array_append(v_sel,
          format($q$coalesce(sum(case when data->>%L ~ %L then (data->>%L)::numeric end), 0) as %I$q$,
            v_met->>'field', v_num_regex, v_met->>'field', v_met->>'label'));
      when 'COUNT' then
        v_sel := array_append(v_sel,
          format($q$count(case when data->>%L is not null and data->>%L != '' then 1 end) as %I$q$,
            v_met->>'field', v_met->>'field', v_met->>'label'));
      when 'AVG' then
        if (v_met->>'fieldType') = 'integer' then
          v_sel := array_append(v_sel,
            format($q$round(avg(case when data->>%L ~ %L then (data->>%L)::numeric end), 0) as %I$q$,
              v_met->>'field', v_num_regex, v_met->>'field', v_met->>'label'));
        else
          v_sel := array_append(v_sel,
            format($q$avg(case when data->>%L ~ %L then (data->>%L)::numeric end) as %I$q$,
              v_met->>'field', v_num_regex, v_met->>'field', v_met->>'label'));
        end if;
      when 'MIN' then
        v_sel := array_append(v_sel,
          format($q$min(case when data->>%L ~ %L then (data->>%L)::numeric end) as %I$q$,
            v_met->>'field', v_num_regex, v_met->>'field', v_met->>'label'));
      when 'MAX' then
        v_sel := array_append(v_sel,
          format($q$max(case when data->>%L ~ %L then (data->>%L)::numeric end) as %I$q$,
            v_met->>'field', v_num_regex, v_met->>'field', v_met->>'label'));
      else
        v_sel := array_append(v_sel,
          format($q$coalesce(sum(case when data->>%L ~ %L then (data->>%L)::numeric end), 0) as %I$q$,
            v_met->>'field', v_num_regex, v_met->>'field', v_met->>'label'));
    end case;
  end loop;

  if array_length(v_sel, 1) is null then
    return '[]'::jsonb;
  end if;

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
          format($q$(case when data->>%L ~ %L then (data->>%L)::numeric end) > (case when %L ~ %L then %L::numeric end)$q$,
            v_flt->>'field', v_num_regex, v_flt->>'field', v_flt->>'value', v_num_regex, v_flt->>'value'));
      when 'gte' then
        v_where := array_append(v_where,
          format($q$(case when data->>%L ~ %L then (data->>%L)::numeric end) >= (case when %L ~ %L then %L::numeric end)$q$,
            v_flt->>'field', v_num_regex, v_flt->>'field', v_flt->>'value', v_num_regex, v_flt->>'value'));
      when 'lt' then
        v_where := array_append(v_where,
          format($q$(case when data->>%L ~ %L then (data->>%L)::numeric end) < (case when %L ~ %L then %L::numeric end)$q$,
            v_flt->>'field', v_num_regex, v_flt->>'field', v_flt->>'value', v_num_regex, v_flt->>'value'));
      when 'lte' then
        v_where := array_append(v_where,
          format($q$(case when data->>%L ~ %L then (data->>%L)::numeric end) <= (case when %L ~ %L then %L::numeric end)$q$,
            v_flt->>'field', v_num_regex, v_flt->>'field', v_flt->>'value', v_num_regex, v_flt->>'value'));
      when 'in' then
        v_where := array_append(v_where,
          format($q$data->>%L = any(array(select jsonb_array_elements_text(%L::jsonb)))$q$,
            v_flt->>'field', v_flt->'value'));
      else null;
    end case;
  end loop;

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

  -- ── Smart filter conditions ────────────────────────────────────
  if p_smart_filter_conditions is not null and array_length(p_smart_filter_conditions, 1) > 0 then
    for i in 1..array_length(p_smart_filter_conditions, 1) loop
      if p_smart_filter_conditions[i] is not null and p_smart_filter_conditions[i] != '' then
        v_where := array_append(v_where, format('(%s)', p_smart_filter_conditions[i]));
      end if;
    end loop;
  end if;

  v_sql := format(
    $q$select %s from dataset_rows where %s$q$,
    array_to_string(v_sel,   ', '),
    array_to_string(v_where, ' and ')
  );

  if array_length(v_grp, 1) is not null then
    v_sql := v_sql || format($q$ group by %s$q$, array_to_string(v_grp, ', '));
  end if;

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

grant execute on function aggregate_dataset(uuid, jsonb, jsonb, jsonb, jsonb, text[], text) to service_role;

-- ── 2. GIN index on dataset_rows.data ─────────────────────────────────────
create index if not exists dataset_rows_data_gin_idx
  on dataset_rows using gin (data jsonb_path_ops);

-- ── 3. Increase statement_timeout in get_distinct_values ──────────────────
create or replace function get_distinct_values(
  p_dataset_ids uuid[],
  p_field       text,
  p_limit       integer default 500
)
returns jsonb
language plpgsql
set search_path = public
set statement_timeout = '120s'
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

grant execute on function get_distinct_values(uuid[], text, integer) to service_role;
