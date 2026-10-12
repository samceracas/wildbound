import { createDb } from "@wildbound/db";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const handle = createDb(config.databaseUrl);
const app = await buildApp({ db: handle.db, config }, { logger: { level: process.env.LOG_LEVEL ?? "info" } });

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: config.port, host: config.host });
