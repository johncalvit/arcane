// Grim Toll smoke tests - run by tests.html.
//
// Every test function below is turned into text and evaluated INSIDE the app's frame, so it sees the app's
// own globals (functions, and top-level let/const such as mapTokens or SPELLS) exactly as the app does.
// That means a test must be self-contained: it can use the app's globals and the helper object T, and
// nothing else from this file.
//
// T (defined by TEST_PRELUDE, inside the frame):
//   T.ok(cond, msg)  T.eq(actual, expected, msg)  T.near(actual, expected, tolerance, msg)
//   T.stub('fnName', fn)        replace a global function until the test ends
//   T.stubObj(obj, 'key', fn)   same for a property (e.g. sb.from, Math.random)
//   T.random(v)                 Math.random() returns v
//   T.map()                     a 100 ft x 100 ft map (1000 px, 10 px per foot): 1% = 1 ft
//   T.token(id, x, y, type, entityId, conditions)   adds a token to mapTokens and returns it
//   T.char(id, extra)           adds a character row to the cache, returns its ref ('char::T_<id>')
//   T.row(ref)                  the cached row behind a ref
//   T.geo()                     point-sized tokens, no walls, 5 ft reach; cids resolve to T.token tokens
//   T.senses(byRef)             every entity gets average senses (override per ref)
//   T.fakeWrites()              updateEntity etc. only touch the cache; returns { log:[], toasts:[] }
// Stubs, tokens, cache rows and the globals the helpers touch are all put back after each test.

function TEST_PRELUDE() {
  const stubs = [];
  let saved = null;
  const T = window.__T = {
    ok(cond, msg) { if (!cond) throw new Error(msg || 'expected a true value'); },
    eq(a, b, msg) {
      const ja = JSON.stringify(a), jb = JSON.stringify(b);
      if (ja !== jb) throw new Error((msg ? msg + ': ' : '') + 'got ' + ja + ', expected ' + jb);
    },
    near(a, b, tol, msg) {
      if (!(Math.abs(a - b) <= (tol == null ? 0.01 : tol))) throw new Error((msg ? msg + ': ' : '') + 'got ' + a + ', expected about ' + b);
    },
    stub(name, fn) { stubs.push([window, name, window[name]]); window[name] = fn; },
    stubObj(obj, key, fn) { stubs.push([obj, key, obj[key]]); obj[key] = fn; },
    random(v) { T.stubObj(Math, 'random', () => v); },
    map() { mapImgW = 1000; mapImgH = 1000; mapScalePPF = 10; },
    token(id, x, y, type, entityId, conditions) {
      const t = { id, x_pct: x, y_pct: y, entity_type: type || 'creature', entity_id: entityId || ('E' + id), label: id, conditions: conditions || [] };
      mapTokens[id] = t;
      return t;
    },
    char(id, extra) {
      const rid = 'T_' + id;
      playCharCache[rid] = Object.assign({
        id: rid, name: id, species: Object.keys(RACE_DATA)[0], stats: Object.assign({}, statValues),
        weapons: [], equipment: [], held_items: {}, armor: {},
        damage: { toughness: 0, stamina: 0, blood: 0, quintessence: 0 },
      }, extra || {});
      return 'char::' + rid;
    },
    row(ref) { return _entityCacheRow(ref); },
    // Flat geometry for stance tests: tokens are points (no radius), no walls, 5 ft melee reach, and
    // 'creature::<tokenId>' / 'char::<entityId>' resolve to the tokens added with T.token.
    geo() {
      T.map();
      T.stub('getTokenSize', () => 0);
      T.stub('_sentinelLineOfSight', () => true);
      T.stub('_sentinelMeleeReachFt', () => 5);
      T.stub('_targetWeaponRangeFt', () => 30);
      T.stub('_pathFindToken', cid => {
        const [type, id] = String(cid).split('::');
        return type === 'creature' ? (mapTokens[id] || null) : (Object.values(mapTokens).find(t => t.entity_type === 'character' && t.entity_id === id) || null);
      });
    },
    // Every entity gets these senses unless byRef names one: byRef = { 'creature::m': { Speed: 0 } }.
    senses(byRef) {
      const base = { DayVision: 10, NightVision: 2, Hearing: 50, Smell: 50, Speed: 10, _targetAdj: 1 };
      T.stub('getEntity', ref => ({ ref, name: ref, attrs: Object.assign({}, base, (byRef || {})[ref] || {}), armorNoise: 0, noiseMult: 1 }));
    },
    fakeWrites() {
      const rec = { log: [], toasts: [] };
      T.stub('updateEntity', async (ref, patch) => { const r = _entityCacheRow(ref); if (!r) return false; Object.assign(r, patch); delete r._attrs; return true; });
      T.stub('_syncOwnBuilder', () => {});
      T.stub('refreshUI', () => {});
      T.stub('logCombat', t => rec.log.push(t));
      T.stub('showToast', t => rec.toasts.push(t));
      return rec;
    },
    _begin() {
      saved = { mapTokens, mapImgW, mapImgH, mapScalePPF, known: characterKnownSpells, quick: characterQuickSpells, worn: characterWorn, dark: mapIsDark, combatants: atCombatants };
      mapTokens = {};
    },
    _end() {
      while (stubs.length) { const [o, k, v] = stubs.pop(); o[k] = v; }
      mapTokens = saved.mapTokens; mapImgW = saved.mapImgW; mapImgH = saved.mapImgH; mapScalePPF = saved.mapScalePPF;
      characterKnownSpells = saved.known; characterQuickSpells = saved.quick; characterWorn = saved.worn; mapIsDark = saved.dark; atCombatants = saved.combatants;
      for (const k of Object.keys(playCharCache)) if (k.startsWith('T_')) delete playCharCache[k];
      document.getElementById('loot-modal')?.remove();
      document.querySelectorAll('[id^="token-T_"]').forEach(e => e.remove());
      _lootState = null; _enchantCast = null; _sentinelCheckPending = null; _vigMoveGait = 0; _dlgReopenId = null; _dlgRoundEndPendingId = null;
    },
  };
}

