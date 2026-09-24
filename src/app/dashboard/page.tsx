import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const [{ data: profile }, { data: todos, error }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,phone,avatar_url").eq("id", user.sub).maybeSingle(),
    supabase.from("todos").select("*").order("created_at", { ascending: false }),
  ]);
  const rawEmail = String(user.email ?? "");
  const email = rawEmail.endsWith("@accounts.taskify.invalid") ? "" : rawEmail;
  const safeProfile = profile ? { ...profile, email: profile.email?.endsWith("@accounts.taskify.invalid") ? null : profile.email } : null;
  return <Dashboard initialProfile={safeProfile} initialTodos={todos ?? []} initialTodosError={error?.message ?? null} email={email} />;
}
