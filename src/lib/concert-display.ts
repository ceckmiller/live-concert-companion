export type ConcertRecording = { title: string; url: string; duration: string };

/** Link the concert title only when there is exactly one full recording. */
export function soleConcertRecording(recordings?: ConcertRecording[]): ConcertRecording | null {
  if (!recordings || recordings.length !== 1) return null;
  return recordings[0];
}

/** Multiple recordings belong in the “Längere Mitschnitte” block, not in the title. */
export function showLongRecordingsSection(recordings?: ConcertRecording[]): boolean {
  return (recordings?.length ?? 0) > 1;
}
