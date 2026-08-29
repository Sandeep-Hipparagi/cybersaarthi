import { authErrorResponse, requireDemoSession } from "../../../../lib/demo-auth";
import { resetSyntheticCases } from "../../../../lib/case-store";

export async function POST(request: Request) {
  let session;
  try {
    session = await requireDemoSession(request, "EVALUATOR");
  } catch (error) {
    return authErrorResponse(error);
  }
  try {
    await resetSyntheticCases(session);
    return Response.json({ reset: true, synthetic: true });
  } catch {
    return Response.json({ error: "The synthetic dataset could not be reset." }, { status: 500 });
  }
}
