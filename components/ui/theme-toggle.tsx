"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={collapsed ? "mx-auto size-8" : "h-8 w-full"} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size={collapsed ? "icon" : "default"}
      className={collapsed ? "mx-auto" : "w-full justify-start gap-2.5 px-3"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={collapsed ? (isDark ? "Switch to light mode" : "Switch to dark mode") : undefined}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span className="relative flex size-4 shrink-0 items-center justify-center">
        <Sun className="absolute size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      </span>
      {!collapsed && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
    </Button>
  );
}
