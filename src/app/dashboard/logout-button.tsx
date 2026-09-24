"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage("Unable to sign out. Please try again.");
      setIsSigningOut(false);
      return;
    }

    window.location.assign("/login");
  }

  return (
    <div className="logout-control">
      {errorMessage ? (
        <p aria-live="polite" className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        className="secondary-button"
        disabled={isSigningOut}
        onClick={handleSignOut}
        type="button"
      >
        {isSigningOut ? "Signing out…" : "Log out"}
      </button>
    </div>
  );
}
