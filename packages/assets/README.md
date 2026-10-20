# @wildbound/assets

Reserved for tile, creature and effect asset metadata used by the future Phaser field. Not started.

AI-assisted tools may help produce art and tiles, but generated assets are a content-production step, never a runtime dependency, and never the source of geographic truth.

Wildkin icons and sprites live in the database (`wildkin_art`), are generated in the Creature Manager with PixelLab and served by the API at `/api/art/wildkin/<id>/<icon|sprite>.png`. The seed copies and the player head are in `apps/web/public/`. All of it is placeholder art until approved against the Wildkin Bible.
