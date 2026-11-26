// Smoke tests for the reaction stances: Sentinel, Target, Vigilant (and Infiltrate). Loaded by tests.html
// after tests.js - see that file for how tests run and what the helper object T offers.
//
// Conventions here: T.geo() makes a 100 ft x 100 ft map where 1% = 1 ft, tokens are points (no radius),
// there are no walls and melee reach is 5 ft. Facing 0 degrees points along +x. Tokens are creatures
// unless stated, so their combatant id is 'creature::<token id>'. A token flagged 'foe' is on the other
// side from one flagged 'friendly'.

// ── Sentinel & Target (reaction zones) ───────────────────────────────────────
test('Sentinel', 'the zone is the melee reach around the watcher, and a wall blocks it', async T => {
  T.geo();
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['sentinel', 'friendly']), m = T.token('m', 0, 0, 'creature', 'Em', ['foe']);
  T.ok(_sentinelZoneCheck(w, 54, 50, m), '4 ft away is inside a 5 ft reach');
  T.ok(_sentinelZoneCheck(w, 50, 45, m), 'reach is a full circle');
  T.ok(!_sentinelZoneCheck(w, 56, 50, m), '6 ft away is outside');
  T.stub('_sentinelLineOfSight', () => false);
  T.ok(!_sentinelZoneCheck(w, 54, 50, m), 'no reaction through a wall');
});
test('Sentinel', 'reach is measured edge to edge, so big tokens trigger sooner', async T => {
  T.geo();
  T.stub('getTokenSize', () => 20); // 20 px across = 1 ft radius
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['sentinel']), m = T.token('m', 0, 0, 'creature', 'Em', []);
  T.ok(_sentinelZoneCheck(w, 57, 50, m), 'centres 7 ft apart, edges 5 ft apart');
  T.ok(!_sentinelZoneCheck(w, 57.5, 50, m));
  T.ok(!_sentinelZoneCheck(w, 57, 50), "without a mover only the watcher's own radius comes off");
});
test('Sentinel', 'a token without the stance has no zone; no map scale means no checks', async T => {
  T.geo();
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['friendly']), m = T.token('m', 0, 0, 'creature', 'Em', ['foe']);
  T.ok(!_sentinelZoneCheck(w, 51, 50, m));
  w.conditions = ['sentinel']; mapScalePPF = 0;
  T.ok(!_sentinelZoneCheck(w, 51, 50, m));
});
test('Sentinel', 'Target watches a narrow cone along its facing, out to weapon range', async T => {
  T.geo(); T.stub('_targetWeaponRangeFt', () => 30);
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['target', 'facing:0']), m = T.token('m', 0, 0, 'creature', 'Em', []);
  const at = (deg, ft) => [50 + ft * Math.cos(deg * Math.PI / 180), 50 + ft * Math.sin(deg * Math.PI / 180)];
  T.ok(_sentinelZoneCheck(w, ...at(0, 20), m), 'straight ahead');
  T.ok(_sentinelZoneCheck(w, ...at(TARGET_CONE_DEG / 2 - 1, 20), m), 'just inside the edge of the cone');
  T.ok(!_sentinelZoneCheck(w, ...at(TARGET_CONE_DEG / 2 + 1, 20), m), 'just outside the cone');
  T.ok(!_sentinelZoneCheck(w, ...at(180, 3), m), "behind, even at arm's length");
  T.ok(!_sentinelZoneCheck(w, ...at(0, 31), m), 'beyond weapon range');
  w.conditions = ['target', 'facing:90'];
  T.ok(_sentinelZoneCheck(w, 50, 70, m), 'the cone turns with the facing');
  T.ok(!_sentinelZoneCheck(w, 70, 50, m));
});
test('Sentinel', 'an enemy walking into reach is caught at the point it enters', async T => {
  T.geo();
  T.token('w', 50, 50, 'creature', 'Ew', ['sentinel', 'friendly']); T.token('m', 30, 50, 'creature', 'Em', ['foe']);
  const hits = _findSentinelCrossings('creature::m', { x_pct: 30, y_pct: 50 }, { x_pct: 47, y_pct: 50 });
  T.eq(hits.length, 1); T.eq(hits[0].sentinelCid, 'creature::w');
  T.ok(hits[0].x_pct >= 45 && hits[0].x_pct <= 45.5, 'should stop about 5 ft short of the watcher, got x=' + hits[0].x_pct);
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 30, y_pct: 50 }, { x_pct: 40, y_pct: 50 }), [], 'a move that stays outside triggers nothing');
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 30, y_pct: 40 }, { x_pct: 70, y_pct: 40 }), [], 'passing 10 ft away triggers nothing');
});
test('Sentinel', 'no reaction for allies, for a watcher who cannot act, or for a mover already inside', async T => {
  T.geo();
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['sentinel', 'friendly']), m = T.token('m', 30, 50, 'creature', 'Em', ['friendly']);
  const walkIn = () => _findSentinelCrossings('creature::m', { x_pct: 30, y_pct: 50 }, { x_pct: 47, y_pct: 50 });
  T.eq(walkIn(), [], 'same side');
  m.conditions = ['foe'];
  T.eq(walkIn().length, 1, 'enemy (control case)');
  for (const k of ['dead', 'unconscious', 'stunned', 'paralyzed']) { w.conditions = ['sentinel', 'friendly', k]; T.eq(walkIn(), [], k); }
  w.conditions = ['sentinel', 'friendly', 'prone'];
  T.eq(walkIn().length, 1, 'a prone sentinel can still react');
  w.conditions = ['sentinel', 'friendly'];
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 46, y_pct: 50 }, { x_pct: 48, y_pct: 50 }), [], 'shuffling around inside the zone is not a fresh entry');
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 46, y_pct: 50 }, { x_pct: 30, y_pct: 50 }), [], 'walking out is not an entry');
});
test('Sentinel', 'the mover never triggers its own stance, and two sentinels react in the order they are reached', async T => {
  T.geo();
  T.token('far', 70, 50, 'creature', 'E1', ['sentinel', 'friendly']); T.token('near', 50, 50, 'creature', 'E2', ['sentinel', 'friendly']);
  T.token('m', 30, 50, 'creature', 'Em', ['foe', 'sentinel']);
  const hits = _findSentinelCrossings('creature::m', { x_pct: 30, y_pct: 50 }, { x_pct: 66, y_pct: 50 });
  T.eq(hits.map(h => h.sentinelCid), ['creature::near', 'creature::far']);
  T.ok(hits[0].frac < hits[1].frac);
});
test('Sentinel', 'a character sentinel is reported by its character ref', async T => {
  T.geo();
  T.token('w', 50, 50, 'character', 'Hero', ['sentinel', 'friendly']); T.token('m', 30, 50, 'creature', 'Em', ['foe']);
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 30, y_pct: 50 }, { x_pct: 47, y_pct: 50 }).map(h => h.sentinelCid), ['char::Hero']);
});
test('Sentinel', "a triggered check waits for an answer and tells the watcher's client", async T => {
  T.geo();
  T.token('w', 50, 50, 'creature', 'Ew', ['sentinel', 'friendly']); T.token('m', 46, 50, 'creature', 'Em', ['foe']);
  let shown = null; T.stub('_maybeShowSentinelPrompt', p => { shown = p; });
  T.stub('_atIsCombatActive', () => false);
  const p = _resolveSentinelCheck('creature::w', 'creature::m', 46, 50);
  T.ok(_sentinelCheckPending, 'the move should be waiting on the sentinel');
  T.eq([shown.sentinelCid, shown.moverCid, shown.vigilantSense], ['creature::w', 'creature::m', null]);
  T.eq(_sentinelCheckPending.checkId, shown.checkId);
  _sentinelCheckPending.resolve(false); await p; // "let it pass"
});
test('Sentinel', 'moving ends Sentinel, Evade, Target and Vigilant - but not Block or Infiltrate, and not for a nudge', async T => {
  T.geo(); const rec = T.fakeWrites(); T.senses();
  const w = T.token('w', 50, 50, 'creature', 'Ew', []);
  T.stub('renderAtList', () => {});
  T.stub('setCondition', async (id, k, on) => { if (!on) mapTokens[id].conditions = mapTokens[id].conditions.filter(c => c !== k); });
  const badge = { Sentinel: 'sentinel', Evade: 'evading', Target: 'target', Vigilant: 'vigilant' };
  for (const label of Object.keys(badge)) {
    w.conditions = [badge[label], 'blocking', 'infiltrating'];
    atCombatants = [{ id: 'creature::w', slots: { full: { label }, right: { label: 'Block' }, left: { label: 'Infiltrate' } } }];
    await _cancelStancesOnMove('creature::w', 0.2);
    T.eq(atCombatants[0].slots.full && atCombatants[0].slots.full.label, label, label + ' should survive a 0.2 ft nudge');
    await _cancelStancesOnMove('creature::w', 10);
    T.eq(atCombatants[0].slots.full, null, label + ' should end');
    T.eq([atCombatants[0].slots.right.label, atCombatants[0].slots.left.label], ['Block', 'Infiltrate']);
    T.eq(w.conditions, ['blocking', 'infiltrating'], label + ' badge');
  }
  T.eq(rec.log.length, 4, 'one Journal line per ended stance');
  atCombatants = [{ id: 'creature::w', slots: { full: { label: 'Sentinel' }, right: null, left: null } }];
  await _cancelStancesOnMove('creature::w', null, 'is thrown'); // unknown distance (blowback, uncalibrated map)
  T.eq(atCombatants[0].slots.full, null);
  T.ok(/is thrown/.test(rec.log[4]));
});

