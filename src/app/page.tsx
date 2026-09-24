import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getAuthenticatedUser();

  redirect(user ? "/dashboard" : "/login");
}
