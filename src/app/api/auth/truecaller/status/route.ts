import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { decryptAccessToken, fetchProfile, hashIdentity, isValidNonce, profileFullName, sha256, TruecallerProfileError } from "@/lib/truecaller/server";
import type { TruecallerAttemptStatus } from "@/lib/truecaller/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === request.nextUrl.origin;
}

function statusResponse(status: TruecallerAttemptStatus) {
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}

async function findOrCreateUser(identityHash: string, profile: Awaited<ReturnType<typeof fetchProfile>>) {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("truecaller_identities").select("supabase_user_id").eq("truecaller_subject_hash", identityHash).maybeSingle();
  if (existing?.supabase_user_id) return existing.supabase_user_id;

  const email = `tc-${crypto.randomUUID()}@accounts.taskify.invalid`;
  const fullName = profileFullName(profile);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName, avatar_url: profile.avatarUrl ?? null, auth_provider: "truecaller" },
  });
  if (createError || !created.user) throw new Error("Unable to create the Taskify account for this identity.");

  const { error: insertError } = await admin.from("truecaller_identities").insert({
    truecaller_subject_hash: identityHash,
    supabase_user_id: created.user.id,
  });
  if (insertError) {
    const { data: raced } = await admin.from("truecaller_identities").select("supabase_user_id").eq("truecaller_subject_hash", identityHash).maybeSingle();
    if (!raced?.supabase_user_id) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw new Error("Unable to save the verified Taskify identity.");
    }
    await admin.auth.admin.deleteUser(created.user.id);
    return raced.supabase_user_id;
  }
  return created.user.id;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 2048) return NextResponse.json({ error: "Invalid request." }, { status: 413 });
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > 2048) {
        await reader.cancel();
        return NextResponse.json({ error: "Invalid request." }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body !== "object" || typeof (body as { nonce?: unknown }).nonce !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const nonce = (body as { nonce: string }).nonce;
  if (!isValidNonce(nonce)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const binding = request.cookies.get(`tc_binding_${nonce}`)?.value;
  if (!binding) return NextResponse.json({ error: "This sign-in attempt expired. Please try again." }, { status: 401 });
  const nonceHash = await sha256(nonce);
  const bindingHash = await sha256(binding);
  const admin = createAdminClient();
  const { data: attempt, error: lookupError } = await admin
    .from("truecaller_login_attempts")
    .select("id,browser_binding_hash,status,expires_at,encrypted_access_token,profile_endpoint")
    .eq("nonce_hash", nonceHash)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Unable to check sign-in status." }, { status: 500 });
  if (!attempt || attempt.browser_binding_hash !== bindingHash || new Date(attempt.expires_at).getTime() <= Date.now()) {
    const response = NextResponse.json({ error: "This sign-in attempt expired. Please try again." }, { status: 410 });
    response.cookies.set(`tc_binding_${nonce}`, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/auth/truecaller/status", maxAge: 0 });
    return response;
  }

  if (attempt.status === "pending" || attempt.status === "flow_invoked" || attempt.status === "processing") return statusResponse(attempt.status);
  if (attempt.status === "rejected") return statusResponse("rejected");
  if (attempt.status === "failed") return statusResponse("failed");
  if (attempt.status === "complete") {
    const response = statusResponse("complete");
    response.cookies.set(`tc_binding_${nonce}`, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/auth/truecaller/status", maxAge: 0 });
    return response;
  }
  if (attempt.status !== "callback_received" || !attempt.encrypted_access_token || !attempt.profile_endpoint) {
    return statusResponse("failed");
  }

  const { data: claimed, error: claimError } = await admin
    .from("truecaller_login_attempts")
    .update({ status: "processing" })
    .eq("id", attempt.id)
    .eq("status", "callback_received")
    .select("id")
    .maybeSingle();
  if (claimError) return NextResponse.json({ error: "Unable to process sign-in." }, { status: 500 });
  if (!claimed) return statusResponse("processing");

  let processingStep = "token_decryption";
  try {
    const accessToken = await decryptAccessToken(attempt.encrypted_access_token);
    processingStep = "profile_request";
    const profile = await fetchProfile(attempt.profile_endpoint, accessToken);
    const subject = String(profile.userId ?? profile.id ?? "");
    if (!subject) throw new Error("Missing verified identity.");
    processingStep = "identity_hash";
    const identityHash = await hashIdentity(subject);
    processingStep = "identity_lookup_or_create";
    const userId = await findOrCreateUser(identityHash, profile);
    const verifiedPhone = profile.phoneNumbers?.[0];
    if (!verifiedPhone) throw new Error("Missing verified phone number.");

    processingStep = "profile_write";
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      email: null,
      full_name: profileFullName(profile),
      phone: verifiedPhone,
      avatar_url: profile.avatarUrl ?? null,
    }, { onConflict: "id" });
    if (profileError) throw new Error("Unable to update the verified profile.");

    processingStep = "auth_user_lookup";
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(userId);
    if (authUserError || !authUser.user.email || authUser.user.user_metadata?.auth_provider !== "truecaller") {
      throw new Error("Unable to establish a Taskify session.");
    }
    processingStep = "magic_link_generation";
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: authUser.user.email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw new Error("Unable to establish a Taskify session.");

    // Consume the one-time admin-generated link through the regular SSR client.
    // This stores the ordinary Supabase session in the existing auth cookies.
    processingStep = "session_verification";
    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (verifyError) throw new Error("Unable to establish a Taskify session.");

    processingStep = "attempt_completion";
    const { error: cleanupError } = await admin.from("truecaller_login_attempts").update({
      status: "complete",
      encrypted_access_token: null,
      profile_endpoint: null,
      consumed_at: new Date().toISOString(),
    }).eq("id", attempt.id).eq("status", "processing");
    if (cleanupError) throw new Error("Unable to complete sign-in.");
    const response = statusResponse("complete");
    response.cookies.set(`tc_binding_${nonce}`, "", { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/auth/truecaller/status", maxAge: 0 });
    return response;
  } catch (caught) {
    const category = caught instanceof TruecallerProfileError ? caught.category : "processing_error";
    const httpStatus = caught instanceof TruecallerProfileError ? caught.httpStatus : undefined;
    console.error("Truecaller status processing failed", {
      step: processingStep,
      category,
      ...(httpStatus === undefined ? {} : { httpStatus }),
      attemptState: "processing",
    });
    const { error: failureStateError } = await admin.from("truecaller_login_attempts").update({
      status: "failed",
      encrypted_access_token: null,
      profile_endpoint: null,
      consumed_at: new Date().toISOString(),
    }).eq("id", attempt.id).eq("status", "processing");
    if (failureStateError) {
      console.error("Truecaller failure state update failed", {
        step: "attempt_failure_transition",
        category: "database_update_error",
        attemptState: "processing",
      });
    }
    return statusResponse("failed");
  }
}
