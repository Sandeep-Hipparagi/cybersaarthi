export type DemoRole = "CITIZEN" | "EVALUATOR";

export type DemoSession = {
  email: string;
  name: string;
  role: DemoRole;
  expiresAt: number;
};

type DemoUser = Omit<DemoSession, "expiresAt"> & { passwordHash: string };

const COOKIE_NAME = "cybersaarthi_demo_session";
const PASSWORD_SALT = "cybersaarthi-demo-v1";
const SESSION_SECONDS = 4 * 60 * 60;

export const JUDGE_DEMO_ACCOUNT = {
  email: "citizen@test.com",
  password: "test2026",
  name: "Sandeep Hipparagi",
  role: "CITIZEN" as const,
};

const DEMO_USERS: DemoUser[] = [
  {
    email: JUDGE_DEMO_ACCOUNT.email,
    name: JUDGE_DEMO_ACCOUNT.name,
    role: JUDGE_DEMO_ACCOUNT.role,
    passwordHash: "fe49e81a07b5f004361553f5af6c5561eb3d1c7444423172bb47c493c9fbce60",
  },
  {
    email: "evaluator@cybersaarthi.demo",
    name: "Competition Evaluator",
    role: "EVALUATOR",
    passwordHash: "5af583a9424583f58c8b9810b3923420b51172fad646337e20828c8dd9710b68",
  },
];

const textEncoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function authSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  return secret;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(encodedPayload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(),
    textEncoder.encode(encodedPayload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function authenticateDemoUser(
  email: string,
  password: string,
): Promise<DemoSession | null> {
  const user = DEMO_USERS.find((candidate) => candidate.email === email.trim().toLowerCase());
  if (!user) return null;
  const suppliedHash = await sha256Hex(`${PASSWORD_SALT}:${password}`);
  if (!constantTimeEqual(suppliedHash, user.passwordHash)) return null;
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
}

function secureCookieAttribute(request: Request): string {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const isSecure = forwardedProtocol
    ? forwardedProtocol === "https"
    : new URL(request.url).protocol === "https:";
  return isSecure ? "; Secure" : "";
}

export async function createSessionCookie(
  request: Request,
  session: DemoSession,
): Promise<string> {
  const encodedPayload = bytesToBase64Url(textEncoder.encode(JSON.stringify(session)));
  const signature = await signPayload(encodedPayload);
  return `${COOKIE_NAME}=${encodedPayload}.${signature}; Path=/; HttpOnly${secureCookieAttribute(request)}; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearSessionCookie(request: Request): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secureCookieAttribute(request)}; SameSite=Lax; Max-Age=0`;
}

function readCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === COOKIE_NAME) return value.join("=");
  }
  return null;
}

export async function readDemoSession(request: Request): Promise<DemoSession | null> {
  try {
    const token = readCookie(request);
    if (!token) return null;
    const [encodedPayload, encodedSignature] = token.split(".");
    if (!encodedPayload || !encodedSignature) return null;
    const payloadBytes = base64UrlToBytes(encodedPayload);
    const signatureBytes = base64UrlToBytes(encodedSignature);
    if (
      bytesToBase64Url(payloadBytes) !== encodedPayload
      || bytesToBase64Url(signatureBytes) !== encodedSignature
    ) return null;
    const verified = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      signatureBytes as BufferSource,
      textEncoder.encode(encodedPayload),
    );
    if (!verified) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as Partial<DemoSession>;
    if (
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) return null;
    if (payload.role !== "CITIZEN" && payload.role !== "EVALUATOR") return null;
    return payload as DemoSession;
  } catch {
    return null;
  }
}

export async function requireDemoSession(
  request: Request,
  role?: DemoRole,
): Promise<DemoSession> {
  const session = await readDemoSession(request);
  if (!session) throw new Error("UNAUTHENTICATED");
  if (role && session.role !== role) throw new Error("FORBIDDEN");
  return session;
}

export function authErrorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "UNAUTHENTICATED";
  if (message === "FORBIDDEN") {
    return Response.json({ error: "This demo account cannot perform that action." }, { status: 403 });
  }
  if (message === "AUTH_NOT_CONFIGURED") {
    return Response.json({ error: "Synthetic authentication is not configured." }, { status: 503 });
  }
  return Response.json({ error: "Please sign in with a synthetic demo account." }, { status: 401 });
}
