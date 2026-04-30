import * as XLSX from "xlsx";

export interface ParseResult {
  rows: Record<string, unknown>[];
  headers: string[];
}

export function parseXLSX(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const seenHeaders = new Set<string>();
        const rows = workbook.SheetNames.flatMap((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
          for (const row of sheetRows) {
            for (const header of Object.keys(row)) seenHeaders.add(header);
          }
          return sheetRows;
        });
        const headers = Array.from(seenHeaders);
        resolve({ rows, headers });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}