const TESTS = [];
function test(group, name, fn) { TESTS.push({ group, name, fn }); }

// ── Loading & config integrity ───────────────────────────────────────────────
test('App', 'index.html and panels.js load and define the basics', async T => {
  T.ok(/^v\d/.test(VERSION), 'VERSION looks wrong: ' + VERSION);
  for (const f of ['getEntity', 'updateEntity', 'applyDamage', '_dlgRender', '_exploreRender', '_resolveSpellCast', 'attackTokenClick'])
    T.ok(typeof window[f] === 'function', f + ' is missing');
});
test('App', 'default tables have unique names', async T => {
  const dups = arr => arr.filter((n, i) => arr.indexOf(n) !== i);
  T.eq(dups(SPELLS.map(s => s.name)), [], 'duplicate spells');
  T.eq(dups(CONSUMABLES.map(s => s.name)), [], 'duplicate consumables');
  T.eq(dups(EQUIPMENT.map(s => s.name)), [], 'duplicate equipment');
  T.eq(dups(ENCHANTMENTS.map(s => s.name)), [], 'duplicate enchantments');
});
test('App', 'every enchanted item points at a real enchantment, and activated ones at a real spell', async T => {
  for (const it of [...EQUIPMENT, ...ARMOR_PIECES]) if (it.enchant) T.ok(_enchantByName(it.enchant), it.name + ' -> missing enchantment ' + it.enchant);
  for (const e of ENCHANTMENTS) {
    if (e.kind === 'active') T.ok(SPELLS.some(s => s.name === e.spell), e.name + ' -> missing spell ' + e.spell);
    else T.eq(_parseEnchantEffects(e.effects).bad, [], e.name + ' has effects that do not parse');
  }
});

