import { readDemoSession } from "../../../../lib/demo-auth";

export async function GET(request: Request) {
  const session = await readDemoSession(request);
  if (!session) return Response.json({ session: null }, { status: 401 });
  return Response.json({
    session: { email: session.email, name: session.name, role: session.role },
  });
}
