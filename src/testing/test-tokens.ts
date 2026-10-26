/** Builds an unsigned JWT-shaped string for tests; only the payload matters to the app. */
export function tokenWith(claims: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const base64 = btoa(String.fromCharCode(...bytes));
  const base64Url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `eyJhbGciOiJub25lIn0.${base64Url}.sig`;
}
