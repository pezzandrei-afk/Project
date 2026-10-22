# Scoreline

Scoreline is a mobile-friendly, real-time scoreboard for two teams.

- **Managers** create an account to manage events containing multiple games. Each event has one permanent spectator QR; managers start each queued game when it is ready.
- **Spectators** open a public, read-only live scoreboard without an account or app install.
- **Mis-tap recovery** is available through undo-last-score. Manager accounts keep event schedules available across devices.

## Features

- Live score synchronization with Supabase Realtime
- +1, +2, and +3 score buttons, score adjustment, reset, and undo
- Team names, colors, and mascot badges
- Private manager event history; spectators only see the scoreboard
- An event schedule with manually started matchups and one stable spectator link/QR
- Email/password manager accounts; spectators never need to sign in
- Mobile-friendly web app and optional Android APK
- Installable PWA with a network-first app shell and cached static assets for offline startup

## Requirements

- Node.js (LTS) and npm
- A Supabase project
- A Cloudflare account for web hosting (free Pages plan is suitable for this static app)
- Optional for Android: Android Studio with its Android SDK and a compatible Java JDK

## 1. Set up the Supabase database

In the Supabase dashboard, open **SQL Editor** and run the SQL file(s) that match your database:

1. **New project:** run [`supabase/schema.sql`](./supabase/schema.sql), then [`supabase/migration_event_series.sql`](./supabase/migration_event_series.sql).
2. **Existing project already using team colors and `game_events`:** run [`supabase/migration_scoring_undo.sql`](./supabase/migration_scoring_undo.sql), then [`supabase/migration_event_series.sql`](./supabase/migration_event_series.sql).
3. **Existing project with only the original games schema:** run [`supabase/migration_add_colors_events.sql`](./supabase/migration_add_colors_events.sql), then [`supabase/migration_scoring_undo.sql`](./supabase/migration_scoring_undo.sql), then [`supabase/migration_event_series.sql`](./supabase/migration_event_series.sql).

Run them in order and check that each SQL Editor result reports success. The event migration adds the event table, scheduled-game status, event-owner RPCs, and Realtime publication. Do not run the original schema over a populated database as an upgrade; use the appropriate migrations instead.

### Enable manager accounts

In Supabase, open **Authentication → Providers → Email** and ensure email/password sign-in is enabled. Keep email confirmation enabled if you want to verify manager email addresses; new managers must click the confirmation email before their first sign-in. Spectators do not use Supabase Auth.

In **Authentication → URL Configuration**, set the **Site URL** to your deployed app URL. Add the local development URL (`http://localhost:5173`) and deployed app URL to **Redirect URLs**. If you use a preview deployment, add that URL too. The app sends confirmation and password-reset links back to the current app origin, so each origin must be allow-listed.

The app needs the Supabase **Project URL** and a **publishable key** (or legacy anon key). In Supabase, find these in the project's **Connect** panel or **Project Settings → API**. The URL looks like `https://<project-id>.supabase.co`. The frontend key is public by design; never use a `service_role` or secret key in this app.

## 2. Configure and run locally

Create a file named `.env.local` in the project folder and set the values from Supabase:

```env
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
VITE_PUBLIC_APP_URL=http://localhost:5173
```

`VITE_PUBLIC_APP_URL` is the public website base URL used to create spectator links and QR codes. The local value is useful for local testing; change it to the deployed HTTPS domain before building for production or Android. If using an older Supabase anon key, `VITE_SUPABASE_ANON_KEY` is also supported.

Install dependencies and start the development server:

