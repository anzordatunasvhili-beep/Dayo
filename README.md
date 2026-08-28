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
npx supabase functions deploy create-livekit-token
```

## Online classroom

Apply the migrations, then configure these Supabase Edge Function secrets:

```bash
npx supabase db push
npx supabase secrets set LIVEKIT_URL=wss://classroom.example.com LIVEKIT_API_KEY=your-key LIVEKIT_API_SECRET=your-secret
```

`LIVEKIT_URL` is the public WebSocket URL of a self-hosted LiveKit server on a separate VPS. Configure that server with the same API key and secret, TLS, and UDP/TCP media ports (7880/7881 plus the configured RTP range). The Vercel app needs only the Supabase URL/anon key; never add `LIVEKIT_API_SECRET` or a service-role key to Vercel.

The classroom is available from the Join button on an existing lesson and uses that lesson's teacher/audience access rules. Joining does not change attendance or billing. The MVP includes LiveKit audio/video/screen sharing, a manual Canvas whiteboard with Broadcast sync and periodic persistence, persistent lesson chat, and Presence metadata. Whiteboard text/select tools are intentionally basic, and screen share requires browser permission.

Enable Email authentication in Supabase. Teacher registration is available publicly; student authentication accounts can only be provisioned by their signed-in teacher through the Edge Function.

Student emails follow: `FirstName_LastName_TeacherCode@Dayo.Edu.Country_Region`.

## Production

Import the repository in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then deploy. `vercel.json` provides the SPA route fallback.

The service-role key is used only inside the Supabase Edge Function and is never exposed to the frontend.
