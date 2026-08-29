export const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export type VoiceCaptureTarget = "AGENT_REPLY" | "NARRATION";

export const MIN_RECORDING_MS = 700;

export function hasUsableRecording(fileSize: number, durationMs: number): boolean {
  return fileSize > 128 && durationMs >= MIN_RECORDING_MS;
}

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException
    ? error.name
    : typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone permission is blocked. Allow microphone access for this site, then tap the voice button again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found. Connect a microphone, or continue by typing.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is busy in another app. Close the other recording app and try again.";
  }
  if (name === "AbortError") {
    return "The microphone did not start. Try the voice button again, or continue by typing.";
  }
  return "Microphone access could not start. Check the browser permission for this site, then try again.";
}

export function chooseRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean,
): string | null {
  return RECORDER_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? null;
}

export function audioFilename(mimeType: string): string {
  if (mimeType.includes("mp4")) return "citizen-voice.m4a";
  if (mimeType.includes("ogg")) return "citizen-voice.ogg";
  if (mimeType.includes("wav")) return "citizen-voice.wav";
  return "citizen-voice.webm";
}

export function appendNarration(current: string, addition: string): string {
  return [current.trim(), addition.trim()].filter(Boolean).join(current.trim() ? "\n" : "");
}
