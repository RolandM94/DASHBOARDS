"use client";

import { ChartType } from "@/types";
import { cn } from "@/lib/utils";
import { BarChart2, LineChart, PieChart, Table, TrendingUp, Layers, Hash, Globe } from "lucide-react";

const CHART_TYPES: { type: ChartType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "bar",         label: "Bar",     icon: BarChart2  },
  { type: "grouped_bar", label: "Grouped", icon: Layers     },
  { type: "line",        label: "Line",    icon: LineChart  },
  { type: "area",        label: "Area",    icon: TrendingUp },
  { type: "pie",         label: "Pie",     icon: PieChart   },
  { type: "kpi",         label: "KPI",     icon: Hash       },
  { type: "table",       label: "Table",   icon: Table      },
  { type: "map",         label: "Map",     icon: Globe      },
];

interface Props {
  value: ChartType;
  onChange: (type: ChartType) => void;
}

export function ChartTypeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Chart Type</p>
      <div className="grid grid-cols-4 gap-1">
        {CHART_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={cn(
              "flex h-12 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] transition-colors",
              value === type
                ? "border-brand/40 bg-brand-tint-100 text-brand-deep shadow-sm"
                : "border-transparent text-muted-foreground hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="leading-none">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
