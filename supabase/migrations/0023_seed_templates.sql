-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0023 — Seed dashboard templates
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

insert into dashboard_templates (
  title, description, category, featured, downloads, data, sample_dataset, sample_dataset_fields
) values
(
  'SaaS Metrics Dashboard',
  'Track MRR, churn rate, LTV, CAC, and active users. Pre-configured with sample SaaS data.',
  'saas', true, 0,
  '{
    "sheets": [
      {"name": "Revenue Overview", "metrics":[{"id":"m1","field":"Revenue","aggregation":"SUM","label":"Total Revenue"}], "dimensions":[{"id":"d1","field":"Month","label":"Month"}], "filters":[], "chartType":"line", "sort":"natural"},
      {"name": "Customer KPIs", "metrics":[{"id":"m1","field":"Active Users","aggregation":"SUM","label":"Active Users"},{"id":"m2","field":"MRR","aggregation":"SUM","label":"MRR"}], "dimensions":[], "filters":[], "chartType":"kpi", "sort":"natural"}
    ],
    "blocks": [
      {"id":"b1","type":"widget","worksheetId":"ws1","sheetId":"Revenue Overview","title":"Revenue Trend","order":0},
      {"id":"b2","type":"widget","worksheetId":"ws1","sheetId":"Customer KPIs","title":"Key Metrics","order":1}
    ],
    "layout": [
      {"i":"b1","x":0,"y":0,"w":8,"h":14},
      {"i":"b2","x":8,"y":0,"w":4,"h":14}
    ]
  }'::jsonb,
  '[]'::jsonb,
  '[{"name":"Month","type":"string"},{"name":"Revenue","type":"decimal"},{"name":"MRR","type":"decimal"},{"name":"Churn Rate","type":"decimal"},{"name":"Active Users","type":"integer"},{"name":"CAC","type":"decimal"},{"name":"LTV","type":"decimal"}]'::jsonb
),
(
  'Marketing Analytics',
  'Campaign performance, channel attribution, and ROI tracking. Perfect for marketing teams.',
  'marketing', true, 0,
  '{
    "sheets": [
      {"name":"Campaign ROI", "metrics":[{"id":"m1","field":"ROI","aggregation":"AVG","label":"Avg ROI"}], "dimensions":[{"id":"d1","field":"Campaign","label":"Campaign"}], "filters":[], "chartType":"bar", "sort":"value_desc"},
      {"name":"Channel Breakdown", "metrics":[{"id":"m1","field":"Conversions","aggregation":"SUM","label":"Conversions"},{"id":"m2","field":"Spend","aggregation":"SUM","label":"Total Spend"}], "dimensions":[{"id":"d1","field":"Channel","label":"Channel"}], "filters":[], "chartType":"grouped_bar", "sort":"value_desc"}
    ],
    "blocks": [
      {"id":"b1","type":"widget","worksheetId":"ws1","sheetId":"Campaign ROI","title":"ROI by Campaign","order":0},
      {"id":"b2","type":"widget","worksheetId":"ws1","sheetId":"Channel Breakdown","title":"Channel Performance","order":1}
    ],
    "layout": [
      {"i":"b1","x":0,"y":0,"w":6,"h":14},
      {"i":"b2","x":6,"y":0,"w":6,"h":14}
    ]
  }'::jsonb,
  '[]'::jsonb,
  '[{"name":"Campaign","type":"string"},{"name":"Channel","type":"string"},{"name":"Impressions","type":"integer"},{"name":"Clicks","type":"integer"},{"name":"Conversions","type":"integer"},{"name":"Spend","type":"decimal"},{"name":"ROI","type":"decimal"}]'::jsonb
),
(
  'Project Tracker',
  'Monitor project milestones, budget utilisation, completion status, and team workload.',
  'business', true, 0,
  '{
    "sheets": [
      {"name":"Budget Overview", "metrics":[{"id":"m1","field":"Approved Budget","aggregation":"SUM","label":"Total Budget"},{"id":"m2","field":"Actual Spend","aggregation":"SUM","label":"Total Spent"}], "dimensions":[{"id":"d1","field":"Project","label":"Project"}], "filters":[], "chartType":"bar", "sort":"value_desc"},
      {"name":"Status Breakdown", "metrics":[{"id":"m1","field":"Approved Budget","aggregation":"SUM","label":"Budget"}], "dimensions":[{"id":"d1","field":"Status","label":"Status"}], "filters":[], "chartType":"pie", "sort":"natural"}
    ],
    "blocks": [
      {"id":"b1","type":"widget","worksheetId":"ws1","sheetId":"Budget Overview","title":"Budget vs Actual","order":0},
      {"id":"b2","type":"widget","worksheetId":"ws1","sheetId":"Status Breakdown","title":"Projects by Status","order":1}
    ],
    "layout": [
      {"i":"b1","x":0,"y":0,"w":7,"h":14},
      {"i":"b2","x":7,"y":0,"w":5,"h":14}
    ]
  }'::jsonb,
  '[]'::jsonb,
  '[{"name":"Project","type":"string"},{"name":"Status","type":"string"},{"name":"Approved Budget","type":"decimal"},{"name":"Actual Spend","type":"decimal"},{"name":"Completion","type":"decimal"},{"name":"Team","type":"string"}]'::jsonb
)
on conflict do nothing;
