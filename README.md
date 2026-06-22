# MAIA Writing Studio

A Next.js app that turns Prophet brand profiles into on-brand copy. It wraps four
MAIA Studio (Lyzr) agents — **Brand Profile Extractor**, **Compose**, **Refine**,
and **Chat** — behind a writing UI, and persists brand profiles and access state
in MongoDB.

- Framework: Next.js 16 (App Router) + React 19 + TypeScript
- Styling: Tailwind CSS + Radix UI primitives
- Data: MongoDB (via `DATABASE_URL`)
- Agents: MAIA Studio / Lyzr (via `LYZR_API_KEY`)

---

## Onboarding (new devs start here)

### 1. Create your environment file

Copy the local env file and fill in the blanks:

```bash
cp .env.example .env.local
```

for the following env variables

```bash
LYZR_API_KEY=        # your MAIA Studio / Lyzr API key
DATABASE_URL=mongodb://127.0.0.1:27017
APP_JWT_SECRET=      # any long random string for local dev
ADMIN_EMAILS=        # comma-separated admin emails (e.g. you@prophet.com)
```

See [.env.example](.env.example) for the full list of variables and notes on
optional ones (`ADMIN_EMAILS`, `NEXT_PUBLIC_DEV_USER_EMAIL`, SSO config, etc.).

### 2. Request access to the MAIA Studio agents

The app calls four agents by hardcoded ID. You need access to each in MAIA Studio
before they'll respond:

| Agent                   | Agent ID                   | Used by                                                                              |
|-------------------------|----------------------------|--------------------------------------------------------------------------------------|
| Brand Profile Extractor | `6a1f940564d5dd595c8475a1` | [app/api/brand-profile/extract/route.ts](app/api/brand-profile/extract/route.ts#L21) |
| Compose                 | `6a21b4aaf5e31cf63ebbd79f` | [app/page.tsx](app/page.tsx#L29)                                                     |
| Refine                  | `6a21b4ab8378e43bad9369d4` | [app/page.tsx](app/page.tsx#L30)                                                     |
| Chat                    | `6a21b4ab5ba5d27b5b2f7bf8` | [app/page.tsx](app/page.tsx#L31)                                                     |

Request access to all four in MAIA Studio using your `LYZR_API_KEY` account.

### 3. Install MongoDB (macOS / Homebrew)

Follow the official guide:
https://www.mongodb.com/docs/manual/administration/install-community/?operating-system=macos&macos-installation-method=homebrew

Quick version:

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community   # runs on mongodb://127.0.0.1:27017
```

Confirm it's listening (matches the default `DATABASE_URL` above):

```bash
mongosh mongodb://127.0.0.1:27017
```

---

## Run it

```bash
npm install
npm run dev
```

The dev server runs on **http://localhost:3336** (`next dev --turbo -p 3336`).

Other scripts:

```bash
npm run build   # production build
npm start       # serve the production build on :3336
npm run lint    # eslint
```

## Project layout

```
app/          App Router routes, pages, and API handlers (app/api/*)
components/   UI components (Radix-based)
lib/          Agent clients (aiAgent, streamAgent), admin/auth, scheduler, db
models/       Mongoose-style data models
response_schemas/  Expected agent response shapes
workflow.json      Agent workflow definition (Compose / Refine / Chat)
```

## Troubleshooting

- **Agent calls 401/403** — confirm `LYZR_API_KEY` is set and you've been granted
  access to all four agent IDs above.
- **DB connection errors** — make sure `brew services start mongodb-community` is
  running and `DATABASE_URL` points at it.
- **Admin features hidden** — add your email to `ADMIN_EMAILS` in `.env.local`.
