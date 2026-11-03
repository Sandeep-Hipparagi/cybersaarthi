import { demoAccessEnabled } from "../../../../lib/demo-auth";

export async function GET() {
  return Response.json({ enabled: demoAccessEnabled() });
}
