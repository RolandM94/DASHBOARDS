"use client";

import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { ChartDataPoint } from "@/types";

const GEO_URL = "/world-atlas-110m.json";

// ── Color interpolation: light teal tint → brand teal ────────────
function interpolateColor(t: number): string {
  // #e0f7f5 → #4ECDC4 (teal palette)
  const r = Math.round(224 + (78  - 224) * t);
  const g = Math.round(247 + (205 - 247) * t);
  const b = Math.round(245 + (196 - 245) * t);
  return `rgb(${r},${g},${b})`;
}

// ── Common country name aliases → normalised atlas name ──────────
const NAME_ALIASES: Record<string, string> = {
  // English short names → atlas full names
  "usa":                          "united states of america",
  "us":                           "united states of america",
  "unitedstates":                 "united states of america",
  "uk":                           "united kingdom",
  "greatbritain":                 "united kingdom",
  "britain":                      "united kingdom",
  "england":                      "united kingdom",
  "uae":                          "united arab emirates",
  "drc":                          "dem. rep. congo",
  "congokinshasa":                "dem. rep. congo",
  "democraticrepublicofthecongo": "dem. rep. congo",
  "congodrc":                     "dem. rep. congo",
  "congobrazzaville":             "congo",
  "republicofthecongo":           "congo",
  "costarica":                    "costa rica",
  "saudiarabia":                  "saudi arabia",
  "southkorea":                   "south korea",
  "northkorea":                   "north korea",
  "newzealand":                   "new zealand",
  "papuanewguinea":               "papua new guinea",
  "sierraleone":                  "sierra leone",
  "ivorycoast":                   "côte d'ivoire",
  "cotedivoire":                  "côte d'ivoire",
  "southafrica":                  "south africa",
  "centralafricanrepublic":       "central african rep.",
  "car":                          "central african rep.",
  "southsudan":                   "s. sudan",
  "bosniaandherzegovina":         "bosnia and herz.",
  "northmacedonia":               "macedonia",
  "trinidadandtobago":            "trinidad and tobago",
  "antiguaandbarbuda":            "antigua and barb.",
  "saintkittsandnevis":           "st. kitts and nevis",
  "saintvincentandthegrenadines": "st. vin. and gren.",
  "sanmarino":                    "san marino",
  "elsalvador":                   "el salvador",
  "puertorico":                   "puerto rico",
  "srilanka":                     "sri lanka",
  "timor-leste":                  "timor-leste",
  "easttimor":                    "timor-leste",
  "equatorialguinea":             "eq. guinea",
  "frenchguiana":                 "fr. guiana",
  "westernsahara":                "w. sahara",
  "dominicanrepublic":            "dominican rep.",
  "falklandislands":              "falkland is.",
  "czechrepublic":                "czechia",
  "czech":                        "czechia",
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveAlias(raw: string): string {
  const n = normalize(raw);
  return NAME_ALIASES[n] ?? raw.toLowerCase().trim();
}

// ── Type from react-simple-maps geography ───────────────────────
interface GeoFeature {
  rsmKey: string;
  id: string;
  properties: { name?: string };
}

interface Props {
  data: ChartDataPoint[];
  xKey: string;
  yKeys: string[];
  height: number;
}

export function MapChartRenderer({ data, xKey, yKeys, height }: Props) {
  const [tooltip, setTooltip] = useState<{ name: string; raw: string; value: string } | null>(null);
  const valueKey = yKeys[0] ?? "";

  // Build lookup: resolved country name → numeric value
  const lookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data) {
      const raw  = String(row[xKey] ?? "");
      const key  = resolveAlias(raw);
      const val  = Number(row[valueKey]);
      if (isFinite(val)) map.set(key, val);
    }
    return map;
  }, [data, xKey, valueKey]);

  const { min, max } = useMemo(() => {
    const vals = Array.from(lookup.values());
    if (!vals.length) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [lookup]);

  function getFill(geoName: string): string {
    const key = resolveAlias(geoName);
    const val  = lookup.get(key);
    if (val === undefined) return "#e5e7eb";
    const t = max === min ? 0.5 : (val - min) / (max - min);
    return interpolateColor(Math.max(0, Math.min(1, t)));
  }

  const matchCount = useMemo(() => {
    return data.filter((row) => {
      const key = resolveAlias(String(row[xKey] ?? ""));
      return lookup.has(key);
    }).length;
  }, [data, xKey, lookup]);

  return (
    <div className="relative w-full flex flex-col" style={{ height }}>
      <ComposableMap
        projectionConfig={{ scale: 147 }}
        style={{ width: "100%", height: height - 28 }}
      >
        <ZoomableGroup zoom={1}>
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: GeoFeature[] }) =>
              geographies.map((geo) => {
                const name = geo.properties.name ?? "";
                const fill = getFill(name);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo as never}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={0.4}
                    onMouseEnter={() => {
                      const key = resolveAlias(name);
                      const val = lookup.get(key);
                      setTooltip({
                        name,
                        raw: name,
                        value: val !== undefined
                          ? val.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : "No data",
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                    style={{
                      default: { outline: "none" },
                      hover: { fill: fill === "#e5e7eb" ? "#d1d5db" : fill, outline: "none", filter: "brightness(0.9)" },
                      pressed: { outline: "none" },
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div className="absolute top-2 left-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-md text-xs pointer-events-none z-10">
          <p className="font-semibold text-slate-800">{tooltip.name}</p>
          <p className="text-slate-500 mt-0.5">
            {valueKey}: <span className="text-slate-700 font-medium">{tooltip.value}</span>
          </p>
        </div>
      )}

      {/* Footer bar */}
      <div className="h-7 flex items-center justify-between px-3 border-t border-gray-100 shrink-0">
        <p className="text-[10px] text-muted-foreground">
          {matchCount} of {data.length} {data.length === 1 ? "country" : "countries"} matched
        </p>
        {/* Colour legend */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {min.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <div
            className="h-2.5 w-20 rounded-full"
            style={{
              background: `linear-gradient(to right, ${interpolateColor(0)}, ${interpolateColor(1)})`,
            }}
          />
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {max.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
      </div>
    </div>
  );
}