// ── Explosions & knockback ───────────────────────────────────────────────────
test('Blast', 'weight factor: reference body 1x, half weight 2x, capped for tiny bodies', async T => {
  T.near(_weightFactor(BLAST.refWeight), 1);
  T.near(_weightFactor(BLAST.refWeight / 2), 2);
  T.near(_weightFactor(1), BLAST.maxLightBonus);
  T.ok(_weightFactor(600) < 0.3, 'a 600 lb body should barely move');
});
test('Blast', 'Arcane Blast is an explosion; an ordinary area spell is not', async T => {
  const ab = DEFAULT_SPELLS.find(s => s.name === 'Arcane Blast');
  T.ok(ab, 'Arcane Blast is missing from the default spells');
  T.ok(_isBlastSpell(ab));
  T.ok(!_isBlastSpell({ targetType: 'Area', aoeShape: 'Circle' }));
  T.ok(!_isBlastSpell({ targetType: 'Individual', blowback: 10 }));
});
test('Blast', 'damage and push fall off with distance; a save halves damage; Prone halves both', async T => {
  T.map();
  const spell = { name: 'Boom', targetType: 'Area', aoeShape: 'Circle', aoeSize: '10 ft radius', damageMax: 10, damageCategory: 'crush', halfOnSave: true, blowback: 20 };
  const mults = [];
  T.stub('_applyAoeFailure', async (c, s, e, t, opts) => { mults.push(opts.dmgMult); return 'x'; });
  T.stub('_blastTokenWeight', () => BLAST.refWeight);
  const run = async (x, saved, prone) => {
    const st = { spell, center: { xPct: 50, yPct: 50 }, casterEnt: {}, pushes: [] };
    await _applyBlast(st, { conditions: new Set(prone ? ['prone'] : []) }, T.token('v', x, 50), saved);
    return { mult: mults.pop(), push: st.pushes[0] ? st.pushes[0].pushFt : 0 };
  };
  const centre = await run(50, false, false);
  T.near(centre.mult, 1); T.near(centre.push, 20);
  const half = await run(55, false, false); // 5 ft out of 10
  T.near(half.mult, 1 - (1 - BLAST.edgeDamage) * 0.5); T.near(half.push, 20 * (1 - (1 - BLAST.edgePush) * 0.5));
  const edge = await run(60, false, false);
  T.near(edge.mult, BLAST.edgeDamage); T.near(edge.push, 20 * BLAST.edgePush);
  T.near((await run(50, true, false)).mult, 0.5, 0.001, 'save');
  const prone = await run(50, false, true);
  T.near(prone.mult, BLAST.proneDamage, 0.001, 'prone damage'); T.near(prone.push, 20 * BLAST.pronePush, 0.001, 'prone push');
});
test('Blast', 'held / holding / carrying bodies are not thrown', async T => {
  T.map();
  const spell = { name: 'Boom', targetType: 'Area', aoeShape: 'Circle', aoeSize: '10 ft radius', halfOnSave: true, blowback: 20 };
  T.stub('_blastTokenWeight', () => BLAST.refWeight);
  for (const k of ['held', 'holding', 'carrying']) {
    const st = { spell, center: { xPct: 50, yPct: 50 }, casterEnt: {}, pushes: [] };
    await _applyBlast(st, { conditions: new Set([k]) }, T.token('v', 50, 50), false);
    T.eq(st.pushes.length, 0, k);
  }
});
test('Blast', 'a thrown body slides the full distance across open ground', async T => {
  T.map(); T.fakeWrites(); T.random(0);
  const ref = T.char('thrown');
  const tok = T.token('T_a', 50, 50, 'character', 'T_thrown');
  T.stub('_clipRoute', pts => ({ points: pts, stop: null }));
  T.stub('_cancelStancesOnMove', async () => {});
  T.stub('_blowbackFx', () => {});
  T.stub('getConditions', () => new Set());
  T.stubObj(sb, 'from', () => ({ update: () => ({ eq: async () => ({ data: [], error: null }) }) }));
  const r = await _blowbackSlide(tok, ref, 1, 0, 10, 150);
  T.near(r.travel, 10); T.near(tok.x_pct, 60); T.near(tok.y_pct, 50);
  T.eq(r.slamText, ''); T.ok(/keeps their feet/.test(r.proneText), 'a good save keeps them upright');
});
test('Blast', 'a failed landing save leaves the body prone', async T => {
  T.map(); T.fakeWrites(); T.random(0.99);
  const ref = T.char('thrown');
  const tok = T.token('T_a', 50, 50, 'character', 'T_thrown');
  T.stub('_clipRoute', pts => ({ points: pts, stop: null }));
  T.stub('_cancelStancesOnMove', async () => {});
  T.stub('_blowbackFx', () => {});
  T.stub('getConditions', () => new Set());
  let prone = false;
  T.stub('setCondition', async (id, k, on) => { if (k === 'prone' && on) prone = true; });
  T.stubObj(sb, 'from', () => ({ update: () => ({ eq: async () => ({ data: [], error: null }) }) }));
  const r = await _blowbackSlide(tok, ref, 1, 0, 10, 150);
  T.ok(prone && /lands prone/.test(r.proneText), 'a roll of 99 beats any save');
});
test('Hop Up', 'Acrobatics odds drop with gear carried but not with body weight', async T => {
  const base = { Power: 10, PhysCoord: 10, _weight: 150 };
  const sk = SKILLS.find(s => s.name === 'Acrobatics');
  const naked = _hopUpChance({ attrs: base, skills: {}, carriedWeight: 150 });
  T.eq(naked.penalty, 0, 'body weight alone is free');
  T.eq(naked.base, Math.round(0.5 * sk.successAttrs.reduce((t, k) => t + (base[k] || 0), 0)), 'untrained is half a first point');
  const loaded = _hopUpChance({ attrs: base, skills: {}, carriedWeight: 200 });
  T.eq(loaded.penalty, 25, '50 lb of gear against a 100 lb lift limit is -25');
  T.ok(loaded.pct < naked.pct || naked.pct === 1, 'gear lowers the chance');
});
test('Blast', 'hitting a wall stops the slide, deals slam damage and knocks prone', async T => {
  T.map(); T.fakeWrites(); T.random(0.99);
  const ref = T.char('thrown');
  const tok = T.token('T_a', 50, 50, 'character', 'T_thrown');
  T.stub('_clipRoute', pts => ({ points: [pts[0], { x_pct: 55, y_pct: 50 }], stop: 'wall' }));
  T.stub('_cancelStancesOnMove', async () => {});
  T.stub('_blowbackFx', () => {});
  T.stub('getConditions', () => new Set());
  T.stub('getArmorDR', () => 0);
  T.stub('_checkDownedState', async () => null);
  let dmg = 0, prone = false;
  T.stub('applyDamage', async (type, id, d) => { dmg += d; });
  T.stub('setCondition', async (id, k, on) => { if (k === 'prone' && on) prone = true; });
  T.stubObj(sb, 'from', () => ({ update: () => ({ eq: async () => ({ data: [], error: null }) }) }));
  const r = await _blowbackSlide(tok, ref, 1, 0, 15, 150);
  T.near(r.travel, 5); T.near(tok.x_pct, 55);
  T.eq(dmg, Math.max(1, Math.round(10 * BLAST.slamPerFt)), 'slam damage for the 10 ft it had left');
  T.ok(/wall/.test(r.slamText), 'slam text should mention the wall'); T.ok(prone, 'a slam always knocks prone');
});
test('Blast', 'weapon knockback: explicit value wins, non-weapon rows give none', async T => {
  T.eq(_knockbackFor({ knockback: 7 }), 7);
  T.eq(_knockbackFor({ knockback: 0 }), 0);
  T.eq(_knockbackFor({ weapon: 'Not In The Table', action: 'Smash' }), 0);
  T.eq(_knockbackFor(null), 0);
});

