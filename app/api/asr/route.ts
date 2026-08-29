import { authErrorResponse, requireDemoSession } from "../../../lib/demo-auth";
import { normalizeBrowserAudioFile } from "../../../lib/audio-validation";
import {
  AUTO_LANGUAGE_CODE,
  SARVAM_LANGUAGE_CODES,
  detectedLanguageCode,
} from "../../../lib/language-support";

const FIXTURE = {
  title: "Part-time task payment scam",
  nativeTranscript: "I received a part-time task offer in a messaging app. I paid ₹12,000 through UPI on 24 August 2026 at 2:32 PM. The transaction reference is 432198765012, and the sender stopped replying.",
  englishTranscript: "I received a part-time task offer in a messaging app. I paid ₹12,000 through UPI on 24 August 2026 at 2:32 PM. The transaction reference is 432198765012, and the sender stopped replying.",
};

type SarvamResponse = {
  transcript?: string;
  language_code?: string;
  language_probability?: number;
};
type TranslationResponse = { translated_text?: string };

class VoiceProviderError extends Error {
  constructor(
    readonly upstreamStatus: number,
    readonly requestId: string | null,
    message = `VOICE_TRANSCRIPTION_FAILED_${upstreamStatus}`,
  ) {
    super(message);
  }
}

function asrStatus() {
  return {
    configured: Boolean(process.env.SARVAM_API_KEY),
    model: process.env.SARVAM_ASR_MODEL ?? "saaras:v3",
    syntheticFixtureAvailable: true,
    autoDetect: true,
    supportedLanguageCount: SARVAM_LANGUAGE_CODES.length,
    maxRecordingSeconds: 28,
  };
}

export async function GET() {
  return Response.json(asrStatus());
}

async function transcribeOnce(file: File): Promise<SarvamResponse> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error("VOICE_NOT_CONFIGURED");
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("model", process.env.SARVAM_ASR_MODEL ?? "saaras:v3");
  form.append("mode", "transcribe");
  form.append("language_code", AUTO_LANGUAGE_CODE);
  const response = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const requestId = response.headers.get("x-request-id");
  let payload: SarvamResponse = {};
  try { payload = JSON.parse(await response.text()) as SarvamResponse; } catch { /* Bounded error below. */ }
  if (!response.ok || typeof payload.transcript !== "string" || !payload.transcript.trim()) {
    throw new VoiceProviderError(response.status, requestId);
  }
  return payload;
}

async function transcribeWithRetry(file: File): Promise<SarvamResponse> {
  try {
    return await transcribeOnce(file);
  } catch (error) {
    if (!(error instanceof VoiceProviderError) || (error.upstreamStatus !== 429 && error.upstreamStatus < 500)) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    return transcribeOnce(file);
  }
}

async function translateTranscriptToEnglish(transcript: string, sourceLanguageCode: string) {
  if (sourceLanguageCode === "en-IN") return transcript;
  if (sourceLanguageCode === AUTO_LANGUAGE_CODE || !process.env.SARVAM_API_KEY) return null;
  try {
    const response = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: transcript,
        source_language_code: sourceLanguageCode,
        target_language_code: "en-IN",
        model: process.env.SARVAM_TRANSLATION_MODEL ?? "sarvam-translate:v1",
        numerals_format: "international",
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json() as TranslationResponse;
    return response.ok && typeof payload.translated_text === "string" && payload.translated_text.trim()
      ? payload.translated_text.trim()
      : null;
  } catch {
    return null;
  }
}

function failureResponse(error: unknown): Response {
  const timeout = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
  const upstreamStatus = error instanceof VoiceProviderError ? error.upstreamStatus : null;
  const code = timeout
    ? "VOICE_PROVIDER_TIMEOUT"
    : error instanceof VoiceProviderError
      ? error.message
      : "VOICE_PROVIDER_UNEXPECTED";
  const status = upstreamStatus === 401 || upstreamStatus === 403 || upstreamStatus === 429 ? 503 : 502;
  return Response.json({
    error: "We could not transcribe this recording. Check microphone access and try again; the words already in Your narration are unchanged.",
    code,
  }, { status });
}

export async function POST(request: Request) {
  try { await requireDemoSession(request, "CITIZEN"); } catch (error) { return authErrorResponse(error); }
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    let body: { fixture?: boolean };
    try { body = await request.json() as { fixture?: boolean }; } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (body.fixture !== true) return Response.json({ error: "Choose the working voice example." }, { status: 422 });
    return Response.json({
      ...FIXTURE,
      languageCode: "en-IN",
      detectedLanguageCode: "en-IN",
      confidence: 1,
      provider: "VOICE_DEMO_FIXTURE",
      model: "submission-demo-v2",
      synthetic: true,
      uncertainSegments: [],
    });
  }
  if (!contentType.includes("multipart/form-data")) {
    return Response.json({ error: "Send audio as multipart form data." }, { status: 415 });
  }
  try {
    const form = await request.formData();
    if (form.get("processingNoticeAccepted") !== "true") {
      return Response.json({ error: "Start the microphone again to confirm voice processing." }, { status: 422 });
    }
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0 || file.size > 8_000_000) {
      return Response.json({ error: "Record a voice reply shorter than 28 seconds." }, { status: 422 });
    }
    const audioBytes = await file.arrayBuffer();
    const normalizedFile = normalizeBrowserAudioFile(file, audioBytes);
    if (!normalizedFile) {
      return Response.json({ error: "Record a WebM, MP4, Ogg, or WAV audio clip." }, { status: 422 });
    }
    if (!process.env.SARVAM_API_KEY) {
      return Response.json({ error: "Live voice transcription is unavailable. Try the working example or type instead." }, { status: 503 });
    }
    const native = await transcribeWithRetry(normalizedFile);
    const nativeTranscript = native.transcript?.trim() ?? "";
    const languageCode = detectedLanguageCode(native.language_code);
    const translatedText = await translateTranscriptToEnglish(nativeTranscript, languageCode);
    const englishTranscript = translatedText || nativeTranscript;
    const translationStatus = languageCode === "en-IN" || Boolean(translatedText)
      ? "COMPLETED"
      : "FALLBACK_NATIVE";
    return Response.json({
      title: "Voice narration",
      nativeTranscript,
      englishTranscript,
      languageCode,
      detectedLanguageCode: languageCode,
      confidence: native.language_probability ?? null,
      provider: "SARVAM_AI",
      model: process.env.SARVAM_ASR_MODEL ?? "saaras:v3",
      synthetic: false,
      uncertainSegments: [],
      translationStatus,
      warnings: translationStatus === "FALLBACK_NATIVE"
        ? ["The translation service was unavailable. The original transcript was preserved."]
        : [],
    });
  } catch (error) {
    return failureResponse(error);
  }
}
