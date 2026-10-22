# WILDBOUND lore brief (Creature Manager AI assistant)

Condensed from the three canon documents in `docs/` for the AI assistant, so a request stays within small model limits.
Authority: (1) Wildkin Bible v1.2 for species canon, (2) The First Field Survey v1.0 for the opening story,
(3) Wildkin Biology & Ecology Reference v1.1 for biological rules. If something here conflicts with them, they win:
update this brief. Details of the existing species are sent separately (the roster), so they are not repeated here.

## Setting (The First Field Survey)

- Sam grew up in **Luntian**, a small settlement on the edge of **Mabunyi Forest Reserve**. Sam's late father was a
  passionate Field Registry worker. Sam returns with a new **Field Registry** license for a first, routine assignment:
  survey Mabunyi's known Wildkin. Motto on the badge: *Observe. Record. Respect.* Father's note: *Don't write down what
  you expect to find. Write down what you actually find.*
- Inspired by a Philippine forest-edge community and watershed (a place like La Mesa), but all places and ecology are
  fictional. Grounded, small-scale, quiet wonder; the world existed before the player.
- Places: East Research Gate (ranger station; rules: observe before approaching, don't disturb nests, record anything
  unusual, don't assume what a displaced Wildkin needs), Mabunyi Research Trail, **Sunbreak** (bright flowering
  clearing), **Root Hollow** (roots, fallen timber), **Fern Hollow** (shaded damp depression: rocks, ferns, moss),
  Creek Trail, **Silayan Creek** (freshwater habitat at the heart of the mystery).
- "Mabunyi is not one habitat. It is many habitats pressed together."
- Central problem: Wildkin appear **outside their recorded habitats**. At Silayan Creek, historically reliable, a
  Riverkin struggles to reach water. Old Registry records "are useful; they're not always current". The routine survey
  becomes an investigation into a changing environment. The cause is **not** established.
- Future species are added only with a clear ecological role, visual identity, gameplay purpose or narrative tie to the
  reserve; the opening stays focused on a small, memorable group.

## What Wildkin are (Biology & Ecology Reference)

- A **distinct, stable biological lineage** on Earth with a shared **Wildkin genetic signature** absent from ordinary
  Earth life. Not magic animals, not present-day mutants: they are born Wildkin, with inherited traits and species
  identities. Resemblance to an Earth animal does not make it that animal (a bird-shaped Wildkin is not a bird).
- Origin hypothesis (unresolved): an unusual microscopic biological influence arrived hundreds of years ago and reshaped
  some lineages over generations. Whether it was extraterrestrial, intelligent, still active, or how it worked is
  **open**. Never present it as settled, and never claim it causes the current habitat changes.
- Wildkin reproduce **only with compatible Wildkin**, never with ordinary animals; cross-species compatibility is not
  assumed.
- They live in real ecosystems alongside ordinary Earth life (an ordinary bird may share a branch with a Kawi). They
  eat, hunt, are hunted, compete, cooperate; they may eat ordinary organisms and **may prey on other Wildkin**. Diet
  must fit anatomy, habitat, behaviour and role; avoid generic diets.
- Intelligence varies by species and adds flexibility, memory, communication; instincts remain (forage, hide, flee,
  defend, protect young). Behaviour spectrum: instinct-driven, curious, social, trainable, bond-capable, highly
  intelligent (rare). Intelligence and bondability are different things. **No Wildkin is automatically friendly**;
  capture is not affection.
- Special abilities must feel like **biological adaptations** (sensory organs, defensive secretions, electrical
  signalling, unusual metabolism, symbiosis…), readable in play, and built from reusable effects.
- The Field Registry is the world's institutional record: species, morphology, habitats, diet, behaviour, human
  interaction, population observations, historical vs current data, and **uncertainty labels**.
- **Individual variation** (ESTABLISHED): individuals inherit two performance traits, Build (smaller or larger than
  typical) and Temperament (bolder or warier), plus rare cosmetic markings; extremes need the same variant from both
  parents and local conditions shape which variants are common. Vigor (health, development) is condition, not
  inheritance.
