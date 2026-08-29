import { clearSessionCookie } from "../../../../lib/demo-auth";

export async function POST(request: Request) {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", clearSessionCookie(request));
  return new Response(JSON.stringify({ signedOut: true }), { status: 200, headers });
}
