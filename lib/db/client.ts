// ============================================================
// AERIE — Drizzle + libSQL client (server-only)
// ============================================================
import "server-only";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { env } from "@/lib/env";
import * as schema from "./schema";

const client = createClient({ url: env.databaseUrl });

export const db = drizzle(client, { schema });
export { client, schema };
