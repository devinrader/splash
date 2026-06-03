import { mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqliteConfig } from "./config.js";

export type SqliteParams = readonly unknown[];

export interface SqliteDatabase {
  get<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: SqliteParams): Row | undefined;
  all<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: SqliteParams): Row[];
  run(sql: string, params?: SqliteParams): void;
  exec(sql: string): void;
  transaction<T>(callback: () => T): T;
  close(): void;
}

export interface MigrationRecord {
  id: string;
  appliedAt: string;
}

class NodeSqliteDatabase implements SqliteDatabase {
  constructor(private readonly database: DatabaseSync) {}

  get<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: SqliteParams = []): Row | undefined {
    return this.database.prepare(sql).get(...(params as any[])) as Row | undefined;
  }

  all<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: SqliteParams = []): Row[] {
    return this.database.prepare(sql).all(...(params as any[])) as Row[];
  }

  run(sql: string, params: SqliteParams = []): void {
    this.database.prepare(sql).run(...(params as any[]));
  }

  exec(sql: string): void {
    this.database.exec(sql);
  }

  transaction<T>(callback: () => T): T {
    this.database.exec("BEGIN");
    try {
      const result = callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

export function createSqliteDatabase(config: SqliteConfig): SqliteDatabase {
  const resolvedPath = resolveDatabasePath(config.path);
  if (shouldEnsureParentDirectory(resolvedPath)) {
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const database = new DatabaseSync(resolvedPath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`PRAGMA busy_timeout = ${Math.max(0, config.busyTimeoutMs)}`);
  if (resolvedPath !== ":memory:") {
    database.exec(`PRAGMA journal_mode = ${config.journalMode}`);
  }

  return new NodeSqliteDatabase(database);
}

export class DatabaseMigrator {
  constructor(private readonly database: SqliteDatabase, private readonly migrationsDir: string) {}

  async migrate(): Promise<MigrationRecord[]> {
    this.ensureMigrationsTable();
    const applied = this.readAppliedMigrationIds();
    const files = await this.readMigrationFiles();
    const executed: MigrationRecord[] = [];

    for (const file of files) {
      if (applied.has(file.id)) {
        continue;
      }
      this.applyMigration(file);
      executed.push({
        id: file.id,
        appliedAt: new Date().toISOString()
      });
    }

    return executed;
  }

  private ensureMigrationsTable(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private readAppliedMigrationIds(): Set<string> {
    const rows = this.database.all<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id ASC");
    return new Set(rows.map((row) => row.id));
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

  private applyMigration(migration: { id: string; sql: string }): void {
    this.database.transaction(() => {
      this.database.exec(migration.sql);
      this.database.run("INSERT INTO schema_migrations (id) VALUES (?)", [migration.id]);
    });
  }
}

function resolveDatabasePath(inputPath: string): string {
  if (inputPath === ":memory:" || inputPath.startsWith("file:")) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

function shouldEnsureParentDirectory(resolvedPath: string): boolean {
  return resolvedPath !== ":memory:" && !resolvedPath.startsWith("file:");
}
