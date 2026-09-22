import { readdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export async function assertLocalSchema(databaseUrl, root = process.cwd()) {
  const target = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)) throw new Error("The standard local launcher requires a loopback database. Configure a separate profile for a remote database.");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const migrations = await prisma.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const applied = new Set(migrations.map(row => row.migration_name));
    const expected = readdirSync(path.join(root, "apps/api/prisma/migrations"), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    const pending = expected.filter(name => !applied.has(name));
    if (pending.length) throw new Error(`Local schema has pending migrations: ${pending.join(", ")}. Review the exact database and upgrade preserving data before starting; the launcher never migrates or reseeds it automatically.`);
  } finally { await prisma.$disconnect(); }
}
