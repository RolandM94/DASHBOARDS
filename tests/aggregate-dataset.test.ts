import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDataset } from "../lib/data/aggregateDataset.ts";
import { buildCacheKey, clearAllCaches, getCached, invalidateDatasetCache, setCache } from "../lib/data/aggregateCache.ts";

test("aggregateDataset uses supplied dataset fields without querying dataset metadata", async () => {
  let fromCalls = 0;
  let rpcCalls = 0;
  const serviceClient = {
    from() {
      fromCalls += 1;
      throw new Error("dataset metadata should be prefetched");
    },
    async rpc(name: string, params: Record<string, unknown>) {
      rpcCalls += 1;
      assert.equal(name, "aggregate_dataset");
      const metrics = params.p_metrics as Array<Record<string, unknown>>;
      assert.equal(metrics[0].fieldType, "integer");
      return { data: [{ "Average Score": 1.7 }], error: null };
    },
  };

  const result = await aggregateDataset(serviceClient as never, {
    datasetId: "dataset-1",
    datasetFields: [{ name: "score", type: "integer", sample: ["1"] }],
    metrics: [{ id: "metric-1", field: "score", label: "Average Score", aggregation: "AVG" }],
    dimensions: [],
  });

  assert.equal(fromCalls, 0);
  assert.equal(rpcCalls, 1);
  assert.deepEqual(result.data, [{ "Average Score": 2, _label: "Total" }]);
});

test("invalidateDatasetCache removes entries keyed by aggregate rpc dataset id", () => {
  clearAllCaches();
  const key = buildCacheKey({
    p_dataset_id: "dataset-1",
    p_dimensions: [],
    p_metrics: [],
    p_worksheet_filters: [],
    p_global_filters: {},
    p_smart_filter_conditions: [],
    p_sort: "natural",
  });

  setCache(key, { ok: true });
  assert.deepEqual(getCached(key), { ok: true });

  invalidateDatasetCache("dataset-1");
  assert.equal(getCached(key), undefined);
});

test("aggregateDataset applies calculated metrics after base aggregation", async () => {
  const serviceClient = {
    async rpc(_name: string, params: Record<string, unknown>) {
      const metrics = params.p_metrics as Array<Record<string, unknown>>;
      assert.equal(metrics.length, 2);
      assert.equal(metrics.some((metric) => metric.aggregation === "CALCULATED"), false);
      return {
        data: [
          { Region: "North", Revenue: 1000, Cost: 400 },
          { Region: "South", Revenue: 0, Cost: 50 },
        ],
        error: null,
      };
    },
  };

  const result = await aggregateDataset(serviceClient as never, {
    datasetId: "dataset-2",
    datasetFields: [
      { name: "revenue", type: "decimal", sample: ["100"] },
      { name: "cost", type: "decimal", sample: ["40"] },
    ],
    dimensions: [{ id: "d1", field: "region", label: "Region" }],
    metrics: [
      { id: "m1", field: "revenue", aggregation: "SUM", label: "Revenue" },
      { id: "m2", field: "cost", aggregation: "SUM", label: "Cost" },
      { id: "m3", field: "Margin", aggregation: "CALCULATED", label: "Margin", formula: "({Revenue} - {Cost}) / {Revenue} * 100" },
    ],
  });

  assert.deepEqual(result.yKeys, ["Revenue", "Cost", "Margin"]);
  assert.equal(result.data[0].Margin, 60);
  assert.equal(result.data[1].Margin, null);
});
