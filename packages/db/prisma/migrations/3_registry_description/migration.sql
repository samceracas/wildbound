-- v0.2.0: explicit in-game Registry description on encyclopedia entries.
-- Entries written before this field existed get the description the game already shows
-- (creatures.description) or, for never-published drafts, their one-line identity.
UPDATE "wildkin_entries" e
SET "content" = e."content" || jsonb_build_object(
  'registryDescription',
  COALESCE(c."description", e."content"->>'identity', '')
)
FROM "wildkin_entries" e2
LEFT JOIN "creatures" c ON c."id" = e2."id"
WHERE e2."id" = e."id"
  AND COALESCE(e."content"->>'registryDescription', '') = '';
