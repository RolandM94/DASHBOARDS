"use client";

import { useState } from "react";
import { ChartType, ChartDataPoint, ResolvedChartData } from "@/types";
import { MapChartRenderer } from "./MapChartRenderer";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Sector,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceArea,
} from "recharts";
import type { BarShapeProps } from "recharts";
import { cn } from "@/lib/utils";

// Bright, clean categorical palette
const COLORS = [
  "#4ECDC4", // teal
  "#FFD166", // amber
  "#6BCB77", // green
  "#FF8FAB", // pink
  "#4D96FF", // blue
  "#FF9F43", // orange
  "#A29BFE", // lavender
  "#55EFC4", // mint
  "#FDCB6E", // gold
  "#74B9FF", // sky
];

const MIN_PX_PER_BAR = 80;   // wider so -45° labels fit within each bar's slot
const MIN_PX_PER_POINT = 52;
const SCROLL_THRESHOLD = 10; // start scrolling sooner to keep bars spacious
const STRAIGHT_X_AXIS_HEIGHT = 48;
const ANGLED_X_AXIS_HEIGHT = 132;

// Extra right margin so angled X-axis labels at the right edge are never clipped.
const CHART_MARGIN        = { top: 12,  right: 44, bottom: 0, left: 4 };
const CHART_MARGIN_GROUPS = { top: 34,  right: 44, bottom: 0, left: 4 };  // extra top for group headers
const GROUP_FILLS         = ["#f8fafc", "transparent"] as const;

// ── Compound x-axis helpers ──────────────────────────────────────
// Multi-dimension data arrives as "GroupName · SubLabel" (aggregate route line 133).
const COMPOUND_SEP = " · ";

type CompoundGroup = { name: string; items: string[] };

function parseCompoundGroups(data: ChartDataPoint[], xKey: string): CompoundGroup[] | null {
  if (!data.length) return null;
  const firstVal = String(data[0][xKey] ?? "");
  if (!firstVal.includes(COMPOUND_SEP)) return null;

  const groups: CompoundGroup[] = [];
  for (const row of data) {
    const full = String(row[xKey] ?? "");
    const sepIdx = full.indexOf(COMPOUND_SEP);
    const groupName = sepIdx >= 0 ? full.slice(0, sepIdx) : full;
    const last = groups[groups.length - 1];
    if (!last || last.name !== groupName) {
      groups.push({ name: groupName, items: [full] });
    } else {
      last.items.push(full);
    }
  }
  return groups.length > 1 ? groups : null;
}

// Custom tick that shows only the sub-label portion of a compound x value.
function CompoundXTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x == null || y == null || !payload) return null;
  const full = payload.value ?? "";
  const sepIdx = full.indexOf(COMPOUND_SEP);
  const label = sepIdx >= 0 ? full.slice(sepIdx + COMPOUND_SEP.length) : full;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0} y={0} dy={14}
        textAnchor="end"
        transform="rotate(-45)"
        fill="#6b7280"
        fontSize={11}
      >
        {truncate(label, 28)}
      </text>
    </g>
  );
}

// Custom label for ReferenceArea group bands.
// Recharts clones this element and injects viewBox = { x, y, width, height }
// (the band's bounds in SVG space), so each label is independently clipped
// to its own band width — no more all-labels-at-same-position overlap.
type BandViewBox = { x?: number; y?: number; width?: number; height?: number };
function GroupBandLabel({ viewBox, value }: { viewBox?: BandViewBox; value?: string }) {
  if (!viewBox || !value) return null;
  const { x = 0, width = 0 } = viewBox;
  if (width < 20) return null; // band too narrow to label
  // Approximate chars that fit: ~6.5 px per char at 10 px font, leave 8 px padding
  const maxChars = Math.max(3, Math.floor((width - 8) / 6.5));
  const label = value.length > maxChars ? value.slice(0, maxChars - 1) + "…" : value;
  return (
    <text
      x={x + 5}
      y={16}
      fontSize={10}
      fill="#475569"
      fontWeight={600}
      textAnchor="start"
    >
      {label}
    </text>
  );
}
const AXIS_LABEL_STYLE = { fontSize: 10, fill: "#9ca3af", fontWeight: 500 };

