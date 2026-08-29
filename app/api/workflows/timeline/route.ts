import { authErrorResponse, requireDemoSession } from "../../../../lib/demo-auth";
import { problemResponse, readJsonObject, requestProblemResponse, successResponse } from "../../../../lib/api-response";
import { fetchIncidentTimeline } from "../../../../lib/workflow-repository";
import { chronologicalEvents, exactAcknowledgement, sanitizeIncidentDescription } from "../../../../lib/workflow-validation";

export async function POST(request: Request) {
  let session;
  try { session = await requireDemoSession(request); } catch (error) { return authErrorResponse(error); }
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); } catch (error) {
    return requestProblemResponse(error) ?? problemResponse(500, "REQUEST_READ_FAILED", "The request could not be read.");
  }
  const acknowledgement = exactAcknowledgement(body.acknowledgementNumber);
  if (!acknowledgement) {
    return problemResponse(422, "ACKNOWLEDGEMENT_INVALID", "Use the exact 14-digit synthetic acknowledgement number.");
  }
  const sanitized = sanitizeIncidentDescription(body.description);
  if (!sanitized.validLength) {
    return problemResponse(422, "INCIDENT_DESCRIPTION_TOO_SHORT", "After unsafe characters are removed, the incident description must contain at least 200 characters.", {
      removedCharacters: sanitized.removedCharacters,
      currentLength: sanitized.text.length,
    });
  }
  try {
    const timeline = await fetchIncidentTimeline(session, acknowledgement, chronologicalEvents(sanitized.text));
    return timeline
      ? successResponse({ timeline, sanitization: { removedCharacters: sanitized.removedCharacters }, synthetic: true })
      : problemResponse(404, "CASE_NOT_FOUND", "No authorised synthetic case matches that acknowledgement number.");
  } catch {
    return problemResponse(500, "TIMELINE_LOOKUP_FAILED", "The incident timeline is temporarily unavailable.");
  }
}