// ── Vigilant & Infiltrate (noticing movement) ────────────────────────────────
test('Vigilant', 'sight range follows Day Vision by day and Night Vision in the dark', async T => {
  const ent = { attrs: { DayVision: 10, NightVision: 2 } };
  mapIsDark = false; T.eq(_vigilantVisionRangeFt(ent), 10 * VIGILANT_VISION_FT_PER_POINT);
  mapIsDark = true;  T.eq(_vigilantVisionRangeFt(ent), 2 * VIGILANT_VISION_FT_PER_POINT);
});
test('Vigilant', 'zone: a 120 degree sight cone ahead, hearing all around to 4 ft per point (60 ft here); walls stop sight but not sound', async T => {
  T.geo(); T.senses({ 'creature::w': { Hearing: 15, Smell: 13 } }); mapIsDark = false; // Day Vision 10 -> 80 ft of sight, Hearing 15 -> 60 ft
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), m = T.token('m', 0, 0, 'creature', 'Em', []);
  const at = (deg, ft) => [50 + ft * Math.cos(deg * Math.PI / 180), 50 + ft * Math.sin(deg * Math.PI / 180)];
  T.ok(_sentinelZoneCheck(w, ...at(0, 70), m), 'ahead at 70 ft: seen');
  T.ok(_sentinelZoneCheck(w, ...at(VIGILANT_CONE_DEG / 2 - 2, 70), m), 'inside the cone edge');
  T.ok(!_sentinelZoneCheck(w, ...at(VIGILANT_CONE_DEG / 2 + 2, 70), m), 'outside the cone and beyond hearing');
  T.ok(!_sentinelZoneCheck(w, ...at(180, 70), m), 'behind at 70 ft: nothing');
  T.ok(_sentinelZoneCheck(w, ...at(180, 55), m), 'behind at 55 ft: within hearing');
  T.ok(!_sentinelZoneCheck(w, ...at(0, 85), m), 'ahead but past sight range');
  T.ok(!_sentinelZoneCheck(w, ...at(0, 30)), 'needs a mover to judge');
  T.stub('_sentinelLineOfSight', () => false);
  T.ok(!_sentinelZoneCheck(w, ...at(0, 70), m), 'a wall hides someone 70 ft ahead');
  T.ok(_sentinelZoneCheck(w, ...at(0, 50), m), 'but at 50 ft they can still be heard through it');
});
test('Vigilant', 'unlike Sentinel, a mover already inside the watched area still gets a notice check', async T => {
  T.geo(); T.senses(); mapIsDark = false;
  T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0', 'friendly']); T.token('m', 60, 50, 'creature', 'Em', ['foe']);
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 60, y_pct: 50 }, { x_pct: 62, y_pct: 50 }).length, 1);
  mapTokens.m.conditions = ['friendly'];
  T.eq(_findSentinelCrossings('creature::m', { x_pct: 60, y_pct: 50 }, { x_pct: 62, y_pct: 50 }), [], 'allies are not checked');
});
test('Vigilant', 'in the open a sneaker is simply seen; screened by concealment it is rolled for (sight over hiding, doubled)', async T => {
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), m = T.token('m', 0, 0, 'creature', 'Em', ['infiltrating']);
  T.senses({ 'creature::w': { Hearing: 0, Smell: 0, DayVision: 17 } }); // sight only; 17 - 7 = 10
  T.random(0.999);
  T.eq(_vigilantDetects(w, m, 80, 50), { detected: true, sense: 'sight' }, 'sneaking in the open and the light gives no sight benefit');
  mapWalls = [{ id: 'c', type: 'conceal', name: 'Thicket', hide: 25, points: [{ x_pct: 70, y_pct: 40 }, { x_pct: 90, y_pct: 40 }, { x_pct: 90, y_pct: 60 }, { x_pct: 70, y_pct: 60 }] }];
  _detectStage = {}; T.random(0.50);
  T.eq(_vigilantDetects(w, m, 80, 50).sense, 'sight', '(17-7) / thicket 25, to the 1.5, doubled = 51%: a roll of 50 sees');
  _detectStage = {}; T.random(0.52);
  T.eq(_vigilantDetects(w, m, 80, 50).detected, false, 'a roll of 52 does not');
  m.conditions = [];
  _detectStage = {}; T.random(0.999);
  T.eq(_vigilantDetects(w, m, 80, 50).sense, 'sight', 'standing in the thicket without sneaking hides nothing');
});
test('Vigilant', 'each ring is rolled once per approach: far at half chance, near at full, and leaving resets', async T => {
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  mapWalls = [{ id: 'c', type: 'conceal', name: 'Thicket', hide: 25, points: [{ x_pct: 0, y_pct: 0 }, { x_pct: 100, y_pct: 0 }, { x_pct: 100, y_pct: 100 }, { x_pct: 0, y_pct: 100 }] }];
  const w = T.token('w', 10, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), m = T.token('m', 0, 0, 'creature', 'Em', ['infiltrating']);
  T.senses({ 'creature::m': { Speed: 0 }, 'creature::w': { Smell: 0, Hearing: 0 } }); // only sight is in play (Day Vision 10: 80 ft, 3 after the penalty)
  T.random(0.26);
  T.eq(_vigilantDetects(w, m, 60, 50).detected, false, '50 ft: far ring, (3/25)^1.5 doubled x0.5 = 4%, a roll of 26 misses');
  T.random(0);
  T.eq(_vigilantDetects(w, m, 60, 50).detected, false, 'same ring again: not rolled twice');
  T.eq(_vigilantDetects(w, m, 45, 50).detected, true, '35 ft: near ring (8%) is a new roll, rolled on 0');
  _detectStage = {};
  T.eq(_vigilantDetects(w, m, 60, 50).detected, true, 'far ring, rolled on 0: seen');
  T.eq(_vigilantDetects(w, m, 95, 50).detected, false, 'past the reach: nothing, and the memory is cleared');
  T.eq(_vigilantDetects(w, m, 60, 50).detected, true, 'back in: rolled afresh');
});
test('Vigilant', 'behind the watcher it comes down to hearing, then smell up close; a quiet sneaker is harder to hear than a walker', async T => {
  T.geo(); T.map(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), m = T.token('m', 0, 0, 'creature', 'Em', ['infiltrating']);
  T.senses(); T.random(0);
  T.eq(_vigilantDetects(w, m, 30, 50).sense, 'hearing', '20 ft behind, a normal mover is heard');
  _detectStage = {};
  T.senses({ 'creature::m': { Speed: 0 }, 'creature::w': { Smell: 13 } }); // makes no noise at all; smell reaches 19.5 ft
  T.eq(_vigilantDetects(w, m, 20, 50), { detected: false, sense: null }, 'silent and 30 ft behind: unnoticed');
  _detectStage = {};
  T.eq(_vigilantDetects(w, m, 35, 50).sense, 'smell', 'silent but 15 ft behind: smelled');
  _detectStage = {};
  T.senses({ 'creature::m': { Speed: 0 }, 'creature::w': { Smell: 0 } });
  T.eq(_vigilantDetects(w, m, 35, 50).detected, false, 'a watcher with no sense of smell');
  // louder is easier to hear: Hearing 20 (13 after the penalty) against hiding 40 (sneaking) is 19%, against 20 (walking openly) 52%
  const p = T.token('p', 50, 50, 'creature', 'Ep', ['facing:0']); // passive: not doubled
  T.senses({ 'creature::p': { Hearing: 20, Smell: 0 } }); T.random(0.3);
  _detectStage = {}; T.eq(_vigilantDetects(p, m, 30, 50).detected, false, 'sneaking, 19%, a roll of 30');
  m.conditions = [];
  _detectStage = {}; T.eq(_vigilantDetects(p, m, 30, 50).sense, 'hearing', 'walking openly, 52%');
});
test('Vigilant', 'a wall blocks sight, so an open walker behind it can only be heard', async T => {
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), m = T.token('m', 0, 0, 'creature', 'Em', []);
  T.stub('_sentinelLineOfSight', () => false);
  T.senses({ 'creature::w': { Hearing: 1 } }); T.random(0.999);
  T.eq(_vigilantDetects(w, m, 80, 50).detected, false, 'not seen through the wall, and a deaf ear on a bad roll');
  _detectStage = {}; T.senses(); T.random(0);
  T.eq(_vigilantDetects(w, m, 80, 50).sense, 'hearing');
});
test('Vigilant', 'passive noticing: any awake enemy rolls against a sneaker (not doubled, sees all round); the stance ends with no prompt', async T => {
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  T.random(0);
  T.token('g', 50, 50, 'creature', 'Eg', []); T.token('m', 60, 50, 'creature', 'Em', ['friendly', 'infiltrating']);
  mapTokens.g.conditions = ['foe']; // enemy of the (friendly) mover; no stance of its own
  const seg = [{ x_pct: 60, y_pct: 50 }, { x_pct: 62, y_pct: 50 }];
  const hits = _findSentinelCrossings('creature::m', seg[0], seg[1]);
  T.eq(hits.length, 1); T.ok(hits[0].passive, 'flagged passive'); T.ok(['sight', 'hearing', 'smell'].includes(hits[0].sense));
  mapTokens.m.conditions = ['friendly'];
  _detectStage = {}; T.eq(_findSentinelCrossings('creature::m', seg[0], seg[1]), [], 'a mover who is not sneaking is not rolled for passively');
  mapTokens.m.conditions = ['friendly', 'infiltrating']; mapTokens.g.conditions = ['foe', 'unconscious'];
  _detectStage = {}; T.eq(_findSentinelCrossings('creature::m', seg[0], seg[1]), [], 'an unconscious body notices nothing');
  mapTokens.g.conditions = ['friendly'];
  _detectStage = {}; T.eq(_findSentinelCrossings('creature::m', seg[0], seg[1]), [], 'an ally does not give a sneaker away');
});
test('Vigilant', 'an unnoticed mover passes silently: no prompt, nothing pending', async T => {
  T.geo(); T.senses();
  T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0', 'friendly']); T.token('m', 60, 50, 'creature', 'Em', ['foe']);
  let shown = 0; T.stub('_maybeShowSentinelPrompt', () => { shown++; });
  T.stub('_atIsCombatActive', () => false);
  T.stub('_vigilantDetects', () => ({ detected: false, sense: null }));
  await _resolveSentinelCheck('creature::w', 'creature::m', 60, 50);
  T.eq(shown, 0); T.eq(_sentinelCheckPending, null);
  T.stub('_vigilantDetects', () => ({ detected: true, sense: 'hearing' }));
  const p = _resolveSentinelCheck('creature::w', 'creature::m', 60, 50);
  T.eq(shown, 1); T.eq(_sentinelCheckPending.vigilantSense, 'hearing');
  _sentinelCheckPending.resolve(false); await p;
});

