import { purgeExpiredSyntheticCases } from "../../../../lib/case-store";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Retention job is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const deletedCases = await purgeExpiredSyntheticCases();
    return Response.json({ deletedCases, retentionDays: 30 });
  } catch {
    return Response.json({ error: "Retention cleanup failed." }, { status: 500 });
  }
}
