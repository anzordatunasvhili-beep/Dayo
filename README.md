# Dayo Edu

A production Supabase-backed teacher workspace for student accounts, mixed group/individual subjects, scheduling, availability, and payments. There is no local demo-data fallback.

## Run locally

```bash
npm install
npm run dev
```

Create a Supabase project, copy `.env.example` to `.env.local`, add the project URL and anon key, and run `supabase/schema.sql` in the Supabase SQL editor.

Deploy the secure student provisioning function:

```bash
npx supabase functions deploy create-student
```

Enable Email authentication in Supabase. Teacher registration is available publicly; student authentication accounts can only be provisioned by their signed-in teacher through the Edge Function.

Student emails follow: `FirstName_LastName_TeacherCode@Dayo.Edu.Country_Region`.

## Production

Import the repository in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then deploy. `vercel.json` provides the SPA route fallback.

The service-role key is used only inside the Supabase Edge Function and is never exposed to the frontend.
