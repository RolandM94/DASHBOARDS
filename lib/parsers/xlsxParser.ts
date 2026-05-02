import readXlsxFile from "read-excel-file/browser";

export interface ParseResult {
  rows: Record<string, unknown>[];
  headers: string[];
}

export function parseXLSX(file: File): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const sheets = await readXlsxFile(e.target!.result as ArrayBuffer);
        const seenHeaders = new Set<string>();
        const rows: Record<string, unknown>[] = [];
        for (const sheet of sheets) {
          const [headerRow, ...dataRows] = sheet.data;
          const headers = (headerRow ?? [])
            .map((header, index) => String(header || `Column ${index + 1}`).trim());

          for (const header of headers) {
            if (header) seenHeaders.add(header);
          }

          for (const dataRow of dataRows) {
            const record: Record<string, unknown> = {};

            headers.forEach((header, index) => {
              if (!header) return;
              const value = dataRow[index];
              record[header] = value === undefined || value === null ? "" : value;
            });

            if (Object.values(record).some((value) => value !== "")) rows.push(record);
          }
        }

        resolve({ rows, headers: Array.from(seenHeaders) });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}
