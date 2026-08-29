export type BrowserAudioContainer = {
  extension: "webm" | "m4a" | "ogg" | "wav";
  mediaType: "audio/webm" | "audio/mp4" | "audio/ogg" | "audio/wav";
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectBrowserAudioContainer(bytes: Uint8Array): BrowserAudioContainer | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { extension: "webm", mediaType: "audio/webm" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") {
    return { extension: "wav", mediaType: "audio/wav" };
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "OggS") {
    return { extension: "ogg", mediaType: "audio/ogg" };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    return { extension: "m4a", mediaType: "audio/mp4" };
  }
  return null;
}

export function normalizeBrowserAudioFile(file: File, audioBytes: ArrayBuffer): File | null {
  const container = detectBrowserAudioContainer(new Uint8Array(audioBytes));
  if (!container) return null;
  return new File([audioBytes], `citizen-voice.${container.extension}`, { type: container.mediaType });
}