// ── Arcane Grenade ───────────────────────────────────────────────────────────
test('Grenade', 'the Arcane Grenade is a blast, and weaker than Arcane Blast', async T => {
  const c = DEFAULT_CONSUMABLES.find(x => x.name === 'Arcane Grenade'), ab = DEFAULT_SPELLS.find(s => s.name === 'Arcane Blast');
  T.ok(c && ab, 'defaults missing');
  const g = _grenadeSpell(c);
  T.ok(g && g._grenade && _isBlastSpell(g));
  T.ok(_parseAoeGeometry(g).radius < _parseAoeGeometry(ab).radius, 'radius');
  T.ok(g.damageMax < ab.damageMax, 'damage'); T.ok(g.blowback < ab.blowback, 'blowback');
  T.ok(_parseSpellRangeFt(g.range) < _parseSpellRangeFt(ab.range), 'range');
  T.eq(_grenadeSpell({ name: 'Water' }), null, 'a plain consumable is not a grenade');
});
test('Grenade', 'throw chance drops with distance and stays within 5-95%', async T => {
  const key = label => HIT_ATTR_MAP.find(x => x[0] === label)[1];
  const mk = v => ({ attrs: { [key('Physical Coordination')]: v, [key('Manual Dexterity')]: v } });
  T.eq(_grenadeThrowTarget(mk(12), 0), 68); T.eq(_grenadeThrowTarget(mk(12), 40), 48);
  T.eq(_grenadeThrowTarget({ attrs: {} }, 400), 5); T.eq(_grenadeThrowTarget(mk(60), 0), 95);
});
test('Grenade', 'the blast catches its own thrower; a spell spares its caster', async T => {
  T.map();
  const me = T.token('me', 50, 50), foe = T.token('foe', 55, 50);
  T.stub('_pathFindToken', () => me);
  const g = _grenadeByName('Arcane Grenade'), ab = SPELLS.find(s => s.name === 'Arcane Blast') || DEFAULT_SPELLS.find(s => s.name === 'Arcane Blast');
  T.eq(_aoeAffectedTokens('x', g, 52, 50).map(t => t.id).sort(), ['foe', 'me']);
  T.eq(_aoeAffectedTokens('x', ab, 52, 50).map(t => t.id), ['foe']);
});
test('Grenade', 'a good throw lands on the spot, uses the item up and resolves the blast', async T => {
  T.map(); const rec = T.fakeWrites();
  const ref = T.char('thrower');
  const me = T.token('T_me', 10, 50, 'character', 'T_thrower'); T.token('foe', 40, 50);
  T.stub('_pathFindToken', () => me);
  T.stub('_clipRoute', pts => ({ points: pts, stop: null }));
  T.stub('_blowbackFxShow', () => {});
  const cap = {};
  T.stub('_expendHeldItem', async (r, n) => { cap.expended = n; });
  T.stub('_resolveAoeFlagged', async (e, s, targets, center) => { cap.targets = targets.map(t => t.id); cap.center = center; });
  T.stub('openRoller', o => { cap.target = o.target; cap.done = o.onComplete(1); });
  await _resolveGrenadeThrow(ref, Object.assign({}, _grenadeByName('Arcane Grenade'), { _item: 'Arcane Grenade' }), { xPct: 38, yPct: 50 });
  await cap.done;
  T.eq(cap.expended, 'Arcane Grenade'); T.eq(cap.targets, ['foe']); T.eq(cap.center, { xPct: 38, yPct: 50 });
  T.ok(cap.target >= 5 && cap.target <= 95);
});
test('Grenade', 'a bad throw scatters at least 3 ft; a wall in the way sets it off early', async T => {
  T.map(); T.fakeWrites(); T.random(0.5);
  const ref = T.char('thrower');
  const me = T.token('T_me', 10, 50, 'character', 'T_thrower');
  T.stub('_pathFindToken', () => me);
  T.stub('_blowbackFxShow', () => {});
  T.stub('_expendHeldItem', async () => {});
  T.stub('showToast', () => {});
  const cap = {};
  T.stub('_aoeAffectedTokens', (c, s, x, y) => { cap.at = { x, y }; return []; });
  T.stub('openRoller', o => { cap.done = o.onComplete(cap.roll); });
  const g = Object.assign({}, _grenadeByName('Arcane Grenade'), { _item: 'Arcane Grenade' });
  T.stub('_clipRoute', pts => ({ points: pts, stop: null }));
  cap.roll = 99; await _resolveGrenadeThrow(ref, g, { xPct: 30, yPct: 50 }); await cap.done;
  T.ok(_pctDistFt(30, 50, cap.at.x, cap.at.y) >= 3, 'missed throw should land at least 3 ft off');
  T.stub('_clipRoute', pts => ({ points: [pts[0], { x_pct: 20, y_pct: 50 }], stop: 'wall' }));
  cap.roll = 1; await _resolveGrenadeThrow(ref, g, { xPct: 30, yPct: 50 }); await cap.done;
  T.eq(cap.at, { x: 20, y: 50 }, 'should burst at the wall');
});

