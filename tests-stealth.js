// Smoke tests for the shared stealth / detection model (stealth.js) and the concealment map object. Loaded by
// tests.html after tests-stances.js - see tests.js for how tests run and what the helper object T offers.

test('Stealth', 'a detection roll is ((sense - 7) / hiding) ^ 1.5, half at the far ring, doubled by Searching or Vigilant, never above 100', async T => {
  T.near(detectionChance(10, 20), 5.81, 0.01, 'near ring: (10-7)/20 to the 1.5');
  T.near(detectionChance(10, 20, { stage: 1 }), 2.905, 0.01, 'far ring is half');
  T.near(detectionChance(10, 20, { boosted: true }), 11.62, 0.01, 'doubled');
  T.near(detectionChance(10, 20, { stage: 1, boosted: true }), 5.81, 0.01, 'doubled, far ring');
  T.near(detectionChance(20, 20), 52.4, 0.1, '(20-7)/20 to the 1.5');
  T.eq(detectionChance(30, 10), 100, 'capped at 100');
  T.eq(detectionChance(10, 0), 0, 'hiding 0 cannot be sensed');
  T.eq(detectionChance(0, 5), 0, 'a blind watcher senses nothing');
  T.eq(detectionChance(7, 1), 0, 'a sense of 7 or less is as good as none (a bad eye, ear or nose)');
  T.eq(detectionChance(10, 1), 100, 'hiding 1 (the open) is always seen by a watcher with a decent sense');
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
  T.eq(personHiding({ ...base, hiding: true, screen: 15 }).sight, 52.5, 'underbrush 15 x (1 + Stealth 10 / 4)');
  T.eq(personHiding({ ...base, hiding: true, dark: true }).sight, 35, 'darkness ' + STEALTH_DARK_HIDING + ' x 3.5');
  T.eq(personHiding({ ...base, hiding: true, dark: true, screen: 25 }).sight, 87.5, 'the better screen counts, they do not add');
});

test('Stealth', 'hearing: a still hider is silent; louder walkers are easier to hear; Stealth only helps a sneaker; smell ignores Stealth', async T => {
  const b = { stealth: 10, noise: 20, odor: 30, gaitMult: 1 };
  T.eq(personHiding({ ...b, hiding: true, moving: false }).hearing, 0, 'a hider who does not move makes no sound');
  const sneak = personHiding({ ...b, hiding: true, moving: true }).hearing;
  const open = personHiding({ ...b, hiding: false, moving: true }).hearing;
  T.eq(sneak, HEARING_HIDING_K / 20 * 3.5, 'sneaking: 400/20 x (1 + Stealth/4)');
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
  T.eq(_fogOccluderSegments().length, 8, 'but they block sight like a wall (4 edges each)');
  T.ok(!_sentinelLineOfSight(90, 10, 10, 10), 'no sight from outside into the grass');
  T.ok(_sentinelLineOfSight(10, 10, 15, 15), 'sight inside one patch is clear');
  T.ok(!_sentinelLineOfSight(10, 10, 90, 10), 'and none out of it');
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
  T.senses({ 'creature::w': { Smell: 0, DayVision: 17 } }); T.random(0.9); // sight 17-7 = 10 against thicket 25: 51% doubled
  T.eq(_vigilantDetects(w, h, 60, 50).detected, false, 'sight 80%, a roll of 90 misses; and no hearing roll at all');
  _detectStage = {}; h.conditions = ['infiltrating']; T.random(0.9);
  T.eq(_vigilantDetects(w, h, 60, 50).sense, 'hearing', 'the same spot sneaking instead of hiding: heard');
  _detectStage = {}; h.conditions = ['hiding']; T.random(0.5);
  T.eq(_vigilantDetects(w, h, 60, 50).sense, 'sight', 'a roll of 50 sees the hider');
});

