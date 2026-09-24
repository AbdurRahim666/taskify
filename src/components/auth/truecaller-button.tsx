"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";

type StartResponse = { nonce: string; partnerKey: string; partnerName: string; error?: string };
type PollResponse = { status?: string; error?: string };

const POLL_INTERVAL_MS = 1500;
const FLOW_TIMEOUT_MS = 2 * 60 * 1000;
function makeDeepLink({ nonce, partnerKey, partnerName }: StartResponse) {
  const query = new URLSearchParams({ type: "btmsheet", requestNonce: nonce, partnerKey, partnerName });
  return `truecallersdk://truesdk/web_verify?${query.toString()}`;
}

export function TruecallerButton() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const attemptRef = useRef<StartResponse | null>(null);
  const attemptStartedAt = useRef(0);

  // User-agent detection only controls whether we start the flow. It never
  // controls whether the button is rendered and does not detect app presence.
  useEffect(() => setSupported(/Android/i.test(navigator.userAgent)), []);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    async function prepare() {
      try {
        const response = await fetch("/api/auth/truecaller/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        const result = await response.json() as StartResponse;
        if (!response.ok || !result.nonce || !result.partnerKey) throw new Error(result.error || "Unable to prepare Truecaller sign-in.");
        if (active) {
          attemptRef.current = result;
          attemptStartedAt.current = Date.now();
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to prepare Truecaller sign-in.");
      }
    }
    void prepare();
    return () => { active = false; };
  }, [supported]);

  async function poll(nonce: string) {
    const deadline = Date.now() + FLOW_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      const response = await fetch("/api/auth/truecaller/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
        cache: "no-store",
      });
      const result = await response.json() as PollResponse;
      if (!response.ok) throw new Error(result.error || "This sign-in attempt expired. Please try again.");
      if (result.status === "complete") {
        window.location.assign("/dashboard");
        return;
      }
      if (result.status === "rejected") throw new Error("You declined to share your Truecaller profile. You can try again or use Google.");
      if (result.status === "failed") throw new Error("Truecaller could not verify your profile. Please try again or use Google.");
      if (result.status === "flow_invoked") setMessage("Approve the request in Truecaller to continue.");
      if (result.status === "pending") setMessage("Waiting for Truecaller to open. Confirm that the Truecaller app is installed, or use Google.");
    }
    throw new Error("Sign-in timed out. Please try again or continue with Google.");
  }

  async function handleClick() {
    setError("");
    if (!supported) {
      return;
    }

    let current = attemptRef.current;
    if (!current || Date.now() - attemptStartedAt.current > 4 * 60 * 1000) {
      setBusy(true);
      try {
        const response = await fetch("/api/auth/truecaller/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        const result = await response.json() as StartResponse;
        if (!response.ok || !result.nonce || !result.partnerKey) throw new Error(result.error || "Unable to prepare Truecaller sign-in.");
        current = result;
        attemptRef.current = result;
        attemptStartedAt.current = Date.now();
      } catch (caught) {
        setBusy(false);
        setError(caught instanceof Error ? caught.message : "Unable to prepare Truecaller sign-in.");
        return;
      }
    }
    if (!current) return;

    setBusy(true);
    setMessage("Opening Truecaller...");
    attemptStartedAt.current = Date.now();
    // Launch the custom scheme from the user's tap on supported Android.
    window.location.href = makeDeepLink(current);
    void poll(current.nonce).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Truecaller sign-in failed.");
      setMessage("");
      setBusy(false);
      attemptRef.current = null;
    });
  }

  return (
    <div className="truecaller-auth">
      <button className="truecaller-button" disabled={busy || supported !== true} onClick={handleClick} type="button">
        <Smartphone size={18} aria-hidden="true" />
        {busy ? "Waiting for Truecaller..." : supported === null ? "Preparing Truecaller..." : "Continue with Truecaller"}
      </button>
      {supported === false ? (
        <p className="truecaller-support-note" aria-live="polite" role="status">
          Truecaller Mobile Web requires a supported Android browser with the Truecaller app installed. Google sign-in is available above.
        </p>
      ) : null}
      {message ? <p className="auth-copy" aria-live="polite" role="status">{message}</p> : null}
      {error ? <p className="form-error" aria-live="polite" role="alert">{error}</p> : null}
    </div>
  );
}
