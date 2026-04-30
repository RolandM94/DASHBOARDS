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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Chart Type</p>
      <div className="grid grid-cols-4 gap-1.5">
        {CHART_TYPES.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => onChange(type)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors",
              value === type
                ? "border-brand bg-brand-tint-100 text-brand-deep"
                : "border-transparent hover:border-muted-foreground/30 hover:bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="leading-none">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
