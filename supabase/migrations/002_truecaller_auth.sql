-- Private state used only by the server-side Truecaller authentication flow.
create table public.truecaller_login_attempts (
  id uuid primary key default gen_random_uuid(),
  nonce_hash text not null unique,
  browser_binding_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'flow_invoked', 'callback_received', 'processing', 'rejected', 'complete', 'failed')),
  expires_at timestamptz not null,
  encrypted_access_token text,
  profile_endpoint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index truecaller_login_attempts_expires_at_idx
  on public.truecaller_login_attempts (expires_at);
create index truecaller_login_attempts_status_expires_at_idx
  on public.truecaller_login_attempts (status, expires_at);

create table public.truecaller_identities (
  id uuid primary key default gen_random_uuid(),
  truecaller_subject_hash text not null unique,
  supabase_user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.truecaller_login_attempts enable row level security;
alter table public.truecaller_identities enable row level security;

-- No client policy is intentional. Only the server-side service-role client
-- can access these tables; RLS remains enabled as defense in depth.
revoke all on public.truecaller_login_attempts from anon, authenticated;
revoke all on public.truecaller_identities from anon, authenticated;
grant all on public.truecaller_login_attempts to service_role;
grant all on public.truecaller_identities to service_role;

create trigger set_truecaller_login_attempts_updated_at
  before update on public.truecaller_login_attempts
  for each row execute function public.handle_updated_at();

create trigger set_truecaller_identities_updated_at
  before update on public.truecaller_identities
  for each row execute function public.handle_updated_at();
