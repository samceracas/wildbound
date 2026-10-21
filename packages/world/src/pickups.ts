import { CATEGORY_CAPSULES, type ItemId, type PoiType } from "@wildbound/shared";

/** Category capsule a POI type can hold (15% chance). Other types hold none. */
export const PICKUP_CATEGORY_CAPSULE: Partial<Record<PoiType, ItemId>> = {
  water: CATEGORY_CAPSULES.aquatic,
  clearing: CATEGORY_CAPSULES.verdant,
  hollow: CATEGORY_CAPSULES.terrestrial,
  trail: CATEGORY_CAPSULES.aerial,
};

export const PICKUP_RULES = {
  fieldCapsules: 2,
  extraFieldCapsuleChance: 0.5,
  trailRationChance: 0.3,
  categoryCapsuleChance: 0.15,
} as const;

/**
 * What a daily POI search finds: 2 Field Capsules, plus 1 more with 50%;
 * 1 Trail Ration with 30%; 1 category capsule with 15% by POI type. Always
 * rolls `random` three times in that order, so results are reproducible.
 */
export function rollPickup(poiType: PoiType, random: () => number): Partial<Record<ItemId, number>> {
  const loot: Partial<Record<ItemId, number>> = {
    "field-capsule": PICKUP_RULES.fieldCapsules + (random() < PICKUP_RULES.extraFieldCapsuleChance ? 1 : 0),
  };
  if (random() < PICKUP_RULES.trailRationChance) loot["trail-ration"] = 1;
  const capsule = PICKUP_CATEGORY_CAPSULE[poiType];
  if (random() < PICKUP_RULES.categoryCapsuleChance && capsule) loot[capsule] = 1;
  return loot;
}
