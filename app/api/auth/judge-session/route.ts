import {
  authenticateDemoUser,
  createSessionCookie,
  JUDGE_DEMO_ACCOUNT,
} from "../../../../lib/demo-auth";

/** One-click, mock-only competition gateway. No OTP or external identity call. */
export async function POST(request: Request) {
  try {
    const session = await authenticateDemoUser(
      JUDGE_DEMO_ACCOUNT.email,
      JUDGE_DEMO_ACCOUNT.password,
    );
    if (!session) {
      return Response.json({ error: "Judge Test Mode is unavailable." }, { status: 503 });
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", await createSessionCookie(request, session));
    return new Response(
      JSON.stringify({
        session: { email: session.email, name: session.name, role: session.role },
        synthetic: true,
        otpRequired: false,
      }),
      { status: 200, headers },
    );
  } catch {
    return Response.json({ error: "Judge Test Mode could not start." }, { status: 503 });
  }
}
