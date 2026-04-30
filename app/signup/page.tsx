"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart2, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function SignupPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName.trim() },
          // Use the current window origin so confirmation links work on any
          // host — localhost, LAN IP, ngrok, or production domain.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // If email confirmation is disabled, a session is returned immediately.
      if (data.session) {
        window.location.assign("/analytics");
        return;
      }

      // Otherwise, email confirmation is required — show the "check email" screen.
      setDone(true);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex items-center justify-center gap-2.5 mb-8">
            <div className="h-9 w-9 bg-brand rounded-xl flex items-center justify-center">
              <BarChart2 className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Eyemark</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-8"
            style={{ boxShadow: "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)" }}>
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-bold mb-2">Check your email</h2>
            <p className="text-sm text-muted-foreground">
              We sent a confirmation link to <strong>{email}</strong>.
              Click it to activate your account, then{" "}
              <Link href="/login" className="text-brand hover:underline">sign in</Link>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-9 w-9 bg-brand rounded-xl flex items-center justify-center">
            <BarChart2 className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg">Eyemark</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8"
          style={{ boxShadow: "0px 0px 5px 0px rgba(0,0,0,.02), 0px 2px 10px 0px rgba(0,0,0,.06), 0px 0px 1px 0px rgba(0,0,0,.3)" }}>
          <h1 className="text-xl font-bold mb-1">Create account</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Government M&amp;E analytics platform
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@organisation.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              Create account
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
