# Taskify

Taskify is a task management application built with Next.js, TypeScript, and Supabase. It provides Google OAuth and Truecaller Mobile Web sign-in, profile management, and a drag-and-drop Kanban todo board.

## Features

- Google OAuth through Supabase Auth with cookie-backed Supabase SSR sessions.
- Truecaller Mobile Web sign-in for supported Android browsers, bridged to a normal Supabase Auth session.
- View and update profile name and avatar; Truecaller accounts also show their verified phone number.
- Create, read, edit, and delete todos.
- Todo, In Progress, and Completed status; Low, Medium, and High priority; optional due dates.
- Drag todos between Kanban columns and reorder cards with positions persisted in Supabase.
- Row Level Security scopes profile and todo access to the authenticated user. Truecaller attempt and identity tables have RLS enabled and no client-facing policies.

## Requirements

- Node.js 20.9 or later
- A Supabase project with Google OAuth configured
- A Truecaller developer Web application and partner key to enable Truecaller sign-in

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and configure the variables listed below. `.env.local` is ignored by Git. Keep service-role and cryptographic keys server-side; never prefix them with `NEXT_PUBLIC_`.

3. Apply both database migrations, in order, in the Supabase SQL Editor:

   - [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   - [`supabase/migrations/002_truecaller_auth.sql`](supabase/migrations/002_truecaller_auth.sql)

   The second migration creates private Truecaller login-attempt and identity-mapping tables. It does not change todo policies or the existing profile/todo schema.

4. Configure Google OAuth in Supabase and Google Cloud. Set the Supabase Google callback URL in Google Cloud, and add the local application callback (`http://localhost:3000/auth/callback`) to Supabase Auth's redirect allowlist.

5. For Truecaller, configure the public app domain and HTTPS callback URL described below. Localhost is not an acceptable callback; use a deployed HTTPS environment or a temporary HTTPS tunnel and configure that exact callback in the Truecaller developer portal.

6. Start the development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

## Environment variables

Required Supabase variables:

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public publishable/anon key used by browser and SSR clients |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase Auth administration and private Truecaller tables |

Required to enable Truecaller:

| Variable | Use |
| --- | --- |
| `TRUECALLER_APP_KEY` | Partner key required in the documented Mobile Web deep link; it is returned to the browser at runtime because the SDK requires it there. It is not the Supabase service-role key. |
| `TRUECALLER_TOKEN_ENCRYPTION_KEY` | Base64 encoding of 32 random bytes for encrypting temporary callback tokens |
| `TRUECALLER_IDENTITY_HASH_KEY` | At least 32 random characters used as the server-side HMAC key for provider identity mapping |
| `TRUECALLER_PROFILE_API_ORIGIN` | Exact HTTPS origin of the profile endpoint returned by Truecaller, for example the host assigned to the app; no path or trailing endpoint |
| `TRUECALLER_APP_NAME` | Display name shown in the Truecaller consent dialog (Taskify by default) |

Generate independent random values for the encryption and identity keys. For example, a local Node command can generate a base64 key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`; do not commit its output. Set the profile API origin to the exact origin shown in your Truecaller callback/profile endpoint. Do not add credentials to source control or client bundle environment variables.

## Truecaller dashboard setup

In the Truecaller developer portal, create/configure a **Web** application with:

- App domain: `taskify-jjtus3dqc-cortex-ai2.vercel.app` (or the active production custom domain).
- Callback URL: `https://taskify-jjtus3dqc-cortex-ai2.vercel.app/api/auth/truecaller/callback`.
- The matching partner key stored as `TRUECALLER_APP_KEY` in Vercel.

The callback must be publicly reachable over HTTPS and accept Truecaller's POST requests. For a preview deployment or HTTPS tunnel, register its exact domain and callback with Truecaller before testing. Mobile Web flow is supported on Android browsers with the Truecaller app installed; other devices should use Google sign-in.

## Supabase setup for the session bridge

The server creates/looks up a Supabase Auth user for the Truecaller identity and uses the supported Admin `generateLink` API followed by `verifyOtp` through the existing cookie-backed SSR client. In Supabase Auth settings, keep the Email provider enabled so the one-time magic-link token can be generated and verified; no email is sent by this custom server-side bridge. Apply migration `002_truecaller_auth.sql` before enabling the feature.

Truecaller identities are not automatically merged with Google users based on a phone number or optional email. Account linking needs a separate, explicit authenticated flow.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment

Configure the eight environment variables above in Vercel for the relevant environments. `SUPABASE_SERVICE_ROLE_KEY`, `TRUECALLER_TOKEN_ENCRYPTION_KEY`, and `TRUECALLER_IDENTITY_HASH_KEY` must remain server-only. The Truecaller partner key is necessarily included in the SDK deep link and is returned at runtime, in line with the Mobile Web SDK model. Configure the production domain/callback in the Truecaller portal and the Google redirect allowlist in Supabase. Do not claim Truecaller is verified until a full Android end-to-end test has passed.
