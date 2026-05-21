import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import type { PostgresConfig } from "./config.js";

export interface Queryable {
  query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
}

export interface MigrationRecord {
  id: string;
  appliedAt: string;
}

export function createPostgresPool(config: PostgresConfig): Pool {
  return new Pool(toPoolConfig(config));
}

export function toPoolConfig(config: PostgresConfig): PoolConfig {
  if (config.connectionString) {
    return {
      connectionString: config.connectionString
    };
  }

  return {
    host: config.host ?? undefined,
    port: config.port,
    database: config.database ?? undefined,
    user: config.user ?? undefined,
    password: config.password ?? undefined
  };
}

export class DatabaseMigrator {
  constructor(private readonly queryable: Queryable, private readonly migrationsDir: string) {}

  async migrate(): Promise<MigrationRecord[]> {
    await this.ensureMigrationsTable();
    const applied = await this.readAppliedMigrationIds();
    const files = await this.readMigrationFiles();
    const executed: MigrationRecord[] = [];

    for (const file of files) {
      if (applied.has(file.id)) {
        continue;
      }
      await this.applyMigration(file);
      executed.push({
        id: file.id,
        appliedAt: new Date().toISOString()
      });
    }

    return executed;
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.queryable.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  private async readAppliedMigrationIds(): Promise<Set<string>> {
    const result = await this.queryable.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id ASC");
    return new Set(result.rows.map((row) => row.id));
  }

  private async readMigrationFiles(): Promise<Array<{ id: string; sql: string }>> {
    const absoluteDir = path.resolve(process.cwd(), this.migrationsDir);
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    const migrations: Array<{ id: string; sql: string }> = [];
    for (const file of files) {
      migrations.push({
        id: file,
        sql: await fs.readFile(path.join(absoluteDir, file), "utf8")
      });
    }

    return migrations;
  }

  private async applyMigration(migration: { id: string; sql: string }): Promise<void> {
    if (isTransactional(this.queryable)) {
      const client = this.queryable;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      return;
    }

    await this.queryable.query(migration.sql);
    await this.queryable.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
  }
}

function isTransactional(queryable: Queryable): queryable is PoolClient {
  return typeof (queryable as PoolClient).release === "function";
}
