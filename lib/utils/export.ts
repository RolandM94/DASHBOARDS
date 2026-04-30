import * as XLSX from "xlsx";

/**
 * Exports an array of row objects to an `.xlsx` file and triggers a browser
 * download. Uses SheetJS (xlsx) — zero additional runtime deps beyond the
 * package already in node_modules.
 *
 * @param data       Array of plain objects (keys become column headers)
 * @param filename   Download filename without extension
 * @param sheetName  Optional worksheet tab name (defaults to "Data")
 */
export function exportAsXLSX(
  data: Record<string, string | number>[],
  filename: string,
  sheetName?: string
): void {
  if (!data.length) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName ?? "Data").slice(0, 31));
  XLSX.writeFile(wb, `${sanitizeFilename(filename)}.xlsx`);
}

/**
 * Serialises the first <svg> found inside `container` to a PNG and triggers
 * a browser download. Works without any external dependencies — uses the
 * native Canvas API and XMLSerializer.
 *
 * @param container  DOM element that contains the Recharts <svg>
 * @param filename   Download filename without extension
 * @param title      Optional title text drawn above the chart
 * @param subtitle   Optional subtitle / meta text drawn below the title
 */
export function exportSvgAsPNG(
  container: HTMLElement,
  filename: string,
  title?: string,
  subtitle?: string
): void {
  const svgEl = container.querySelector("svg");
  if (!svgEl) return;

  const rect = svgEl.getBoundingClientRect();
  const svgW = Math.round(rect.width);
  const svgH = Math.round(rect.height);
  if (!svgW || !svgH) return;

  // ── Clone + patch the SVG for off-screen canvas rendering ─────────
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(svgW));
  clone.setAttribute("height", String(svgH));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Ensure every text node has an explicit font-family (CSS vars don't
  // survive SVG serialisation).
  clone.querySelectorAll<SVGElement>("text, tspan").forEach((el) => {
    if (!el.getAttribute("font-family")) {
      el.setAttribute("font-family", "Inter, system-ui, -apple-system, sans-serif");
    }
  });

  // ── Canvas dimensions ─────────────────────────────────────────────
  const PAD = 24;
  const TITLE_H = title ? 52 : PAD;
  const canvasW = svgW + PAD * 2;
  const canvasH = svgH + TITLE_H + PAD;
  const SCALE = 2; // 2× for crisp display on retina screens

  const canvas = document.createElement("canvas");
  canvas.width = canvasW * SCALE;
  canvas.height = canvasH * SCALE;

  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Title row
  if (title) {
    ctx.fillStyle = "#111827";
    ctx.font = "bold 14px Inter, system-ui, sans-serif";
    ctx.fillText(title, PAD, 22);
  }
  if (subtitle) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillText(subtitle, PAD, title ? 40 : PAD + 4);
  }

  // ── Draw SVG via blob URL ─────────────────────────────────────────
  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(blob);

  const img = new Image();

  img.onload = () => {
    ctx.drawImage(img, PAD, TITLE_H, svgW, svgH);
    URL.revokeObjectURL(svgUrl);

    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(pngBlob);
      a.download = `${sanitizeFilename(filename)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    }, "image/png");
  };

  img.onerror = () => URL.revokeObjectURL(svgUrl);
  img.src = svgUrl;
}

function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-z0-9_\-\s]/gi, "").replace(/\s+/g, "_") || "chart";
}
