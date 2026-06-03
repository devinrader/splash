import { createLogger } from "./logger.js";
import { loadSqliteConfig } from "./config.js";
import { createSqliteDatabase, DatabaseMigrator } from "./database.js";

async function main(): Promise<void> {
  const logger = createLogger();
  const sqlite = loadSqliteConfig(process.env);
  if (!sqlite) {
    throw new Error("SQLite configuration is required to run migrations.");
  }

  const database = createSqliteDatabase(sqlite);

  try {
    const migrator = new DatabaseMigrator(database, sqlite.migrationsDir);
    const applied = await migrator.migrate();
    logger.info("database.migrate", "Database migrations complete.", {
      applied_migrations: applied.map((migration) => migration.id)
    });
  } finally {
    database.close();
  }
}

main().catch((error) => {
  const logger = createLogger();
  logger.error("database.migrate.failed", "Database migration failed.", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
