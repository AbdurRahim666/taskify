import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { getAuthenticatedUser } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

const authenticationErrors: Record<string, string> = {
  callback: "We could not complete your sign-in. Please try again.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;

  return <LoginForm initialError={error ? authenticationErrors[error] : undefined} />;
}
