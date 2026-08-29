export class RequestProblem extends Error {
  constructor(
    readonly status: 400 | 413 | 415 | 422,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().slice(0, maxLength)
    : "";
}

export async function readJsonObject(
  request: Pick<Request, "headers" | "body">,
  maxBytes = 64_000,
): Promise<Record<string, unknown>> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestProblem(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }
  let text = "";
  try {
    if (!request.body) {
      text = "";
    } else {
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          throw new RequestProblem(413, "REQUEST_TOO_LARGE", "The request is too large.");
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
  } catch (error) {
    if (error instanceof RequestProblem) throw error;
    throw new RequestProblem(400, "REQUEST_READ_FAILED", "The request body could not be read.");
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new RequestProblem(413, "REQUEST_TOO_LARGE", "The request is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new RequestProblem(400, "JSON_INVALID", "Request body must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestProblem(400, "JSON_OBJECT_REQUIRED", "Request body must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function problemResponse(
  status: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
): Response {
  return Response.json({ ok: false, error, code, ...extra }, { status });
}

export function requestProblemResponse(error: unknown): Response | null {
  return error instanceof RequestProblem
    ? problemResponse(error.status, error.code, error.message)
    : null;
}

export function successResponse<T extends Record<string, unknown>>(
  data: T,
  status = 200,
): Response {
  return Response.json({ ok: true, ...data }, { status });
}
