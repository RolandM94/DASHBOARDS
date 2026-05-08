import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_PDF_PREVIEW_ROW_LIMIT,
  aggregateDashboardPdfWidgets,
  fetchDashboardPdfPreviewRows,
} from "../lib/reports/dashboardPdfData.ts";
import type { DashboardWorksheetRow } from "../lib/auth/dashboardScope.ts";
import type { DatasetPreviewBlockConfig, WidgetBlockConfig } from "../types/index.ts";

const worksheet: DashboardWorksheetRow = {
  id: "worksheet-1",
  dataset_id: "dataset-1",
  name: "Sales",
  description: null,
  status: "saved",
  created_at: "2026-05-08T00:00:00.000Z",
  updated_at: "2026-05-08T00:00:00.000Z",
  config: {
    version: 1,
    activeSheetId: "sheet-1",
    sheets: [{
      id: "sheet-1",
      name: "By Region",
      metrics: [{ field: "sales", label: "Sales", aggregation: "SUM" }],
      dimensions: [{ field: "region", label: "Region" }],
      filters: [{ id: "region-filter", field: "region", operator: "not_empty", value: "", label: "Region" }],
      chartType: "bar",
      sort: "value_desc",
    }],
  },
};

test("aggregateDashboardPdfWidgets dedupes identical widget aggregate work", async () => {
  const widgetBlocks: WidgetBlockConfig[] = [
    { id: "widget-1", type: "widget", order: 0, worksheetId: "worksheet-1", sheetId: "sheet-1" },
    { id: "widget-2", type: "widget", order: 1, worksheetId: "worksheet-1", sheetId: "sheet-1" },
  ];
  let aggregateCalls = 0;

  const results = await aggregateDashboardPdfWidgets({
    serviceClient: {} as never,
    widgetBlocks,
    worksheets: [worksheet],
    extraFilters: [],
    smartFilters: [],
    cleanGlobalFilters: {},
    datasetFieldsById: new Map([["dataset-1", [{ name: "sales", type: "integer", sample: ["100"] }]]]),
    aggregate: async (_serviceClient, input) => {
      aggregateCalls += 1;
      assert.deepEqual(input.datasetFields, [{ name: "sales", type: "integer", sample: ["100"] }]);
      return {
        xKey: "Region",
        yKeys: ["Sales"],
        data: [{ Region: "North", Sales: 100 }],
      };
    },
  });

  assert.equal(aggregateCalls, 1);
  assert.deepEqual(results.map((result) => result.blockId), ["widget-1", "widget-2"]);
  assert.deepEqual(results.map((result) => result.data?.data[0]), [
    { Region: "North", Sales: 100 },
    { Region: "North", Sales: 100 },
  ]);
});

test("fetchDashboardPdfPreviewRows caps preview queries to the rendered PDF limit", async () => {
  const previewBlocks: DatasetPreviewBlockConfig[] = [
    { id: "preview-1", type: "preview", order: 0, datasetId: "dataset-1", rowLimit: 1000 },
  ];
  let requestedLimit = 0;
  const serviceClient = {
    from(table: string) {
      assert.equal(table, "dataset_rows");
      return {
        select(columns: string) {
          assert.equal(columns, "data");
          return {
            eq(column: string, value: string) {
              assert.equal(column, "dataset_id");
              assert.equal(value, "dataset-1");
              return {
                order(columnName: string, options: { ascending: boolean }) {
                  assert.equal(columnName, "row_index");
                  assert.deepEqual(options, { ascending: true });
                  return {
                    async limit(limit: number) {
                      requestedLimit = limit;
                      return { data: [{ data: { row: 1 } }], error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const results = await fetchDashboardPdfPreviewRows(serviceClient as never, previewBlocks);

  assert.equal(requestedLimit, DASHBOARD_PDF_PREVIEW_ROW_LIMIT);
  assert.deepEqual(results, [{ blockId: "preview-1", rows: [{ row: 1 }] }]);
});
