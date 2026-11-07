import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/server/db/schema";

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  raw?: Sql;
  sql?: Sql;
  db?: PostgresJsDatabase<typeof schema>;
  migration?: Promise<void>;
  migrating?: boolean;
};

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return url;
}

function rawSql(): Sql {
  if (!globalForDb.raw) {
    globalForDb.raw = postgres(databaseUrl(), {
      max: 10,
      connect_timeout: 10,
      idle_timeout: 20,
      onnotice: () => undefined,
    });
  }
  return globalForDb.raw;
}

function guardedSql(raw: Sql): Sql {
  const call = (target: (...args: unknown[]) => unknown) => {
    return async (...args: unknown[]) => {
      await ensureDatabase();
      return target(...args);
    };
  };
  return new Proxy(raw, {
    apply(target, thisArg, args) {
      return call(target.bind(thisArg))(...args);
    },
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return call(value.bind(target));
    },
  }) as Sql;
}

export function getSql(): Sql {
  if (globalForDb.migrating) return rawSql();
  if (!globalForDb.sql) globalForDb.sql = guardedSql(rawSql());
  return globalForDb.sql;
}

export function ensureDatabase(): Promise<void> {
  if (!globalForDb.migration) {
    globalForDb.migration = (async () => {
      globalForDb.migrating = true;
      try {
        const { migrateDatabase } = await import("@/server/db/migrate");
        await migrateDatabase();
      } catch (error) {
        globalForDb.migration = undefined;
        throw error;
      } finally {
        globalForDb.migrating = false;
      }
    })();
  }
  return globalForDb.migration;
}

export function getDb() {
  if (!globalForDb.db) {
    globalForDb.db = drizzle(getSql(), { schema });
  }
  return globalForDb.db;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.raw) {
    await globalForDb.raw.end({ timeout: 5 });
  }
  globalForDb.raw = undefined;
  globalForDb.sql = undefined;
  globalForDb.db = undefined;
  globalForDb.migration = undefined;
  globalForDb.migrating = false;
}
