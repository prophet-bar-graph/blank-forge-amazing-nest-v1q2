// Admin allow-list resolution. `ADMIN_EMAILS` is a comma-separated env var
// (e.g., `ddowling@prophet.com,foo@prophet.com`). Comparisons are case-insensitive.

function parse(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

let _cached: string[] | null = null

export function getAdminEmails(): string[] {
  if (_cached) return _cached
  _cached = parse(process.env.ADMIN_EMAILS)
  return _cached
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return getAdminEmails().includes(normalized)
}

// Test-only: lets test code reset the module-level cache after mutating process.env.
// Production code should never call this.
export function __resetAdminCache(): void {
  _cached = null
}
