import { authErrorResponse, requireDemoSession } from "../../../lib/demo-auth";
import { cleanText, problemResponse, readJsonObject, requestProblemResponse } from "../../../lib/api-response";
import { extractNarrationFinancialFields } from "../../../lib/narration-field-extraction";

export async function POST(request: Request) {
  try { await requireDemoSession(request, "CITIZEN"); } catch (error) { return authErrorResponse(error); }
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); } catch (error) {
    return requestProblemResponse(error) ?? problemResponse(500, "REQUEST_READ_FAILED", "The request could not be read.");
  }
  if (body.synthetic !== true || body.modelProcessingAccepted !== true) {
    return problemResponse(422, "MODEL_PROCESSING_CONFIRMATION_REQUIRED", "Confirm synthetic narration processing before preparing fields.");
  }
  const story = cleanText(body.story, 8_000);
  if (story.length < 20) {
    return problemResponse(422, "NARRATION_TOO_SHORT", "Add more narration before preparing fields.");
  }
  const facts = Array.isArray(body.facts)
    ? body.facts.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)).slice(0, 24)
    : [];
  try {
    return Response.json(await extractNarrationFinancialFields(story, facts));
  } catch {
    return problemResponse(500, "FIELD_PREPARATION_FAILED", "The narration fields could not be prepared.");
  }
}