// ── Hidden objects: two rolls per approach (2x stat ft at half chance, 1x stat ft at full), none repeated ──
test('Hidden', 'one roll at the far ring, one at the near ring, none while standing still; leaving resets', async T => {
  const sn = { k: 'visual', stat: 10, hiding: 100, distFt: 30, los: true };
  const w = { id: 'h1', found: false };
  T.map();
  const savedCid = currentCharacterId; currentCharacterId = 'T_me';
  try {
    let rolls = 0, revealed = 0;
    T.stub('isGM', () => false);
    T.stub('_hiddenObjects', () => [w]);
    T.stub('_fogViewerToken', () => ({ id: 'tok1' }));
    T.stub('getConditions', () => new Set());
    T.stub('_refForToken', () => 'char::T_me');
    T.stub('getEntity', () => ({ name: 'Me', attrs: {} }));
    T.stub('_hiddenSenses', () => [Object.assign({}, sn)]);
    T.stub('_hiddenReveal', () => { revealed++; });
    T.stub('_hiddenRollChance', () => { rolls++; return 0; });
    delete _hiddenStage['tok1|h1|visual'];
    _hiddenDetectionCheck(false); T.eq(rolls, 0, 'beyond 2 x stat nothing rolls');
    sn.distFt = 18; _hiddenDetectionCheck(false); T.eq(rolls, 1, 'far ring rolls once');
    _hiddenDetectionCheck(false); _hiddenDetectionCheck(false); T.eq(rolls, 1, 'standing still never re-rolls');
    sn.distFt = 8; _hiddenDetectionCheck(false); T.eq(rolls, 2, 'near ring rolls once');
    sn.distFt = 5; _hiddenDetectionCheck(false); T.eq(rolls, 2, 'closer still: no extra roll');
    sn.distFt = 40; _hiddenDetectionCheck(false); sn.distFt = 18; _hiddenDetectionCheck(false);
    T.eq(rolls, 3, 'walking away and back rolls the far ring again');
    _hiddenDetectionCheck(true); T.eq(rolls, 4, 'starting a Search re-rolls the stage they are inside');
    T.eq(revealed, 0);
  } finally { currentCharacterId = savedCid; delete _hiddenStage['tok1|h1|visual']; }
});
test('Hidden', 'chance is stat / hiding factor, half at the far ring, doubled by Searching', async T => {
  const sn = { stat: 10, hiding: 40 };
  T.near(_hiddenRollChance(sn, 2, false), 25); T.near(_hiddenRollChance(sn, 1, false), 12.5);
  T.near(_hiddenRollChance(sn, 2, true), 50);  T.near(_hiddenRollChance(sn, 1, true), 25);
  T.eq(_hiddenRollChance({ stat: 10, hiding: 0 }, 2, false), 0);
});

