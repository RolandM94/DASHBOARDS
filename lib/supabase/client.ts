import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client.
 * Use in Client Components (hooks, event handlers, etc.).
 * Re-uses a single instance per render to avoid creating new clients on re-renders.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { realtime: { params: { eventsPerSecond: 10 } } }
  );
}
