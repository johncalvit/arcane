# Grim Toll - item list for a token/icon library

Pulled from the game's built-in defaults (v0.1.20261110g). A dropped item becomes a map token labelled with
the item's name, so a library can look an icon up by that name. Items a GM adds in Game Config will not be
on this list, so keep a generic fallback icon per category.

Counts: 43 weapon icons, 32 gear icons, about 6 generic potion icons, 5 light sources, 12 armor looks (plus per-slot variants).

## Weapons - melee (32)
Named exactly as the game names them. "Type" is the weapon family used for techniques.

| Item | Type |
|---|---|
| Axe, Hatchet | Axe |
| Battleaxe | Axe |
| Greataxe | Axe |
| Hammer, Carpenter's | Hammer |
| Hammer, Sledge | Hammer |
| Hammer, War | Hammer |
| Club | Club |
| Greatclub | Club |
| Mace | Mace |
| Morningstar | Mace |
| Flail | Flail |
| Knife | Knife |
| Sword, Short | Short Sword |
| Sword, Long | Longsword |
| Greatsword | Greatsword |
| Rapier | Rapier |
| Scimitar | Scimitar |
| Glaive | Polearm |
| Halberd | Polearm |
| Pike | Polearm |
| Spear, Long | Spear |
| Spear, Short/Long | Spear |
| Javelin | Spear |
| Trident | Spear |
| Lance, Heavy Cavalry | Lance |
| Lance, Light Cavalry | Lance |
| Staff | Staff |
| Whip | Whip |
| Net | Net |
| Shield, Small | Shield |
| Shield, Large | Shield |
| Shield, Buckler | Shield |

## Weapons - ranged (11 more; the rest reuse a melee icon)

| Item | Type |
|---|---|
| Bow, Horse | Bow |
| Bow, Hunting | Bow |
| Bow, Light | Bow |
| Bow, War | Bow |
| Crossbow, Hand | Crossbow |
| Crossbow, Light | Crossbow |
| Crossbow, Heavy | Crossbow |
| Sling Pellet | Sling |
| Sling Stone | Sling |
| Blowgun | Blowgun |
| Dart | Dart |

Thrown versions share the base weapon's icon: "Club (Thrown)", "Axe, Hatchet (Thrown)", "Knife (Thrown)",
and the ranged "Javelin" (same item as the melee Javelin).

## Weapon types (24) - good for fallback icons
Axe, Hammer, Club, Mace, Flail, Knife, Short Sword, Longsword, Greatsword, Rapier, Scimitar, Polearm, Spear,
Lance, Staff, Whip, Net, Shield, Unarmed, Bow, Crossbow, Sling, Blowgun, Dart.

## Gear / equipment (32)
Backpack, Bedroll, Blanket, Canteen (full), Candle, Chalk (x10), Climbing Gear, Crowbar, Flint & Steel,
Grappling Hook, Hammer, Healer's Kit, Lantern, Lock (good), Manacles, Mirror (small), Oil (flask),
Pick, Miner's, Piton (x10), Pole (10 ft), Pouch, Rations (1 day), Rope, Hemp (50 ft), Rope, Silk (50 ft),
Sack, Shovel, Thieves' Tools, Torch, Waterskin, Writing Kit, Arrows (x20), Crossbow Bolts (x20).

## Consumables - generic potion icons
Consumables are open-ended (a GM can add any number in Game Config), so they get a small set of generic potion
icons instead of one icon per item. The defaults today are Water, Healing Potion and Night Vision Potion.

Suggested set (about 6 icons), picked by what the consumable does:

| Icon | Used when the consumable... | Example |
|---|---|---|
| Red potion | restores Toughness | Healing Potion |
| Dark red / crimson potion | restores Blood | |
| Green potion | restores Stamina (or clears a condition) | |
| Blue potion | gives a timed stat buff | Night Vision Potion |
| Clear flask / waterskin | plain drink, no special effect | Water |
| Grey / purple potion | anything else (fallback) | |

If a consumable does several things, use the first match in the order above. Anything whose name contains
"potion" with no data to go on gets the grey fallback.

## Light sources
Any item whose name contains these words also gives off light, so they are worth distinct icons:
Candle, Torch, Lantern (carried or dropped), Campfire and Brazier (fixed scenery, cannot be picked up).

## Armor
Armor pieces are chosen per body slot. Humanoid slots: Head/Neck, Torso, Right Arm/Hand, Left Arm/Hand,
Right Leg/Foot, Left Leg/Foot. Other body types add slots such as Forelegs, Hindlegs, Tail, Wings.

Armor materials (11, plus "None"): Leather/Hide, Reinforced Leather, Padded, Bronze Scale, Bronze Plate,
Iron Scale, Iron Chainmail, Iron Plate, Steel Chainmail, Steel Plate, Tempered Steel Plate.

Named pieces in the defaults: Full Helmet (head), Kettle Hat (head), Scale Hauberk (torso). Every material
also has a generic piece, e.g. "Iron Chainmail (Generic)". Suggested icons: helmet, body armor, gauntlet/arm
guard, greave/boots, each tinted or varied by material.

## Not item tokens
Natural weapons (Fangs, Tusks, Horns, Beak, Mandibles, Claws, Talons, Fore Hooves, Hind Hooves, Rear Claws,
Tail Slam, Stinger) and Bare Handed are attacks, not things that can be dropped.

## Suggested lookup order for the game
1. Exact item name (above).
2. Weapon type (e.g. any unknown "Axe" gets the axe icon).
3. Category fallback: weapon, gear, armor, light, or a generic potion for any consumable (colored by effect, see above).