// ── Hidden objects: walking onto an unnoticed one stops the move ──
test('Hidden', 'a player route is stopped at an unnoticed hidden line or area; found ones and the GM pass', async T => {
  T.map();
  const savedCid = currentCharacterId; currentCharacterId = 'T_me';
  try {
    const line = { id: 'hl', type: 'hidden', shape: 'line', found: false, name: 'Tripwire', points: [{ x_pct: 50, y_pct: 40 }, { x_pct: 50, y_pct: 60 }] };
    const area = { id: 'ha', type: 'hidden', shape: 'poly', found: false, name: 'Pit', points: [{ x_pct: 70, y_pct: 40 }, { x_pct: 80, y_pct: 40 }, { x_pct: 80, y_pct: 60 }, { x_pct: 70, y_pct: 60 }] };
    T.stub('_hiddenObjects', () => [line, area]);
    T.stub('getConditions', () => new Set());
    T.stub('isGM', () => false);
    const tok = T.token('T_me', 40, 50, 'character', 'T_me');
    const route = [{ x_pct: 40, y_pct: 50 }, { x_pct: 90, y_pct: 50 }];
    let r = _clipRoute(route, { traps: _hiddenTrapsFor(tok) });
    T.eq(r.stop, 'hidden'); T.eq(r.trap.id, 'hl', 'the line is crossed first');
    const end = r.points[r.points.length - 1];
    T.ok(end.x_pct >= 50 && end.x_pct < 52, 'stops right on the line, got ' + end.x_pct);
    line.found = true;
    r = _clipRoute(route, { traps: _hiddenTrapsFor(tok) });
    T.eq(r.trap.id, 'ha', 'with the line found, the area is next');
    T.ok(r.points[r.points.length - 1].x_pct >= 70 && r.points[r.points.length - 1].x_pct < 72);
    area.found = true;
    r = _clipRoute(route, { traps: _hiddenTrapsFor(tok) });
    T.eq(r.stop, null, 'found things do not trigger');
    line.found = area.found = false;
    T.stub('isGM', () => true);
    T.eq(_hiddenTrapsFor(tok).length, 0, 'the GM never springs traps');
  } finally { currentCharacterId = savedCid; }
});