test('Stealth', 'a Searching watcher doubles its chance against a sneaker or hider, like Vigilant, but looks all round (no cone)', async T => {
  T.geo(); T.map(); T.senses(); T.fakeWrites(); mapIsDark = false; _detectStage = {};
  const _sq = (x0, y0, x1, y1) => [{ x_pct: x0, y_pct: y0 }, { x_pct: x1, y_pct: y0 }, { x_pct: x1, y_pct: y1 }, { x_pct: x0, y_pct: y1 }];
  mapWalls = [{ id: 'c', type: 'conceal', name: 'Thicket', hide: 25, points: _sq(0, 0, 100, 100) }];
  const w = T.token('w', 50, 50, 'creature', 'Ew', ['searching']), h = T.token('h', 60, 50, 'creature', 'Eh', ['hiding']);
  T.senses({ 'creature::w': { Smell: 0, DayVision: 17 } }); // sight 17-7 = 10 against thicket 25: 51% doubled
  T.random(0.30); // below the doubled 51% (and the far-ring half of it) but above the undoubled 20%
  T.eq(_vigilantDetects(w, h, 60, 50).sense, 'sight', 'a Searching watcher sees the hider on a roll of 30');
  _detectStage = {}; w.conditions = [];
  T.eq(_vigilantDetects(w, h, 60, 50).detected, false, 'the same watcher not searching misses on that roll');
  // behind the watcher: Vigilant is held to its cone, Searching is not
  mapTokens.h.x_pct = 40; mapTokens.h.conditions = ['hiding']; // west of the watcher; its default facing is east
  _detectStage = {}; w.conditions = ['searching']; T.random(0.30);
  T.eq(_vigilantDetects(w, mapTokens.h, 40, 50).sense, 'sight', 'Searching sees behind it');
  _detectStage = {}; w.conditions = ['vigilant']; T.random(0.30);
  T.eq(_vigilantDetects(w, mapTokens.h, 40, 50).detected, false, 'Vigilant, with the hider behind it, does not');
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

// ── Step 4: stealth attack, Stealth Kill, Stealth from gear and the formula ──
test('Stealth', 'the Stealth formula is editable; a broken one falls back to the default; gear and magic add on top', async T => {
  const saved = STEALTH_FORMULA;
  try {
    T.eq(stealthScore({ PhysCoord: 10, Logic: 20 }), 15);
    STEALTH_FORMULA = 'Logic';
    T.eq(stealthScore({ PhysCoord: 10, Logic: 20 }, 3), 23, 'a custom formula plus a +3 bonus');
    STEALTH_FORMULA = 'not a formula (';
    T.eq(stealthScore({ PhysCoord: 10, Logic: 20 }), 15, 'broken: the default skill');
  } finally { STEALTH_FORMULA = saved; }
  const fx = _parseEnchantEffects('Stealth +4, Noise -50%');
  T.eq(fx.stealth, 4); T.eq(fx.noisePct, -50); T.eq(fx.bad, []);
  T.eq(_parseEnchantEffects('Stealth +10%').bad.length, 1, 'a percentage Stealth is not understood');
  T.ok(DEFAULT_ENCHANTMENTS.some(e => e.name === 'Camouflage' && /Stealth \+/.test(e.effects)), 'a Camouflage enchantment ships');
});

test('Stealth', 'Stealth Kill: its own Knife and Short Sword rows, x3 armor gap, hiding/sneaking only, unlocked by a level 4 technique', async T => {
  for (const [weapon, tech] of [['Knife', 'knife-stealth-kill'], ['Sword, Short', 'short-sword-stealth-kill']]) {
    const r = DEFAULT_MELEE_WEAPONS.find(x => x.weapon === weapon && x.action === 'Stealth Kill');
    T.ok(r, weapon + ' has a Stealth Kill row');
    T.eq(r.reqTechnique, tech); T.eq(r.gapMult, 3); T.ok(r.stealthOnly); T.eq(r.damageType, 'pierce');
    T.ok(!_rowUnlocked([], r) && _rowUnlocked([tech], r), 'locked until the technique is chosen');
    const t = DEFAULT_TECHNIQUES.find(x => x.id === tech);
    T.ok(t && t.minLevel === 4 && t.stealthKill, 'a level 4 technique');
  }
});

test('Stealth', 'a stealth attack: +20 to hit, no defense, double damage flagged; not when already noticed; Stealth Kill needs a stance', async T => {
  T.geo(); T.fakeWrites(); mapIsDark = false;
  atCombatants = [];
  sessionCreatureCache['Ea'] = { species: 'Human', stats: {}, held_items: { right: 'Knife' }, weapons: [{ name: 'Knife' }] };
  const a = T.token('a', 50, 50, 'creature', 'Ea', ['friendly']); T.token('t', 51, 50, 'creature', 'Et', ['foe']);
  const added = !MELEE_WEAPONS.some(r => r.weapon === 'Knife' && r.action === 'Stealth Kill');
  if (added) MELEE_WEAPONS.push({ ...DEFAULT_MELEE_WEAPONS.find(r => r.weapon === 'Knife' && r.action === 'Stealth Kill') });
  const seen = [], logs = [], toasts = [];
  T.stub('_openCalledShotModal', o => seen.push(o)); T.stub('atSetSlot', () => {}); T.stub('switchGmTab', () => {});
  T.stub('logCombat', m => logs.push(m)); T.stub('showToast', m => toasts.push(m));
  const saved = [attackMode, attackIsRanged, attackRangeFt, attackCombatantId, attackWeaponName, attackActionLabel];
  const swing = (conds, action) => {
    a.conditions = conds; seen.length = 0;
    attackMode = true; attackIsRanged = false; attackRangeFt = 5; attackCombatantId = 'creature::a'; attackWeaponName = 'Knife'; attackActionLabel = action || 'Stab';
    attackTokenClick('t');
    return seen[0];
  };
  try {
    const plain = swing(['friendly']);
    T.ok(plain && plain.baseThreshold > 0 && !plain.damageContext.stealth, 'an open attack is made: ' + JSON.stringify(plain && { t: plain.baseThreshold, d: plain.defenseOptions.length }) + ' ' + logs.join('|') + toasts.join('|'));
    const stealth = swing(['friendly', 'infiltrating']);
    T.eq(stealth.baseThreshold, plain.baseThreshold + STEALTH_ATTACK_HIT, '+20 to hit');
    T.eq(stealth.defenseOptions.length, 0, 'no defense roll');
    T.ok(stealth.damageContext.stealth, 'flagged for double damage');
    T.ok(logs.some(m => /stealth attack/.test(m)));
    const hid = swing(['friendly', 'hiding']);
    T.ok(hid.damageContext.stealth && hid.defenseOptions.length === 0, 'from hiding too');
    const noticed = swing(['friendly', 'infiltrating', 'noticedby:t']);
    T.eq(noticed.baseThreshold, plain.baseThreshold, 'the target has noticed you: no bonus');
    T.ok(!noticed.damageContext.stealth);
    const refused = swing(['friendly'], 'Stealth Kill');
    T.ok(!refused && toasts.some(m => /hiding or sneaking/.test(m)), 'Stealth Kill is refused unless hiding or sneaking');
    const kill = swing(['friendly', 'hiding'], 'Stealth Kill');
    T.ok(kill && kill.damageContext.weaponRow.gapMult === 3, 'Stealth Kill goes through with its x3 gap row');
  } finally {
    [attackMode, attackIsRanged, attackRangeFt, attackCombatantId, attackWeaponName, attackActionLabel] = saved;
    if (added) MELEE_WEAPONS.splice(MELEE_WEAPONS.findIndex(r => r.weapon === 'Knife' && r.action === 'Stealth Kill'), 1);
    delete sessionCreatureCache['Ea'];
  }
});

test('Core Rules', 'the Publish button follows the core_rules_owners table, not the id saved in the browser', async T => {
  let made = false, btn = document.getElementById('core-publish-btn');
  if (!btn) { made = true; btn = document.createElement('button'); btn.id = 'core-publish-btn'; document.body.appendChild(btn); }
  const savedDisplay = btn.style.display; btn.style.display = 'none';
  const lsKey = OWNER_USER_LS_KEY, savedLs = localStorage.getItem(lsKey), savedUser = currentUser, savedPub = [_corePublisher, _corePublisherFor];
  try {
    currentUser = { id: 'u1' };
    localStorage.setItem(lsKey, 'someone-else'); // a different account saved as the browser's owner
    T.ok(!isConfigOwner(), 'the old check would hide it');
    const answer = (data, error) => T.stubObj(sb, 'from', () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data, error }) }) }) }));
    answer([{ user_id: 'u1' }], null); _corePublisher = null; _corePublisherFor = null;
    await _refreshCorePublisher();
    T.eq(btn.style.display, '', 'an owner in the table sees it');
    answer([], null); _corePublisher = null; _corePublisherFor = null;
    await _refreshCorePublisher();
    T.eq(btn.style.display, 'none', 'someone not in the table does not');
    answer(null, { message: 'no such table' }); _corePublisher = null; _corePublisherFor = null;
    await _refreshCorePublisher();
    T.eq(btn.style.display, 'none', 'table unreadable: falls back to the old check (hidden here)');
  } finally {
    if (made) btn.remove(); else btn.style.display = savedDisplay;
    currentUser = savedUser; [_corePublisher, _corePublisherFor] = savedPub;
    if (savedLs === null) localStorage.removeItem(lsKey); else localStorage.setItem(lsKey, savedLs);
  }
});

