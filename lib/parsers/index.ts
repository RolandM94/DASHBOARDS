import { DatasetField, FieldType } from "@/types";
import { parseCSV } from "./csvParser";
import { parseXLSX } from "./xlsxParser";

export interface ParsedFile {
  rows: Record<string, unknown>[];
  fields: DatasetField[];
}

function inferType(values: unknown[]): FieldType {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (nonEmpty.length === 0) return "string";

  let numCount    = 0;
  let dateCount   = 0;
  let boolCount   = 0;
  let hasDecimal  = false;
  let hasTime     = false;

  for (const v of nonEmpty) {
    if (typeof v === "boolean") { boolCount++; continue; }

    if (typeof v === "number") {
      numCount++;
      if (!Number.isInteger(v)) hasDecimal = true;
      continue;
    }

    const s = String(v).trim();

    // Numeric check — allow integers and decimals
    if (/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(s)) {
      numCount++;
      if (s.includes(".")) hasDecimal = true;
      continue;
    }

    // Date/datetime check
    if (s.length > 5 && !isNaN(Date.parse(s))) {
      dateCount++;
      // Has time component if it contains T or hh:mm pattern
      if (s.includes("T") || /\d{2}:\d{2}/.test(s)) hasTime = true;
      continue;
    }
  }

  const total = nonEmpty.length;
  if (numCount  / total > 0.8) return hasDecimal ? "decimal" : "integer";
  if (dateCount / total > 0.8) return hasTime    ? "datetime" : "date";
  if (boolCount / total > 0.8) return "boolean";
  return "string";
}

function inferFields(rows: Record<string, unknown>[], headers: string[]): DatasetField[] {
  const sampleRows = rows.slice(0, 200);

  return headers.map((name) => {
    const values = sampleRows.map((r) => r[name]);
    const type = inferType(values);

    const unique = Array.from(
      new Set(values.filter((v) => v !== null && v !== undefined && v !== "").map(String))
    ).slice(0, 50);

    // inferredType = snapshot of inferred type, never overwritten by user edits
    return { name, type, inferredType: type, sample: unique };
  });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  let rows: Record<string, unknown>[];
  let headers: string[];

  if (ext === "csv") {
    ({ rows, headers } = await parseCSV(file));
  } else if (ext === "xlsx" || ext === "xls") {
    ({ rows, headers } = await parseXLSX(file));
  } else {
    throw new Error(`Unsupported file type: .${ext}`);
  }

  const fields = inferFields(rows, headers);
  return { rows, fields };
}
