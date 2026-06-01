// ============================================================
// AERIE — seed the minimal structural defaults (visibility groups).
// Services and users are NOT seeded — they come from the declarative
// YAML config and the Admin UI. Idempotent via onConflictDoNothing.
// ============================================================
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { DEFAULT_GROUPS } from "./defaults";

type DB = LibSQLDatabase<typeof schema>;

export async function seed(db: DB): Promise<void> {
  await db
    .insert(schema.groups)
    .values(DEFAULT_GROUPS.map(([name, label]) => ({ name, label })))
    .onConflictDoNothing();
}
