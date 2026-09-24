import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseConfig } from "./config";

/** Creates a cookie-backed client for Client Components. */
export function createClient() {
  const [supabaseUrl, supabaseAnonKey] = getSupabaseConfig();

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