test('Hidden', 'resetting the fog hides found objects again and clears the approach rolls', async T => {
  const a = { id: 'a', found: true, foundBy: 'X' }, b = { id: 'b', found: false };
  T.stub('_hiddenObjects', () => [a, b]);
  T.stub('drawWalls', () => {});
  _hiddenStage['t|a|visual'] = 2;
  T.eq(_hiddenForgetAll(), 1, 'one had been found');
  T.ok(!a.found && a.foundBy === '', 'forgotten');
  T.eq(Object.keys(_hiddenStage).length, 0, 'approach rolls cleared');
});

test('Hidden', 'a door is only known where the player has seen; the GM always sees it', async T => {
  T.map();
  const door = { id: 'd', door: true, type: 'line', points: [{ x_pct: 50, y_pct: 50 }, { x_pct: 52, y_pct: 50 }] };
  const savedCanvas = _fogExploredCanvas;
  try {
    const c = document.createElement('canvas'); c.width = mapImgW || 1000; c.height = mapImgH || 1000;
    _fogExploredCanvas = c;
    T.stub('_fogViewerToken', () => ({ id: 'v' }));
    T.stub('_gmSeesAll', () => false);
    T.eq(_doorKnown(door), false, 'unexplored: unknown');
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(c.width * 0.45, c.height * 0.45, c.width * 0.1, c.height * 0.1);
    T.eq(_doorKnown(door), true, 'explored: known');
    T.stub('_gmSeesAll', () => true); _fogExploredCanvas = null;
    T.eq(_doorKnown(door), true, 'GM always');
  } finally { _fogExploredCanvas = savedCanvas; }
});

test('Hidden', 'GM trap dialog: failed rolls come back, then Apply Effects opens with the failures ticked', async T => {
  T.map();
  T.stub('isGM', () => true);
  T.stub('showToast', () => {});
  const a = T.token('T_a', 40, 50, 'character', 'ca'), b = T.token('T_b', 45, 50, 'character', 'cb');
  a.label = 'Ann'; b.label = 'Bob';
  let opened = null;
  T.stub('atOpenApplyEffectsModal', ids => { opened = ids; });
  try {
    _trapGmDialog({ id: 'h', who: 'Ann', what: 'a Pit', charId: 'ca', tokenId: a.id });
    T.ok(document.getElementById('trap-gm-modal'), 'dialog shown');
    T.eq([...document.querySelectorAll('.tg-char:checked')].map(c => c.value).join(), 'ca', 'the one who triggered is ticked');
    _trapDlg.callId = 'c1'; _trapDlg.called = { ca: null, cb: null };
    _trapRollResult({ callId: 'other', charId: 'ca', ok: false });
    T.eq(opened, null, 'results for another call are ignored');
    _trapRollResult({ callId: 'c1', charId: 'ca', ok: true, roll: 10, pct: 50 });
    T.eq(opened, null, 'still waiting for Bob');
    _trapRollResult({ callId: 'c1', charId: 'cb', ok: false, roll: 90, pct: 50 });
    T.eq(JSON.stringify(opened), JSON.stringify([b.id]), 'only the failure is ticked');
    T.ok(!document.getElementById('trap-gm-modal'), 'trap dialog closes');
  } finally { document.getElementById('trap-gm-modal')?.remove(); _trapDlg = null; }
});

test('Sentinel', 'creature reach is the held melee weapon, not body height; packed weapons do not count', async T => {
  const saved = sessionCreatureCache['c1'];
  sessionCreatureCache['c1'] = { held_items: { right: 'Sword, Long' }, weapons: [{ name: 'Sword, Long' }] };
  const tok = { id: 't1', entity_type: 'creature', entity_id: 'c1', species: 'Orc' };
  const spear = Math.max(...MELEE_WEAPONS.filter(r => normalizeWeaponName(r.weapon) === normalizeWeaponName('Sword, Long') && r.damageMax > 0).map(r => r.reach));
  T.eq(_sentinelMeleeReachFt(tok), spear, 'a held sword sets the reach');
  sessionCreatureCache['c1'] = { held_items: {}, weapons: [{ name: 'Sword, Long' }] };
  T.eq(_sentinelMeleeReachFt(tok), 1, 'a sword in the pack gives only the unarmed 1 ft');
  if (saved) sessionCreatureCache['c1'] = saved; else delete sessionCreatureCache['c1'];
});

