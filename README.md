# Taskify

Taskify is a task management app built with Next.js, TypeScript, and Supabase. It supports Google authentication, profile management, todo CRUD, and a drag-and-drop Kanban board.

## Features

- Google sign-in through Supabase Auth with cookie-backed Supabase SSR sessions.
- View and update profile name and avatar URL.
- Create, read, edit, and delete todos.
- Track Todo, In Progress, and Completed status; Low, Medium, and High priority; and optional due dates.
- Drag todos between Kanban columns and reorder cards. Status and position are persisted in Supabase.
- Row Level Security policies scope profile and todo access to the authenticated user.

## Requirements

- Node.js 20.9 or later
- A Supabase project with Google OAuth configured

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local`, then set the project URL and public publishable/anon key from your Supabase project:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
   ```

   Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable. `.env.local` is ignored by Git.

3. In the Supabase SQL Editor, run [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql). It creates the profile and todo tables, indexes, RLS policies, and timestamp/profile triggers.

4. Configure Google OAuth in Supabase and Google Cloud. Set the Supabase Google callback URL in Google Cloud, and add the local application callback (`http://localhost:3000/auth/callback`) to the Supabase Auth redirect allowlist. Configure the deployed callback URL when deploying.

5. Start the development server:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000`.

## Validation

```bash
npm run lint
npm run typecheck
npm run build
```

## Deployment

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the deployment environment before building. Add the deployed callback URL to Supabase Auth's redirect allowlist and configure the matching Site URL. Do not deploy a service-role key to the browser.
