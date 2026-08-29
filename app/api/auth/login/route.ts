import {
  authenticateDemoUser,
  createSessionCookie,
} from "../../../../lib/demo-auth";

export async function POST(request: Request) {
  try {
    let body: { email?: string; password?: string };
    try {
      body = (await request.json()) as { email?: string; password?: string };
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    if (!email || !password) {
      return Response.json({ error: "Enter both mock email and password." }, { status: 400 });
    }
    const session = await authenticateDemoUser(email, password);
    if (!session) {
      return Response.json({ error: "Those synthetic demo credentials do not match." }, { status: 401 });
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", await createSessionCookie(request, session));
    return new Response(
      JSON.stringify({ session: { email: session.email, name: session.name, role: session.role } }),
      { status: 200, headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      { error: message === "AUTH_NOT_CONFIGURED" ? "Synthetic authentication is not configured." : "Login could not be completed." },
      { status: message === "AUTH_NOT_CONFIGURED" ? 503 : 500 },
    );
  }
}
