#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const dns = require("node:dns/promises");
const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const root = process.cwd();
const envPath = path.join(root, ".env.local");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function checkDns(hostname) {
  try {
    await dns.lookup(hostname);
  } catch (error) {
    if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
      throw new Error(
        `DNS lookup failed for ${hostname} (${error.code}). This usually means the current terminal/network sandbox cannot resolve external hosts. Run this command from a normal terminal, or approve the unrestricted network run in Codex.`
      );
    }

    throw error;
  }
}

async function timedFetch(baseUrl, route) {
  const started = Date.now();
  const response = await fetch(new URL(route.path, baseUrl), {
    redirect: route.redirect ?? "follow",
    headers: { "user-agent": "eyemark-production-smoke/1.0" },
  });

  return {
    path: route.path,
    status: response.status,
    ms: Date.now() - started,
    ok: route.expect.includes(response.status),
  };
}

async function runConcurrent(baseUrl, route, count) {
  const results = await Promise.all(
    Array.from({ length: count }, () => timedFetch(baseUrl, route))
  );
  const failures = results.filter((result) => !result.ok);
  const times = results.map((result) => result.ms);

  return {
    path: route.path,
    count,
    ok: failures.length === 0,
    statuses: results.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {}),
    minMs: Math.min(...times),
    p95Ms: percentile(times, 95),
    maxMs: Math.max(...times),
    failures,
  };
}

async function runSignupSmoke() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      skipped: true,
      reason:
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  await checkDns(new URL(url).hostname);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `eyemark.signup.smoke.${Date.now()}@gmail.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "TempPass12345!",
    email_confirm: true,
    user_metadata: { full_name: "Signup Smoke" },
  });

  if (error) {
    return {
      ok: false,
      email,
      error: {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
      },
    };
  }

  const userId = data.user?.id;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, display_name, user_type, org_id")
    .eq("id", userId)
    .maybeSingle();

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  return {
    ok: Boolean(profile) && !profileError && !deleteError,
    email,
    userId,
    profile: profileError
      ? {
          ok: false,
          error: {
            message: profileError.message,
            code: profileError.code,
            details: profileError.details,
            hint: profileError.hint,
          },
        }
      : { ok: Boolean(profile), row: profile },
    cleanup: deleteError
      ? {
          ok: false,
          error: {
            message: deleteError.message,
            status: deleteError.status,
            code: deleteError.code,
          },
        }
      : { ok: true },
  };
}

async function runBrowserSignupSmoke(baseUrl) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return {
      skipped: true,
      reason:
        "Missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `eyemark.browser.signup.smoke.${Date.now()}@gmail.com`;
  const { data, error } = await anon.auth.signUp({
    email,
    password: "TempPass12345!",
    options: {
      data: { full_name: "Browser Signup Smoke" },
      emailRedirectTo: new URL("/auth/callback", baseUrl).toString(),
    },
  });

  if (error) {
    return {
      ok: false,
      email,
      error: {
        message: error.message,
        status: error.status,
        code: error.code,
        name: error.name,
      },
    };
  }

  const userId = data.user?.id;
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  return {
    ok: Boolean(userId) && !deleteError,
    email,
    userId,
    needsConfirmation: !data.session,
    cleanup: deleteError
      ? {
          ok: false,
          error: {
            message: deleteError.message,
            status: deleteError.status,
            code: deleteError.code,
          },
        }
      : { ok: true },
  };
}

async function main() {
  loadEnvFile(envPath);

  const baseUrl = process.argv[2] ?? "https://supercool-stuff.vercel.app";
  const concurrency = Number(process.env.SMOKE_CONCURRENCY ?? 20);
  const hostname = new URL(baseUrl).hostname;

  console.log(`Production smoke test: ${baseUrl}`);
  console.log(`Concurrency: ${concurrency}`);

  await checkDns(hostname);

  const routes = [
    { path: "/login", expect: [200] },
    { path: "/analytics", expect: [200] },
    { path: "/api/datasets", expect: [401] },
  ];

  const routeResults = [];
  for (const route of routes) {
    const result = await runConcurrent(baseUrl, route, concurrency);
    routeResults.push(result);
    console.log(
      `${result.ok ? "PASS" : "FAIL"} ${route.path} statuses=${JSON.stringify(
        result.statuses
      )} min=${result.minMs}ms p95=${result.p95Ms}ms max=${result.maxMs}ms`
    );
  }

  const signup = await runSignupSmoke();
  if (signup.skipped) {
    console.log(`SKIP signup: ${signup.reason}`);
  } else {
    console.log(
      `${signup.ok ? "PASS" : "FAIL"} signup-trigger profile=${
        signup.profile?.ok ?? false
      } cleanup=${signup.cleanup?.ok ?? false}`
    );
    if (!signup.ok) {
      console.log(JSON.stringify(signup, null, 2));
    }
  }

  let browserSignup = { skipped: true };
  if (process.env.SMOKE_BROWSER_SIGNUP === "1") {
    browserSignup = await runBrowserSignupSmoke(baseUrl);
    if (browserSignup.skipped) {
      console.log(`SKIP browser-signup: ${browserSignup.reason}`);
    } else {
      console.log(
        `${browserSignup.ok ? "PASS" : "FAIL"} browser-signup cleanup=${
          browserSignup.cleanup?.ok ?? false
        }`
      );
      if (!browserSignup.ok) {
        console.log(JSON.stringify(browserSignup, null, 2));
      }
    }
  } else {
    console.log("SKIP browser-signup: set SMOKE_BROWSER_SIGNUP=1 to send a real signup email.");
  }

  const failedRoutes = routeResults.filter((result) => !result.ok);
  if (
    failedRoutes.length > 0 ||
    (!signup.skipped && !signup.ok) ||
    (!browserSignup.skipped && !browserSignup.ok)
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
