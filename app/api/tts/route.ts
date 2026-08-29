import { authErrorResponse, requireDemoSession } from "../../../lib/demo-auth";
import { SARVAM_LANGUAGE_CODES, ttsLanguageCode } from "../../../lib/language-support";

type TtsResponse = {
  audios?: string[];
  request_id?: string | null;
};

function decodeBase64Audio(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer as ArrayBuffer;
}

export async function GET() {
  return Response.json({
    configured: Boolean(process.env.SARVAM_API_KEY),
    model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
    autoVoiceLanguage: true,
    supportedLanguageCount: SARVAM_LANGUAGE_CODES.length,
    maxCharacters: 650,
  });
}

export async function POST(request: Request) {
  try {
    await requireDemoSession(request, "CITIZEN");
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: { text?: string; languageCode?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  const languageCode = ttsLanguageCode(body.languageCode);
  if (!text || text.length > 650) {
    return Response.json({ error: "Voice prompts must contain 1 to 650 characters." }, { status: 400 });
  }

  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Natural voice playback is temporarily unavailable." }, { status: 503 });
  }

  try {
    const response = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        language_code: languageCode,
        model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
        speaker: process.env.SARVAM_TTS_SPEAKER ?? "kavya",
        pace: 0.92,
        temperature: 0.35,
        output_audio_codec: "wav",
        speech_sample_rate: 24000,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const payload = (await response.json()) as TtsResponse;
    const encodedAudio = payload.audios?.[0];
    if (!response.ok || typeof encodedAudio !== "string" || encodedAudio.length === 0) {
      throw new Error(`VOICE_PLAYBACK_FAILED_${response.status}`);
    }
    return new Response(decodeBase64Audio(encodedAudio), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Natural voice playback is temporarily unavailable." }, { status: 502 });
  }
}
