# Stealth, Hide, Infiltrate and Vigilant — one detection model (DRAFT)

**Status:** draft for approval (2026-11-25). Nothing here is built yet.

## Goal

Use the detection model already proven on hidden objects, traps and secret doors for people too, and add a basic
**Hide** for ambushes with a **Stealth Kill** technique.

## 1. The shared model (what hidden objects already do)

For each sense a thing can be noticed by (sight, hearing, smell, Quintessence) it has a **hiding value**.
A watcher's chance for one roll is `sense score ÷ hiding value × 100` (max 100).

- Two rings: the watcher rolls once at **twice** its sense score away (half chance) and once at **once** its score
  away (full chance). Each ring rolls once per approach and resets when the watcher leaves the reach.
- **Searching doubles** the chance (SEARCH_DETECT_MULT).
- Sight needs a clear line; hearing and smell ignore walls.
- Sight uses Day Vision, or Night Vision when the watcher stands in the dark (unlit, map dark).

## 2. A person becomes a moving "hidden object"

Their hiding values come from them, not from a drawn object:

| Sense | Hiding value of a person |
|---|---|
| Sight | **Concealment** they stand in (see 3). Standing in the open in the light: 1, which means seen (always 100%). |
| Hearing | Harder to hear the **quieter** they are: `400 / noise`, where noise is their Noise score (worn armor Noise + Speed, x Target Size) x gait (x1 walk ... x2 sprint), doubled if they are **not** sneaking. A **Hider who is not moving** makes no sound (hiding 0 = cannot be heard). Stealth adds to this for a hider or sneaker. |
| Smell | `600 / odor`. Stealth does not help. |

All of these are on the same scale as sense scores (which run about 5-30), so they can be compared directly. The
constants (400, 600) are tunable after play.

**Stealth** (a new attribute) is **added to the sight and hearing hiding values** while the person is hiding or
sneaking. Stealth = the **Stealth skill** + gear + magic:

- **Stealth skill:** a small one, `(Physical Coordination + Logic) x 0.5` by default, kept as an editable formula in
  the config (like a weapon's hit formula) so it can be tuned after play. (Agility itself is a raw stat that feeds
  Physical Coordination and Manual Dexterity; the formula uses the finished attributes.)
- **Camouflage outfits:** a Stealth value on armor pieces and equipment (flat bonus for now).
- **Magic:** a passive enchantment effect, `Stealth +N`, using the existing enchantment system (worn or held
  items), and spells that raise it through the existing buff condition.
- Smell is **not** helped by Stealth (scent needs its own gear or magic later).

(A hidden-object hiding value of 0 means "cannot be sensed". For a person the meaning is reversed only for sight in the
open, where 1 is used so they are simply seen.)

## 3. Concealment and darkness

Hiding (and Infiltrate's sight benefit) only works where something screens the eye:

- **Darkness:** the token is in an unlit spot on a dark map. Sight hiding **10**, and watchers use Night Vision.
- **Concealment objects:** a new map object type (drawn by the GM like a lit area): underbrush, tall grass, fog, a
  curtain. Each has a **sight hiding value** (suggested: tall grass 8, underbrush 15, thicket 25). It screens
  anyone standing inside its shape. Cover and walls still block sight outright as today.
- With neither, **Hide is refused** ("nothing to hide in") and Infiltrate gives no sight benefit (only quieter
  movement).

## 4. Passive noticing and Vigilant

- **Every awake body** (not dead, unconscious, stunned or paralyzed) notices passively using section 1 at the
  normal chance. Players already do this for hidden objects.
- **Vigilant** doubles the chance, like Searching, and keeps its 120 degree sight cone and its hearing and smell
  reach. Passive noticing uses the same cone and reach (so a monster facing away does not see you).
- A watcher who notices a hider/sneaker is recorded on the hider as having **noticed** them. A body that has noticed
  you stays aware until you leave its reach and re-hide.
- Reactions are unchanged: a spotted mover still gets the Attack / Call Out prompt, and the roll happens on the
  mover's client as now (a stationary Hider is rolled against when a watcher moves toward them).

## 5. Hide (new action)

- Needs concealment or darkness (section 3). Stationary: moving more than a nudge ends it (Infiltrate is the
  moving version).
- While hidden, the Hider has the section 2 values; sight rolls come from watchers approaching or looking.
- Ends when: they move, attack, are noticed, or choose to stand up. Other stances follow the existing rules for what
  a move cancels.

## 6. Stealth attack and Stealth Kill

- A **stealth attack** is an attack made from Hide or Infiltrate against a target that **has not noticed** the
  attacker: **+20 to hit** and **double damage**. The stance ends when the attack is made.
- **Stealth Kill** works like **Iron Fist**: it has **its own weapon rows** in the Melee Weapons table (an action
  named Stealth Kill on Knife and Short Sword weapons), so its damage, reach and hit can be tuned after real play,
  and it is unlocked by a **technique** (a weapon row can require a technique, as Iron Fist does). The row carries
  a **gap x3** value (same mechanism as Gap Target) which applies only when that action is used.
- The Stealth Kill action is offered only while the attacker is **hiding or sneaking** (shown dimmed otherwise).
  Used on a target that has not noticed the attacker it gets the stealth attack bonuses above too.

## 7. Build order

**Step 1 is built** (v0.1.20261125n): `stealth.js` holds the pure rules (`detectionChance`, `detectionStage`,
`stealthScore`, `personHiding`, `concealmentAt`) with tests, and the GM can draw concealment areas with the Lights tool
(Concealment: Tall grass / Underbrush / Thicket) and edit their rating in the Walls list. Nothing uses them in play
yet.


**Steps 2, 3 and 4 are built** (v0.1.20261125o / p / q). Camouflage outfits are done with an enchantment effect `Stealth +N` on an armor piece (no separate armor field).

1. The shared detection function (pure, with tests); concealment object type in the map tools and its drawing.
2. Move Vigilant and Infiltrate onto it; add passive noticing; Journal lines for each roll (as Vigilant logs now).
3. Hide action; "noticed by" tracking.
4. Stealth attack and the Stealth Kill technique; Quick Start and tests.

**Tuning (v0.1.20261125s):** after simulating a scout sneaking up on a group, the numbers were changed: a watcher's sense is cut by 7, the chance is (sense / hiding)^1.5, and Stealth multiplies cover and hearing hiding (x (1 + Stealth/4)) instead of adding. Constants `SENSE_PENALTY`, `DETECT_POWER`, `STEALTH_DIVISOR` in stealth.js.

**Reach (v0.1.20261126a):** hearing and smell reach now scale with the watcher's score: `HEARING_FT_PER_POINT` 4 and `SMELL_FT_PER_POINT` 1.5 (sight is Day/Night Vision x 8). Far ring = the reach, near ring = half.

**Search and smell (v0.1.20261126j):** a Searching watcher now doubles its chance against sneakers and hiders, like Vigilant (but with no sight cone). `SMELL_HIDING_K` raised from 600 to 1200 so smell finds people less often.

## Open decisions (defaults in brackets)

- Does an unaware target get a defense roll against a stealth attack? [No: it did not see it coming.]
- Stealth Kill's technique level and which Knife / Short Sword weapons get the row. [Level 4, every Knife and Short Sword weapon.]
- Darkness hiding value and the concealment ratings above. [10; 8 / 15 / 25.]
- The Stealth skill formula. [`(Physical Coordination + Logic) x 0.5`, editable.]
- Camouflage: flat bonus everywhere, or terrain-specific (forest, snow)? [Flat for now.]
