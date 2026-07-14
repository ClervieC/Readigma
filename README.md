# Readigma

A social reading tracker built as a single universal Expo Router app (iOS, Android, and web) on top of **Supabase** (Postgres + Auth). There is no separate backend server — the app talks to Supabase directly via `@supabase/supabase-js`, with Row-Level Security enforcing who can read/write what, and a couple of Postgres functions replacing what used to be custom REST endpoints. Book search/discovery comes from **Open Library**'s free, keyless API, called directly from the client. The only server-side code left is one small `+api.ts` route bundled in this same project, for sending push notifications (the one thing that needs a secret).

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account and project
- Expo Go app on your phone (or an iOS/Android simulator) — or just a browser for web

## 1. Create the Supabase project

1. Create a project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor** and run [db/schema.sql](db/schema.sql) — this creates every table, its Row-Level Security policies, and the Postgres functions the app calls instead of a custom backend. It references Supabase's built-in `auth.users` table directly, so nothing else needs configuring first.
   - If you already ran a previous version of `schema.sql` against this project, don't paste the whole file again (it'll fail on "relation already exists" for tables you already have). Run the relevant file under [db/migrations/](db/migrations/) instead — each one is a self-contained, idempotent add-on for a specific feature.
3. In **Project Settings → API**, note the **Project URL**, the **anon public** key, and the **service_role** key (the last one is a server-only secret — never put it in client code).
4. Email/password auth is on by default. If your project has "Confirm email" enabled (Settings → Authentication), signups will need a confirmation click before they get a session — the app already handles this (see `lib/pendingUsername.ts`), it just means the very first test signup won't be usable until you click the confirmation link Supabase emails out.

## 2. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Where it's used | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | client | Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | client | Project Settings → API → anon public key |
| `EXPO_PUBLIC_API_URL` | client | Only needed if a native build isn't served from the same dev server (see below) |
| `SUPABASE_SERVICE_ROLE_KEY` | server (`app/api/push/send+api.ts`) | Project Settings → API → service_role key — bypasses RLS, never expose to the client |

No API key is needed for book search — it's all Open Library, which is free and keyless.

## 3. Run the app

```bash
npm install
npm run web       # browser
npm run ios       # iOS simulator
npm run android   # Android emulator
npm start         # Expo Go QR code menu
```

On a physical device in dev mode, the app's own `/api/*` routes (see below) are served by the same Metro dev server your phone already connects to for the JS bundle, so no extra config is needed there. `EXPO_PUBLIC_API_URL` only matters once you deploy (e.g. via EAS Hosting) and want a native build to hit that deployed URL instead.

## Project structure

```
readigma/
├── app/
│   ├── (auth)/          login, register
│   ├── (tabs)/           Découvrir, Feed, Bibliothèque, Chercher, Profil
│   ├── book/[id].tsx     book detail (status, progress, ratings, reactions)
│   ├── friends/          friends list/search + a friend's public profile
│   ├── goal.tsx, suggest-book.tsx, notifications.tsx, edit-profile.tsx, onboarding.tsx, help.tsx
│   └── api/push/send+api.ts   the only server code: looks up a push token and sends the notification
├── lib/                  supabase.ts (the client), books.ts (talks to Open Library directly),
│                         pendingUsername.ts (email-confirmation signup flow), and one module
│                         per other feature (userBooks, friends, goals, feed, suggestions)
├── context/              AuthContext (session + profile), ThemeContext (dark/light)
├── components/           shared UI (TabBar, ...)
├── theme/                color palette, radius, shadows
└── db/schema.sql         tables, RLS policies, and the Postgres functions that replace
                           what used to be Express routes (feed, randomizer, goal stats, ...)
```

## Why one server route still exists

Everything else talks to Supabase directly from the client — `@supabase/supabase-js` is proven to work the same on web and React Native (session persisted via `AsyncStorage`, same as this project's other Expo Router app, Epify). Book search goes straight to Open Library too, since it needs no key. The one thing that stays server-side is `app/api/push/send+api.ts`: looking up another user's push token to send a notification, kept out of the client-readable `profiles` table entirely (see `db/schema.sql`'s `push_tokens` table) and read there with the `service_role` key, which bypasses RLS.
