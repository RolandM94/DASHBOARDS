"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2, Building2, LayoutDashboard, LogOut, Plus,
  Loader2, AlertCircle, FileText, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DataLoader } from "@/components/providers/DataLoader";
import OnboardingTour from "@/components/analytics/OnboardingTour";
import TourLauncher from "@/components/analytics/TourLauncher";
import { useTourStore } from "@/store/tourStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Nav link ──────────────────────────────────────────────────────

function NavLink({ href, label, collapsed, children }: { href: string; label?: string; collapsed?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      title={collapsed ? (label ?? "Link") : undefined}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors shrink-0",
        collapsed ? "justify-center w-8 h-8 mx-auto px-0" : "",
        active
          ? "bg-brand-tint-100 text-brand-deep font-medium"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  );
}

// ── Mandatory org setup screen ────────────────────────────────────
// Shown full-screen to owner-type users who have not yet created an org.
// Replaces the normal layout entirely — no sidebar, no navigation, no exit.

function OrgSetupScreen({ onCreated, onSignOut }: { onCreated: () => void; onSignOut: () => void }) {
  const [name, setName]     = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res  = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create organisation");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md space-y-8">

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5">
          <div className="h-9 w-9 bg-brand rounded-xl flex items-center justify-center">
            <BarChart2 className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg">Supercoolstuff</span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 space-y-6">
          <div className="text-center space-y-3">
            <div className="h-14 w-14 mx-auto rounded-2xl bg-brand/10 flex items-center justify-center">
              <Building2 className="h-7 w-7 text-brand" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Create your organisation</h1>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Set up your organisation to get started.
                You can invite stakeholders once it&apos;s created.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Organisation name</Label>
              <Input
                id="org-name"
                placeholder="e.g. Ministry of Finance"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                required
                autoFocus
                disabled={saving}
              />
            </div>
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create organisation
            </Button>
          </form>
        </div>

        {/* Escape hatch */}
        <p className="text-center text-xs text-muted-foreground/60">
          Wrong account?{" "}
          <button
            type="button"
            onClick={onSignOut}
            className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
          >
            Sign out
          </button>
        </p>

      </div>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────

type GuardState = "loading" | "setup" | "ready";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [guardState, setGuardState] = useState<GuardState>("loading");
  const [userType, setUserType]     = useState<"owner" | "member">("owner");
  const [userName, setUserName]     = useState<string>("");
  const [userEmail, setUserEmail]   = useState<string>("");
  const { hasSeenTour, startTour }  = useTourStore();
  const autoStartedRef              = useRef(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return typeof window !== "undefined" && localStorage.getItem("sidebar-collapsed") === "true"; }
    catch { return false; }
  });

  function toggleSidebar() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email ?? "");

      // Make org invite/profile state current before deciding whether this
      // account needs first-time organisation setup.
      await fetch("/api/auth/accept-invites", { method: "POST" }).catch(() => {});

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_type, org_id, display_name")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.error("AnalyticsLayout: failed to load profile", profileError);
        setGuardState("ready");
        return;
      }

      const type = (profile?.user_type ?? "owner") as "owner" | "member";
      setUserType(type);
      setUserName(profile?.display_name ?? user.email?.split("@")[0] ?? "");

      // Owners with no org must create one before using the platform
      if (type === "owner" && !profile?.org_id) {
        setGuardState("setup");
      } else {
        setGuardState("ready");
        // Auto-start tour on first login
        if (!hasSeenTour && !autoStartedRef.current) {
          autoStartedRef.current = true;
          setTimeout(() => startTour(), 1500);
        }
      }
    });
  }, [router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (guardState === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Mandatory org setup (owner with no org) ───────────────────────────────
  if (guardState === "setup") {
    return (
      <OrgSetupScreen
        onCreated={() => setGuardState("ready")}
        onSignOut={handleSignOut}
      />
    );
  }

  // ── Normal app ────────────────────────────────────────────────────────────
  return (
    <>
      <DataLoader />
      <OnboardingTour />
      <div className="flex h-full min-w-0 overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          "shrink-0 border-r bg-white flex flex-col transition-all duration-300",
          collapsed ? "w-14" : "w-56"
        )}>
          <div className={cn("border-b flex items-center gap-2 shrink-0",
            collapsed ? "justify-center py-3" : "px-4 py-5"
          )}>
            {!collapsed ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="h-7 w-7 bg-brand rounded-lg flex items-center justify-center shrink-0">
                  <BarChart2 className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-sm">Supercoolstuff</span>
              </div>
            ) : (
              <div className="h-7 w-7 bg-brand rounded-lg flex items-center justify-center shrink-0">
                <BarChart2 className="h-4 w-4 text-white" />
              </div>
            )}
            <button
              onClick={toggleSidebar}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed
                ? <PanelLeftOpen className="h-4 w-4" />
                : <PanelLeftClose className="h-4 w-4" />
              }
            </button>
          </div>

          <nav className={cn("flex-1 space-y-0.5 overflow-hidden", collapsed ? "p-2" : "p-3")} data-tour-id="sidebar-nav">
            <NavLink href="/analytics" label="Home" collapsed={collapsed}>
              <BarChart2 className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Home</span>}
            </NavLink>
            <NavLink href="/analytics/workbook/new" label="New Workbook" collapsed={collapsed}>
              <Plus className="h-4 w-4 shrink-0" />
              {!collapsed && <span>New Workbook</span>}
            </NavLink>
            <NavLink href="/analytics/canvas/new" label="New Canvas" collapsed={collapsed}>
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!collapsed && <span>New Canvas</span>}
            </NavLink>
            <NavLink href="/analytics/reports" label="Reports" collapsed={collapsed}>
              <FileText className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Reports</span>}
            </NavLink>

            {/* Owners only — members don't manage org settings */}
            {userType === "owner" && (
              <>
                {!collapsed && (
                  <div className="pt-2 pb-0.5">
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                      Settings
                    </p>
                  </div>
                )}
                <NavLink href="/analytics/settings/org" label="Settings" collapsed={collapsed}>
                  <Building2 className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>Stakeholder Management</span>}
                </NavLink>
              </>
            )}
          </nav>

          <div className={cn("border-t space-y-2", collapsed ? "px-1 py-2" : "px-3 py-3")}>
            {/* User identity */}
            {userName && !collapsed && (
              <div className="flex items-center gap-2.5 px-3 py-2">
                <div className="h-7 w-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-semibold text-brand">{getInitials(userName)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{userName}</p>
                  {userEmail && <p className="text-[10px] text-muted-foreground/60 truncate">{userEmail}</p>}
                </div>
              </div>
            )}
            {userName && collapsed && (
              <div className="flex justify-center">
                <div className="h-7 w-7 rounded-full bg-brand/10 flex items-center justify-center shrink-0" title={userName}>
                  <span className="text-[10px] font-semibold text-brand">{getInitials(userName)}</span>
                </div>
              </div>
            )}
            <TourLauncher collapsed={collapsed} />
            <button
              onClick={handleSignOut}
              className={cn(
                "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                collapsed
                  ? "justify-center w-8 h-8 mx-auto p-0"
                  : "w-full gap-2.5 px-3 py-2"
              )}
              title={collapsed ? "Sign out" : undefined}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign out</span>}
            </button>
          </div>
        </aside>

        {/* Main — individual pages set their own overflow strategy */}
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </>
  );
}
