# Arcane VTT — Refactor Spec

**Status:** Approved — all decision points resolved (2026-07-15)
**Scope:** Data layer unification, panel render consolidation, campaign/character decoupling
**Non-goals:** Feature work (combat/magic additions), visual redesign, security hardening

Security note: loading full character/creature data into any player's browser memory is
acceptable by design. This is a table-top aid, not a competitive system. The only
enforcement that matters is *edit* permission (players can't write other people's
characters), which Supabase RLS already covers.

---

## Part 1 — Unified data layer

### Problem

Character data currently has three sources of truth:

| Layer | Used for | Failure mode |
|---|---|---|
| DOM form (`#char-name`, `#ps-hand-*`, `#weapon-list`, armor selects…) | Own character, when the sheet is loaded | Panels read DOM elements that don't exist for other entities or before the sheet loads |
| `playCharCache` / `sessionCreatureCache` | Everyone else | SELECT column lists drift; every new column has to be added by hand in multiple places |
| Supabase DB | Persistence | Writes scattered across ad-hoc `.update()` calls |

Nearly every recent bug (bare-hand-only dropdowns, missing Block defense option,
missing health bars, `safeTokenId` crash) came from a panel reading the wrong layer.

### Design

**The cache becomes the single runtime truth.** The DOM character-builder form is
just an *editor* that writes into the cache (and DB); every render path reads only
from the cache.

#### 1.1 One entity accessor

```js
// ref forms: 'char::<charId>' | 'creature::<tokenId>'
function getEntity(ref) → {
  ref, type,                 // 'char' | 'creature'
  id,                        // character id or session_creature id
  tokenId,                   // map token id or null
  name, species, bodyType, avatarUrl,
  attrs,                     // calcAttributesFromData output (memoized)
  held: { right, left },
  armor: { head, torso, rarm, larm, rleg, lleg },
  damage: { toughness, stamina },
  skills, stats,
  loadout: [ ...item names ],   // weapons + equipment, for hand dropdowns
  conditions: Set,              // from mapTokens[tokenId].conditions
}
```

Rules:
- `getEntity` never touches the DOM and never awaits — it reads the caches
  synchronously. If the entity isn't cached, it returns `null` and the caller
  shows a loading state while `ensureEntityLoaded(ref)` fetches it.
- `attrs` are memoized per entity and invalidated on any write to that entity
  (stats/species/build changes are rare; recomputing on every render is the
  current behavior and is measurably wasteful).
- All existing helpers (`healthBarsHtml`, defense-option building,
  `drawSentinelRanges`, initiative rolls, stamina costs) take an entity or
  read through `getEntity` — no more `playCharCache[...]` /
  `sessionCreatureCache[...]` / `document.getElementById('ps-hand-right')`
  reaching directly into panels.

#### 1.2 One write path

```js
async function updateEntity(ref, patch)   // shallow-merge patch into cache, write to DB, broadcast, re-render
```

- Replaces the scattered `sb.from('characters').update(...)` /
  `sb.from('session_creatures').update(...)` calls in `applyDamage`,
  `recoverStamina`, `_setCurrentHp`, `_playSetHand`, `_acSetHand`, `saveCharacter`.
- Column allow-list lives in ONE place (also fixes the recurring
  "SELECT was missing a column" bug — define `CHAR_COLUMNS` once, use it for
  both the SELECT in `loadPlayCharCache` and validation in `updateEntity`).
- After the DB write, `updateEntity` triggers a targeted re-render
  (see 2.3) instead of each caller remembering to call `renderPlayCharacter()`.

#### 1.3 Realtime in one place

A single subscription handler applies incoming `characters` /
`session_creatures` / `map_tokens` changes to the cache and calls the same
re-render entry point. Today some realtime paths update the cache and some
update the DOM directly.

#### 1.4 The character builder becomes an editor

`gatherCharacterData()` / `saveCharacter()` stay, but on save they write
through `updateEntity` so the cache is always correct immediately —
no more waiting for a cache reload or reading half from DOM, half from cache.
`renderPlayCharacter` stops reading `#ps-hand-*`, `#weapon-list`, armor
selects, etc. entirely.

### Migration order (each step leaves the app working)

1. Add `getEntity` / `ensureEntityLoaded` / `updateEntity` alongside existing code.
2. Convert the damage/stamina/conditions functions (smallest, already close).
3. Convert the four panel renderers to read only via `getEntity` (Part 2 merges them at the same time).
4. Convert `attackTokenClick` defense building + sentinel ranges.
5. Convert `saveCharacter` / hand setters; delete the dead direct-cache and DOM-reading code.
6. Single `CHAR_COLUMNS` / `CREATURE_COLUMNS` constants for all SELECTs.

---

## Part 2 — One panel renderer

### Problem

Four near-identical panel builders exist (own character, active combatant,
token-info character, token-info creature). Each rebuilds Health, Conditions,
Combat, Stats, Equipment, Armor, Skills sections with slightly different
wiring (different refresh callbacks, different id schemes, different
edit-permission checks). Every panel bug has to be fixed up to four times.

### Design

```js
renderEntityPanel(ref, {
  container,            // element to render into
  canEdit,              // computed once: isGM() || own character
  sections,             // ordered list, defaults to the standard set
  header,               // 'active-banner' | 'back-button' | 'plain'
  refresh,              // single callback used by every interactive child
})
```

