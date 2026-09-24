import { redirect } from "next/navigation";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { Dashboard } from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const [{ data: profile }, { data: todos, error }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,avatar_url").eq("id", user.sub).maybeSingle(),
    supabase.from("todos").select("*").order("created_at", { ascending: false }),
  ]);
  return <Dashboard initialProfile={profile} initialTodos={todos ?? []} initialTodosError={error?.message ?? null} email={String(user.email ?? "")} />;
}
