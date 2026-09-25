"use client";

import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";

type StartResponse = { nonce: string; partnerKey: string; partnerName: string; error?: string };
type PollResponse = { status?: string; error?: string };

const POLL_INTERVAL_MS = 1500;
const FLOW_TIMEOUT_MS = 2 * 60 * 1000;
const ATTEMPT_REFRESH_MS = 4 * 60 * 1000;
const ATTEMPT_LIFETIME_MS = 5 * 60 * 1000;
const ATTEMPT_REFRESH_CHECK_MS = 15 * 1000;
function makeDeepLink({ nonce, partnerKey, partnerName }: StartResponse) {
  const query = new URLSearchParams({ type: "btmsheet", requestNonce: nonce, partnerKey, partnerName });
  return `truecallersdk://truesdk/web_verify?${query.toString()}`;
}

export function TruecallerButton() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState<StartResponse | null>(null);
  const attemptRef = useRef<StartResponse | null>(null);
  const attemptStartedAt = useRef(0);
  const preparingRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  // User-agent detection only controls whether we start the flow. It never
  // controls whether the button is rendered and does not detect app presence.
  useEffect(() => setSupported(/Android/i.test(navigator.userAgent)), []);

  useEffect(() => {
    if (!supported) return;
    mountedRef.current = true;
    function prepare() {
      if (preparingRef.current) return preparingRef.current;
      const request = (async () => {
      try {
        const response = await fetch("/api/auth/truecaller/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        const result = await response.json() as StartResponse;
        if (!response.ok || !result.nonce || !result.partnerKey) throw new Error(result.error || "Unable to prepare Truecaller sign-in.");
        if (mountedRef.current) {
          attemptRef.current = result;
          setAttempt(result);
          attemptStartedAt.current = Date.now();
          setError("");
        }
      } catch (caught) {
        if (mountedRef.current) setError(caught instanceof Error ? caught.message : "Unable to prepare Truecaller sign-in.");
      }
      })();
      preparingRef.current = request;
      void request.finally(() => {
        if (preparingRef.current === request) preparingRef.current = null;
      });
      return request;
    }
    void prepare();
    const refreshTimer = window.setInterval(() => {
      if (Date.now() - attemptStartedAt.current >= ATTEMPT_REFRESH_MS) void prepare();
    }, ATTEMPT_REFRESH_CHECK_MS);
    const expiryTimer = window.setInterval(() => {
      if (Date.now() - attemptStartedAt.current >= ATTEMPT_LIFETIME_MS) {
        attemptRef.current = null;
        setAttempt(null);
      }
    }, ATTEMPT_REFRESH_CHECK_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(expiryTimer);
    };
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

  function handleClick() {
    setError("");
    if (!supported) {
      return;
    }

    const current = attemptRef.current;
    const age = Date.now() - attemptStartedAt.current;
    if (!current || age >= ATTEMPT_LIFETIME_MS) {
      attemptRef.current = null;
      setAttempt(null);
      setMessage("Truecaller is still preparing. Please try again.");
      return;
    }

    setBusy(true);
    setMessage("Opening Truecaller...");
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
      <button className="truecaller-button" disabled={busy || supported !== true || !attempt} onClick={handleClick} type="button">
        <Smartphone size={18} aria-hidden="true" />
        {busy ? "Waiting for Truecaller..." : supported === null || (supported && !attempt) ? "Preparing Truecaller..." : "Continue with Truecaller"}
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
