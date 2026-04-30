import Papa from "papaparse";

export interface ParseResult {
  rows: Record<string, unknown>[];
  headers: string[];
}

export function parseCSV(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        resolve({
          rows: results.data as Record<string, unknown>[],
          headers,
        });
      },
      error: (error) => reject(error),
    });
  });
}
