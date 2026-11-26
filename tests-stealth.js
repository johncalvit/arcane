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
