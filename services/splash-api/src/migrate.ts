import { createLogger } from "./logger.js";
import { loadPostgresConfig } from "./config.js";
import { createPostgresPool, DatabaseMigrator } from "./database.js";

async function main(): Promise<void> {
  const logger = createLogger();
  const postgres = loadPostgresConfig(process.env);
  if (!postgres) {
    throw new Error("PostgreSQL configuration is required to run migrations.");
  }

  const pool = createPostgresPool(postgres);
  const client = await pool.connect();

  try {
    const migrator = new DatabaseMigrator(client, postgres.migrationsDir);
    const applied = await migrator.migrate();
    logger.info("database.migrate", "Database migrations complete.", {
      applied_migrations: applied.map((migration) => migration.id)
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  const logger = createLogger();
  logger.error("database.migrate.failed", "Database migration failed.", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