// ── Spell casting ────────────────────────────────────────────────────────────
test('Spells', 'armor (Arcane Impedance) lowers the success cap; Deific spells ignore it', async T => {
  T.eq(_spellSuccessCap({ arcaneImpedance: 0 }, { magicClass: 'Arcane' }), 95);
  T.eq(_spellSuccessCap({ arcaneImpedance: 60 }, { magicClass: 'Arcane' }), 35);
  T.eq(_spellSuccessCap({ arcaneImpedance: 500 }, { magicClass: 'Arcane' }), 1);
  T.eq(_spellSuccessCap({ arcaneImpedance: 60 }, { magicClass: 'Deific' }), 95);
});
test('Spells', 'Quick Cast doubles the odds but never passes the cap', async T => {
  const sp = SPELLS.find(s => s.magicClass !== 'Deific' && s.difficultyStat);
  T.ok(sp, 'no suitable spell');
  const mk = (imp, quick) => ({ attrs: { Knowledge: 10, [sp.difficultyStat]: sp.difficultyValue }, level: 1, skills: {}, arcaneImpedance: imp, stats: { QuickSpells: quick ? [sp.name] : [] } });
  const raw = _spellRawAccum(mk(0, false), sp, 1);
  T.ok(raw > 1, 'test caster should have a positive base chance, got ' + raw);
  T.eq(_spellSuccessRoll(mk(0, false), sp, 1), Math.min(95, Math.round(raw)));
  T.eq(_spellSuccessRoll(mk(0, true), sp, 1), Math.min(95, Math.round(raw * 2)));
  const cap = Math.max(1, Math.round(raw * 2) - 3); // a cap just under the doubled odds
  T.eq(_spellSuccessRoll(mk(95 - cap, true), sp, 1), cap, 'should stop at the cap');
});
test('Spells', 'Quick Cast costs 3x the memory; unlearned spells cost nothing', async T => {
  const sp = SPELLS[0], attrs = calcAttributes(), c = _spellMemoryCost(attrs, sp);
  T.eq(QUICK_CAST_MULT, 3);
  characterKnownSpells = []; characterQuickSpells = [];
  T.eq(_memoryPointsUsed(attrs), 0);
  characterKnownSpells = [sp.name];
  T.eq(_memoryPointsUsed(attrs), c);
  characterQuickSpells = [sp.name];
  T.eq(_memoryPointsUsed(attrs), c * 3, 'basic + the 2x upgrade');
});

