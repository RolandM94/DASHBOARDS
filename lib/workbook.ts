import type { WorkbookConfig, WorkbookSheet, Worksheet, WorksheetConfig } from "@/types";
import { generateId } from "@/lib/utils/ids";

export const blankSheetConfig: WorksheetConfig = {
  metrics: [],
  dimensions: [],
  filters: [],
  chartType: "bar",
  sort: "natural",
};

function isWorkbookConfig(config: Worksheet["config"] | unknown): config is WorkbookConfig {
  return Boolean(
    config &&
    typeof config === "object" &&
    "sheets" in config &&
    Array.isArray((config as { sheets?: unknown }).sheets)
  );
}

function sheetFromLegacyConfig(
  config: WorksheetConfig,
  fallback: { name?: string; description?: string; id?: string } = {},
): WorkbookSheet {
  return {
    ...blankSheetConfig,
    ...config,
    id: fallback.id ?? generateId(),
    name: fallback.name?.trim() || "Sheet 1",
    description: fallback.description?.trim() || undefined,
  };
}

export function createBlankSheet(name = "Untitled Sheet"): WorkbookSheet {
  return {
    ...blankSheetConfig,
    id: generateId(),
    name,
  };
}

export function normalizeWorkbookConfig(
  config: Worksheet["config"] | undefined,
  fallback: { name?: string; description?: string } = {},
): WorkbookConfig {
  if (!config) {
    const sheet = createBlankSheet(fallback.name || "Sheet 1");
    return { version: 1, activeSheetId: sheet.id, sheets: [sheet] };
  }

  if (!isWorkbookConfig(config)) {
    const sheet = sheetFromLegacyConfig(config as WorksheetConfig, {
      name: fallback.name,
      description: fallback.description,
    });
    return { version: 1, activeSheetId: sheet.id, sheets: [sheet] };
  }

  const sheets = config.sheets.length > 0
    ? config.sheets.map((sheet, index) => ({
      ...blankSheetConfig,
      ...sheet,
      id: sheet.id || generateId(),
      name: sheet.name?.trim() || `Sheet ${index + 1}`,
      description: sheet.description?.trim() || undefined,
    }))
    : [createBlankSheet(fallback.name || "Sheet 1")];

  const activeSheetId = sheets.some((sheet) => sheet.id === config.activeSheetId)
    ? config.activeSheetId
    : sheets[0].id;

  return { version: 1, activeSheetId, sheets };
}

export function getWorkbookSheets(worksheet: Worksheet): WorkbookSheet[] {
  return normalizeWorkbookConfig(worksheet.config, {
    name: worksheet.name,
    description: worksheet.description,
  }).sheets;
}

export function getActiveWorkbookSheet(worksheet: Worksheet): WorkbookSheet {
  const workbook = normalizeWorkbookConfig(worksheet.config, {
    name: worksheet.name,
    description: worksheet.description,
  });
  return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook.sheets[0];
}

export function getWorkbookSheet(worksheet: Worksheet, sheetId?: string): WorkbookSheet {
  const workbook = normalizeWorkbookConfig(worksheet.config, {
    name: worksheet.name,
    description: worksheet.description,
  });
  return workbook.sheets.find((sheet) => sheet.id === sheetId) ?? workbook.sheets[0];
}

export function getWorkbookDisplayName(worksheet: Worksheet): string {
  return worksheet.name || "Untitled Workbook";
}