test('Melee reach', 'a melee attack on a target beyond the weapon reach is refused and targeting stays up', async T => {
  T.geo();
  const a = T.token('a', 50, 50, 'creature', 'Ea', ['friendly']), far = T.token('far', 56, 50, 'creature', 'Far', ['foe']);
  T.eq(Math.round(_meleeGapFt('creature::a', far)), 6, 'gap is the distance between the token edges');
  const toasts = [];
  T.stub('showToast', m => toasts.push(m));
  const saved = [attackMode, attackIsRanged, attackRangeFt, attackCombatantId, attackWeaponName, attackActionLabel];
  attackMode = true; attackIsRanged = false; attackRangeFt = 3; attackCombatantId = 'creature::a'; attackWeaponName = 'Sword, Long'; attackActionLabel = 'Slash';
  const handled = attackTokenClick('far');
  const stillTargeting = attackMode;
  [attackMode, attackIsRanged, attackRangeFt, attackCombatantId, attackWeaponName, attackActionLabel] = saved;
  T.ok(handled && stillTargeting, 'click is swallowed and targeting stays up');
  T.ok(toasts.some(m => /Out of reach/.test(m)), 'player is told why: ' + toasts.join('|'));
});

test('Night Vision', 'in the dark you identify others within your Night Vision stat in feet; a little farther they are shadows', async T => {
  T.geo();
  const me = T.token('me', 50, 50, 'creature', 'Me', ['friendly']);
  const near = T.token('near', 51.5, 50, 'creature', 'Near', ['foe']), mid = T.token('mid', 60, 50, 'creature', 'Mid', ['foe']), far = T.token('far', 90, 50, 'creature', 'Far', ['foe']);
  T.stub('_gmSeesAll', () => false);
  T.stub('_fogViewerToken', () => me);
  T.stub('_refForToken', () => 'creature::me');
  T.stub('getEntity', () => ({ attrs: { NightVision: 2 } }));
  T.stub('_tokenIsLit', () => false);
  const saved = [_darkActive, _fogLastPoly, _revealedTokens];
  _darkActive = true; _fogLastPoly = []; _revealedTokens = {};
  const st = t => _fogVisState(t);
  const got = [st(near), st(mid), st(far)];
  [_darkActive, _fogLastPoly, _revealedTokens] = saved;
  T.eq(got.join(), ['full', 'shadow', 'none'].join(), 'near (1.5 ft, inside 2 ft NV) full, mid (10 ft, at the edge of the 10 ft silhouette reach, 5 ft per point) shadow, far (40 ft) unseen');
});

test('Sentinel', 'a token that is guarding but lost its tracker slot (refresh) gets the stance slot back', async T => {
  T.geo();
  T.token('w', 50, 50, 'creature', 'Ew', ['sentinel']);
  T.token('x', 60, 50, 'creature', 'Ex', []);
  const saved = atCombatants;
  atCombatants = [{ id: 'creature::w', slots: { full: null, right: null, left: null, move: null } },
                  { id: 'creature::x', slots: { full: null, right: null, left: null, move: null } }];
  const n = _atRestoreAllStanceSlots();
  const w = atCombatants[0], x = atCombatants[1];
  atCombatants = saved;
  T.eq(n, 1, 'only the guarding token is restored');
  T.eq(w.slots.full && w.slots.full.label, 'Sentinel', 'the slot reads Sentinel, so the dialog shows it lit');
  T.ok(w.slots.full.durationRounds >= 9999 && w.slots.full.locksAll, 'a lock-on stance with no end');
  T.ok(!x.slots.full, 'a token with no stance is left alone');
  const busy = { slots: { full: null, right: { label: 'Slash' }, left: null, move: null }, id: 'creature::w' };
  T.ok(!_atRestoreStanceSlot(busy), 'not restored over a hand that is already acting');
});

test('Hidden', 'a secret door cycles hidden / noticed / open, is found like any hidden object, and hides again on fog reset', async T => {
  const door = { id: 'sd', type: 'line', door: true, secret: true, found: false, open: false, blocksVision: true, blocksMovement: true,
                 name: 'Secret door', vis: 40, hear: 0, smell: 0, points: [{ x_pct: 50, y_pct: 50 }, { x_pct: 52, y_pct: 50 }] };
  const savedWalls = mapWalls;
  mapWalls = [door];
  T.stub('saveMapWalls', async () => {}); T.stub('drawWalls', () => {}); T.stub('drawFog', () => {}); T.stub('logCombat', () => {});
  try {
    T.eq(_secretDoorState(door), 'hidden', 'starts hidden');
    T.ok(_hiddenDetectables().includes(door), 'characters can notice it');
    T.ok(!_hiddenObjects().includes(door), 'but it is not a trap line');
    await toggleDoor('sd');
    T.eq(_secretDoorState(door), 'noticed', 'first toggle reveals it, still a closed door');
    T.ok(door.blocksMovement && door.blocksVision, 'noticed doors are still shut');
    await toggleDoor('sd');
    T.eq(_secretDoorState(door), 'open', 'second toggle opens it');
    T.ok(!door.blocksMovement && !door.blocksVision, 'open blocks nothing');
    await toggleDoor('sd');
    T.eq(_secretDoorState(door), 'noticed', 'third toggle closes it again');
    await _secretDoorSet('sd', 'open');
    T.eq(_hiddenForgetAll(), 1, 'fog reset forgets it');
    T.ok(_secretDoorState(door) === 'hidden' && door.blocksMovement && door.blocksVision, 'hidden and shut again');
  } finally { mapWalls = savedWalls; }
});

test('Hidden', 'trap reaction: shield option only with a shield; responses are recorded for the GM', async T => {
  const base = ['Freeze', 'Jump Back', 'Roll to the Side', 'Dash Forward', 'Go Prone', 'Other'];
  T.eq(_trapReactionOptions({ held: { right: 'Sword, Long' } }).join(), base.join(), 'no shield, no Hunker option');
  T.eq(_trapReactionOptions({ held: { left: 'Shield, Heater' } }).join(),
    ['Freeze', 'Jump Back', 'Roll to the Side', 'Hunker behind Shield', 'Dash Forward', 'Go Prone', 'Other'].join(), 'a shield adds Hunker behind Shield');
  T.eq(TRAP_REACT_SECS, 6, 'six seconds on the clock');
  const saved = _trapResponses;
  _trapResponses = {};
  _trapResponseReceived({ who: 'Choppy', response: 'Jump Back', charId: 'c1' });
  T.eq(_trapResponseLines().join(), 'Choppy responds: Jump Back', 'the GM sees who did what');
  _trapResponses = saved;
});

