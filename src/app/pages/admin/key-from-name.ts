/** The key suggested for a name: "Travel request (EU)" gives "travel-request-eu". May be too short to be a valid key. */
export function keyFromName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 100)
    .replace(/^-+|-+$/g, '');
}
