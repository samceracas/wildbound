import type { Weather } from "@wildbound/shared";
import { weatherFromWmoCode } from "@wildbound/world";

export interface LocalConditions {
  weather: Weather;
  temperatureC: number | null;
  /** IANA zone of the location (Open-Meteo `timezone=auto`), if known. */
  timeZone: string | null;
  source: "live" | "fallback";
}

/** Anything that can tell the server the weather at a coordinate. Tests pass a fake. */
export interface WeatherProvider {
  current(lat: number, lng: number): Promise<LocalConditions>;
}

const FALLBACK: LocalConditions = { weather: "clear", temperatureC: null, timeZone: null, source: "fallback" };

interface OpenMeteoResponse {
  timezone?: string;
  current?: { weather_code?: number; temperature_2m?: number };
}

/**
 * Live weather from Open-Meteo (free, no API key). The server fetches it for the
 * player's server-side position, so clients cannot choose their own weather.
 *
 * Results are cached per ~5 km grid cell for 10 minutes to stay polite to the
 * free API. Any failure falls back to clear weather so the game keeps working.
 */
export class OpenMeteoWeather implements WeatherProvider {
  private cache = new Map<string, { at: number; value: LocalConditions }>();

  constructor(
    private readonly baseUrl: string,
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async current(lat: number, lng: number): Promise<LocalConditions> {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;

    const url = new URL(this.baseUrl);
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lng.toFixed(4));
    url.searchParams.set("current", "weather_code,temperature_2m");
    url.searchParams.set("timezone", "auto");
    try {
      const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const body = (await res.json()) as OpenMeteoResponse;
      const value: LocalConditions = {
        weather: weatherFromWmoCode(body.current?.weather_code ?? -1),
        temperatureC: body.current?.temperature_2m ?? null,
        timeZone: body.timezone ?? null,
        source: "live",
      };
      this.cache.set(key, { at: Date.now(), value });
      return value;
    } catch (error) {
      console.warn(`Weather lookup failed for ${key}; using fallback.`, (error as Error).message);
      return FALLBACK;
    }
  }
}

/** Fixed weather; used by tests and handy for offline development (WEATHER_API_URL=off). */
export class StaticWeather implements WeatherProvider {
  constructor(private readonly value: Partial<LocalConditions> = {}) {}
  async current(): Promise<LocalConditions> {
    return { ...FALLBACK, ...this.value };
  }
}