test('Critical miss', 'melee critical miss: slip (96-97), fumble (98-99) and self-hit (100) each need a failed save', async T => {
  const tok = T.token('a', 50, 50, 'creature', 'Ea', []);
  const log = [], seq = { rolls: [] };
  T.stub('_pathFindToken', () => tok);
  T.stub('getEntity', () => ({ name: 'Ea', attrs: { PhysCoord: 10, ManualDex: 10 } }));
  T.stub('_refForToken', () => 'creature::a');
  T.stub('_handHoldingWeapon', () => 'right');
  T.stub('logCombat', m => log.push(m));
  T.stub('setCondition', async (id, k, on) => log.push('cond:' + k + ':' + on));
  T.stub('dropHeldItem', async (ref, side) => log.push('drop:' + side));
  T.stub('applyDamage', async (t, id, d) => log.push('dmg:' + (d >= 1 ? 'some' : 'none')));
  T.stub('_checkDownedState', async () => null);
  T.stub('openRoller', o => { log.push('save:' + o.target + ':' + o.label.split(' save')[0]); o.onComplete(seq.rolls.shift()); });
  const dc = { attackerCombatantId: 'creature::a', weaponRow: { weapon: 'Sword, Long', damageMax: 6, maxPowerMod: 0.5 }, atkPower: 10, melee: true };
  const run = async (n, saveRoll) => { log.length = 0; seq.rolls = [saveRoll]; await _meleeCritMiss(dc, n); return log.join(' | '); };
  let r = await run(96, 90);
  T.ok(/save:50:Physical Coordination/.test(r) && /cond:prone:true/.test(r), 'a failed save on 96 drops them Prone: ' + r);
  r = await run(97, 20);
  T.ok(!/cond:prone/.test(r), 'a passed save on 97 keeps them on their feet');
  r = await run(98, 90);
  T.ok(/save:50:Manual Dexterity/.test(r) && /drop:right/.test(r), 'a failed Manual Dexterity save on 98 drops the weapon: ' + r);
  r = await run(99, 10);
  T.ok(!/drop:/.test(r), 'a passed save on 99 holds on');
  r = await run(100, 99);
  T.ok(/save:50:Physical Coordination/.test(r) && /dmg:some/.test(r), 'a failed save on 100 hurts themselves: ' + r);
  r = await run(100, 3);
  T.ok(!/dmg:/.test(r), 'a passed save on 100 avoids it');
});

test('Hidden', 'hidden magic: Quintessence is its own sense, reaching as far as the score, blocked by walls, nothing for a non-caster', async T => {
  T.map();
  const me = T.token('me', 50, 50, 'character', 'Me', []);
  const w = { id: 'q1', type: 'hidden', shape: 'line', points: [{ x_pct: 60, y_pct: 50 }, { x_pct: 60, y_pct: 55 }], vis: 0, hear: 0, smell: 0, quint: 40 };
  T.stub('_sentinelLineOfSight', () => true);
  const caster = _hiddenSenses(w, me, { Quintessence: 12 });
  T.eq(caster.length, 1, 'only the Quintessence sense applies to a magic-only object');
  T.eq(caster[0].k, 'quint'); T.eq(caster[0].stat, 12); T.eq(caster[0].hiding, 40);
  T.eq(Math.round(_hiddenRollChance(caster[0], 2, false)), 30, 'stat / hiding at full chance (12 / 40)');
  T.eq(Math.round(_hiddenRollChance(caster[0], 2, true)), 60, 'Searching doubles it');
  T.eq(Math.round(_hiddenRollChance(caster[0], 1, false)), 15, 'the far roll is half');
  T.eq(_hiddenSenses(w, me, { Quintessence: 0 })[0].stat, 0, 'no Quintessence, no chance (the check skips a zero stat)');
  T.stub('_sentinelLineOfSight', () => false);
  T.eq(_hiddenSenses(w, me, { Quintessence: 12 })[0].los, false, 'a wall blocks seeing magic, like sight');
  T.eq(_hiddenSenses(Object.assign({}, w, { quint: 0 }), me, { Quintessence: 12 }).length, 0, 'a factor of 0 means magic does not reveal it');
});

test('Hidden', 'trap cues: 32 of them, each reads "<name> sees/hears/feels/smells ..." and an unknown cue is none', async T => {
  const all = TRAP_CLUES.flatMap(g => g.list);
  T.eq(all.length, 32, 'twelve visual, ten audible, ten physical');
  T.eq(new Set(all.map(c => c[0])).size, 32, 'ids are unique');
  T.eq(_trapClueLine('click', 'Choppy'), 'Choppy hears a sharp metallic click.');
  T.eq(_trapClueLine('glint', 'Choppy'), 'Choppy sees a glint of metal.');
  T.eq(_trapClueLine('tremor', 'Choppy'), 'Choppy feels the floor shudder.');
  T.eq(_trapClueLine('sulfur', 'Choppy'), 'Choppy smells a sharp sulfur odor.');
  T.eq(_trapClueLine('', 'Choppy'), null, 'no cue chosen');
  T.eq(_trapClueLine('nope', 'Choppy'), null, 'unknown cue');
  T.ok(all.every(c => c[2].length <= 34), 'descriptions stay short');
});