- Section builders (`healthSection(entity, opts)`, `conditionsSection(...)`,
  `combatSection(...)`, …) are pure functions of the entity — written once.
- The `refresh` callback replaces today's string-interpolated
  `'renderPlayCharacter()'` / `'showTokenInfo(...)'` onclick plumbing
  (which caused the `safeTokenId` ordering crash). Interactive elements get
  real event listeners attached after `innerHTML` is set, not inline
  `onclick` strings with quote-escaping.
- `renderPlayCharacter` and `showTokenInfo` shrink to: resolve the ref,
  pick header style + permissions, call `renderEntityPanel`.

### 2.3 Targeted re-render

One entry point: `refreshUI(ref?)`. If the currently displayed panel shows
that entity (or no ref given), re-render it; always refresh token badges and
health-related overlays. `updateEntity` and the realtime handler call this.

---

## Part 3 — Campaigns and character portability

### Problem

- New players hit a wall: they must be in a campaign before anything works,
  and the launch modal presents Characters, Campaigns, and Game Config all
  at once with no guidance.
- `characters.campaign_id` hard-binds a character to one campaign. Characters
  should belong to the *player* and visit campaigns.

### Design

#### 3.1 Schema: characters belong to users; campaigns have members

```sql
-- Characters are owned by the user; campaign_id becomes a soft "last played in"
ALTER TABLE characters ADD COLUMN IF NOT EXISTS last_campaign_id uuid REFERENCES campaigns(id);

-- Join table: which characters are present in which campaign
CREATE TABLE campaign_characters (
  campaign_id  uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  joined_at    timestamptz DEFAULT now(),
  PRIMARY KEY (campaign_id, character_id)
);

-- Backfill from the existing binding
INSERT INTO campaign_characters (campaign_id, character_id)
  SELECT campaign_id, id FROM characters WHERE campaign_id IS NOT NULL
  ON CONFLICT DO NOTHING;

UPDATE characters SET last_campaign_id = campaign_id;
-- Keep characters.campaign_id for one release as a fallback, then drop it.
```

App changes:
- `loadPlayCharCache` selects characters **via `campaign_characters`** for the
  active campaign instead of `eq('campaign_id', ...)`.
- "Add character to campaign" = insert a row in `campaign_characters`
  (GM invites or player joins with the campaign code). Removing a character
  from a campaign deletes the link, never the character.
- A character may be linked to multiple campaigns. Per-campaign state that
  shouldn't travel (current `damage`, conditions) is discussed in 3.3.

#### 3.2 Onboarding flow

Reorder the launch experience around what the user is trying to do:

1. **Sign in → land on "My Characters"** (no campaign required). Creating and
   editing a character works entirely campaign-free.
2. **Playing requires a campaign**, and only then:
   - *Join a campaign* — enter a short invite code (campaigns already have a
     code; surface it as the primary join mechanism).
   - *Create a campaign* — becomes GM.
3. When entering a campaign with no linked character, prompt:
   "Bring a character into this campaign" → pick from My Characters → creates
   the `campaign_characters` link.
4. Game Configuration (species/skills/armor/weapon managers) moves behind a
   "GM Tools" disclosure — new players never need to see it.

#### 3.3 What travels with the character vs. stays in the campaign

| Data | Lives on | Rationale |
|---|---|---|
| Identity, stats, skills, loadout, armor, avatar | `characters` (travels) | The character sheet is the player's |
| `damage` (toughness/stamina) | `characters` (travels) | **DECIDED:** wounds follow the character; easy to heal/clear manually, and per-campaign copies would be hard to keep straight |
| Conditions | `map_tokens.conditions` (already per-campaign) | No change |
| Held items (`held_items`) | `characters` (travels) | It's part of the loadout; acceptable simplification |

No `damage` migration needed — the column stays on `characters` as-is.

---

## Suggested execution order

| Phase | Content | Size |
|---|---|---|
| 1 | Part 1 data layer (steps 1–2), no visible change | 1 session |
| 2 | Part 2 panel consolidation + Part 1 steps 3–5 | 1–2 sessions |
| 3 | Part 3 schema + onboarding | 1–2 sessions |

Phases 1–2 unblock combat/magic feature work; Phase 3 is independent and can
be scheduled around playtest sessions (it touches sign-in flow, so best done
when no session is imminent).

## Decision points — all resolved

1. **Per-campaign damage** (3.3) — **DECIDED:** damage stays on `characters` and
   travels with the character. No migration needed.
2. **`characters.campaign_id`** — **DECIDED:** keep it, renamed to
   `last_campaign_id` ("home campaign"). Its only job is auto-selecting the
   campaign at sign-in; characters with no campaign links live under
   My Characters as a stable for later use. Near-zero added complexity.
3. **File split** — **DECIDED:** do it. During Phase 2, panel/section builders
   move to `panels.js` loaded by index.html. Single-file portability no longer
   matters now that GitHub Pages hosts the app.
4. **Inline onclick strings → event listeners** — **DECIDED:** yes, for the new
   section builders (rest of the app converts opportunistically as code is
   touched). Eliminates the quote-escaping fragility that caused the
   `safeTokenId` crash.