```powershell
npm ci
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

## 3. Test the app before deployment

Run the project's checks:

```powershell
npm run lint
npm run build
npm test
```

Then use two browser windows or devices to test both the single-game and event flows:

1. In one window, create a scoreboard and confirm the manager console opens.
2. Use +1, +2, and +3 and confirm the score updates; test **Undo last score**, **Reset 0-0**, and finish/resume.
3. Edit team names, colors, and badges and confirm the updated scoreboard is visible.
4. Copy the **spectator** link or scan its QR code in a second window. Confirm it shows live updates, has no manager controls or event history, and its Back button does not leave the current game.
5. Return to the manager window and use **Save recovery link**. Open that link in a private/incognito window and confirm the manager key restores manager access. Treat this link like a password.
6. Return to the home page and check **My recent games** on the original browser/device.
7. Create a manager account with an email address and password. If email confirmation is enabled, confirm it from the mailbox, then sign in.
8. Create an event, add at least two games, and check that both appear in queue order.
9. Copy or scan the event QR in the spectator window before starting a game. It should show a waiting message; leave it open.
10. In the manager event page, tap **Start game**. The already-open spectator event page should switch to that game automatically.
11. Score, undo, and finish the game. Start the next queued game from the event page; the same spectator page should follow it without scanning again.
12. On the deployed HTTPS site, use the browser's install option to install Scoreline. Confirm the service worker is registered and the app still loads its latest version after a redeploy.

Undo requires `migration_scoring_undo.sql` to have been applied. Older score history without recorded score deltas cannot be undone.

## 4. Deploy the web app to Cloudflare Pages

### Configure the production URL

Choose the public HTTPS URL for the app, such as the `*.pages.dev` address Cloudflare will assign or a custom domain. You will use this exact base URL for `VITE_PUBLIC_APP_URL`.

### Create the Pages site

1. Push the project to a GitHub repository.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. Configure the build:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** the repository directory containing this `package.json` (usually `/`)
4. In the Pages project settings, add these **build environment variables** for Production (and Preview if you want preview deployments to connect):
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — your Supabase publishable key
   - `VITE_PUBLIC_APP_URL` — your final public HTTPS site URL, without a trailing slash
5. Save the settings and deploy. Wait for the build to complete, then open the deployment URL.

Vite embeds `VITE_*` values at build time. If you change an environment variable, trigger a new deployment for it to take effect. When using a custom domain, update `VITE_PUBLIC_APP_URL` to that domain and redeploy. Do not put Supabase secret/service-role keys in Cloudflare's frontend build variables.

The production build includes `manifest.json` and `sw.js` from `public/`. The app registers the service worker automatically on production HTTPS deployments (and localhost); the worker caches only same-origin app assets and never caches Supabase/API traffic. Cloudflare Pages serves this SPA's direct `/e/<EVENT_CODE>` route from the app shell.

### Verify the deployed app

Repeat the manager/spectator checks above using the deployed HTTPS site. Check that the stable event spectator URL, `https://<your-site>/e/<EVENT_CODE>`, loads when opened directly or refreshed. Verify that:

- The page loads and connects to Supabase.
- Scores update live in a separate spectator window.
- The QR code points to the deployed HTTPS domain, not `localhost` or an Android-local URL.
- An event QR opened before a match starts updates to the first game, then follows the next game after the manager starts it.
- Spectators cannot access score controls or the manager event history.
- Manager sign-in and event management work on another browser/device.

## 5. Optional: build the Android APK

First complete a successful web deployment and set `VITE_PUBLIC_APP_URL` to its public HTTPS URL. The APK uses this value for spectator links; `localhost` and the Capacitor origin are not shareable public URLs.

From the project folder in PowerShell:

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
```

The debug APK is created at `android\app\build\outputs\apk\debug\app-debug.apk`. Install it on an Android device for testing, create a game, and scan the spectator QR with a second device. The APK is a debug build for testing; prepare a signed release build before distributing publicly.

## Useful commands

- `npm run dev` — run the local development server
- `npm run lint` — lint the source files
- `npm run build` — type-check and build the production web app into `dist`
- `npm run preview` — locally preview the production build
- `npm run cap:sync` — sync the web build into the native Android project
- `npm run cap:android` — open the Android project in Android Studio

## Troubleshooting

- **“This app is not connected to Supabase”** — check the URL/key names in `.env.local`, then restart `npm run dev`. For deployment, check Pages build environment variables and redeploy.
- **RPC/schema-cache error or undo unavailable** — run the required database migration in Supabase SQL Editor and wait for it to complete.
- **Game won't update live** — confirm the schema/migration completed successfully and that the `games` and `game_events` tables are in the `supabase_realtime` publication.
- **QR/link uses the wrong address** — set `VITE_PUBLIC_APP_URL` to the deployed site URL and rebuild/redeploy. Vite environment values are fixed at build time.
- **QR opens `/g/<GAME_CODE>` instead of following the event** — `/g/` is the single-game link. Open the manager's event dashboard and share its **ONE PERMANENT SPECTATOR QR**, which uses `/e/<EVENT_CODE>`. If the event dashboard itself shows `/g/`, redeploy the latest app build and check that you opened `/event/<EVENT_CODE>`, not a standalone game manager page.
- **PWA shows an old app after deployment** — the service worker fetches navigations from the network first and uses cached app files only when offline. Reload while online; do not manually reuse an old single-game QR as the event QR.
- **QR opens `/g/<GAME_CODE>` instead of following the event** — `/g/` is the single-game link. Open the manager's event dashboard and share its **ONE PERMANENT SPECTATOR QR**, which uses `/e/<EVENT_CODE>`. If the event dashboard itself shows `/g/`, redeploy the latest app build and check that you opened `/event/<EVENT_CODE>`, not a standalone game manager page.
- **PWA shows an old app after deployment** — the service worker fetches navigations from the network first and uses cached app files only when offline. Reload while online; do not manually reuse an old single-game QR as the event QR.
- **Cannot create an event or sign in** — confirm Email auth is enabled in Supabase and, if email confirmation is required, verify the address before signing in.
- **Event QR does not move to the next game** — leave the `/e/<EVENT_CODE>` page open, check that `scoreboard_events` is included in the `supabase_realtime` publication, and ensure the manager started the next queued game from the event dashboard.
