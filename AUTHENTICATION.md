# Authentication & User Identity

This document describes how user authentication and identity are determined in the Maia Writing Studio application.

## Overview

The application uses a **multi-layer authentication system** with fallback support for both production (Keycloak SSO) and local development modes.

## Authentication Architecture

### 1. SSOGuard Component

The `SSOGuard` component ([components/SSOGuard.tsx](components/SSOGuard.tsx)) is the main authentication gateway that wraps the entire application.

**Responsibilities:**

- Initializes Keycloak authentication in production
- Provides user identity context via `useSSO()` hook
- Exposes user information: `email`, `givenName`, `familyName`, `isAdmin`, `adminEmails`

**User Identity Resolution Priority:**

1. **Keycloak JWT claims** (production): `email`, `given_name`, `family_name`
2. **Query parameter override** (dev): `?as=admin` or `?as=member`
3. **localStorage** (dev): `brand-studio-user-email`
4. **Environment variable** (dev): `NEXT_PUBLIC_DEV_USER_EMAIL`

### 2. SSO Configuration Endpoint

**Endpoint:** `GET /api/sso-config` ([app/api/sso-config/route.ts](app/api/sso-config/route.ts))

Returns:

- `enabled`: Whether Keycloak SSO is active
- `keycloak_url`, `realm`, `client_id`: Keycloak configuration
- `admin_emails`: List of admin email addresses (always included, even in dev mode)

## User Identity Headers

Two custom HTTP headers are used to pass user identity through API calls. These should be included on all fetch requests to API routes.

### Email Header

- **Header name:** `x-brand-user-email`
- **Constant:** `USER_EMAIL_HEADER` from [lib/userEmail.ts](lib/userEmail.ts)
- **Usage:** Admin checks, audit logging, per-email scoping
- **Set by:** Client components via `BrandProfileProvider`

### User ID Header

- **Header name:** `x-brand-user-id`
- **Constant:** `USER_ID_HEADER` from [lib/userId.ts](lib/userId.ts)
- **Usage:** Row-Level Security (RLS) scoping, isolates profiles by browser
- **Persistence:** Stored in localStorage as `brand-studio-user-id`
- **Scope:** Per-browser (not per-person; resets when localStorage is cleared)

## Admin Access Control

Admin status is determined by checking if a user's email matches the `ADMIN_EMAILS` environment variable.

**Key files:**

- [lib/admin.ts](lib/admin.ts) — Contains `isAdminEmail()` utility and `ADMIN_EMAILS` constant
- Admin check is **case-insensitive**
- Admin emails are surfaced from `/api/sso-config` and computed client-side

**Example:**

```typescript
import { isAdminEmail } from '@/lib/admin'

const isAdmin = isAdminEmail('user@example.com')
```

## User Identity Flow

### Client-Side

1. `SSOGuard` initializes and fetches `/api/sso-config`
2. If Keycloak is enabled: user is redirected to Keycloak login
3. If Keycloak is disabled (dev): user identity comes from fallback chain
4. `useSSO()` hook provides: `email`, `givenName`, `familyName`, `isAdmin`, `adminEmails`
5. `BrandProfileProvider` generates/retrieves browser `userId` via `getOrCreateBrowserUserId()`
6. Both headers are included on API requests

### Server-Side

API routes receive both headers and:

- Use `USER_ID_HEADER` for RLS-scoped database queries (isolate by browser)
- Use `USER_EMAIL_HEADER` for admin checks and audit logging

**Example in API route:**

```typescript
import { USER_EMAIL_HEADER, USER_ID_HEADER } from '@/lib/userEmail'

export async function POST(req: Request) {
  const email = req.headers.get(USER_EMAIL_HEADER)
  const userId = req.headers.get(USER_ID_HEADER)
  
  // Check if admin
  const isAdmin = email && isAdminEmail(email)
  
  // Use userId for RLS scoping
  const profile = await db.profiles.findOne({ userId })
}
```

## User Display & Initials

### Avatar Initials

User initials are generated dynamically based on name information from SSO.

**Function:** `getInitials()` ([lib/userInitials.ts](lib/userInitials.ts))

**Logic:**

- If both `givenName` and `familyName` exist: first letter of each (e.g., "John Doe" → "JD")
- If only `givenName`: first 2 letters (e.g., "John" → "JO")
- If only `familyName`: first 2 letters (e.g., "Doe" → "DO")
- If neither (local dev with no Keycloak):
  - **"AU"** for admin users
  - **"NU"** for normal users

**Usage in [app/page.tsx](app/page.tsx):**

```typescript
import { getInitials } from '@/lib/userInitials'
import { useSSO } from '@/components/SSOGuard'

const { givenName, familyName, isAdmin } = useSSO()
const initials = getInitials(givenName, familyName, isAdmin)

// Pass to AvatarDropdown
<AvatarDropdown initials={initials} {...otherProps} />
```

## Key Files Reference

| File                                                                       | Purpose                                                      |
|----------------------------------------------------------------------------|--------------------------------------------------------------|
| [components/SSOGuard.tsx](components/SSOGuard.tsx)                         | Main auth gate; provides user identity context               |
| [components/BrandProfileProvider.tsx](components/BrandProfileProvider.tsx) | Manages user context + userId; includes headers on API calls |
| [lib/userEmail.ts](lib/userEmail.ts)                                       | Email resolution (Keycloak → localStorage → env)             |
| [lib/userId.ts](lib/userId.ts)                                             | Per-browser UUID generation and persistence                  |
| [lib/userInitials.ts](lib/userInitials.ts)                                 | Generate user initials from name data                        |
| [lib/admin.ts](lib/admin.ts)                                               | Admin email validation logic                                 |
| [app/api/sso-config/route.ts](app/api/sso-config/route.ts)                 | Server config endpoint                                       |
| [components/AvatarDropdown.tsx](components/AvatarDropdown.tsx)             | Avatar UI component with initials                            |

## Local Development

In local dev mode (when `ARCHITECT_BACKEND_URL` is not set):

- SSO is disabled (`enabled: false`)
- User identity comes from the fallback chain:
  1. Query parameter: `?as=admin` or `?as=member`
  2. localStorage value: `brand-studio-user-email`
  3. Environment variable: `NEXT_PUBLIC_DEV_USER_EMAIL`

**To set a dev user:**

```bash
# Via environment variable
export NEXT_PUBLIC_DEV_USER_EMAIL=testuser@example.com

# Via query parameter (one-time override)
http://localhost:3000?as=admin

# Via localStorage (in browser console)
localStorage.setItem('brand-studio-user-email', 'testuser@example.com')
```

## Production (Keycloak)

In production:

- Keycloak SSO is enabled and required
- User email and name come from JWT token claims
- Session is managed by Keycloak
- Admin status is computed from `ADMIN_EMAILS` environment variable

**JWT token claims used:**

- `email` or `preferred_username` (for email identity)
- `given_name` (first name)
- `family_name` (last name)

## Security Notes

- **userId is browser-based, not person-based:** Two browsers on the same machine get different profiles but share the same email identity and admin status
- **Admin status is computed client-side:** The client receives `adminEmails` from `/api/sso-config` and checks if the user's email matches
- In production, both Keycloak authentication AND RLS browser scoping provide layered security
- Headers are included on all API requests for identity verification
