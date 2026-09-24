import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/profile/profile-form";

export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: profile, error } = await supabase.from("profiles").select("id,full_name,email,avatar_url").eq("id", user.sub).maybeSingle();
  return <main className="profile-page"><div className="profile-wrap"><header className="profile-header"><Link href="/dashboard" className="brand"><span className="brand-mark"><Check size={19}/></span> taskify</Link><Link href="/dashboard" className="back-link"><ArrowLeft size={16}/> Back to dashboard</Link></header><section className="profile-panel"><div className="profile-title"><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Your profile</h1><p className="muted">Manage the details associated with your account.</p></div>{error ? <p className="notice error-notice" role="alert">Couldn’t load your profile. Please refresh and try again.</p> : <ProfileForm profile={profile} email={String(user.email ?? profile?.email ?? "")}/>}</section></div></main>;
}
