import assert from "node:assert/strict";
import test from "node:test";
import { aggregateDataset } from "../lib/data/aggregateDataset.ts";

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