interface Props {
  chartData: ResolvedChartData;
  chartType: ChartType;
  height?: number;
  logScale?: boolean;
}

function ScrollableChart({
  children, dataLength, minPxPerPoint, height, yAxisWidth,
}: {
  children: (width: number, mode: "full" | "yAxisOnly" | "noYAxis") => React.ReactNode;
  dataLength: number; minPxPerPoint: number; height: number;
  yAxisWidth: number;
}) {
  const needsScroll = dataLength > SCROLL_THRESHOLD;
  const computedWidth = needsScroll ? Math.max(dataLength * minPxPerPoint, 600) : undefined;

  if (!needsScroll) {
    return (
      <div style={{ height }}>
        {children(0, "full")}
      </div>
    );
  }

  const totalWidth = yAxisWidth + computedWidth!;

  return (
    <div style={{ overflowX: "auto", height, background: "white" }}>
      <div style={{ display: "flex", width: totalWidth, height, minWidth: "100%" }}>
        {/* Sticky Y-axis column — remains fixed at left while scrolled right */}
        <div style={{
          width: yAxisWidth, flexShrink: 0, position: "sticky", left: 0, zIndex: 10,
          background: "white",
          boxShadow: "2px 0 6px -2px rgba(0,0,0,0.06)",
        }}>
          {children(yAxisWidth, "yAxisOnly")}
        </div>

        {/* Scrollable chart body — bars, X-axis, tooltip, legend */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {children(computedWidth!, "noYAxis")}
        </div>
      </div>
    </div>
  );
}

/**
 * For log-scale charts:
 * 1. Find the smallest positive value across all series.
 * 2. Derive a clean power-of-10 lower bound one decade below that minimum
 *    (e.g. min=100 000 000 → domainMin=10 000 000).
 * 3. Clamp zeros / negatives to domainMin so Recharts doesn't choke.
 */
function prepareLogData(
  data: ResolvedChartData["data"],
  yKeys: string[],
): { clampedData: ResolvedChartData["data"]; domainMin: number; domainMax: number } {
  // Find smallest positive value
  let minPositive = Infinity;
  let maxPositive = 0;
  for (const row of data) {
    for (const key of yKeys) {
      const v = Number(row[key]);
      if (isFinite(v) && v > 0 && v < minPositive) minPositive = v;
      if (isFinite(v) && v > 0 && v > maxPositive) maxPositive = v;
    }
  }

  // Fallback when there are no positive values at all
  const logFloor = isFinite(minPositive) ? Math.floor(Math.log10(minPositive)) : -2;
  // One decade below the smallest positive value → gives visual padding at bottom
  const domainMin = Math.pow(10, logFloor - 1);
  const domainMax = Math.max(domainMin * 10, maxPositive * 1.08);

  const clampedData = data.map((row) => {
    const patched: typeof row = { ...row };
    for (const key of yKeys) {
      const v = Number(patched[key]);
      if (!isFinite(v) || v <= 0) patched[key] = domainMin;
    }
    return patched;
  });

  return { clampedData, domainMin, domainMax };
}

function getLinearDomainMax(data: ResolvedChartData["data"], yKeys: string[]): number {
  let max = 0;
  for (const row of data) {
    for (const key of yKeys) {
      const value = Number(row[key]);
      if (isFinite(value) && value > max) max = value;
    }
  }
  return max > 0 ? max * 1.08 : 1;
}

function numericFormatter(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function tooltipFormatter(val: unknown): string {
  if (typeof val !== "number") return String(val ?? "");
  return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatCell(val: unknown): string {
  if (typeof val === "number") return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(val ?? "");
}

function formatKpiValue(val: unknown): { display: string; full: string; compact: boolean } {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    const value = String(val ?? "—");
    return { display: value, full: value, compact: false };
  }

  const full = val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const abs = Math.abs(val);
  let display = full;
  if (abs >= 1_000_000_000_000) display = `${(val / 1_000_000_000_000).toFixed(2).replace(/\.?0+$/, "")}T`;
  else if (abs >= 1_000_000_000) display = `${(val / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
  else if (abs >= 1_000_000) display = `${(val / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  else if (abs >= 100_000) display = `${(val / 1_000).toFixed(1).replace(/\.?0+$/, "")}K`;

  return { display, full, compact: display !== full };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ── Custom bar shape: rounded top corners + per-bar colour (single series) ──
function makeCategoricalBarShape(seriesColor: string | null) {
  return function BarShape(props: BarShapeProps) {
    const { x, y, width, height, index } = props;
    if (x == null || y == null || !width || !height || height <= 0) return null;
    const color = seriesColor ?? COLORS[(index ?? 0) % COLORS.length];
    const r = Math.min(4, width / 2);
    return (
      <path
        d={`M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`}
        fill={color}
      />
    );
  };
}

function makeYAxisProps(logScale: boolean, yAxisLabel: string, domainMin: number, domainMax: number) {
  return {
    axisKey: `${logScale ? "log" : "linear"}-${domainMin}-${domainMax}`,
    scale: (logScale ? "log" : "auto") as "log" | "auto",
    domain: logScale ? ([domainMin, domainMax] as [number, number]) : ([0, domainMax] as [number, number]),
    allowDataOverflow: logScale,
    tick: { fontSize: 11, fill: "#6b7280" },
    tickLine: false,
    axisLine: false,
    width: 72,
    tickFormatter: numericFormatter,
    label: {
      value: yAxisLabel,
      angle: -90,
      position: "insideLeft" as const,
      style: { ...AXIS_LABEL_STYLE, textAnchor: "middle" as const },
    },
  };
}

const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    fontSize: 12,
    boxShadow: "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)",
    padding: "8px 12px",
  },
};

const LEGEND_STYLE = { wrapperStyle: { fontSize: 12, paddingBottom: 6 } };

// ── Pie active shape: pops the hovered slice outward ─────────────
// Props typed explicitly so they are a structural supertype of PieSectorDataItem,
// making the function assignable to ActiveShape<PieSectorDataItem>.
interface PieSliceRenderProps {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}

function PieActiveShape({
  cx = 0, cy = 0,
  innerRadius = 0, outerRadius = 0,
  startAngle = 0, endAngle = 0,
  fill = "",
}: PieSliceRenderProps) {
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

function PieChartRenderer({
  data, xKey, yKeys, height,
}: {
  data: ChartDataPoint[]; xKey: string; yKeys: string[]; height: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const raw = data
    .map((d, i) => ({
      name: String(d[xKey] ?? ""),
      value: Number(d[yKeys[0]]),
      fill: COLORS[i % COLORS.length],
    }))
    .filter((d) => isFinite(d.value) && d.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = raw.reduce((s, d) => s + d.value, 0);

  const slices = raw;

  if (slices.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No positive values to display
      </div>
    );
  }

  const radius = Math.min(Math.floor(height * 0.41), 128);
  const pieSize = (radius + 12) * 2;   // +12 so active shape never clips

  return (
    <div className="flex items-center gap-4 w-full overflow-hidden" style={{ height }}>
      {/* ── Donut ── */}
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: pieSize, height: pieSize }}>
        <PieChart width={pieSize} height={pieSize}>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={radius}
            innerRadius={Math.round(radius * 0.54)}
            paddingAngle={slices.length > 1 ? 1.5 : 0}
            strokeWidth={0}
            activeShape={PieActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(val, name) => [
              typeof val === "number"
                ? `${val.toLocaleString()}  (${((val / total) * 100).toFixed(1)}%)`
                : String(val),
              String(name),
            ]}
          />
        </PieChart>

        {/* Center: total + active slice hint */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          {activeIndex !== null ? (
            <>
              <p className="text-[10px] text-muted-foreground leading-tight text-center max-w-[80px] truncate px-1">
                {slices[activeIndex]?.name}
              </p>
              <p className="text-sm font-bold text-slate-800 tabular-nums leading-tight">
                {numericFormatter(slices[activeIndex]?.value ?? 0)}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {((( slices[activeIndex]?.value ?? 0) / total) * 100).toFixed(1)}%
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground leading-tight">Total</p>
              <p className="text-sm font-bold text-slate-800 tabular-nums leading-tight">
                {numericFormatter(total)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Legend panel ── */}
      <div className="flex-1 min-w-0 overflow-y-auto pr-1" style={{ maxHeight: height - 8 }}>
        <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest mb-2 px-1">
          {yKeys[0]}
        </p>
        <div className="space-y-0.5">
          {slices.map((slice, i) => {
            const pct = ((slice.value / total) * 100).toFixed(1);
            const isActive = activeIndex === i;
            return (
              <div
                key={`${slice.name}-${i}`}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-default transition-colors text-xs",
                  isActive
                    ? "bg-slate-100 text-slate-800"
                    : "hover:bg-slate-50 text-slate-600"
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <span
                  className="shrink-0 rounded-sm"
                  style={{ width: 10, height: 10, backgroundColor: slice.fill }}
                />
                <span className="flex-1 truncate">{slice.name}</span>
                <span className="shrink-0 tabular-nums text-slate-400">{pct}%</span>
                <span className="shrink-0 tabular-nums text-slate-500 font-medium ml-1">
                  {numericFormatter(slice.value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ChartRenderer({ chartData, chartType, height = 320, logScale = false }: Props) {
  const { xKey, yKeys } = chartData;
  const { clampedData, domainMin, domainMax } = logScale
    ? prepareLogData(chartData.data, yKeys)
    : { clampedData: chartData.data, domainMin: 0, domainMax: getLinearDomainMax(chartData.data, yKeys) };
  const data = clampedData;

  if (!data.length || !yKeys.length) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Add metrics and dimensions to see a preview
      </div>
    );
  }

  const rawYLabel = yKeys.length === 1 ? yKeys[0] : "Values";
  const yAxisLabel = truncate(logScale ? `${rawYLabel} (log)` : rawYLabel, 24);
  const xAxisLabel = truncate(xKey, 36);
  const yProps = makeYAxisProps(logScale, yAxisLabel, domainMin, domainMax);
  const { axisKey, ...yAxisProps } = yProps;

  // ── Map ───────────────────────────────────────────────────────────
  if (chartType === "map") {
    return <MapChartRenderer data={data} xKey={xKey} yKeys={yKeys} height={height} />;
  }

  // ── KPI ──────────────────────────────────────────────────────────
  if (chartType === "kpi") {
    return (
      <div
        className="grid gap-3 p-3 h-full content-start overflow-auto"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(190px, 100%), 1fr))" }}
      >
        {yKeys.map((key, i) => {
          const val = data[0]?.[key];
          const formatted = formatKpiValue(val);
          const color = COLORS[i % COLORS.length];
          return (
            <div
              key={key}
              className="min-w-0 overflow-hidden border rounded-lg px-4 py-4"
              style={{ borderColor: `${color}40`, backgroundColor: `${color}12` }}
            >
              <p className="text-[10px] font-bold mb-2 truncate uppercase tracking-widest" style={{ color }} title={key}>
                {key}
              </p>
              <p
                className="min-w-0 truncate font-bold tabular-nums tracking-tight text-slate-800"
                style={{ fontSize: formatted.display.length > 10 ? "1.35rem" : formatted.display.length > 7 ? "1.65rem" : "2rem" }}
                title={formatted.compact ? formatted.full : undefined}
              >
                {formatted.display}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Table ─────────────────────────────────────────────────────────
  if (chartType === "table") {
    const cols = [xKey, ...yKeys].filter(Boolean);
    return (
      <div className="overflow-auto h-full rounded-lg border text-sm">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-50 border-b">
              {cols.map((c) => (
                <th key={c} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 200).map((row: ChartDataPoint, i: number) => (
              <tr key={i} className={`border-b transition-colors hover:bg-brand-tint-100/40 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 whitespace-nowrap text-sm text-slate-700">
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Pie ───────────────────────────────────────────────────────────
  if (chartType === "pie") {
    return <PieChartRenderer data={data} xKey={xKey} yKeys={yKeys} height={height} />;
  }

  // ── Line / Area ───────────────────────────────────────────────────
  if (chartType === "line" || chartType === "area") {
    const Component = chartType === "area" ? AreaChart : LineChart;
    const DataComponent = chartType === "area" ? Area : Line;
    const lineGroups = parseCompoundGroups(data, xKey);
    const hasLineGroups = lineGroups !== null;
    const hasAngle = hasLineGroups || data.length > 8;
    const xAxisHeight = hasAngle ? ANGLED_X_AXIS_HEIGHT : STRAIGHT_X_AXIS_HEIGHT;
    const margin = hasLineGroups ? CHART_MARGIN_GROUPS : CHART_MARGIN;

    return (
      <ScrollableChart dataLength={data.length} minPxPerPoint={MIN_PX_PER_POINT} height={height} yAxisWidth={yAxisProps.width}>
        {(computedWidth, mode) => {
          const isYAxisOnly = mode === "yAxisOnly";
          // yAxisOnly renders only the frozen Y-axis. The scrollable body gets
          // a hidden Y-axis with the same props so scale/domain stay synced.
          const chartWidth = isYAxisOnly ? computedWidth : (computedWidth || undefined);
          const chartStyle = isYAxisOnly
            ? { overflow: "hidden" }
            : (computedWidth ? {} : { width: "100%" });
          const chartMargin = isYAxisOnly
            ? { top: margin.top, right: 0, bottom: 0, left: 0 }
            : margin;

          return (
            <Component
              width={chartWidth || undefined}
              height={height}
              data={data}
              margin={chartMargin}
              style={chartStyle}
            >
              {!isYAxisOnly && hasLineGroups && lineGroups!.map((group, gi) => (
                <ReferenceArea
                  key={`band-${gi}`}
                  x1={group.items[0]}
                  x2={group.items[group.items.length - 1]}
                  fill={GROUP_FILLS[gi % 2]}
                  fillOpacity={1}
                  stroke="none"
                  label={isYAxisOnly ? undefined : <GroupBandLabel value={group.name} />}
                />
              ))}
              {!isYAxisOnly && <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />}
              {!isYAxisOnly && (
                <XAxis
                  dataKey={xKey}
                  tick={hasLineGroups ? <CompoundXTick /> : { fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  angle={hasAngle && !hasLineGroups ? -45 : 0}
                  textAnchor={hasAngle && !hasLineGroups ? "end" : "middle"}
                  height={xAxisHeight}
                  interval={computedWidth ? 0 : "preserveStartEnd"}
                  tickFormatter={hasAngle && !hasLineGroups ? (v: string) => truncate(String(v), 16) : undefined}
                  label={!hasLineGroups ? { value: xAxisLabel, position: "insideBottom", offset: 0, style: AXIS_LABEL_STYLE } : undefined}
                />
              )}
              {mode === "full" && <YAxis key={axisKey} {...yAxisProps} />}
              {isYAxisOnly && (
                <YAxis
                  key={axisKey}
                  scale={yAxisProps.scale}
                  domain={yAxisProps.domain}
                  allowDataOverflow={yAxisProps.allowDataOverflow}
                  tick={yAxisProps.tick}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={yAxisProps.tickFormatter}
                  label={yAxisProps.label}
                />
              )}
              {mode === "noYAxis" && <YAxis key={axisKey} {...yAxisProps} hide />}
              {!isYAxisOnly && (
                <Tooltip {...TOOLTIP_STYLE} cursor={{ stroke: "#e2e8f0", strokeWidth: 1 }} formatter={tooltipFormatter} />
              )}
              {!isYAxisOnly && <Legend verticalAlign="top" {...LEGEND_STYLE} />}
              {isYAxisOnly && yKeys.map((key) => (
                <DataComponent
                  key={`axis-context-${key}`}
                  type="monotone"
                  dataKey={key}
                  stroke="transparent"
                  fill="transparent"
                  fillOpacity={0}
                  strokeWidth={0}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                />
              ))}
              {!isYAxisOnly && yKeys.map((key, i) => (
                <DataComponent
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={chartType === "area" ? 0.1 : 1}
                  strokeWidth={2.5}
                  dot={data.length <= 30 ? { r: 3, strokeWidth: 0 } : false}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              ))}
            </Component>
          );
        }}
      </ScrollableChart>
    );
  }

  // ── Bar / Grouped Bar ─────────────────────────────────────────────
  // Single series: each bar gets its own colour via custom shape.
  // Multi series: each series gets a fixed colour.
  const singleSeries = yKeys.length === 1;
  const compoundGroups = parseCompoundGroups(data, xKey);
  const hasGroups = compoundGroups !== null && compoundGroups.length > 1;

  // With compound groups, always use angled labels (sub-labels are shorter but there are many)
  const hasAngleBar = hasGroups || data.length > 8;
  const xAxisHeightBar = hasAngleBar ? ANGLED_X_AXIS_HEIGHT : STRAIGHT_X_AXIS_HEIGHT;
  const barMargin = hasGroups ? CHART_MARGIN_GROUPS : CHART_MARGIN;

  return (
    <ScrollableChart dataLength={data.length} minPxPerPoint={MIN_PX_PER_BAR} height={height} yAxisWidth={yAxisProps.width}>
      {(computedWidth, mode) => {
        const isYAxisOnly = mode === "yAxisOnly";
        // yAxisOnly renders only the frozen Y-axis. The scrollable body gets
        // a hidden Y-axis with the same props so scale/domain stay synced.
        const chartWidth = isYAxisOnly ? computedWidth : (computedWidth || undefined);
        const chartStyle = isYAxisOnly
          ? { overflow: "hidden" }
          : (computedWidth ? {} : { width: "100%" });
        const chartMargin = isYAxisOnly
          ? { top: barMargin.top, right: 0, bottom: 0, left: 0 }
          : barMargin;

        return (
          <BarChart
            width={chartWidth || undefined}
            height={height}
            data={data}
            barGap={2}
            barCategoryGap={data.length > 20 ? "28%" : "32%"}
            margin={chartMargin}
            style={chartStyle}
          >
            {!isYAxisOnly && hasGroups && compoundGroups!.map((group, gi) => (
              <ReferenceArea
                key={`band-${gi}`}
                x1={group.items[0]}
                x2={group.items[group.items.length - 1]}
                fill={GROUP_FILLS[gi % 2]}
                fillOpacity={1}
                stroke="none"
                label={isYAxisOnly ? undefined : <GroupBandLabel value={group.name} />}
              />
            ))}

            {!isYAxisOnly && <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />}
            {!isYAxisOnly && (
              <XAxis
                dataKey={xKey}
                tick={hasGroups ? <CompoundXTick /> : { fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                angle={hasAngleBar && !hasGroups ? -45 : 0}
                textAnchor={hasAngleBar && !hasGroups ? "end" : "middle"}
                height={xAxisHeightBar}
                interval={computedWidth ? 0 : "preserveStartEnd"}
                tickFormatter={hasAngleBar && !hasGroups ? (v: string) => truncate(String(v), 16) : undefined}
                label={!hasGroups ? { value: xAxisLabel, position: "insideBottom", offset: 0, style: AXIS_LABEL_STYLE } : undefined}
              />
            )}
            {mode === "full" && <YAxis key={axisKey} {...yAxisProps} />}
            {isYAxisOnly && (
              <YAxis
                key={axisKey}
                scale={yAxisProps.scale}
                domain={yAxisProps.domain}
                allowDataOverflow={yAxisProps.allowDataOverflow}
                tick={yAxisProps.tick}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={yAxisProps.tickFormatter}
                label={yAxisProps.label}
              />
            )}
            {mode === "noYAxis" && <YAxis key={axisKey} {...yAxisProps} hide />}
            {!isYAxisOnly && (
              <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: "rgba(0,0,0,0.03)" }} formatter={tooltipFormatter} />
            )}
            {!isYAxisOnly && <Legend verticalAlign="top" {...LEGEND_STYLE} />}
            {isYAxisOnly && yKeys.map((key) => (
              <Bar
                key={`axis-context-${key}`}
                dataKey={key}
                fill="transparent"
                isAnimationActive={false}
              />
            ))}
            {!isYAxisOnly && yKeys.map((key, i) => (
              <Bar
                key={key}
                dataKey={key}
                fill={singleSeries ? COLORS[0] : COLORS[i % COLORS.length]}
                shape={singleSeries ? makeCategoricalBarShape(null) : makeCategoricalBarShape(COLORS[i % COLORS.length])}
                maxBarSize={64}
              />
            ))}
          </BarChart>
        );
      }}
    </ScrollableChart>
  );
}
