import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const dbPath = process.env.DATABASE_URL?.replace(/^file:/, "") || "./data/paisaflow.db";
const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

async function main() {
  migrate(db, { migrationsFolder: "./src/db/migrations" });
}

main().catch((error) => {
  console.error("Migration failed", error);
  process.exit(1);
});
