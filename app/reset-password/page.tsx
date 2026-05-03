"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart2, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

type Phase = "request" | "update" | "done";

function formatRateLimitError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("too many") || lower.includes("429")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return message;
}

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("request");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [cooldown, setCooldown]   = useState(0);

  // Supabase sends users back here after they click the email link.
  // The client picks up the session automatically via onAuthStateChange.
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPhase("update");
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    if (cooldown > Date.now()) {
      const secs = Math.ceil((cooldown - Date.now()) / 1000);
      setError(`Please wait ${secs}s before trying again.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setPhase("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(formatRateLimitError(message));
      if (message.toLowerCase().includes("rate limit")) {
        setCooldown(Date.now() + 120_000);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-9 w-9 bg-brand rounded-xl flex items-center justify-center">
            <BarChart2 className="h-5 w-5 text-white" />
          </div>
           <span className="font-bold text-lg">Supercoolstuff</span>
        </div>

        <div
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8"
          style={{ boxShadow: "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)" }}
        >
          {phase === "request" && (
            <>
              <h1 className="text-xl font-bold mb-1">Reset password</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Enter your email and we&apos;ll send a reset link.
              </p>
              <form onSubmit={handleRequest} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@organisation.gov"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            </>
          )}

          {phase === "update" && (
            <>
              <h1 className="text-xl font-bold mb-1">Choose a new password</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Pick a strong password for your account.
              </p>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(null); }}
                    required
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                    required
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update password
                </Button>
              </form>
            </>
          )}

          {phase === "done" && (
            <div className="text-center space-y-4">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">
                  {password ? "Password updated" : "Check your inbox"}
                </p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {password
                    ? "Your password has been changed. You can now sign in."
                    : "We sent a reset link to your email address."}
                </p>
              </div>
              <Link href="/login">
                <Button variant="outline" className="w-full">Back to sign in</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
