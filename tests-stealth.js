// Smoke tests for the shared stealth / detection model (stealth.js) and the concealment map object. Loaded by
// tests.html after tests-stances.js - see tests.js for how tests run and what the helper object T offers.

test('Stealth', 'a detection roll is sense / hiding, half at the far ring, doubled by Searching or Vigilant, never above 100', async T => {
  T.eq(detectionChance(10, 20), 50, 'near ring: 10 against 20');
  T.eq(detectionChance(10, 20, { stage: 1 }), 25, 'far ring is half');
  T.eq(detectionChance(10, 20, { boosted: true }), 100, 'doubled');
  T.eq(detectionChance(10, 20, { stage: 1, boosted: true }), 50, 'doubled, far ring');
  T.eq(detectionChance(30, 10), 100, 'capped at 100');
  T.eq(detectionChance(10, 0), 0, 'hiding 0 cannot be sensed');
  T.eq(detectionChance(0, 5), 0, 'a blind watcher senses nothing');
  T.eq(detectionChance(10, 1), 100, 'hiding 1 (the open) is always seen by a watcher with any sense');
});

test('Stealth', 'a watcher is in the far ring within twice its reach and the near ring within its reach', async T => {
  T.eq(detectionStage(5, 10), 2);
  T.eq(detectionStage(10, 10), 2, 'on the line counts as near');
  T.eq(detectionStage(15, 10), 1);
  T.eq(detectionStage(20, 10), 1);
  T.eq(detectionStage(21, 10), 0);
  T.eq(detectionStage(1, 0), 0, 'no reach, no detection');
});

test('Stealth', 'the Stealth skill is (Physical Coordination + Logic) x 0.5, plus gear and magic', async T => {
  T.eq(stealthScore({ PhysCoord: 14, Logic: 17 }), 15.5);
  T.eq(stealthScore({ PhysCoord: 14, Logic: 17 }, 4), 19.5, 'camouflage / enchantment bonus adds');
  T.eq(stealthScore({}), 0);
  T.eq(stealthScore({ PhysCoord: 2, Logic: 2 }, -10), 0, 'never below 0');
});

test('Stealth', 'only a screen hides someone from sight: darkness or concealment, helped by Stealth', async T => {
  const base = { stealth: 10, noise: 20, odor: 30 };
  T.eq(personHiding({ ...base, hiding: true }).sight, 1, 'hiding in the open and in the light: simply seen');
  T.eq(personHiding({ ...base, hiding: false, screen: 15 }).sight, 1, 'standing in underbrush without hiding is not hiding');
  T.eq(personHiding({ ...base, hiding: true, screen: 15 }).sight, 25, 'underbrush 15 + Stealth 10');
  T.eq(personHiding({ ...base, hiding: true, dark: true }).sight, 20, 'darkness ' + STEALTH_DARK_HIDING + ' + Stealth 10');
  T.eq(personHiding({ ...base, hiding: true, dark: true, screen: 25 }).sight, 35, 'the better screen counts, they do not add');
});

test('Stealth', 'hearing: a still hider is silent; louder walkers are easier to hear; Stealth only helps a sneaker; smell ignores Stealth', async T => {
  const b = { stealth: 10, noise: 20, odor: 30, gaitMult: 1 };
  T.eq(personHiding({ ...b, hiding: true, moving: false }).hearing, 0, 'a hider who does not move makes no sound');
  const sneak = personHiding({ ...b, hiding: true, moving: true }).hearing;
  const open = personHiding({ ...b, hiding: false, moving: true }).hearing;
  T.eq(sneak, HEARING_HIDING_K / 20 + 10, 'sneaking: 400/20 + Stealth');
  T.eq(open, HEARING_HIDING_K / 40, 'walking openly is twice as loud and gets no Stealth');
  T.ok(sneak > open, 'so a sneaker is harder to hear');
  const run = personHiding({ ...b, hiding: true, moving: true, gaitMult: 2 }).hearing;
  T.ok(run < sneak, 'a faster gait is louder');
  T.eq(personHiding({ ...b, hiding: true, moving: true, noise: 0 }).hearing, 0, 'no noise at all: cannot be heard');
  const sm = personHiding({ ...b, hiding: true }).smell;
  T.eq(sm, SMELL_HIDING_K / 30);
  T.eq(personHiding({ ...b, stealth: 99, hiding: true }).smell, sm, 'Stealth does not hide a smell');
});

