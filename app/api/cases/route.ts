import { authErrorResponse, requireDemoSession } from "../../../lib/demo-auth";
import {
  cleanText,
  problemResponse,
  readJsonObject,
  requestProblemResponse,
} from "../../../lib/api-response";
import {
  createCase,
  DuplicateCaseError,
  listCases,
  type NewCaseInput,
} from "../../../lib/case-store";
import { isAllowedCaseProvider } from "../../../lib/case-integrity";
import { detectedLanguageCode } from "../../../lib/language-support";

const ROUTES = new Set([
  "WOMEN_CHILDREN_RELATED_CRIME",
  "FINANCIAL_FRAUD",
  "OTHER_CYBER_CRIME",
  "UNKNOWN",
]);
const URGENCY_LEVELS = new Set(["IMMEDIATE", "TIME_SENSITIVE", "ROUTINE", "UNKNOWN"]);

export async function GET(request: Request) {
  let session;
  try {
    session = await requireDemoSession(request);
  } catch (error) {
    return authErrorResponse(error);
  }
  try {
    return Response.json({ cases: await listCases(session), synthetic: true });
  } catch {
    return problemResponse(500, "CASE_LIST_UNAVAILABLE", "The synthetic case list is temporarily unavailable.");
  }
}

export async function POST(request: Request) {
  const preflightStartedAt = Date.now();
  let session;
  try {
    session = await requireDemoSession(request, "CITIZEN");
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestProblemResponse(error)
      ?? problemResponse(500, "REQUEST_READ_FAILED", "The request could not be read.");
  }

  try {
    if (body.synthetic !== true) {
      return problemResponse(422, "SYNTHETIC_CONFIRMATION_REQUIRED", "Only explicitly synthetic cases can be recorded in this prototype.");
    }
    const title = cleanText(body.title, 140);
    const narrativeNative = cleanText(body.narrativeNative, 8000);
    const narrativeEnglish = cleanText(body.narrativeEnglish, 8000);
    const languageCode = detectedLanguageCode(cleanText(body.languageCode, 16));
    const route = cleanText(body.route, 64);
    const district = cleanText(body.district, 120);
    if (
      !title ||
      narrativeNative.length < 20 ||
      narrativeEnglish.length < 20 ||
      !ROUTES.has(route) ||
      !district
    ) {
      return problemResponse(422, "CASE_FIELDS_INVALID", "Review the title, narration, district, and proposed route.");
    }
    const rawLoss = body.lossAmount;
    const lossAmount = typeof rawLoss === "number" && Number.isFinite(rawLoss) && rawLoss >= 0
      ? Math.round(rawLoss)
      : null;
    const facts = Array.isArray(body.facts)
      ? body.facts.slice(0, 24).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
    const unknowns = Array.isArray(body.unknowns)
      ? body.unknowns.slice(0, 24).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
    if (JSON.stringify({ facts, unknowns }).length > 32_000) {
      return problemResponse(422, "CASE_FACTS_TOO_LARGE", "The proposed facts are too large for this synthetic record.");
    }
    const urgency = cleanText(body.urgency, 32) || "UNKNOWN";
    if (!URGENCY_LEVELS.has(urgency)) {
      return problemResponse(422, "URGENCY_INVALID", "Choose a supported urgency level.");
    }
    const provider = cleanText(body.provider, 80) || "DETERMINISTIC_DEMO";
    if (!isAllowedCaseProvider(provider)) {
      return problemResponse(
        422,
        "CASE_SOURCE_REJECTED",
        "Only citizen-entered narration, consented voice, and citizen-confirmed evidence can create a case. Scraped or repository data stays a lead, not a case.",
      );
    }
    const input: NewCaseInput = {
      title,
      narrativeNative,
      narrativeEnglish,
      languageCode,
      provider,
      model: cleanText(body.model, 80) || null,
      route,
      district,
      lossAmount,
      urgency,
      facts,
      unknowns,
    };
    const { caseId, demoReference, integrity } = await createCase(session, input);
    return Response.json(
      {
        caseId,
        demoReference,
        integrity: {
          ...integrity,
          preflightMs: Date.now() - preflightStartedAt,
        },
        synthetic: true,
        officialAcknowledgementNumber: null,
        firNumber: null,
        disclosure: `SYNTHETIC DEMO REFERENCE · ${demoReference} · NOT NCRP · NOT AN FIR`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DuplicateCaseError) {
      return Response.json(
        {
          error: `An identical case is already saved${error.demoReference ? ` as ${error.demoReference}` : ""}. Open My cases instead of creating a duplicate.`,
          duplicate: true,
          existingCaseId: error.existingCaseId,
          existingReference: error.demoReference,
        },
        { status: 409 },
      );
    }
    return problemResponse(500, "CASE_RECORD_FAILED", "The synthetic case could not be recorded.");
  }
}
