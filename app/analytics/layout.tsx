"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2, Building2, LayoutDashboard, LogOut, Plus,
  Loader2, AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DataLoader } from "@/components/providers/DataLoader";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Nav link ──────────────────────────────────────────────────────

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
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
          <span className="font-bold text-lg">Eyemark</span>
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
      }
    });
  }, []);

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
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r bg-white flex flex-col">
          <div className="px-4 py-5 border-b">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 bg-brand rounded-lg flex items-center justify-center">
                <BarChart2 className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-sm">Eyemark</span>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5">
            <NavLink href="/analytics">
              <BarChart2 className="h-4 w-4" />
              Analytics
            </NavLink>
            <NavLink href="/analytics/worksheet/new">
              <Plus className="h-4 w-4" />
              New Worksheet
            </NavLink>
            <NavLink href="/analytics/canvas/new">
              <LayoutDashboard className="h-4 w-4" />
              New Canvas
            </NavLink>

            {/* Owners only — members don't manage org settings */}
            {userType === "owner" && (
              <>
                <div className="pt-2 pb-0.5">
                  <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-1">
                    Settings
                  </p>
                </div>
                <NavLink href="/analytics/settings/org">
                  <Building2 className="h-4 w-4" />
                  Stakeholder Management
                </NavLink>
              </>
            )}
          </nav>

          <div className="px-3 py-3 border-t space-y-2">
            {/* User identity */}
            {userName && (
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
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main — individual pages set their own overflow strategy */}
        <main className="flex-1 min-h-0 flex flex-col">
          {children}
        </main>
      </div>
    </>
  );
}
