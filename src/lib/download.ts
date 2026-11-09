// Saving files to the student's computer. Nothing leaves the browser.

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel a large download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function extensionFor(mimeType: string): string {
  const [type] = mimeType.split(";");
  if (type === "video/mp4") return "mp4";
  if (type === "audio/mp4") return "m4a";
  if (type === "audio/webm") return "weba";
  return "webm";
}

export function stationFilename(sessionStartedAt: string, station: number, extension: string, part = 1): string {
  const date = sessionStartedAt.slice(0, 10);
  const suffix = part > 1 ? `-part-${part}` : "";
  return `PracticeMMI-${date}-station-${station}${suffix}.${extension}`;
}

export function transcriptFileText(station: number, question: string, transcript: string): string {
  return `Station ${station}\n\nQuestion:\n${question}\n\nTranscript:\n${transcript}\n`;
}

export function saveTranscriptFile(sessionStartedAt: string, station: number, question: string, transcript: string): void {
  saveBlob(
    new Blob([transcriptFileText(station, question, transcript)], { type: "text/plain;charset=utf-8" }),
    stationFilename(sessionStartedAt, station, "txt"),
  );
}
