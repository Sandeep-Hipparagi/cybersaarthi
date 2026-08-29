import { authErrorResponse, requireDemoSession } from "../../../../lib/demo-auth";
import { problemResponse, successResponse } from "../../../../lib/api-response";
import { fetchStatusAudit } from "../../../../lib/workflow-repository";
import { exactAcknowledgement } from "../../../../lib/workflow-validation";

export async function GET(request: Request) {
  let session;
  try { session = await requireDemoSession(request); } catch (error) { return authErrorResponse(error); }
  const acknowledgement = exactAcknowledgement(new URL(request.url).searchParams.get("acknowledgement"));
  if (!acknowledgement) {
    return problemResponse(422, "ACKNOWLEDGEMENT_INVALID", "Use the exact 14-digit synthetic acknowledgement number.");
  }
  try {
    const audit = await fetchStatusAudit(session, acknowledgement);
    return audit
      ? successResponse({ audit, synthetic: true })
      : problemResponse(404, "CASE_NOT_FOUND", "No authorised synthetic case matches that acknowledgement number.");
  } catch {
    return problemResponse(500, "STATUS_LOOKUP_FAILED", "The status audit is temporarily unavailable.");
  }
}
