// ============================================================
// AERIE — Drizzle + libSQL client (server-only)
// ============================================================
import "server-only";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { env } from "@/lib/env";
import * as schema from "./schema";

// For a local file DB, make sure the parent directory exists before opening,
// otherwise libSQL fails to create the file (e.g. fresh CI/Docker checkouts
// where ./data is gitignored and absent).
if (env.databaseUrl.startsWith("file:")) {
  const path = env.databaseUrl.replace(/^file:/, "");
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    /* best-effort */
  }
}

const client = createClient({ url: env.databaseUrl });

export const db = drizzle(client, { schema });
export { client, schema };
