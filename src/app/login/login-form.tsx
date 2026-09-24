"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  initialError?: string;
};

export function LoginForm({ initialError }: LoginFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(initialError ?? "");

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setErrorMessage("Unable to start Google sign-in. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section aria-labelledby="login-heading" className="auth-panel">
        <p className="wordmark">Taskify</p>
        <h1 id="login-heading">Organize your work. Get things done.</h1>
        <p className="auth-copy">Sign in to continue to your workspace.</p>

        {errorMessage ? (
          <p aria-live="polite" className="form-error" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <button
          className="google-button"
          disabled={isSubmitting}
          onClick={handleGoogleSignIn}
          type="button"
        >
          {isSubmitting ? "Connecting to Google…" : "Continue with Google"}
        </button>
      </section>
    </main>
  );
}
