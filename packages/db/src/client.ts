import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export type Database = PrismaClient;

export interface DbHandle {
  db: Database;
  /** The connection string this handle was opened with (migrations need it). */
  url: string;
  close: () => Promise<void>;
}

/**
 * Opens a Prisma client over node-postgres. Prisma 7 always talks to the
 * database through a driver adapter; PrismaPg owns the connection pool.
 */
export function createDb(connectionString: string): DbHandle {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 10 }) });
  return { db, url: connectionString, close: () => db.$disconnect() };
}