// ── Enchanted items ──────────────────────────────────────────────────────────
test('Enchantments', 'effect text parses: attributes, percentages, Noise, and rejects nonsense', async T => {
  const fx = _parseEnchantEffects('Noise -50%, Night Vision +10, Power +10%, Bogus +1, Noise -5');
  T.eq(fx.noisePct, -50);
  T.eq(fx.attrs, [{ key: 'NightVision', amt: 10, pct: false }, { key: 'Power', amt: 10, pct: true }]);
  T.eq(fx.bad, ['Bogus +1', 'Noise -5']);
});
test('Enchantments', 'worn armor, worn jewelry and held items count; unworn jewelry does not', async T => {
  const row = {
    stats: { ArmorOwned: [{ id: 'b1', name: "Thieves' Enchanted Boots" }], ArmorEquipped: { rleg: 'b1', lleg: 'b1' }, Worn: { ringR: 'Ring of Night Eyes', ringL: 'Ring of Night Eyes' } },
    equipment: [{ name: 'Ring of Night Eyes', qty: 1 }, { name: 'Wand of Fire Rose', qty: 1 }], held_items: { right: 'Wand of Fire Rose' },
  };
  T.eq(_entityEnchantItems(row, true).map(x => [x.item, x.ench.name, x.where]),
    [["Thieves' Enchanted Boots", 'Silent Step', 'worn'], ['Ring of Night Eyes', 'Night Eyes', 'worn'], ['Wand of Fire Rose', 'Fire Rose', 'held']],
    'one ring cannot fill both hands, one boot piece counts once');
  T.eq(_entityEnchantItems({ stats: { Worn: {} }, equipment: [{ name: 'Ring of Night Eyes', qty: 1 }], held_items: {} }, true), [], 'a carried but unworn ring does nothing');
  T.eq(_entityEnchantItems({ stats: {}, equipment: [{ name: 'Wand of Fire Rose', qty: 1 }], held_items: {} }, true), [], 'a wand in the pack does nothing');
});
test('Enchantments', 'a creature wears the jewelry it carries (at most two rings)', async T => {
  T.eq(_entityEnchantItems({ stats: {}, equipment: [{ name: 'Ring of Night Eyes', qty: 3 }], held_items: {} }, false).length, 2);
});
test('Enchantments', 'passive effects reach the entity, and copies of one enchantment do not stack', async T => {
  const plain = getEntity(T.char('plain'));
  const one = getEntity(T.char('one', { stats: Object.assign({}, statValues, { Worn: { ringR: 'Ring of Night Eyes' }, ArmorOwned: [{ id: 'b1', name: "Thieves' Enchanted Boots", size: 4 }], ArmorEquipped: { rleg: 'b1' } }), equipment: [{ name: 'Ring of Night Eyes', qty: 1 }] }));
  const two = getEntity(T.char('two', { stats: Object.assign({}, statValues, { Worn: { ringR: 'Ring of Night Eyes', ringL: 'Ring of Night Eyes' } }), equipment: [{ name: 'Ring of Night Eyes', qty: 2 }] }));
  T.near(one.attrs.NightVision - plain.attrs.NightVision, 10);
  T.near(two.attrs.NightVision - plain.attrs.NightVision, 10, 0.01, 'two identical rings');
  T.eq(plain.noiseMult, 1); T.eq(one.noiseMult, 0.5);
  T.near(_infiltratorNoiseScore(one), _noiseScore(one.attrs, one.armorNoise) * 0.5, 0.001);
});
test('Enchantments', 'activation cost: Quintessence first, else 4 Stamina a point, unless it insists on Quintessence', async T => {
  const fr = { kind: 'active', spell: 'Fire Rose', successPct: 80, cost: 1 };
  const ent = (q, usedStam) => ({ attrs: { Quintessence: q }, baseAttrs: { Stamina: 10 }, damage: { stamina: usedStam || 0 } });
  T.eq(ENCHANT_STAMINA_PER_QUINT, 4);
  T.eq(_enchantCostFor(ent(5), fr), { quint: 1, stamina: 0 });
  T.eq(_enchantCostFor(ent(0), fr), { quint: 0, stamina: 4 });
  T.eq(_enchantCostFor(ent(0, 8), fr), null, 'too tired');
  T.eq(_enchantCostFor(ent(0), Object.assign({}, fr, { quintOnly: true })), null);
  T.eq(_enchantCostFor(ent(1), Object.assign({}, fr, { cost: 2 })), { quint: 1, stamina: 4 }, 'mixed payment');
});
test('Enchantments', 'activating a wand rolls its fixed %, charges its own cost, and a failure miscasts', async T => {
  T.fakeWrites();
  const ref = T.char('mage', { equipment: [{ name: 'Wand of Fire Rose', qty: 1 }], held_items: { right: 'Wand of Fire Rose' } });
  const ench = _enchantByName('Fire Rose'), spell = SPELLS.find(s => s.name === ench.spell);
  const cap = {};
  T.stub('openRoller', o => { cap.label = o.label; cap.target = o.target; cap.done = o.onComplete(cap.roll); });
  T.stub('_resolveSpellAoe', async () => { cap.resolved = true; });
  T.stub('_applySpellEffectToTarget', async () => { cap.resolved = true; });
  T.stub('_resolveSpellAttack', async (ce, s, t, th) => { cap.target = th; cap.resolved = true; await _paySpellCost(ce, s); });
  T.stub('_resolveSpellMiscast', async () => { cap.miscast = true; });
  T.stub('_startMaintaining', async () => {});
  T.stub('_pathFindToken', () => ({ id: 'tk', x_pct: 1, y_pct: 1 }));
  T.stub('atCloseModal', () => {}); T.stub('enterAoeCastMode', () => {}); T.stub('enterAttackMode', () => {}); T.stub('enterObstacleCastMode', () => {});
  const expectCost = _enchantCostFor(getEntity(ref), ench);
  T.ok(expectCost, 'the test character should be able to power the wand');

  cap.roll = 1;
  T.ok(await atActivateEnchant(ref, 'Wand of Fire Rose'), 'activation refused');
  if (spell.targetType !== 'Self') await _resolveSpellCast(ref, spell.name, ref, { xPct: 5, yPct: 5 });
  await cap.done;
  T.eq(cap.target, _enchantPct(ench), 'rolled against the item, not the caster');
  T.ok(cap.resolved, 'spell effect did not resolve');
  T.eq([T.row(ref).damage.quintessence, T.row(ref).damage.stamina], [expectCost.quint, expectCost.stamina], 'charged the item cost');
  T.eq(_enchantCast, null, 'pending activation should be consumed');

  cap.roll = 99; cap.miscast = false;
  await atActivateEnchant(ref, 'Wand of Fire Rose');
  if (spell.targetType !== 'Self') await _resolveSpellCast(ref, spell.name, ref, { xPct: 5, yPct: 5 });
  await cap.done;
  if (!(spell.spellType === 'Attack' && spell.hitFormula && spell.targetType !== 'Area')) T.ok(cap.miscast, 'a failed item roll should miscast');
});
test('Enchantments', 'a cancelled activation never leaks into a normal cast', async T => {
  T.fakeWrites();
  const ref = T.char('mage', { equipment: [{ name: 'Wand of Fire Rose', qty: 1 }], held_items: { right: 'Wand of Fire Rose' } });
  T.stub('atCloseModal', () => {}); T.stub('enterAoeCastMode', () => {}); T.stub('enterAttackMode', () => {}); T.stub('enterObstacleCastMode', () => {});
  T.stub('_resolveSpellCast', async () => {});
  await atActivateEnchant(ref, 'Wand of Fire Rose');
  T.ok(_enchantCast, 'activation should be pending');
  await atCompleteCast(ref, 'Fire Rose'); // the player backed out and cast the real spell instead
  T.eq(_enchantCast, null);
});
test('Enchantments', 'the dialog section lists activatable items and always-on effects', async T => {
  const ent = getEntity(T.char('mage', { stats: Object.assign({}, statValues, { Worn: { ringR: 'Ring of Night Eyes' } }), equipment: [{ name: 'Ring of Night Eyes', qty: 1 }, { name: 'Wand of Fire Rose', qty: 1 }], held_items: { right: 'Wand of Fire Rose' } }));
  const html = _enchantSectionHtml(ent, 'enchact', false);
  T.ok(html.includes('Wand of Fire Rose') && html.includes('data-dact="enchact"'), 'activate chip missing');
  T.ok(html.includes('Always on') && html.includes('Ring of Night Eyes'), 'passive line missing');
  T.eq(_enchantSectionHtml(getEntity(T.char('nobody')), 'enchact', false), '');
});

