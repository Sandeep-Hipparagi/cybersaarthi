import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeBindings = { DB?: D1Database };

function runtimeBindings(): RuntimeBindings {
  return (globalThis as typeof globalThis & {
    __CYBERSAARTHI_ENV?: RuntimeBindings;
  }).__CYBERSAARTHI_ENV ?? {};
}

export function getDb() {
  const env = runtimeBindings();
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
