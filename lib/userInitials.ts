export function getInitials(givenName: string | null, familyName: string | null, isAdmin: boolean): string {
  if (givenName && familyName) {
    return (givenName[0] + familyName[0]).toUpperCase()
  }
  if (givenName) {
    return givenName.substring(0, 2).toUpperCase()
  }
  if (familyName) {
    return familyName.substring(0, 2).toUpperCase()
  }
  return isAdmin ? 'AU' : 'NU'
}