// Design target (v0.1.20261126): an above-average Scout in light armor slips past a group of four average guards through
// cover about 80% of the time; noisy armor, keen senses (orc smell) or a big body make it much harder. This pins the
// tuning so a later change to the numbers is a deliberate one.
test('Stealth', 'a level 4 Scout sneaks past four average guards about 80% of the time; noisy armor and keen noses cut that sharply', async T => {
  const mk = race => calcAttributesFromData({ race, bodyType: 'Humanoid', sex: 'Male', age: 'Adult', height: 'Average', build: 'Average', social: 'Balanced', mental: 'Balanced',
    stats: { XP: _xpForLevel(4), CharClass: 'Scout', LevelPicks: ['Intellect', 'Intellect', 'Memory'], Strength: 8, Endurance: 10, Agility: 14, Memory: 10, Intellect: 12, Senses: 12, Quintessence: 0 } });
  const through = (att, watcher, armorNoise, n, vigilant) => {
    const hid = personHiding({ hiding: true, moving: true, stealth: stealthScore(att), screen: 15, dark: false,
      noise: (armorNoise + att.Speed) * att._targetAdj, gaitMult: 1, odor: 8 * (att._targetAdj / 6) });
    let p = 1;
    for (const [stat, h] of [[watcher.Day, hid.sight], [watcher.Hear, hid.hearing], [watcher.Smell, hid.smell]])
      p *= (1 - detectionChance(stat, h, { stage: 1, boosted: vigilant }) / 100) * (1 - detectionChance(stat, h, { stage: 2, boosted: vigilant }) / 100);
    return Math.pow(p, n) * 100;
  };
  const guard = { Day: 10, Hear: 10, Smell: 10 }, orc = { Day: 12, Hear: 14, Smell: 25 };
  const human = mk('Human');
  const base = through(human, guard, 0, 4, false);
  T.ok(base >= 72 && base <= 88, 'light armor, four average guards: ' + Math.round(base) + '%');
  T.ok(through(human, guard, 30, 4, false) < 50, 'a full suit of mail (Noise +30) drops it below half');
  T.ok(through(human, guard, 0, 4, true) < base, 'Vigilant guards are harder to pass');
  T.ok(through(human, orc, 0, 4, false) < base - 30, 'orcs, with their noses, are far harder');
  T.ok(through(mk('Halfling'), guard, 0, 4, false) > base, 'a small body is quieter');
  T.ok(through(mk('Ogre'), guard, 0, 4, false) < base, 'a big body is louder');
});

test('Cover', 'ground cover draws a hatched, named area for everyone', async T => {
  T.stub('_wallPctToVp', p => ({ x: p.x_pct * 10, y: p.y_pct * 10 }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const pts = [{ x_pct: 1, y_pct: 1 }, { x_pct: 9, y_pct: 1 }, { x_pct: 5, y_pct: 8 }];
  _concealDraw(svg, [{ type: 'conceal', name: 'Thicket', hide: 25, points: pts }, { type: 'conceal', name: 'Tall grass', hide: 8, points: pts }]);
  T.eq(svg.querySelectorAll('polygon').length, 4, 'a wash and a hatch per area');
  T.eq(svg.querySelectorAll('pattern').length, 2, 'a heavier hatch for the thicker cover');
  T.ok(/Thicket/.test(svg.textContent), 'named');
  const empty = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); _concealDraw(empty, []);
  T.eq(empty.childNodes.length, 0, 'nothing to draw, nothing drawn');
});
