# @wildbound/game

Reserved for battle and game systems. Not started.

Per the project plan, this begins after the Map Editor milestone and the first Phaser field. It must consume the shared `WorldContext` and must not introduce a second world model.

The v0.3.0 battle rules (stats, genetics, levels and EXP, the turn engine, matchups, statuses, capture, recovery, licenses) are pure functions in [`packages/world`](../world/README.md) (`src/battle/` and siblings), run by the API. NPC friendly battles (planned for 0.4.0) extend that engine with a second trainer side.