test('Stealth', 'concealment areas: the best covering rating wins, outside is none; they never block sight or movement', async T => {
  T.map();
  const sq = (x0, y0, x1, y1) => [{ x_pct: x0, y_pct: y0 }, { x_pct: x1, y_pct: y0 }, { x_pct: x1, y_pct: y1 }, { x_pct: x0, y_pct: y1 }];
  mapWalls = [
    { id: 'c1', type: 'conceal', name: 'Tall grass', hide: 8, points: sq(0, 0, 50, 50), blocksVision: false, blocksMovement: false },
    { id: 'c2', type: 'conceal', name: 'Thicket', hide: 25, points: sq(20, 20, 30, 30), blocksVision: false, blocksMovement: false },
    { id: 'l1', type: 'litarea', points: sq(60, 60, 90, 90) },
  ];
  T.eq(concealmentAt(10, 10), 8, 'grass only');
  T.eq(concealmentAt(25, 25), 25, 'the thicket inside the grass is the better screen');
  T.eq(concealmentAt(70, 70), 0, 'a lit area is not concealment');
  T.eq(concealmentAt(90, 10), 0, 'outside everything');
  T.eq(_concealAreas().length, 2);
  T.eq(_moveBlockers().length, 0, 'concealment never blocks movement');
  T.eq(_fogOccluderSegments().length, 0, 'or sight');
});

// ── Step 3: Hide, "noticed by" ──

test('Stealth', 'Hide needs something to hide in: a concealment area or an unlit spot on a dark map', async T => {
  const _sqPct = (x0, y0, x1, y1) => [{ x_pct: x0, y_pct: y0 }, { x_pct: x1, y_pct: y0 }, { x_pct: x1, y_pct: y1 }, { x_pct: x0, y_pct: y1 }];
  T.geo(); T.map(); mapIsDark = false; _litShapes = []; mapWalls = [];
  const h = T.token('h', 30, 30, 'creature', 'Eh', []);
  T.ok(!_canHideAt(h), 'open ground in the light');
  mapWalls = [{ id: 'c', type: 'conceal', name: 'Underbrush', hide: 15, points: _sqPct(20, 20, 40, 40) }];
  T.ok(_canHideAt(h), 'underbrush');
  mapWalls = []; mapIsDark = true;
  T.ok(_canHideAt(h), 'darkness');
  _litShapes = [[{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }]];
  T.ok(!_canHideAt(h), 'darkness that a light has lit is not cover');
  _litShapes = []; mapIsDark = false;
  let toast = null; T.stub('showToast', m => { toast = m; });
  T.ok(!_hideCheck('creature::h') && /Nothing to hide in/.test(toast), 'refused with a reason');
});

test('Stealth', 'a hider makes no sound: only sight (past the cover) or smell can find them', async T => {
  const _sqPct = (x0, y0, x1, y1) => [{ x_pct: x0, y_pct: y0 }, { x_pct: x1, y_pct: y0 }, { x_pct: x1, y_pct: y1 }, { x_pct: x0, y_pct: y1 }];
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  mapWalls = [{ id: 'c', type: 'conceal', name: 'Thicket', hide: 25, points: _sqPct(0, 0, 100, 100) }];
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), h = T.token('h', 60, 50, 'creature', 'Eh', ['hiding']);
  T.senses({ 'creature::w': { Smell: 0 } }); T.random(0.9);
  T.eq(_vigilantDetects(w, h, 60, 50).detected, false, 'sight 80%, a roll of 90 misses; and no hearing roll at all');
  _detectStage = {}; h.conditions = ['infiltrating']; T.random(0.9);
  T.eq(_vigilantDetects(w, h, 60, 50).sense, 'hearing', 'the same spot sneaking instead of hiding: heard');
  _detectStage = {}; h.conditions = ['hiding']; T.random(0.5);
  T.eq(_vigilantDetects(w, h, 60, 50).sense, 'sight', 'a roll of 50 sees the hider');
});

