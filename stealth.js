// stealth.js - one detection model for hidden objects, people who hide or sneak, and the watchers who look for them.
// See STEALTH_SPEC.md. Loaded after index.html's own script (it uses SEARCH_DETECT_MULT / HIDDEN_FAR_FACTOR from
// there at call time) and exercised by tests-stealth.js. The functions here are pure: nothing touches the map, the
// database or other players, so the rules can be tested and tuned in one place.
//
// The model: a thing has a HIDING value per sense (higher = harder to notice; 0 = cannot be sensed at all). A watcher's
// chance for one roll is  ((sense score - 7) / hiding value) ^ 1.5 x 100  (max 100). Two rolls per approach: one at twice the
// sense reach (half chance) and one inside the reach (full chance). Searching or Vigilant doubles the chance.

// ── Tunables (the numbers are on the same scale as sense scores, which run about 5-30) ──
var STEALTH_DARK_HIDING = 10;          // hiding value of an unlit spot on a dark map
var STEALTH_SKILL = { stats: ['PhysCoord', 'Logic'], mult: 0.5 }; // fallback if the formula below is blank or broken
// The Stealth skill formula, editable in Game Config (Economy page). Written like a weapon hit formula.
var STEALTH_FORMULA = (typeof STEALTH_FORMULA === 'string' && STEALTH_FORMULA) ? STEALTH_FORMULA : '(Physical Coordination + Logic) * 0.5';
var STEALTH_ATTACK_HIT = 20;           // a stealth attack is this many points easier to land (and does double damage)
var HEARING_HIDING_K = 400;            // hearing hiding = this / noise (a louder walker is easier to hear)
var SMELL_HIDING_K   = 600;            // smell hiding   = this / odor
// Tuning knobs (playtest 2026-11-25): a watcher's sense score is cut by SENSE_PENALTY before it is compared (a low score
// is a bad ear, eye or nose), the chance is (sense / hiding) raised to DETECT_POWER, and Stealth multiplies the cover and
// hearing hiding values: hiding x (1 + Stealth / STEALTH_DIVISOR).
var SENSE_PENALTY = 7;
var DETECT_POWER = 1.5;
var STEALTH_DIVISOR = 4;
var STEALTH_OPEN_NOISE_MULT = 2;       // a walker who is not sneaking makes this much more noise

// The chance (0-100) of ONE detection roll.
//   sense   the watcher's score for that sense
//   hiding  the thing's hiding value for it (0 or less: cannot be sensed)
//   opts    { stage: 1 = far ring (half chance) | 2 = near ring (full, default), boosted: Searching or Vigilant }
function detectionChance(sense, hiding, opts) {
  const o = opts || {};
  if (!(hiding > 0)) return 0;
  const s = Math.max(0, Math.min(100, sense || 0) - SENSE_PENALTY);
  const boost = o.boosted ? SEARCH_DETECT_MULT : 1;
  const far = o.stage === 1 ? HIDDEN_FAR_FACTOR : 1;
  return Math.min(100, Math.pow(s / hiding, DETECT_POWER) * 100 * boost * far);
}

// Which ring a watcher is in: 0 out of reach, 1 far (within twice the reach), 2 near (within the reach).
function detectionStage(distFt, reachFt) {
  if (!(reachFt > 0)) return 0;
  if (distFt <= reachFt) return 2;
  if (distFt <= reachFt * 2) return 1;
  return 0;
}

// Stealth score: the skill from attributes plus whatever gear and magic add.
function stealthScore(attrs, bonus) {
  const a = attrs || {};
  let base = null;
  try {
    let expr = STEALTH_FORMULA;
    for (const [label, key] of HIT_ATTR_MAP) expr = expr.replace(new RegExp(label, 'gi'), String(a[key] || 0));
    const v = Function('"use strict"; return (' + expr + ')')();
    if (isFinite(v)) base = v;
  } catch (e) { base = null; }
  if (base === null) base = STEALTH_SKILL.stats.reduce((n, k) => n + (a[k] || 0), 0) * STEALTH_SKILL.mult;
  return Math.max(0, base + (bonus || 0));
}

// The highest sight-hiding rating of any concealment area covering a point (0 = none). (_concealAreas is in index.html.)
function concealmentAt(xPct, yPct) {
  let best = 0;
  for (const w of _concealAreas()) {
    if (_pointInPoly(xPct, yPct, w.points.map(p => ({ x: p.x_pct, y: p.y_pct })))) best = Math.max(best, w.hide || 0);
  }
  return best;
}

// A person's hiding values.
//   p = { hiding: hiding or sneaking, moving, stealth, screen: concealment rating where they stand,
//         dark: standing in an unlit spot on a dark map, noise, gaitMult, odor }
// Sight: only a screen (darkness or concealment) hides anyone; Stealth multiplies it. In the open they are simply seen
// (hiding value 1). Hearing: someone hiding who is not moving makes no sound (0 = cannot be heard); everyone else is
// harder to hear the quieter they are, twice as easy if they are not sneaking, and Stealth multiplies the hiding value.
// Smell depends on odor only (Stealth does not help).
function personHiding(p) {
  const covered = Math.max(p.screen || 0, p.dark ? STEALTH_DARK_HIDING : 0);
  const stealthMult = 1 + (p.stealth || 0) / STEALTH_DIVISOR;
  const sight = (p.hiding && covered > 0) ? covered * stealthMult : 1;
  let hearing = 0;
  if (!(p.hiding && !p.moving)) {
    const noise = (p.noise || 0) * (p.hiding ? 1 : STEALTH_OPEN_NOISE_MULT) * (p.gaitMult || 1);
    hearing = noise > 0 ? HEARING_HIDING_K / noise * (p.hiding ? stealthMult : 1) : 0;
  }
  const smell = (p.odor || 0) > 0 ? SMELL_HIDING_K / p.odor : 0;
  return { sight, hearing, smell };
}
