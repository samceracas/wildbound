import type { Weather } from "@wildbound/shared";

/**
 * Maps a WMO weather interpretation code (what Open-Meteo returns as
 * `current.weather_code`) to the five WILDBOUND weather states.
 *
 * WMO codes (https://open-meteo.com/en/docs, "WMO Weather interpretation codes"):
 *   0            clear sky
 *   1, 2, 3      mainly clear, partly cloudy, overcast
 *   45, 48       fog, depositing rime fog
 *   51-57        drizzle (incl. freezing)
 *   61-67        rain (incl. freezing)
 *   71-77        snow
 *   80-82        rain showers
 *   85, 86       snow showers
 *   95, 96, 99   thunderstorm (with or without hail)
 *
 * Intended mapping:
 *   0 and 1 -> "clear"      2 and 3 -> "cloudy"     45, 48 -> "fog"
 *   drizzle, rain, showers, snow -> "rain"           95, 96, 99 -> "storm"
 *   anything unknown -> "cloudy" (a safe middle ground)
 *
 * ------------------------------------------------------------------------
 * TODO(you): implement the mapping above. Until then every location reports
 * clear weather, so weather-specific Wildkin never change their odds.
 * The exercise tests live in weather.exercise.test.ts (pnpm test:exercises).
 * Hint: a `switch (true)` with range checks, or a small lookup table.
 * ------------------------------------------------------------------------
 */
export function weatherFromWmoCode(code: number): Weather {
  void code;
  console.log(code);
  return "clear";
}
