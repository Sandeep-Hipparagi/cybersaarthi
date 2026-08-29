import { authErrorResponse, requireDemoSession } from "../../../../lib/demo-auth";
import {
  addAssistantSupportMessage,
  addSupportMessage,
  closeSettledCase,
  deleteClosedCase,
  getSupportCaseContext,
  reviewCaseRelationship,
  updateCaseStatus,
} from "../../../../lib/case-store";
import { detectedLanguageCode } from "../../../../lib/language-support";
import { generateSupportAssistantReply } from "../../../../lib/support-assistant";

type ActionBody = {
  caseId?: unknown;
  action?: unknown;
  note?: unknown;
  languageCode?: unknown;
  relationshipId?: unknown;
};

const ACTIONS = [
  "FOLLOW_UP",
  "SUPPORT_REPLY",
  "START_REVIEW",
  "REQUEST_INFORMATION",
  "RESOLVE",
  "CLOSE_SETTLED",
  "DELETE_CLOSED",
  "CONFIRM_RELATIONSHIP",
  "REJECT_RELATIONSHIP",
] as const;
type CaseAction = typeof ACTIONS[number];

function isCaseAction(value: unknown): value is CaseAction {
  return typeof value === "string" && ACTIONS.some((action) => action === value);
}

function actionError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  if (message === "CASE_NOT_FOUND") {
    return Response.json({ error: "That synthetic case was not found for this account." }, { status: 404 });
  }
  if (message === "CASE_CLOSED") {
    return Response.json({ error: "This case is closed. Reopen is intentionally unavailable in the prototype." }, { status: 409 });
  }
  if (message === "CASE_ALREADY_CLOSED") {
    return Response.json({ error: "This case is already closed." }, { status: 409 });
  }
  if (message === "CASE_NOT_FINANCIAL") {
    return Response.json({ error: "Settlement closure is available only for financial-fraud cases." }, { status: 409 });
  }
  if (message === "CASE_NOT_CLOSED") {
    return Response.json({ error: "Close the case after settlement before deleting it." }, { status: 409 });
  }
  if (message === "RELATIONSHIP_NOT_FOUND") {
    return Response.json({ error: "That proposed relationship was not found for this case." }, { status: 404 });
  }
  if (message === "FORBIDDEN" || message === "UNAUTHENTICATED" || message === "AUTH_NOT_CONFIGURED") {
    return authErrorResponse(error);
  }
  return Response.json({ error: "The synthetic case action could not be completed." }, { status: 500 });
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireDemoSession(request);
  } catch (error) {
    return authErrorResponse(error);
  }

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const caseId = typeof body.caseId === "string" ? body.caseId.trim().slice(0, 80) : "";
    const action = body.action;
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1200) : "";
    if (!caseId || !isCaseAction(action)) {
      return Response.json({ error: "Choose a valid case and action." }, { status: 400 });
    }

    if (action === "FOLLOW_UP" || action === "SUPPORT_REPLY") {
      if (!note) return Response.json({ error: "Write a short follow-up message." }, { status: 400 });
      if (action === "FOLLOW_UP" && session.role !== "CITIZEN") return authErrorResponse(new Error("FORBIDDEN"));
      if (action === "SUPPORT_REPLY" && session.role !== "EVALUATOR") return authErrorResponse(new Error("FORBIDDEN"));
      const languageCode = detectedLanguageCode(body.languageCode);
      const citizenMessage = await addSupportMessage(session, caseId, note, languageCode);
      if (action === "FOLLOW_UP") {
        const context = await getSupportCaseContext(session, caseId, note);
        const generated = await generateSupportAssistantReply(context);
        const assistantMessage = await addAssistantSupportMessage(
          session,
          caseId,
          generated.body,
          languageCode,
        );
        return Response.json({
          updated: true,
          synthetic: true,
          citizenMessage,
          assistantMessage,
          replyProvider: generated.provider,
          replyModel: generated.model,
        });
      }
      return Response.json({ updated: true, synthetic: true, citizenMessage });
    } else if (action === "CLOSE_SETTLED") {
      if (session.role !== "CITIZEN") return authErrorResponse(new Error("FORBIDDEN"));
      await closeSettledCase(session, caseId, note || null);
      return Response.json({ updated: true, synthetic: true, closed: true });
    } else if (action === "DELETE_CLOSED") {
      if (session.role !== "CITIZEN") return authErrorResponse(new Error("FORBIDDEN"));
      if (note !== "DELETE_CLOSED_CASE") {
        return Response.json({ error: "Confirm deletion from the closed-case panel." }, { status: 400 });
      }
      await deleteClosedCase(session, caseId);
      return Response.json({ updated: true, synthetic: true, deleted: true });
    } else if (action === "CONFIRM_RELATIONSHIP" || action === "REJECT_RELATIONSHIP") {
      if (session.role !== "EVALUATOR") return authErrorResponse(new Error("FORBIDDEN"));
      const relationshipId = typeof body.relationshipId === "string"
        ? body.relationshipId.trim().slice(0, 80)
        : "";
      if (!relationshipId) {
        return Response.json({ error: "Choose a proposed relationship to review." }, { status: 400 });
      }
      await reviewCaseRelationship(
        session,
        caseId,
        relationshipId,
        action === "CONFIRM_RELATIONSHIP" ? "CONFIRMED" : "REJECTED",
        note || null,
      );
      return Response.json({
        updated: true,
        synthetic: true,
        relationshipReviewed: true,
      });
    } else {
      if (session.role !== "EVALUATOR") return authErrorResponse(new Error("FORBIDDEN"));
      await updateCaseStatus(
        session,
        caseId,
        action as "START_REVIEW" | "REQUEST_INFORMATION" | "RESOLVE",
        note || null,
      );
    }
    return Response.json({ updated: true, synthetic: true });
  } catch (error) {
    return actionError(error);
  }
}