// ── Looting ──────────────────────────────────────────────────────────────────
test('Loot', 'only an incapacitated body within reach, and only with a free hand', async T => {
  T.map();
  const me = T.char('looter', { held_items: { right: 'Torch' } }); T.char('body');
  const meTok = T.token('T_l', 10, 10, 'character', 'T_looter'), b = T.token('T_b', 14, 10, 'character', 'T_body');
  T.stub('_pathFindToken', () => meTok);
  T.ok(/dead, unconscious or paralyzed/.test(_lootRefusal(me, b)), 'a healthy target must be refused');
  for (const k of ['dead', 'unconscious', 'paralyzed']) { b.conditions = [k]; T.eq(_lootRefusal(me, b), '', k); }
  b.x_pct = 40; T.ok(/Too far/.test(_lootRefusal(me, b))); b.x_pct = 14;
  T.row(me).held_items = { right: 'Torch', left: 'Torch' };
  T.ok(/free hand/.test(_lootRefusal(me, b)));
  T.ok(/yourself/.test(_lootRefusal(me, meTok)));
  T.ok(/not a body/.test(_lootRefusal(me, { id: 'i', entity_type: 'item' })));
});
test('Loot', 'natural weapons are never loot', async T => {
  const nat = MELEE_WEAPONS.find(r => r.naturalSlot);
  const ref = T.char('beast', { weapons: [{ name: 'Mace', wt: 6 }].concat(nat ? [{ name: nat.weapon, wt: 0 }] : []), held_items: { right: 'Bare Handed' } });
  T.eq(_lootItems(ref).map(i => i.name), ['Mace']);
});
test('Loot', 'taking items moves them from the body to the looter and adds their weight', async T => {
  T.map(); const rec = T.fakeWrites();
  const me = T.char('looter', { equipment: [{ name: 'Torch', qty: 1, unitWt: 1 }], held_items: { right: 'Torch' } });
  const body = T.char('body', { weapons: [{ name: 'Mace', damage: '', wt: 6, reach: '' }], equipment: [{ name: 'Torch', qty: 2, unitWt: 1 }], held_items: { right: 'Mace', left: 'Mace' } });
  const b = T.token('T_b', 14, 10, 'character', 'T_body', ['dead']);
  let reopened = 0; T.stub('_dlgMaybeReopen', () => { reopened++; });
  T.stub('_atIsCombatActive', () => false);
  const before = getEntity(me).carriedWeight;
  await openLootModal(me, b);
  T.eq(_lootState.items.map(i => [i.name, i.qty, i.held]), [['Mace', 1, true], ['Torch', 2, false]]);
  await lootTake(0);
  await lootTake(_lootState.items.findIndex(i => i.name === 'Torch'));
  T.eq(T.row(body).weapons, []); T.eq(T.row(body).equipment, [{ name: 'Torch', qty: 1, unitWt: 1 }]);
  T.eq(T.row(body).held_items, { right: null, left: null }, 'the mace leaves both of the body\'s hands');
  T.eq(T.row(me).weapons.map(w => w.name), ['Mace']); T.eq(T.row(me).equipment, [{ name: 'Torch', qty: 2, unitWt: 1 }]);
  T.eq(T.row(me).held_items, { right: 'Torch' }, 'loot goes to the pack, not the hand');
  T.near(getEntity(me).carriedWeight - before, 7);
  T.ok(document.getElementById('loot-modal'), 'out of combat the list stays open');
  lootClose();
  T.ok(!document.getElementById('loot-modal')); T.eq(reopened, 1); T.eq(rec.log.length, 2);
});
test('Loot', 'in combat one item closes the list; a refused write changes nothing', async T => {
  T.map(); T.fakeWrites();
  const me = T.char('looter'), body = T.char('body', { weapons: [{ name: 'Mace', wt: 6 }, { name: 'Dagger', wt: 1 }] });
  const b = T.token('T_b', 14, 10, 'character', 'T_body', ['dead']);
  T.stub('_dlgMaybeReopen', () => {}); T.stub('atClearSlot', () => {});
  T.stub('_atIsCombatActive', () => true);
  await openLootModal(me, b);
  await lootTake(0);
  T.ok(!document.getElementById('loot-modal'), 'the list should close after one item in combat');
  T.eq(T.row(me).weapons.length, 1); T.eq(T.row(body).weapons.length, 1);
  // no permission to change the body
  T.stub('updateEntity', async () => false);
  await openLootModal(me, b);
  await lootTake(0);
  T.eq(T.row(me).weapons.length, 1, 'looter must not gain an item the body kept');
  lootClose();
});

