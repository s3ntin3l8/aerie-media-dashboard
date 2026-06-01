// CLI: apply migrations + seed the config DB.
//   npx tsx scripts/seed.ts
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createClient } from "@libsql/client";
import * as schema from "../lib/db/schema";
import { seed } from "../lib/db/seed";

async function main() {
  const url = process.env.DATABASE_URL || "file:./data/aerie.db";
  const client = createClient({ url });
  const db = drizzle(client, { schema });

  console.log(`[seed] migrating ${url} …`);
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[seed] seeding structural defaults (visibility groups) …");
  await seed(db);

  const svc = await db.select().from(schema.services);
  const users = await db.select().from(schema.users);
  console.log(`[seed] done — ${svc.length} services, ${users.length} users.`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed] failed:", e);
  process.exit(1);
});
