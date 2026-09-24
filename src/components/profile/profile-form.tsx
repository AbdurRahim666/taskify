"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ profile, email }: { profile: { id: string; full_name: string | null; email: string | null; avatar_url: string | null } | null; email: string }) {
  const [name, setName] = useState(profile?.full_name ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFeedback(null);
    const client = createClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) { setFeedback({kind:"error",message:"Your session has expired. Please sign in again."}); setBusy(false); return; }
    const values = { id: auth.user.id, full_name: name.trim() || null, avatar_url: avatar.trim() || null, email };
    const { error } = profile ? await client.from("profiles").update({ full_name: values.full_name, avatar_url: values.avatar_url }).eq("id", auth.user.id) : await client.from("profiles").insert(values);
    setFeedback(error ? {kind:"error",message:error.message} : {kind:"success",message:"Your profile has been updated."}); setBusy(false);
  }
  return <form onSubmit={submit} className="profile-form"><div className="profile-avatar">{avatar ? <Image src={avatar} alt="Profile avatar preview" width={75} height={75} unoptimized/> : <UserRound size={31}/>}</div><p className="avatar-caption">Profile photo preview</p><label>Full name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} autoComplete="name" placeholder="Your name"/></label><label>Email address<input value={email} readOnly disabled autoComplete="email"/><small>Your email is managed by your sign-in provider.</small></label><label>Avatar URL<input type="url" value={avatar} onChange={event => setAvatar(event.target.value)} placeholder="https://example.com/photo.jpg" autoComplete="url"/><small>Use a public image URL. Leave blank to use your initials.</small></label>{feedback && <p className={`notice ${feedback.kind === "error" ? "error-notice" : "success-notice"}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.kind === "success" && <Check size={16}/>} {feedback.message}</p>}<div className="profile-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div></form>;
}