// ── Hands ────────────────────────────────────────────────────────────────────
test('Hands', 'letting go of a two-handed item with one hand keeps it in the other, nothing hits the ground', async T => {
  T.fakeWrites();
  const ref = T.char('fighter', { weapons: [{ name: 'Mace', wt: 6 }], held_items: { right: 'Mace', left: 'Mace' } });
  let dropped = 0; T.stub('dropItemOnMap', async () => { dropped++; });
  T.stub('_entityToken', () => ({ id: 'tk' }));
  await dropHeldItem(ref, 'right');
  T.eq(T.row(ref).held_items, { right: null, left: 'Mace' }); T.eq(T.row(ref).weapons.length, 1); T.eq(dropped, 0);
  await dropHeldItem(ref, 'left');
  T.eq(T.row(ref).held_items, { right: null, left: null }); T.eq(T.row(ref).weapons.length, 0); T.eq(dropped, 1);
});

test('Hands', 'the Loadout page hand selectors set what is held, and show a two-handed grip', async T => {
  const wl = document.getElementById('weapon-list'), before = wl.innerHTML;
  const r = document.getElementById('ps-hand-right'), l = document.getElementById('ps-hand-left');
  const prev = [r.value, l.value];
  try {
    _appendWeaponRow({ name: 'T_TestBlade', damage: '', wt: 3, reach: '' });
    buildHandSelectors(); buildHandFields();
    const sel = side => document.querySelector(`#hand-fields select[data-hand="${side}"]`);
    T.ok(sel('right') && sel('left'), 'both hand selectors should be on the Loadout page');
    T.ok([...sel('right').options].some(o => o.value === 'T_TestBlade'), 'carried weapon should be offered');
    setLoadoutHand('right', 'T_TestBlade');
    T.eq(getHeldItems().right, 'T_TestBlade');
    T.eq(sel('right').value, 'T_TestBlade', 'selector should show the new choice');
    setLoadoutHand('left', 'T_TestBlade');
    T.ok(/two-handed/i.test(document.getElementById('hand-fields').textContent), 'one copy in both hands is a two-handed grip');
    setLoadoutHand('right', ''); setLoadoutHand('left', '');
    T.eq(getHeldItems(), { right: '', left: '' });
  } finally {
    wl.innerHTML = before; buildHandSelectors(); r.value = prev[0]; l.value = prev[1]; recalc(); buildHandFields();
  }
});

// ── Token health rings ───────────────────────────────────────────────────────
test('Rings', 'the Toughness ring shows the fraction left, and damage pops a number', async T => {
  T.map();
  const ref = T.char('hurt');
  const tok = T.token('T_r', 50, 50, 'character', 'T_hurt');
  const el = document.createElement('div'); el.id = 'token-T_r'; document.body.appendChild(el);
  T.stub('getTokenSize', () => 40);
  delete _hpSeen['T_r'];
  const tMax = Math.max(1, Math.round(getEntity(ref).baseAttrs.Toughness ?? 10));
  const frac = () => {
    const c = el.querySelector('.token-hp circle[stroke="#4a9cf0"]');
    if (!c) return 0;
    const [a, b] = c.getAttribute('stroke-dasharray').split(/[ ,]+/).map(Number);
    return a / b;
  };
  _updateTokenRing('T_r');
  T.near(frac(), 1, 0.001, 'unhurt');
  T.ok(!el.querySelector('.dmg-pop'), 'no number on first sight');
  const hit = Math.max(1, Math.floor(tMax / 2));
  T.row(ref).damage = { toughness: hit, stamina: 0, blood: 0, quintessence: 0 };
  _updateTokenRing('T_r');
  T.near(frac(), 1 - hit / tMax, 0.001, 'after a hit');
  T.eq(el.querySelector('.dmg-pop')?.textContent, '-' + hit);
  T.ok(!el.querySelector('.token-hp circle[stroke="#e04848"]'), 'no Blood ring until Blood is lost');
});
test('Rings', "players do not see monsters' rings", async T => {
  T.map();
  const tok = T.token('T_m', 50, 50, 'creature', 'Em');
  const el = document.createElement('div'); el.id = 'token-T_m'; document.body.appendChild(el);
  T.stub('isGM', () => false);
  _updateTokenRing('T_m');
  T.ok(!el.querySelector('.token-hp'));
});

test('Loot', 'the loot chip under a hand needs that hand bare and a lootable body next to you', async T => {
  T.map();
  const me = T.token('T_me', 50, 50, 'character', 'T_me');
  const ref = T.char('me');
  const body = T.token('T_body', 52, 50, 'creature', 'T_body');
  let conds = new Set(['unconscious']);
  T.stub('getConditions', id => id === body.id ? conds : new Set());
  T.stub('_pathFindToken', () => me);
  T.stub('getEntity', () => ({ held: { right: '', left: 'Sword' } }));
  T.stub('_pctDistFt', () => 5);
  T.eq(_lootHandRefusal(ref, 'right'), '', 'bare right hand next to an unconscious body is fine');
  T.ok(/holding Sword/.test(_lootHandRefusal(ref, 'left')), 'a full hand says what it holds');
  conds = new Set();
  T.ok(/bare hand/.test(_lootHandRefusal(ref, 'right')), 'no lootable body: says what is needed');
  conds = new Set(['dead']); T.stub('_pctDistFt', () => 40);
  T.ok(_lootHandRefusal(ref, 'right') !== '', 'too far away');
});
