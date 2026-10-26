export type JwtClaims = Record<string, unknown>;

/** Reads a JWT payload for display and role checks only; the backend verifies signatures. */
export function decodeJwtPayload(token: string): JwtClaims | null {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as JwtClaims) : null;
  } catch {
    return null;
  }
}

export function realmRoles(claims: JwtClaims | null): string[] {
  const access = claims?.['realm_access'];
  if (access === null || typeof access !== 'object') {
    return [];
  }
  const roles = (access as Record<string, unknown>)['roles'];
  return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
}

export function stringClaim(claims: JwtClaims | null, name: string): string {
  const value = claims?.[name];
  return typeof value === 'string' ? value : '';
}
