import { Cloud, CloudFog, CloudLightning, CloudRain, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import type { TimeOfDay, Weather } from "@wildbound/shared";

export const WEATHER_LABEL: Record<Weather, string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  rain: "Rain",
  storm: "Storm",
  fog: "Fog",
};

export const TIME_LABEL: Record<TimeOfDay, string> = { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" };

export function WeatherIcon({ weather, className }: { weather: Weather; className?: string }) {
  const Icon = { clear: Sun, cloudy: Cloud, rain: CloudRain, storm: CloudLightning, fog: CloudFog }[weather];
  return <Icon className={className} aria-hidden />;
}

export function TimeIcon({ timeOfDay, className }: { timeOfDay: TimeOfDay; className?: string }) {
  const Icon = { dawn: Sunrise, day: Sun, dusk: Sunset, night: Moon }[timeOfDay];
  return <Icon className={className} aria-hidden />;
}
