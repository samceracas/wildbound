import type { ConditionRules, TimeOfDay, Weather } from "@wildbound/shared";

export interface Environment {
  timeOfDay: TimeOfDay;
  weather: Weather;
}

/** Empty lists mean "any". Every non-empty list must include the current value. */
export function conditionsMatch(rules: ConditionRules, env: Environment): boolean {
  if (rules.timeOfDay.length > 0 && !rules.timeOfDay.includes(env.timeOfDay)) return false;
  if (rules.weather.length > 0 && !rules.weather.includes(env.weather)) return false;
  return true;
}

/** Hour boundaries, local time. dawn 05–07, day 07–17, dusk 17–19, night 19–05. */
export function timeOfDayForHour(hour: number): TimeOfDay {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`hour must be an integer 0-23, got ${hour}`);
  }
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 17) return "day";
  if (hour >= 17 && hour < 19) return "dusk";
  return "night";
}

/** Time of day at an instant in a given IANA time zone (e.g. "Asia/Manila"). */
export function timeOfDayAt(date: Date, timeZone: string): TimeOfDay {
  const hourPart = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
    .formatToParts(date)
    .find((p) => p.type === "hour");
  return timeOfDayForHour(Number(hourPart?.value ?? date.getUTCHours()) % 24);
}

/** Human-readable summary, e.g. "dawn/day · rain". Empty rules read "always". */
export function describeConditions(rules: ConditionRules): string {
  const parts: string[] = [];
  if (rules.timeOfDay.length) parts.push(rules.timeOfDay.join("/"));
  if (rules.weather.length) parts.push(rules.weather.join("/"));
  return parts.length ? parts.join(" · ") : "always";
}
