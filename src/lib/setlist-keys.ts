/** Stable React keys for setlist rows (same song may appear twice, e.g. encore). */
export function setlistEntryKey(index: number, song: string): string {
  return `${index}:${song}`;
}