test('Hidden', 'a sprung trap calls every other living party member to react, with their own name; the trigger and the GM are skipped', async T => {
  T.map();
  const mine = T.token('mine', 50, 50, 'character', 'Fez', []);
  mine.entity_id = 'T_fez';
  const calls = [];
  T.stub('_trapReactionDialog', (w, tok, who, ent, line, by) => calls.push({ id: w.id, who, line, by }));
  T.stub('getEntity', () => ({ name: 'Fez' }));
  T.stub('_refForToken', () => 'char::T_fez');
  const savedCid = currentCharacterId; currentCharacterId = 'T_fez';
  try {
    T.stub('isGM', () => false);
    const p = { id: 'h1', who: 'Choppy', what: 'a pit trap', charId: 'T_choppy', clueId: 'click' };
    _trapPartyReaction(p);
    T.eq(calls.length, 1, 'a party member who did not trigger it gets the call');
    T.eq(calls[0].who, 'Fez'); T.eq(calls[0].line, 'Fez hears a sharp metallic click.', 'the cue is worded for them');
    T.eq(calls[0].by, 'Choppy set off a pit trap.', 'and told who set it off');
    _trapPartyReaction(Object.assign({}, p, { charId: 'T_fez' }));
    T.eq(calls.length, 1, 'the character who triggered it already has their own dialog');
    T.stub('getConditions', () => new Set(['unconscious']));
    _trapPartyReaction(p);
    T.eq(calls.length, 1, 'an unconscious character is not asked');
    T.stub('isGM', () => true);
    T.stub('getConditions', () => new Set());
    _trapPartyReaction(p);
    T.eq(calls.length, 1, 'the GM is not asked');
  } finally { currentCharacterId = savedCid; }
});
test('Sentinel', 'a reaction that drops the mover ends the move where it fell, and the other watchers are not asked', async T => {
  T.geo();
  const m = T.token('m', 10, 50, 'creature', 'Em', ['foe']);
  T.token('a', 20, 50, 'creature', 'Ea', ['sentinel']); T.token('b', 30, 50, 'creature', 'Eb', ['sentinel']);
  const moves = [], asked = [];
  T.stub('_moveTokenTo', async (t, x, y) => { moves.push([x, y]); t.x_pct = x; t.y_pct = y; });
  T.stub('_findSentinelCrossings', () => [{ sentinelCid: 'creature::a', x_pct: 15, y_pct: 50, frac: 0.25 }, { sentinelCid: 'creature::b', x_pct: 25, y_pct: 50, frac: 0.75 }]);
  T.stub('_resolveSentinelCheck', async sc => { asked.push(sc); m.conditions = ['foe', 'unconscious']; });
  await _executeMoveWithSentinelChecks('creature::m', [{ x_pct: 10, y_pct: 50 }, { x_pct: 40, y_pct: 50 }]);
  T.eq(asked, ['creature::a'], 'the second watcher must not be asked');
  T.eq(moves, [[15, 50]], 'the body stays where it fell');
  // a mover still on its feet is asked by both and ends at the destination
  m.conditions = ['foe']; moves.length = 0; asked.length = 0;
  T.stub('_resolveSentinelCheck', async sc => { asked.push(sc); });
  await _executeMoveWithSentinelChecks('creature::m', [{ x_pct: 10, y_pct: 50 }, { x_pct: 40, y_pct: 50 }]);
  T.eq(asked, ['creature::a', 'creature::b']);
  T.eq(moves[moves.length - 1], [40, 50]);
});
test('Sentinel', 'an Attack answer runs the reaction on the answering screen and frees the mover only when it has finished', async T => {
  const wait = () => new Promise(r => setTimeout(r, 20));
  let attacked = null, released = 'none';
  T.stub('_resolveSentinelAttack', async p => { attacked = p; return true; });
  const pend = id => ({ checkId: id, sentinelCid: 'creature::w', moverCid: 'creature::m', resolve: v => { released = v; } });
  _sentinelCheckPending = pend('c1'); _sentinelPromptData.c1 = { checkId: 'c1', sentinelCid: 'creature::w', moverCid: 'creature::m' };
  _answerSentinelCheck('c1', true); await wait();
  T.eq(attacked && attacked.sentinelCid, 'creature::w', 'the attack starts on the answering client');
  T.eq(released, 'none', 'the mover keeps waiting while the attack is in flight');
  T.ok(_sentinelReactionWait, 'the reaction is tracked');
  _dlgMaybeReopen(); await wait(); // the attack roller closing
  T.eq(released, true, 'the mover is freed');
  T.eq(_sentinelReactionWait, null);
  released = 'none'; _sentinelCheckPending = pend('c2'); _sentinelPromptData.c2 = { checkId: 'c2' };
  _answerSentinelCheck('c2', false); await wait();
  T.eq(released, false, 'Let it pass frees the mover at once');
});
test('Sentinel', 'the Target range comes from the held ranged weapon, for monsters too; none held means nothing to guard', async T => {
  T.map(); T.stub('getTokenSize', () => 0); T.stub('_sentinelLineOfSight', () => true); // (T.geo would stub the range itself)
  const m = T.token('m', 0, 0, 'creature', 'Em', []);
  const c = T.token('c', 50, 50, 'creature', 'Ec', ['target', 'facing:0']);
  sessionCreatureCache[c.entity_id] = { held_items: { right: 'Javelin', left: '' } };
  const inc = n => Math.max(...RANGED_WEAPONS.filter(r => r.weapon === n).map(r => r.rangeIncrement || 0));
  T.ok(inc('Javelin') > inc('Dart'), 'the Javelin outranges the Dart');
  T.eq(_targetWeaponRangeFt(c), inc('Javelin') * TARGET_RANGE_INCREMENTS, 'a monster holding a Javelin');
  sessionCreatureCache[c.entity_id] = { held_items: { right: 'Dart', left: 'Javelin' } };
  T.eq(_targetWeaponRangeFt(c), inc('Javelin') * TARGET_RANGE_INCREMENTS, 'the longest held weapon wins');
  sessionCreatureCache[c.entity_id] = { held_items: { right: 'Longsword', left: '' } };
  T.eq(_targetWeaponRangeFt(c), 0, 'no ranged weapon: no range');
  T.ok(!_sentinelZoneCheck(c, 60, 50, m), 'and so nothing is guarded');
  delete sessionCreatureCache[c.entity_id];
});

test('Vigilant', 'hearing and smell reach scale with the watcher: 4 ft per Hearing point, 1.5 ft per Smell point', async T => {
  const ent = { attrs: { Hearing: 15, Smell: 19 } };
  T.eq(_vigilantHearingRangeFt(ent), 60);
  T.near(_vigilantSmellRangeFt(ent), 28.5, 0.001, 'an orc (Smell 19) smells from farther than a human (10 -> 15 ft)');
  T.eq(_vigilantSmellRangeFt({ attrs: { Smell: 10 } }), 15);
  T.eq(_vigilantHearingRangeFt({ attrs: {} }), 0, 'no hearing, no reach');
});
