import { createDb } from "@wildbound/db";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { OpenMeteoWeather, StaticWeather } from "./weather.ts";

const config = loadConfig();
const handle = createDb(config.databaseUrl);
const weather = config.weatherApiUrl === "off" ? new StaticWeather() : new OpenMeteoWeather(config.weatherApiUrl);
const app = createApp({ db: handle.db, config, weather });

const server = app.listen(config.port, config.host, () => {
  console.log(`WILDBOUND API listening on http://${config.host}:${config.port}`);
});

const shutdown = () => {
  server.close(async () => {
    await handle.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
