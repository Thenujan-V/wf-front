/** How long something took, in the units a person would use: "45 min", "13 h", "2 d 7 h"; "—" when unknown. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) {
    return 'under a minute';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days} d ${rest} h` : `${days} d`;
}
