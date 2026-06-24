# MAIA Writing Studio

A Next.js app that turns Prophet brand profiles into on-brand copy. It wraps four MAIA Studio (Lyzr) agents — **Brand Profile Extractor**, **Compose**, **Refine**, and **Chat** — behind a writing UI, and persists brand profiles and access state in MongoDB.

**Tech Stack:**

- Framework: Next.js 16 (App Router) + React 19 + TypeScript
- Styling: Tailwind CSS + Radix UI primitives
- Data: MongoDB (via `DATABASE_URL`)
- Agents: MAIA Studio / Lyzr (via `LYZR_API_KEY`)
- Auth: Keycloak SSO (production) + local dev fallback

---

## Project Overview

### What It Does

The Writing Studio is a brand-aware AI writing assistant that helps teams create on-brand content across multiple channels (email, social, web, etc.). Users can:

- **Learn** — Understand their brand through an AI-extracted brand profile
- **Compose** — Generate new copy from scratch using brand guidance
- **Refine** — Iteratively improve copy with brand-aware edits stacked across multiple passes
- **Chat** — Ask questions about their brand or specific copy pieces

Brand profiles are extracted from uploaded brand guidelines (PDFs, docs, etc.) and stored per-user in MongoDB. Admin users can manage access control via unlock requests.

### Key Features

- **Brand Profile Extraction** — AI-powered extraction of brand identity from uploaded files
- **Multi-mode writing** — Learn, Compose, Refine, Chat modes for different workflows
- **Iterative refinement** — Cumulative pass-over-pass edits that stack improvements
- **Admin dashboard** — Unlock request approval/denial for brand profile access control
- **User identity** — SSO-based auth with admin/member roles
- **Per-browser isolation** — Profiles are scoped by browser via RLS (`userId` header)

---

## Onboarding (new devs start here)

### 1. Create your environment file

Copy the local env file and fill in the blanks:

```bash
cp .env.example .env.local
```

Fill in the following:

```bash
LYZR_API_KEY=        # your MAIA Studio / Lyzr API key
LYZR_USER_ID=        # your Prophet email (default user for agent calls)
DATABASE_URL=mongodb://127.0.0.1:27017/writing-studio
APP_JWT_SECRET=      # any long random string (e.g., openssl rand -hex 16)
ADMIN_EMAILS=        # comma-separated admin emails (e.g., you@prophet.com)
```

See [.env.example](.env.example) for the full list of variables, including optional SSO and public client-side config.

### 2. Request access to the MAIA Studio agents

The app calls four agents by hardcoded ID. You need access to each in MAIA Studio before they'll respond:

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

Confirm it's listening:

```bash
mongosh mongodb://127.0.0.1:27017
```

---

## Run It

```bash
npm install
npm run dev
```

The dev server runs on **http://localhost:3336** (`next dev --turbo -p 3336`).

### Other scripts

```bash
npm run build   # production build
npm start       # serve the production build on :3336
npm run lint    # eslint
```

---

## Project Structure

```
app/
  page.tsx                          # Main layout and tabs (Learn / Compose / Refine / Chat)
  sections/                         # Tab-specific sections (LearnSection, WriteSection, etc.)
  api/
    sso-config/                     # SSO configuration endpoint
    brand-profile/
      apply/                        # Save brand profile edits
      extract/                      # Extract profile from uploaded files
      unlock/                       # Request unlock for a profile
    admin/
      unlock-requests/              # Admin: view, approve, deny unlock requests
    chat/                           # Chat mode API
    agent/                          # Generic agent call wrapper

components/
  SSOGuard.tsx                      # Auth gate; provides useSSO() hook
  BrandProfileProvider.tsx          # User context + userId; includes headers on API calls
  BrandOnboardingModal.tsx          # Upload brand guidelines
  AvatarDropdown.tsx                # User avatar + settings menu
  ExplainSection.tsx                # Learn mode UI
  AdminRequestsModal.tsx            # Admin unlock request management

lib/
  aiAgent.ts                        # Call Lyzr agents (Compose, Refine, Chat)
  streamAgent.ts                    # Stream agent responses
  userEmail.ts                      # Email resolution + USER_EMAIL_HEADER constant
  userId.ts                         # Browser userId generation + USER_ID_HEADER constant
  userInitials.ts                   # Generate user initials from name
  admin.ts                          # Admin email validation
  brandProfile.ts                   # Brand profile fetch/apply logic
  brandContextPrompt.ts             # Brand context included in agent calls

models/
  brandProfile.ts                   # Mongoose brand profile schema
  unlockRequest.ts                  # Mongoose unlock request schema

response_schemas/                   # Expected agent response shapes (TypeScript interfaces)

AUTHENTICATION.md                   # Detailed auth architecture and user identity flow
README.md                           # This file
```

---

## Architecture & Key Concepts

### Authentication & User Identity

User identity is determined by a multi-layer system with fallback for both production (Keycloak SSO) and local development.

**See [AUTHENTICATION.md](AUTHENTICATION.md) for:**
- How user identity is resolved (Keycloak → localStorage → env)
- User identity headers (`x-brand-user-email`, `x-brand-user-id`)
- Admin access control
- User display (avatar initials)

### User Data Flow

1. **Auth Gate** — `SSOGuard` initializes; user logs in via Keycloak (prod) or dev fallback
2. **Identity Context** — `useSSO()` hook provides `email`, `givenName`, `familyName`, `isAdmin`
3. **Browser Scoping** — `BrandProfileProvider` generates per-browser `userId` for RLS
4. **API Headers** — All API calls include `x-brand-user-email` and `x-brand-user-id` headers
5. **Server-side Checks** — API routes verify user identity and scope database queries by `userId`

