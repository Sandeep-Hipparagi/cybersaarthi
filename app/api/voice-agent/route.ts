import { authErrorResponse, requireDemoSession } from "../../../lib/demo-auth";
import {
  AUTO_LANGUAGE_CODE,
  detectedLanguageCode,
  isSarvamLanguageCode,
} from "../../../lib/language-support";

type CaptureKey = "NARRATIVE" | "FINANCIAL" | "EVIDENCE" | "DISTRICT";

type GuidedTurn = {
  capture: CaptureKey;
  promptEnglish: string;
  syntheticReply: string;
};

const AGENT_ID = process.env.SARVAM_VOICE_AGENT_ID ?? "Sarvam-Voic-3cb2474d-5463";
const AGENT_VERSION = Number(process.env.SARVAM_VOICE_AGENT_VERSION ?? "2");
const FINAL_PROMPT =
  "Thank you. Your account is ready. Review the narration, district, and proposed facts before saving.";

const TURNS: GuidedTurn[] = [
  {
    capture: "NARRATIVE",
    promptEnglish:
      "Speak in the language you are most comfortable with. Take your time and tell me what happened, from the first contact to what you noticed.",
    syntheticReply:
      "I received a part-time task offer in a messaging app. I paid money through UPI, and the sender stopped replying.",
  },
  {
    capture: "FINANCIAL",
    promptEnglish:
      "Did money move? Share the amount, date, time, bank or wallet, and transaction reference. Anything you do not know can remain unknown.",
    syntheticReply:
      "₹12,000 was debited through UPI on 24 August 2026 at 2:32 PM. The transaction reference is 432198765012.",
  },
  {
    capture: "EVIDENCE",
    promptEnglish:
      "What screenshots, phone numbers, links, payment IDs, or messages do you have? Missing suspect details can remain unknown.",
    syntheticReply:
      "I have screenshots of the task messages, the payment ID, and the bank debit alert. I do not know the sender's real name or address.",
  },
  {
    capture: "DISTRICT",
    promptEnglish:
      "Which district were you in when the incident occurred? A district is required before this prototype case can be saved.",
    syntheticReply: "Bengaluru Urban.",
  },
];

type TranslationResponse = {
  translated_text?: string;
};

async function localisePrompt(promptEnglish: string, languageCode: string): Promise<string> {
  if (!isSarvamLanguageCode(languageCode) || languageCode === "en-IN") return promptEnglish;
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return promptEnglish;
  try {
    const response = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: {
        "api-subscription-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: promptEnglish,
        source_language_code: "en-IN",
        target_language_code: languageCode,
        model: process.env.SARVAM_TRANSLATION_MODEL ?? "sarvam-translate:v1",
        numerals_format: "international",
      }),
      signal: AbortSignal.timeout(4_000),
    });
    const payload = (await response.json()) as TranslationResponse;
    if (!response.ok || typeof payload.translated_text !== "string" || !payload.translated_text.trim()) {
      return promptEnglish;
    }
    return payload.translated_text.trim();
  } catch {
    return promptEnglish;
  }
}

function agentMetadata() {
  return {
    selectedAgentId: AGENT_ID,
    selectedAgentVersion: AGENT_VERSION,
    provider: "CYBERSAARTHI_GUIDED_VOICE",
    liveRuntimeConnected: false,
    browserTransport: "AUTO_LANGUAGE_TTS_STT_SESSION",
    syntheticSessionAvailable: true,
    languageAutoDetect: true,
    turnCount: TURNS.length,
  };
}

export async function GET(request: Request) {
  try {
    await requireDemoSession(request, "CITIZEN");
  } catch (error) {
    return authErrorResponse(error);
  }
  return Response.json(agentMetadata());
}

export async function POST(request: Request) {
  try {
    await requireDemoSession(request, "CITIZEN");
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: {
    action?: "START" | "TURN" | "SYNTHETIC_TURN";
    detectedLanguageCode?: string;
    step?: number;
    nativeAnswer?: string;
    englishAnswer?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const step = Number.isInteger(body.step) ? Number(body.step) : 0;
  if (step < 0 || step >= TURNS.length) {
    return Response.json({ error: "The guided voice step is invalid." }, { status: 400 });
  }

  if (body.action === "START") {
    const first = TURNS[0];
    return Response.json({
      ...agentMetadata(),
      languageCode: AUTO_LANGUAGE_CODE,
      step: 0,
      complete: false,
      promptNative: first.promptEnglish,
      promptEnglish: first.promptEnglish,
      answerNative: null,
      answerEnglish: null,
      answerProvider: null,
      answerModel: null,
      answerCapture: null,
      synthetic: true,
    });
  }

  if (body.action !== "TURN" && body.action !== "SYNTHETIC_TURN") {
    return Response.json({ error: "Choose a supported voice action." }, { status: 400 });
  }

  const currentTurn = TURNS[step];
  const synthetic = body.action === "SYNTHETIC_TURN";
  const languageCode = synthetic ? "en-IN" : detectedLanguageCode(body.detectedLanguageCode);
  const answerNative = synthetic ? currentTurn.syntheticReply : body.nativeAnswer?.trim() ?? "";
  const answerEnglish = synthetic
    ? currentTurn.syntheticReply
    : body.englishAnswer?.trim() || answerNative;
  if (answerNative.length < 2 || answerEnglish.length < 2) {
    return Response.json({ error: "The voice answer was too short. Try again or use the working example." }, { status: 400 });
  }
  if (answerNative.length > 8000 || answerEnglish.length > 8000) {
    return Response.json({ error: "Keep each answer under 8,000 characters." }, { status: 400 });
  }

  const nextStep = step + 1;
  const complete = nextStep >= TURNS.length;
  const promptEnglish = complete ? FINAL_PROMPT : TURNS[nextStep].promptEnglish;
  const promptNative = await localisePrompt(promptEnglish, languageCode);

  return Response.json({
    ...agentMetadata(),
    languageCode,
    step: nextStep,
    complete,
    promptNative,
    promptEnglish,
    answerNative,
    answerEnglish,
    answerProvider: synthetic ? "VOICE_DEMO_FIXTURE" : "SARVAM_AI",
    answerModel: synthetic ? "submission-demo-v2" : process.env.SARVAM_ASR_MODEL ?? "saaras:v3",
    answerCapture: currentTurn.capture,
    synthetic,
  });
}
