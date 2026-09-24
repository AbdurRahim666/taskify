import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { encryptAccessToken, isValidNonce, sha256, validateCallback } from "@/lib/truecaller/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const success = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

async function parsePayload(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.byteLength; });
  const body = new TextDecoder().decode(bytes);
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try { return JSON.parse(body) as unknown; } catch { return null; }
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formRequest = new Request(request.url, { method: "POST", headers: { "Content-Type": contentType }, body });
    const form = await formRequest.formData();
    return Object.fromEntries(form.entries());
  }
  return null;
}

export async function POST(request: NextRequest) {
  const raw = await parsePayload(request);
  const callback = validateCallback(raw);
  if (!callback) return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  if (callback.requestNonce && callback.requestNonce !== callback.requestId) {
    return NextResponse.json({ error: "Invalid callback correlation." }, { status: 400 });
  }
  if (!isValidNonce(callback.requestId)) return NextResponse.json({ error: "Invalid callback correlation." }, { status: 400 });

  const nonceHash = await sha256(callback.requestId);
  const admin = createAdminClient();
  const { data: attempt } = await admin
    .from("truecaller_login_attempts")
    .select("id,status,expires_at")
    .eq("nonce_hash", nonceHash)
    .maybeSingle();
  if (!attempt || new Date(attempt.expires_at).getTime() <= Date.now()) return new NextResponse(null, { status: 410 });

  if (callback.status === "flow_invoked") {
    if (attempt.status === "pending") {
      await admin.from("truecaller_login_attempts").update({ status: "flow_invoked" }).eq("id", attempt.id).eq("status", "pending");
    }
    return success();
  }
  if (callback.status === "user_rejected") {
    if (attempt.status === "pending" || attempt.status === "flow_invoked") {
      await admin.from("truecaller_login_attempts").update({ status: "rejected" }).eq("id", attempt.id).in("status", ["pending", "flow_invoked"]);
    }
    return success();
  }
  if (!callback.accessToken || !callback.endpoint) return NextResponse.json({ error: "Invalid callback." }, { status: 400 });

  if (attempt.status === "callback_received" || attempt.status === "processing" || attempt.status === "complete") return success();
  if (attempt.status !== "pending" && attempt.status !== "flow_invoked") return new NextResponse(null, { status: 409 });

  let encryptedAccessToken: string;
  try { encryptedAccessToken = await encryptAccessToken(callback.accessToken); }
  catch { return NextResponse.json({ error: "Callback processing is unavailable." }, { status: 500 }); }

  const { data: saved, error } = await admin
    .from("truecaller_login_attempts")
    .update({ status: "callback_received", encrypted_access_token: encryptedAccessToken, profile_endpoint: callback.endpoint })
    .eq("id", attempt.id)
    .in("status", ["pending", "flow_invoked"])
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Callback processing is unavailable." }, { status: 500 });
  if (!saved) {
    const { data: current } = await admin.from("truecaller_login_attempts").select("status").eq("id", attempt.id).maybeSingle();
    return current?.status === "callback_received" || current?.status === "processing" || current?.status === "complete"
      ? success()
      : new NextResponse(null, { status: 409 });
  }
  return success();
}
