/**
 * Shared vocabularies for WILDBOUND world authoring.
 * These are data vocabularies, not UI strings: the editor, API and future
 * Phaser field all agree on them.
 */

/** Spatial reference used everywhere: WGS84 longitude/latitude (EPSG:4326). */
export const WORLD_SRID = 4326;

export const TIME_OF_DAY = ["dawn", "day", "dusk", "night"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const WEATHER = ["clear", "cloudy", "rain", "storm", "fog"] as const;
export type Weather = (typeof WEATHER)[number];

export const POI_TYPES = [
  "gate",
  "trail",
  "landmark",
  "clearing",
  "hollow",
  "water",
  "research-station",
  "other",
] as const;
export type PoiType = (typeof POI_TYPES)[number];

export const PUBLICATION_STAGES = ["draft", "published"] as const;
export type PublicationStage = (typeof PUBLICATION_STAGES)[number];

/** Suggested tags. Tags are free-form slugs; these just speed up authoring. */
export const SUGGESTED_BIOME_TAGS = [
  "tropical-forest",
  "urban-park",
  "wetland",
  "grassland",
  "riparian",
] as const;

export const SUGGESTED_HABITAT_TAGS = [
  "forest",
  "forest-edge",
  "canopy",
  "woodland-edge",
  "forest-floor",
  "leaf-litter",
  "moss",
  "clearing",
  "flowering",
  "sunny",
  "rocky",
  "fallen-branches",
  "sheltered",
  "freshwater",
  "creek",
  "riparian",
] as const;

/** Default and maximum radius (meters) for nearby POI lookups. */
export const NEARBY_POI_DEFAULT_RADIUS_M = 300;
export const NEARBY_POI_MAX_RADIUS_M = 5000;
export const NEARBY_POI_LIMIT = 25;

export const ENCOUNTER_WEIGHT_MIN = 1;
export const ENCOUNTER_WEIGHT_MAX = 1000;

/** Rarity bands (Wildkin Bible). Rarity is not strength. */
export const RARITIES = ["common", "uncommon", "rare", "TBD"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Activity pattern vocabulary (Wildkin Bible, section 4). */
export const ACTIVITY_PATTERNS = [
  "diurnal",
  "nocturnal",
  "crepuscular",
  "cathemeral",
  "sheltering_by_day",
  "seasonal",
  "TBD",
] as const;
export type ActivityPattern = (typeof ACTIVITY_PATTERNS)[number];

/**
 * How a spawned Wildkin wanders on the radar (see wanderStep in @wildbound/world).
 * - still:   barely moves (rooted, resting, hiding)
 * - skulker: short, cautious moves with long pauses
 * - forager: slow meandering
 * - roamer:  steady travel in one general direction
 * - darter:  quick bursts with frequent stops
 */
export const MOVEMENT_STYLES = ["still", "skulker", "forager", "roamer", "darter"] as const;
export type MovementStyleName = (typeof MOVEMENT_STYLES)[number];
