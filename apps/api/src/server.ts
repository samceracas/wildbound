import { createDb } from "@wildbound/db";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { PixelLabArt } from "./manager/art.ts";
import { GroqAssistant } from "./manager/assistant.ts";
import { OpenMeteoWeather, StaticWeather } from "./weather.ts";

const config = loadConfig();
const handle = createDb(config.databaseUrl);
const weather = config.weatherApiUrl === "off" ? new StaticWeather() : new OpenMeteoWeather(config.weatherApiUrl);
const assistant = config.groqApiKey ? new GroqAssistant(config.groqApiKey, config.groqModel, config.groqApiUrl) : null;
const art = config.pixellabApiKey ? new PixelLabArt(config.pixellabApiKey, config.pixellabApiUrl) : null;
const app = createApp({ db: handle.db, config, weather, assistant, art });

const server = app.listen(config.port, config.host, () => {
  console.log(`WILDBOUND API listening on http://${config.host}:${config.port}`);
  console.log(`Creature Manager: AI assistant ${assistant ? `on (${assistant.model})` : "off (set GROQ_API_KEY)"}, art ${art ? "on (PixelLab Pixen)" : "off (set PIXELLAB_API_KEY)"}`);
});

const shutdown = () => {
  server.close(async () => {
    await handle.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
