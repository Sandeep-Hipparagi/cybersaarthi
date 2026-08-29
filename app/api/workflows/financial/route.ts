import { authErrorResponse, requireDemoSession } from "../../../../lib/demo-auth";
import { problemResponse, successResponse } from "../../../../lib/api-response";
import { fetchGoldenHourTransaction } from "../../../../lib/workflow-repository";
import { exactUtr } from "../../../../lib/workflow-validation";

export async function GET(request: Request) {
  let session;
  try { session = await requireDemoSession(request); } catch (error) { return authErrorResponse(error); }
  const url = new URL(request.url);
  const utr = url.searchParams.get("utr");
  const transactionId = url.searchParams.get("transactionId")?.normalize("NFKC").trim() ?? "";
  if (Boolean(utr) === Boolean(transactionId)) {
    return problemResponse(422, "ONE_TRANSACTION_IDENTIFIER_REQUIRED", "Provide exactly one UTR or transaction ID.");
  }
  const identifier = utr
    ? { kind: "UTR" as const, value: exactUtr(utr) }
    : { kind: "TRANSACTION_ID" as const, value: /^[A-Za-z0-9-]{8,64}$/.test(transactionId) ? transactionId : null };
  if (!identifier.value) {
    return problemResponse(422, "TRANSACTION_IDENTIFIER_INVALID", "Use an exact 12-digit UTR or a valid stored transaction ID.");
  }
  try {
    const transaction = await fetchGoldenHourTransaction(session, { ...identifier, value: identifier.value });
    return transaction
      ? successResponse({ transaction, synthetic: true })
      : problemResponse(404, "TRANSACTION_NOT_FOUND", "No authorised synthetic transaction matches that identifier.");
  } catch {
    return problemResponse(500, "TRANSACTION_LOOKUP_FAILED", "The transaction lookup is temporarily unavailable.");
  }
}
