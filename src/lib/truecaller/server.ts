import "server-only";

import type { TruecallerCallback, TruecallerProfile } from "./types";

const encoder = new TextEncoder();
const MAX_PROFILE_BYTES = 64 * 1024;

export class TruecallerProfileError extends Error {
  constructor(readonly category: string, readonly httpStatus?: number) {
    super(category);
    this.name = "TruecallerProfileError";
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidNonce(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function validateCallback(value: unknown): TruecallerCallback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.requestId !== "string" || item.requestId.length < 8 || item.requestId.length > 128) return null;
  if (item.requestNonce !== undefined && (typeof item.requestNonce !== "string" || item.requestNonce.length > 128)) return null;
  if (item.status !== undefined && item.status !== "flow_invoked" && item.status !== "user_rejected") return null;
  if (item.accessToken !== undefined && (typeof item.accessToken !== "string" || item.accessToken.length < 8 || item.accessToken.length > 4096)) return null;
  if (item.endpoint !== undefined && (typeof item.endpoint !== "string" || item.endpoint.length > 2048)) return null;
  return {
    requestId: item.requestId,
    ...(typeof item.requestNonce === "string" ? { requestNonce: item.requestNonce } : {}),
    ...(item.status ? { status: item.status } : {}),
    ...(typeof item.accessToken === "string" ? { accessToken: item.accessToken } : {}),
    ...(typeof item.endpoint === "string" ? { endpoint: item.endpoint } : {}),
  };
}

function encryptionKey() {
  const encoded = process.env.TRUECALLER_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Missing Truecaller token encryption configuration.");
  const raw = fromBase64Url(encoded);
  if (raw.length !== 32) throw new Error("Truecaller token encryption key must decode to 32 bytes.");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptAccessToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(token));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptAccessToken(value: string) {
  const [encodedIv, encodedCiphertext, extra] = value.split(".");
  if (!encodedIv || !encodedCiphertext || extra) throw new Error("Invalid encrypted token format.");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(encodedIv) },
    await encryptionKey(),
    fromBase64Url(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function hashIdentity(subject: string) {
  const secret = process.env.TRUECALLER_IDENTITY_HASH_KEY;
  if (!secret || secret.length < 32) throw new Error("Missing or weak Truecaller identity hash configuration.");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(subject));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEndpoint(endpoint: string) {
  const configuredOrigin = process.env.TRUECALLER_PROFILE_API_ORIGIN;
  if (!configuredOrigin) throw new TruecallerProfileError("profile_origin_missing");
  let allowed: URL;
  let requested: URL;
  try {
    allowed = new URL(configuredOrigin);
    requested = new URL(endpoint);
  } catch {
    throw new TruecallerProfileError("profile_endpoint_invalid");
  }
  if (allowed.protocol !== "https:" || requested.protocol !== "https:" || requested.origin !== allowed.origin || requested.username || requested.password || requested.port) {
    throw new TruecallerProfileError("profile_origin_mismatch");
  }
  if (!requested.pathname.startsWith("/v1/")) throw new TruecallerProfileError("profile_path_invalid");
  return requested.toString();
}

export async function fetchProfile(endpoint: string, accessToken: string): Promise<TruecallerProfile> {
  const response = await fetch(safeEndpoint(endpoint), {
    headers: { Authorization: `Bearer ${accessToken}`, "Cache-Control": "no-cache", Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new TruecallerProfileError("profile_http_error", response.status);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_PROFILE_BYTES) throw new TruecallerProfileError("profile_response_too_large");
  const text = await response.text();
  if (text.length > MAX_PROFILE_BYTES) throw new TruecallerProfileError("profile_response_too_large");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new TruecallerProfileError("profile_json_invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TruecallerProfileError("profile_shape_invalid");
  const profile = value as Record<string, unknown>;
  const rawName = profile.name && typeof profile.name === "object" ? profile.name as Record<string, unknown> : {};
  const online = profile.onlineIdentities && typeof profile.onlineIdentities === "object" ? profile.onlineIdentities as Record<string, unknown> : {};
  const phoneNumbers = Array.isArray(profile.phoneNumbers)
    ? profile.phoneNumbers.filter((phone): phone is string => typeof phone === "string" && phone.length <= 32)
    : [];
  const id = [profile.userId, profile.id].find((item) => typeof item === "string" || typeof item === "number");
  console.info("Truecaller profile shape", {
    hasId: typeof profile.id === "string" || typeof profile.id === "number",
    hasUserId: typeof profile.userId === "string" || typeof profile.userId === "number",
    phoneNumberCount: phoneNumbers.length,
    hasName: Boolean(profile.name && typeof profile.name === "object" && !Array.isArray(profile.name)),
  });
  if (id === undefined || !phoneNumbers.length) throw new TruecallerProfileError("profile_identity_incomplete");
  const name = {
    ...(typeof rawName.first === "string" ? { first: rawName.first.slice(0, 120) } : {}),
    ...(typeof rawName.last === "string" ? { last: rawName.last.slice(0, 120) } : {}),
    ...(typeof rawName.full === "string" ? { full: rawName.full.slice(0, 120) } : {}),
  };
  return {
    id: typeof profile.id === "string" || typeof profile.id === "number" ? profile.id : undefined,
    userId: typeof profile.userId === "string" || typeof profile.userId === "number" ? profile.userId : undefined,
    name,
    phoneNumbers,
    ...(typeof profile.avatarUrl === "string" && profile.avatarUrl.length <= 2048 ? { avatarUrl: profile.avatarUrl } : {}),
    onlineIdentities: typeof online.email === "string" && online.email.length <= 320 ? { email: online.email } : undefined,
  };
}

export function profileFullName(profile: TruecallerProfile) {
  const combined = [profile.name?.first, profile.name?.last].filter(Boolean).join(" ").trim();
  return (profile.name?.full?.trim() || combined || "Taskify user").slice(0, 120);
}