- **Capture, care and bonding** (ESTABLISHED): a wild Wildkin is feral toward humans and resists a capsule while it
  has the strength, so researchers weaken it in a controlled bout first. Bouts never aim to kill; a fainted Wildkin
  has withdrawn exhausted. Every injured Wildkin gets first aid, then recovers slowly in its capsule; vets at field
  stations treat faster. The bond grows with shared experience (the level). A Wildkin the researcher's license does
  not cover cannot be safely treated or directed: it is **restless**, travels along but does not cooperate.
- **Friendly battles** are an everyday, respected part of regional life (children spar, some people live from
  sparring circuits); fieldwork is one path among many.

## Canon rules (Wildkin Bible)

- Labels: **ESTABLISHED** (canon), **PROPOSED** (working direction, say so), **TBD** (do not invent a definitive
  answer). Mark every detail you add as PROPOSED; keep unknowns TBD.
- Wildkin are living species with ecological needs, not disposable battle units. Observation precedes capture,
  especially for displaced or distressed Wildkin.
- Every species needs a recognisable **visual hook**, an **ecological role**, a clear **gameplay purpose** and a
  manageable content footprint. Data-driven: reuse existing stats, effects, interactions and encounter rules; no
  bespoke engine code for one species.
- **Habitat mismatch is a story clue**: an unusual sighting prompts observation and investigation, not the assumption
  that the creature is dangerous or must be captured.
- **Rarity is not strength.** Common Wildkin stay useful and memorable.
- Real animals are design references, not claims. Do not infer diet or inspiration from appearance alone.
- Before adding a species, check that no existing Wildkin already fills the same visual, ecological and gameplay role;
  report conflicts with canon instead of silently rewriting it.

## Design standards

- Identity formula: concept → visual hook → ecological role → gameplay role → stat shape (HP, Attack, Defense, Speed)
  → one simple passive → four skills from reusable effects (damage, heal, shield, stat change, damage over time, short
  control, cleanse, counter) → field use → lore blurb. Passive, skills and field use stay TBD (skill system in 0.4.0).
- **Stat budget:** base stats (HP, Attack, Defense, Speed, each 10 to 150) sum to **exactly 300** for every species,
  shaped by anatomy and behaviour (armoured: high Defense; darting flier: high Speed). Rarity never adds strength.
- **Categories** (decide which Field Registry license covers it): aerial, aquatic, terrestrial, verdant (plant-bound).
- **Body traits** (1 or 2, from anatomy; weak to / resists): plated (crush / pierce), feathered (surge / crush),
  soft-bodied (pierce / spore), leafy (toxin / surge), slick (toxin / pierce).
- **Attack approaches:** strike (always neutral), pierce, crush, surge, toxin, spore.
- **Placeholder attacks:** 1 or 2 per species, power 30 to 60, approach matching the anatomy (beak: pierce; tail
  slam: crush; water: surge), marked PROPOSED. They are not skills.
- **Genetics:** Build (S/L alleles: Small, Typical, Large) and Temperament (B/W: Bold, Steady, Wary) are inherited
  with trade-offs; a species' gene pool sets allele odds, optionally per habitat tag (larger Kantar in mature
  woodland). Vigor (0 to 5 per stat) is rolled per individual, not inherited.
- **Marking variant:** optional, cosmetic only, recessive; name it after a visible difference ("Banded"), frequency
  0.02 to 0.1. Leave the gene pool at defaults unless the concept implies variation.
- Field encounters use lightweight clues: sound, movement, tracks, habitat, time of day. Reusable interactions:
  observe, inspect cover, scan habitat, record evidence.
- Visuals: start from a recognisable silhouette; one or two signature features readable at small sprite sizes;
  separate animal anatomy from fantasy additions; record palette, markings, texture, signature idle movement.
  Placeholder or AI art is never canon until approved.
- Activity patterns: diurnal, nocturnal, crepuscular (dawn/dusk), cathemeral, sheltering_by_day, seasonal, TBD.
- Bible habitat vocabulary: canopy, woodland edge, clearing, leaf litter, root hollow, damp forest floor, under rock,
  freshwater, shaded bank, deep pool.

## Open questions (do not silently resolve)

The nature, arrival and mechanism of the ancient biological influence; how much of it remains in modern Wildkin;
detailed reproduction and cross-species pairing; the limits of bonding, intelligence and communication, and the ethics
of keeping Wildkin long term; what causes the current habitat changes (climate, local damage, a fictional
phenomenon, or several). Describe these as unknowns or competing hypotheses.
