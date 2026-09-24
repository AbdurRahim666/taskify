import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomToken, sha256 } from "@/lib/truecaller/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTEMPT_LIFETIME_MS = 5 * 60 * 1000;

function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const browserSupabase = await createClient();
  const { data: claims } = await browserSupabase.auth.getClaims();
  if (claims?.claims?.sub) return NextResponse.json({ error: "You are already signed in." }, { status: 409 });

  const partnerKey = process.env.TRUECALLER_APP_KEY;
  const partnerName = process.env.TRUECALLER_APP_NAME || "Taskify";
  if (!partnerKey || !process.env.TRUECALLER_PROFILE_API_ORIGIN) {
    return NextResponse.json({ error: "Truecaller sign-in is not configured yet." }, { status: 503 });
  }

  const nonce = randomToken(32);
  const binding = randomToken(32);
  const nonceHash = await sha256(nonce);
  const bindingHash = await sha256(binding);
  const expiresAt = new Date(Date.now() + ATTEMPT_LIFETIME_MS).toISOString();
  const admin = createAdminClient();
  // Purge abandoned attempts, including encrypted tokens whose clients never
  // completed their status polling after Truecaller called back.
  await admin.from("truecaller_login_attempts").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("truecaller_login_attempts").insert({
    nonce_hash: nonceHash,
    browser_binding_hash: bindingHash,
    expires_at: expiresAt,
  });

  if (error) return NextResponse.json({ error: "Unable to start Truecaller sign-in. Please try again." }, { status: 500 });

  const response = NextResponse.json({ nonce, partnerKey, partnerName });
  response.cookies.set(`tc_binding_${nonce}`, binding, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/truecaller/status",
    maxAge: Math.floor(ATTEMPT_LIFETIME_MS / 1000),
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