test('Stealth', 'noticed by: recorded on the hider, stops further rolls, cleared when they start afresh', async T => {
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['vigilant', 'facing:0']), m = T.token('m', 60, 50, 'creature', 'Em', ['infiltrating']);
  T.random(0);
  T.ok(!_hasNoticed(w, m));
  await _markNoticed(w, m);
  T.ok(_hasNoticed(w, m), 'recorded');
  T.eq(_vigilantDetects(w, m, 60, 50), { detected: false, sense: null }, 'a watcher that has already noticed does not roll again');
  await _clearNoticedBy(m);
  T.ok(!_hasNoticed(w, m), 'cleared');
  T.eq(_vigilantDetects(w, m, 60, 50).detected, true);
});

test('Stealth', 'a watcher walking up to a stationary hider is rolled for; allies and non-hiders are not', async T => {
  const _sqPct = (x0, y0, x1, y1) => [{ x_pct: x0, y_pct: y0 }, { x_pct: x1, y_pct: y0 }, { x_pct: x1, y_pct: y1 }, { x_pct: x0, y_pct: y1 }];
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  mapWalls = [{ id: 'c', type: 'conceal', name: 'Tall grass', hide: 8, points: _sqPct(0, 0, 100, 100) }];
  T.token('w', 10, 50, 'creature', 'Ew', ['foe', 'facing:0']); T.token('h', 50, 50, 'creature', 'Eh', ['friendly', 'hiding']);
  const seg = [{ x_pct: 10, y_pct: 50 }, { x_pct: 45, y_pct: 50 }];
  T.random(0);
  const r = _findHiderNotices('creature::w', seg[0], seg[1]);
  T.eq(r.length, 1); T.eq(r[0].hider.id, 'h'); T.ok(['sight', 'smell'].includes(r[0].sense), 'a still hider cannot be heard: ' + r[0].sense);
  mapWalls[0].hide = 100; T.senses({ 'creature::w': { Smell: 0 } });
  T.random(0.999); _detectStage = {};
  T.eq(_findHiderNotices('creature::w', seg[0], seg[1]).length, 0, 'deep cover and a bad roll: unseen');
  T.senses(); mapWalls[0].hide = 8;
  T.random(0); _detectStage = {}; mapTokens.h.conditions = ['friendly'];
  T.eq(_findHiderNotices('creature::w', seg[0], seg[1]), [], 'not hiding: nothing to find');
  mapTokens.h.conditions = ['foe', 'hiding']; _detectStage = {};
  T.eq(_findHiderNotices('creature::w', seg[0], seg[1]), [], 'same side');
});

test('Stealth', 'moving ends Hide even after a refresh has emptied the tracker slot', async T => {
  T.geo(); T.map(); T.fakeWrites();
  T.token('h', 50, 50, 'creature', 'Eh', ['hiding']);
  atCombatants = [{ id: 'creature::h', slots: { full: null, right: null, left: null } }];
  await _cancelStancesOnMove('creature::h', 0.2);
  T.ok(getConditions('h').has('hiding'), 'a nudge does not end it');
  await _cancelStancesOnMove('creature::h', 10);
  T.ok(!getConditions('h').has('hiding'), 'a real move does');
  T.eq(_defCondFromLabel('Hide'), 'hiding');
});
