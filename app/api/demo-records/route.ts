import { POST as createSyntheticCase } from "../cases/route";
import { problemResponse, readJsonObject, requestProblemResponse } from "../../../lib/api-response";

/**
 * Explicit synthetic record-creation endpoint. It saves only inside CyberSaarthi and
 * returns a 14-digit synthetic demo reference; it never calls NCRP.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request.clone());
  } catch (error) {
    return requestProblemResponse(error)
      ?? problemResponse(500, "REQUEST_READ_FAILED", "The request could not be read.");
  }
  if (body.reviewedByCitizen !== true) {
    return problemResponse(422, "CITIZEN_REVIEW_REQUIRED", "Review the proposed record before saving it.");
  }
  if (body.unresolvedCriticalConflicts !== 0) {
    return problemResponse(422, "CRITICAL_CONFLICTS_UNRESOLVED", "Resolve or mark critical conflicts unknown before saving.");
  }
  return createSyntheticCase(request);
}
