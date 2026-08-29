export const AUTO_LANGUAGE_CODE = "unknown";
export const DEFAULT_VOICE_LANGUAGE_CODE = "en-IN";

export const SARVAM_LANGUAGE_CODES = [
  "as-IN",
  "bn-IN",
  "brx-IN",
  "doi-IN",
  "en-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "kok-IN",
  "ks-IN",
  "mai-IN",
  "ml-IN",
  "mni-IN",
  "mr-IN",
  "ne-IN",
  "od-IN",
  "pa-IN",
  "sa-IN",
  "sat-IN",
  "sd-IN",
  "ta-IN",
  "te-IN",
  "ur-IN",
] as const;

const languageCodes = new Set<string>(SARVAM_LANGUAGE_CODES);

export function isSarvamLanguageCode(value: unknown): value is string {
  return typeof value === "string" && languageCodes.has(value);
}

export function detectedLanguageCode(value: unknown): string {
  return isSarvamLanguageCode(value) ? value : AUTO_LANGUAGE_CODE;
}

export function ttsLanguageCode(value: unknown): string {
  return isSarvamLanguageCode(value) ? value : DEFAULT_VOICE_LANGUAGE_CODE;
}

export function htmlLanguageCode(value: unknown): string | undefined {
  if (!isSarvamLanguageCode(value)) return undefined;
  return value.split("-", 1)[0];
}