### Brand Profile Lifecycle

1. **Upload** — User uploads brand guidelines (PDF, doc, etc.) via `BrandOnboardingModal`
2. **Extract** — `POST /api/brand-profile/extract` calls Brand Profile Extractor agent
3. **Store** — Profile is saved to MongoDB scoped by `userId`
4. **Use** — All agent calls (Compose, Refine, Chat) include brand context from the profile
5. **Edit** — User can edit profile; edits are locked until approved by admin (unlock request)

### Admin Unlock Requests

When a user edits their brand profile, the edit is locked pending admin approval:

1. **Request Created** — Edit triggers an unlock request (stored in MongoDB)
2. **Admin Dashboard** — Admins see pending requests in `AdminRequestsModal`
3. **Approve/Deny** — Admin can approve (unlocks edit) or deny (discards edit)
4. **Email Notification** — User receives email when request is processed (not yet implemented)

---

## API Routes

### Brand Profile

- `GET /api/brand-profile` — Fetch current user's brand profile
- `POST /api/brand-profile/apply` — Save profile edits (creates unlock request if edited)
- `POST /api/brand-profile/extract` — Extract profile from uploaded file
- `POST /api/brand-profile/unlock` — Request unlock for a profile edit

### Admin

- `GET /api/admin/unlock-requests` — List unlock requests (filtered by status)
- `POST /api/admin/unlock-requests/:id/approve` — Approve an unlock request
- `POST /api/admin/unlock-requests/:id/deny` — Deny an unlock request

### Chat & Agents

- `POST /api/chat` — Chat with the MAIA Chat agent about a brand
- `POST /api/agent` — Generic agent call wrapper (used by Compose, Refine, Chat)

### Config

- `GET /api/sso-config` — SSO configuration (Keycloak URL, realm, client ID, admin emails)

---

## Development

### Code Conventions

- **No comments** — Code should be self-documenting through clear naming
- **Minimal error handling** — Only validate at system boundaries (user input, external APIs)
- **Avoid premature abstraction** — Three similar lines is better than a premature abstraction
- **Prefer editing over creating** — Only create new files when necessary

### Working with the Database

MongoDB is used for:

- Brand profiles (`models/brandProfile.ts`)
- Unlock requests (`models/unlockRequest.ts`)

Schema design:

- Documents are scoped by `userId` (per-browser isolation via RLS)
- Admin features use `email` header for verification

### Working with Agents

All agent calls go through:

- **`callAIAgent()`** — Single-shot agent calls (Compose, Refine, Chat)
- **`streamAgent()`** — Streaming agent responses to the client
- **Brand Context** — Every call includes the user's brand profile via [lib/brandContextPrompt.ts](lib/brandContextPrompt.ts)

See [lib/aiAgent.ts](lib/aiAgent.ts) for examples.

---

## Local Development Tips

### Set a dev user

Without SSO enabled, use one of these to set your identity:

```bash
# Via environment variable
export NEXT_PUBLIC_DEV_USER_EMAIL=you@example.com

# Via query parameter (one-time override)
http://localhost:3336?as=admin

# Via localStorage (browser console)
localStorage.setItem('brand-studio-user-email', 'you@example.com')
```

### Make yourself an admin

Add your email to `ADMIN_EMAILS` in `.env.local`:

```bash
ADMIN_EMAILS=you@example.com,other@example.com
```

### Reset a user's profile

Delete the MongoDB document scoped to that `userId`:

```bash
mongosh mongodb://127.0.0.1:27017/writing-studio
db.brandprofiles.deleteOne({ userId: "some-browser-uuid" })
```

### View unlock requests

```bash
mongosh mongodb://127.0.0.1:27017/writing-studio
db.unlockrequests.find({ status: "pending" })
```

---

## Troubleshooting

### Agent calls return 401/403

**Problem:** Compose, Refine, Chat, or Extract agents fail with auth errors.

**Solution:** Confirm `LYZR_API_KEY` is set and you've been granted access to all four agent IDs in MAIA Studio (see onboarding step 2 above).

### Database connection errors

**Problem:** "Cannot connect to MongoDB" or "ECONNREFUSED 127.0.0.1:27017"

**Solution:** Make sure MongoDB is running:

```bash
brew services start mongodb-community
mongosh mongodb://127.0.0.1:27017   # confirm it responds
```

### Admin features hidden

**Problem:** No "Pending requests" menu item or unlock request approval buttons.

**Solution:** Add your email to `ADMIN_EMAILS` in `.env.local`:

```bash
ADMIN_EMAILS=your@example.com
```

### Brand profile not saving

**Problem:** Profile edits fail or aren't persisted.

**Solution:**

1. Check the browser console and server logs for errors
2. Confirm `DATABASE_URL` points to a running MongoDB instance
3. Verify the `userId` is consistent (check localStorage: `brand-studio-user-id`)

### Agent responses not appearing

**Problem:** Compose/Refine/Chat calls timeout or return empty responses.

**Solution:**

1. Confirm `LYZR_API_KEY` is valid in your `.env.local`
2. Check MAIA Studio to see if the agent exists and you have access
3. Review [lib/aiAgent.ts](lib/aiAgent.ts) for the agent IDs being called
4. Check server logs for error details from the Lyzr API

---

## Related Documentation

- [AUTHENTICATION.md](AUTHENTICATION.md) — Detailed auth architecture, SSO setup, user identity resolution
- [.env.example](.env.example) — All environment variables with descriptions
