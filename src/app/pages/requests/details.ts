/** One name/value line of start data. Replaced by real start forms in Phase 3. */
export interface DetailRow {
  name: string;
  value: string;
}

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
/** Plain decimals only; a leading zero (phone numbers, codes such as 007) keeps the value as text. */
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

export function parseDetails(rows: DetailRow[]): { data: Record<string, unknown>; errors: string[] } {
  const data: Record<string, unknown> = {};
  const errors: string[] = [];
  let unnamed = false;
  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) {
      continue;
    }
    if (!name) {
      unnamed = true;
      continue;
    }
    if (!NAME.test(name)) {
      errors.push(`"${name}" is not a valid name: start with a letter and use letters, digits or _.`);
      continue;
    }
    if (name in data) {
      errors.push(`"${name}" is used more than once.`);
      continue;
    }
    data[name] = NUMBER.test(value) ? Number(value) : value === 'true' ? true : value === 'false' ? false : value;
  }
  if (unnamed) {
    errors.push('Every value needs a name.');
  }
  return { data, errors };
}
