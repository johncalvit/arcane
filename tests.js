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

test('Techniques', 'Whirlwind exists for exactly the five weapon types and is found by weapon name', async T => {
  const ws = TECHNIQUES.filter(t => t.whirlwind && !t.classes); // the Monk's Tornado is class-locked and tested under Monk
  T.eq(ws.map(t => t.weaponType).sort().join(), ['Flail', 'Greatsword', 'Polearm', 'Scimitar', 'Staff'].join());
  const sword = ws.find(t => t.weaponType === 'Greatsword');
  T.ok(_techniqueWhirlwind([sword.id], 'Greatsword'), 'owner of the technique');
  T.eq(_techniqueWhirlwind([], 'Greatsword'), null, 'not owned');
  T.eq(_techniqueWhirlwind([sword.id], 'Dagger'), null, 'wrong weapon type');
});
test('Techniques', 'Whirlwind: targets in reach (allies too, not self, not anyone on the ground), stamina up front, one swing each', async T => {
  T.map();
  const me = T.token('T_me', 50, 50, 'character', 'T_me');
  const a = T.token('T_a', 51, 50, 'character', 'T_a');       // an ally, in reach
  const b = T.token('T_b', 50, 51, 'creature', 'T_b');        // a monster, in reach
  const far = T.token('T_far', 90, 90, 'creature', 'T_far');  // out of reach
  const dead = T.token('T_dead', 50, 49, 'creature', 'T_dead');
  const prone = T.token('T_prone', 49, 50, 'creature', 'T_prone'), out = T.token('T_out', 49, 49, 'creature', 'T_out');
  T.stub('getTokenSize', () => 0);
  T.stub('_pathFindToken', () => me);
  T.stub('getConditions', id => id === dead.id ? new Set(['dead']) : id === prone.id ? new Set(['prone']) : id === out.id ? new Set(['unconscious']) : new Set());
  T.stub('_pctDistFt', () => 3);
  const reachFt = 6 * 0 + 1000 / (mapScalePPF || 1); // wide enough for the near tokens, nothing like 90% away
  const ids = _whirlTargets('char::T_me', 12);
  T.ok(ids.includes(a.id) && ids.includes(b.id), 'ally and monster are swept');
  T.ok(!ids.includes(me.id) && !ids.includes(dead.id) && !ids.includes(far.id), 'not self, the dead, or the far');
  T.ok(!ids.includes(prone.id) && !ids.includes(out.id), 'bodies that are prone or unconscious are skipped');
  // stamina check and the swing chain
  const swings = [];
  T.stub('showToast', () => {});
  T.stub('logCombat', () => {});
  T.stub('_whirlTargets', () => [a.id, b.id]);
  T.stub('_whirlEnd', () => { _whirl = null; });
  T.stub('enterAttackMode', () => {});
  T.stub('exitAttackMode', () => {});
  T.stub('attackTokenClick', id => { swings.push([id, attackWhirl && attackWhirl.n, attackWhirl && attackWhirl.last]); return true; });
  let stam = 1;
  T.stub('getEntity', () => ({ name: 'Me', attrs: { Stamina: stam }, damage: { stamina: 0 } }));
  T.eq(startWhirlwind('char::T_me', 'Greatsword', 'Slash', 4), false, 'one Stamina is not enough for two targets');
  T.eq(swings.length, 0);
  stam = 5;
  T.eq(startWhirlwind('char::T_me', 'Greatsword', 'Slash', 4), true);
  T.eq(JSON.stringify(swings), JSON.stringify([[a.id, 2, false]]), 'first swing carries n=2');
  _whirlNext();
  T.eq(JSON.stringify(swings[1]), JSON.stringify([b.id, 2, true]), 'second swing is flagged last');
});
test('Techniques', 'Numb and Lunge exist for exactly their weapon types', async T => {
  const types = f => TECHNIQUES.filter(t => t[f]).map(t => t.weaponType).sort().join();
  T.eq(types('numb'), ['Club', 'Staff', 'Whip'].join());
  T.eq(types('lunge'), ['Knife', 'Longsword', 'Rapier', 'Short Sword'].join());
  const numb = TECHNIQUES.find(t => t.numb && t.weaponType === 'Whip');
  T.ok(_techniqueFlag([numb.id], 'Whip', 'numb'), 'found by weapon');
  T.eq(_techniqueFlag([numb.id], 'Club', 'numb'), null, 'a different weapon type');
});
test('Techniques', 'Numb: arm and leg Fumble/Slow chances use the d10 even when armor soaked the hit', async T => {
  T.stub('_partRole', (bt, part) => part);
  const base = { toughnessMax: 10, finalDamage: 0, damageType: 'slash', bodyType: 'Humanoid', numbDmg: 10 };
  T.near(_locEffectChance('fumble', Object.assign({ hitPart: 'arm' }, base)), 1, 0.001, 'd10 of 10 on a 10 Toughness target');
  T.near(_locEffectChance('slowed', Object.assign({ hitPart: 'leg' }, base, { numbDmg: 5 })), 0.5, 0.001);
  T.near(_locEffectChance('stunned', Object.assign({ hitPart: 'head' }, base)), 0, 0.001, 'heads are not affected');
  T.near(_locEffectChance('fumble', Object.assign({ hitPart: 'arm' }, base, { finalDamage: 8, numbDmg: 3 })), 0.8, 0.001, 'real damage counts when higher');
  const eff = HIT_EFFECTS.find(e => e.key === 'fumble');
  T.stub('_armHasItem', () => true);
  T.ok(eff.gate(Object.assign({ hitPart: 'arm', conds: new Set() }, base)), 'gate opens on a 0-damage Numb hit');
  T.ok(!eff.gate(Object.assign({ hitPart: 'arm', conds: new Set() }, base, { numbDmg: 0 })), 'but not without Numb');
});
test('Techniques', 'Lunge: a Sentinel does not react to a lunger, and attacking it uses up the stance', async T => {
  T.map();
  const mover = T.token('m', 40, 50, 'creature', 'Em');
  const sent = T.token('s', 50, 50, 'creature', 'Es', ['sentinel']);
  T.stub('_pathFindToken', cid => cid === 'creature::m' ? mover : sent);
  T.stub('_isEnemyOf', () => true);
  T.stub('_sentinelCanReact', () => true);
  T.stub('logCombat', () => {});
  T.stub('_sentinelZoneCheck', (w, x, y) => x >= 45); // entering from x=40 toward 50
  const run = lunging => { T.stub('_isLunging', () => lunging); return _findSentinelCrossings('creature::m', { x_pct: 40, y_pct: 50 }, { x_pct: 50, y_pct: 50 }, false); };
  T.stub('_sentinelMeleeReachFt', () => 6);
  _lungedPast = {};
  T.eq(run(false).length, 1, 'no lunge: the sentinel reacts');
  T.eq(run(true).length, 0, 'lunging: bypassed whatever the reach');
  const rec = _lungedPast['creature::m'];
  T.ok(rec && rec.sentinels.has('creature::s'), 'the sentinel is remembered for the attack');
  T.ok(!_consumeLungedSentinel('creature::m', 'creature::other'), 'an unrelated target does not use up a stance');
  T.ok(_consumeLungedSentinel('creature::m', 'creature::s'), 'attacking it uses up its stance');
  T.ok(!_consumeLungedSentinel('creature::m', 'creature::s'), 'only once');
  _lungedPast = {};
});

test('App integrity', 'update prompt: reads the published VERSION and only shows for a different one', async T => {
  const html = await (await fetch('index.html?_=' + Date.now(), { cache: 'no-store' })).text();
  T.eq(_newVersionFromHtml(html), VERSION, 'the published page names the running version');
  document.getElementById('update-banner')?.remove();
  _showUpdateBanner(VERSION);
  T.ok(!document.getElementById('update-banner'), 'same version: no banner');
  _showUpdateBanner('v9.9.9');
  T.ok(document.getElementById('update-banner') && /v9\.9\.9/.test(document.getElementById('update-banner').textContent), 'newer version: banner');
  document.getElementById('update-later').click();
  T.ok(!document.getElementById('update-banner'), 'dismissed');
  _showUpdateBanner('v9.9.9');
  T.ok(!document.getElementById('update-banner'), 'stays dismissed for that version');
  _showUpdateBanner('v9.9.10');
  T.ok(document.getElementById('update-banner'), 'a still newer version brings it back');
  document.getElementById('update-banner')?.remove(); _updateDismissedFor = '';
});

test('Placement', 'dropped tokens cluster at the center without stacking', async T => {
  T.map();
  T.stub('viewportCenterPlacement', () => ({ x_pct: 50, y_pct: 50 }));
  const saveTokens = mapTokens, saveMap = activeMapId;
  activeMapId = 'm1'; mapTokens = {}; _recentDrops = [];
  const placed = [];
  for (let i = 0; i < 7; i++) {
    const p = clusteredCenterPlacement();
    placed.push(p);
    mapTokens['t' + i] = { id: 't' + i, map_id: 'm1', x_pct: p.x_pct, y_pct: p.y_pct };
  }
  mapTokens = saveTokens; activeMapId = saveMap; _recentDrops = [];
  T.near(placed[0].x_pct, 50, 0.01, 'first token sits at the center');
  let minD = 1e9, maxD = 0;
  for (let i = 0; i < 7; i++) {
    maxD = Math.max(maxD, Math.hypot(placed[i].x_pct - 50, placed[i].y_pct - 50) * 10);
    for (let j = i + 1; j < 7; j++) minD = Math.min(minD, Math.hypot(placed[i].x_pct - placed[j].x_pct, placed[i].y_pct - placed[j].y_pct) * 10);
  }
  T.ok(minD >= TOKEN_SIZE * 0.8, 'no two tokens overlap (min gap ' + minD.toFixed(1) + 'px)');
  T.ok(maxD <= TOKEN_SIZE * 1.3, 'seven tokens stay within one ring of the center');
});

test('Items tool', 'the picker lists weapons, equipment and consumables, and a placed item is a normal ground item', async T => {
  const cat = _itemToolCatalog();
  T.eq(cat.map(g => g.group).join(), 'Weapons,Equipment,Consumables', 'three groups');
  T.ok(cat[0].names.includes('Sword, Long') && cat[1].names.length > 3 && cat[2].names.length > 0, 'each group has items');
  const inserted = [];
  const savedTokens = mapTokens, savedMap = activeMapId, savedCamp = currentCampaignId;
  activeMapId = 'm1'; currentCampaignId = 'c1';
  T.stub('upsertTokenElement', () => {}); T.stub('refreshTokenPanel', () => {});
  T.stubObj(sb, 'from', () => ({ insert: row => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { ...row, id: 'tk1' }, error: null }) }) }; } }));
  try {
    await _placeItemAt('Sword, Long', 40, 60);
    const row = inserted[0];
    T.eq(row.entity_type, 'item'); T.eq(row.label, 'Sword, Long'); T.eq(row.x_pct, 40);
    const payload = JSON.parse(row.conditions[0].slice(5));
    T.eq(payload.kind, 'weapon', 'a weapon is carried as a weapon');
    T.eq(payload.record.name, 'Sword, Long');
    await _placeItemAt(cat[1].names[0], 10, 10);
    T.eq(JSON.parse(inserted[1].conditions[0].slice(5)).kind, 'equipment', 'equipment is carried as equipment');
  } finally { mapTokens = savedTokens; activeMapId = savedMap; currentCampaignId = savedCamp; }
});

test('Preferences', 'quick roll and active-character centering: defaults, saved to the account, and quick roll follows the preference', async T => {
  const saved = currentUser, savedLs = (() => { try { return localStorage.getItem('gt_quickroll'); } catch (e) { return null; } })();
  try { localStorage.removeItem('gt_quickroll'); } catch (e) {}
  const sent = [];
  T.stubObj(sb.auth, 'updateUser', async arg => { sent.push(arg); return { data: { user: Object.assign({}, currentUser, { user_metadata: Object.assign({}, currentUser.user_metadata, arg.data) }) }, error: null }; });
  currentUser = { id: 'u', email: 'x@y.z', user_metadata: {} };
  T.eq(_prefGet('quick_roll'), false, 'quick roll is off by default');
  T.eq(_prefGet('center_active'), true, 'centering is on by default');
  T.eq(await _prefSet('center_active', false), true, 'saving works');
  T.eq(_prefGet('center_active'), false, 'now off');
  T.eq(sent[0].data.prefs.center_active, false, 'sent to the account');
  await _prefSet('quick_roll', true);
  T.eq(_rollerQuick(), true, 'the roller follows the preference');
  T.eq(sent[1].data.prefs.center_active, false, 'saving one preference keeps the other');
  currentUser = saved;
  try { savedLs === null ? localStorage.removeItem('gt_quickroll') : localStorage.setItem('gt_quickroll', savedLs); } catch (e) {}
});

test('Ammunition', 'bows use Arrows, crossbows use Bolts; a bundle opens into single rounds and each shot spends one; creatures are untracked', async T => {
  T.eq(_ammoTypeFor('Bow, Hunting').key, 'Arrows'); T.eq(_ammoTypeFor('Crossbow, Light').key, 'Crossbow Bolts');
  T.eq(_ammoTypeFor('Dart'), null, 'darts and javelins are thrown, not shot'); T.eq(_ammoTypeFor('Sling Stone'), null);
  { const at = _ammoTypeFor('Bow, War 50 Pounds'), bt = _ammoTypeFor('Crossbow, Light');
    T.eq(_ammoCountIn([{ name: 'War Arrow', qty: 1 }, { name: 'War Arrow', qty: 2 }, { name: 'Quiver', qty: 1 }, { name: 'Arrows (×20)', qty: 1 }], at), 23, 'custom arrow names count, bundles too');
    T.eq(_ammoCountIn([{ name: 'Iron Bolt', qty: 5 }, { name: 'War Arrow', qty: 9 }], bt), 5, 'bolts are separate from arrows'); }
  T.eq(_ammoTypeFor('Bow, War 50 Pounds').key, 'Arrows'); T.eq(_ammoTypeFor('Composite Bow').key, 'Arrows'); T.eq(_ammoTypeFor('Longbow').key, 'Arrows');
  T.eq(_ammoTypeFor('Heavy Crossbow').key, 'Crossbow Bolts'); T.eq(_ammoTypeFor('Arbalest').key, 'Crossbow Bolts'); T.eq(_ammoTypeFor('Bowie Knife'), null);
  const row = { equipment: [{ name: 'Arrows (×20)', qty: 2, unitWt: 2 }, { name: 'Backpack', qty: 1, unitWt: 2 }] };
  T.stub('_entityCacheRow', () => row);
  T.stub('_syncOwnBuilder', () => {});
  T.stub('updateEntity', async (ref, patch) => { Object.assign(row, patch); return true; });
  T.eq(_ammoInfoForRef('char::a', 'Bow, War').count, 40, 'two bundles of 20');
  T.eq(_ammoInfoForRef('creature::x', 'Bow, War'), null, 'creatures are not tracked');
  T.eq(_ammoInfoForRef('char::a', 'Sword, Long'), null, 'only projectile weapons');
  T.eq(await _spendAmmo('char::a', 'Bow, War'), true);
  T.eq(_ammoInfoForRef('char::a', 'Bow, War').count, 39, 'one arrow gone');
  const single = row.equipment.find(e => e.name === 'Arrows');
  T.eq(single.qty, 19, 'the opened bundle became 19 single arrows'); T.near(single.unitWt, 0.1, 0.001, 'at a twentieth of the bundle weight');
  T.eq(row.equipment.find(e => e.name === 'Arrows (×20)').qty, 1, 'one sealed bundle left');
  for (let i = 0; i < 38; i++) await _spendAmmo('char::a', 'Bow, War');
  T.eq(_ammoInfoForRef('char::a', 'Bow, War').count, 1, 'down to the last arrow');
  T.eq(await _spendAmmo('char::a', 'Bow, War'), true);
  T.eq(_ammoInfoForRef('char::a', 'Bow, War').count, 0);
  T.ok(!row.equipment.some(e => /Arrows/.test(e.name)), 'the empty stack is removed');
  T.eq(await _spendAmmo('char::a', 'Bow, War'), false, 'nothing left to fire');
  T.ok(row.equipment.some(e => e.name === 'Backpack'), 'other gear untouched');
});

test('Web', 'a web holds its target until it breaks free; strength scales with the spinner; a stronger web wins; fire burns it away', async T => {
  T.eq(_webStrength({ attrs: { Power: 80 } }, 'natural'), 80, 'a natural web is as strong as the spider\'s Power');
  T.eq(_webStrength({ attrs: { Power: 5 } }, 'natural'), WEB.minStrength, 'a weak spinner still holds');
  T.eq(_webStrength({ attrs: { Quintessence: 55, Power: 10 } }, 'spell'), 55, 'a spell web is as strong as the caster\'s Quintessence');
  T.token('v', 50, 50, 'creature', 'V', []);
  T.stub('_atSharedRound', () => 3);
  T.stub('setConditions', async (id, ch) => {
    const t = mapTokens[id], set = new Set(t.conditions);
    for (const [c, on] of ch) on ? set.add(c) : set.delete(c);
    t.conditions = [...set];
  });
  await applyWeb('v', 60);
  T.ok(mapTokens.v.conditions.includes('webbed') && mapTokens.v.conditions.includes('web:60:3'), 'webbed with its strength and round');
  await applyWeb('v', 40);
  T.eq(mapTokens.v.conditions.filter(c => c.startsWith('web:')).join(), 'web:60:3', 'a weaker second web does not loosen the first');
  await applyWeb('v', 90);
  T.eq(mapTokens.v.conditions.filter(c => c.startsWith('web:')).join(), 'web:90:3', 'a stronger one tightens it, and there is still only one marker');
  await applyWeb('v', 60); // (stays 90)
  mapTokens.v.conditions = ['webbed', 'web:60:3'];
  const strong = { attrs: { Power: 60 }, baseAttrs: { Power: 60 } }, weak = { attrs: { Power: 20 }, baseAttrs: { Power: 20 } };
  T.eq(_recoverTarget(strong, 'v', 'webbed').pct, 50, 'equal Power and web strength: even odds');
  T.eq(_recoverTarget(weak, 'v', 'webbed').pct, 25, 'a weaker victim struggles longer');
  T.stub('_atSharedRound', () => 5);
  T.eq(_recoverTarget(weak, 'v', 'webbed').pct, 45, 'two more rounds stuck: +10% each');
  T.eq(_recoverTarget({ attrs: { Power: 1 }, baseAttrs: { Power: 1 } }, 'v', 'webbed').pct >= WEB.floorPct, true, 'never below the floor');
  const a = _clipRoute([{ x_pct: 10, y_pct: 10 }, { x_pct: 20, y_pct: 10 }], { stuck: true });
  T.eq(a.points.length, 1, 'a webbed token cannot move'); T.eq(a.stop, 'web');
  T.eq(_clipRoute([{ x_pct: 10, y_pct: 10 }, { x_pct: 20, y_pct: 10 }], {}).points.length, 2, 'free to move without it');
  const s = new Set(['webbed', 'web:60:3', 'prone']); _burnAwayWeb(s);
  T.eq([...s].join(), 'prone', 'fire burns the web away');
  T.ok(SPELLS.concat(DEFAULT_SPELLS).some(x => x.name === 'Web' && x.setsCondition === 'webbed'), 'the Web spell exists');
  T.ok(DEFAULT_MELEE_WEAPONS.some(x => x.weapon === 'Spinnerets' && x.webs > 0 && x.naturalSlot === 'tail'), 'Spinnerets is a natural weapon that webs');
  T.eq(DEFAULT_RACE_DATA['Giant Spider'].BodyType, 'Insect');
  T.ok(DEFAULT_ENCHANTMENTS.some(x => x.spell === 'Web'), 'an enchantment casts it');
});

test('Grenade', 'Molotov, Bottled Lightning and Acid Vial are throwables with their own damage type and a condition on a failed save', async T => {
  const want = { 'Molotov Cocktail': ['burn', 'burning'], 'Bottled Lightning': ['shock', 'stunned'], 'Acid Vial': ['corrode', 'corroding'] };
  for (const [name, [cat, cond]] of Object.entries(want)) {
    const c = DEFAULT_CONSUMABLES.find(x => x.name === name);
    T.ok(c, name + ' exists');
    const g = _grenadeSpell(c);
    T.eq(g.damageCategory, cat, name + ' damage type'); T.eq(g.setsCondition, cond, name + ' condition');
    T.ok(g.secondaryChance > 0 && g.secondaryChance <= 100, name + ' chance'); T.eq(g.blowback, 0, name + ' does not throw bodies about');
    T.ok(_isBlastSpell(g), name + ' resolves as a blast (halves on a save)');
    T.ok(CONDITION_DEFS.some(d => d.key === cond), cond + ' is a real condition');
  }
  T.eq(_grenadeSpell(DEFAULT_CONSUMABLES.find(x => x.name === 'Arcane Grenade')).setsCondition, '', 'the Arcane Grenade sets none');
});

// ── Full-body figure ─────────────────────────────────────────────────────────
test('Figure', 'a full-body figure shows to the GM and owner always, to others only while the token is fully visible', async T => {
  T.token('T_figtok', 10, 10, 'creature');
  const el = document.createElement('div');
  el.id = 'token-T_figtok';
  document.body.appendChild(el); // T._end removes [id^="token-T_"]
  const mk = over => Object.assign({ type: 'creature', tokenId: 'T_figtok', figureUrl: 'a/b.webp' }, over);

  T.stub('isGM', () => false);
  T.ok(_figureShown(mk(), false), 'a fully visible token shows it');
  el.classList.add('token-shadow');
  T.ok(!_figureShown(mk(), false), 'a shadow in the dark hides it');
  el.classList.remove('token-shadow');
  el.style.display = 'none';
  T.ok(!_figureShown(mk(), false), 'a token out of sight hides it');
  T.ok(_figureShown(mk(), true), "the owner's own sheet always shows it");
  T.ok(!_figureShown(mk({ tokenId: null }), false), 'a creature that is not on the map shows nothing');
  T.ok(_figureShown(mk({ tokenId: null, type: 'char' }), false), 'a party character who is not on the map still shows it');
  T.stub('isGM', () => true);
  T.ok(_figureShown(mk(), false), 'the GM always sees it');

  T.stub('isGM', () => false);
  T.eq(_paFigureHtml(mk({ figureUrl: '' }), false), '', 'no image, no card');
  el.style.display = '';
  T.ok(_paFigureHtml(mk(), false).includes('pa-figure'), 'a visible token renders the figure card');
});

// ── Monk ─────────────────────────────────────────────────────────────────────
test('Monk', 'the Monk class, its class-locked techniques, the bare-handed Block / Iron Fist unlocks and Soul Armor', async T => {
  T.ok(TECHNIQUE_CLASSES.includes('Monk'), 'Monk is a class');
  T.eq(DEFAULT_TECHNIQUE_ALLOWANCE.Monk, 2, 'a Monk gets 2 techniques per level');
  const ids = ['monk-block-1', 'monk-block-2', 'monk-block-3', 'monk-iron-fist', 'monk-soul-armor', 'monk-tornado'];
  for (const id of ids) T.ok(DEFAULT_TECHNIQUES.some(x => x.id === id), id + ' is a default technique');
  const lvl = id => DEFAULT_TECHNIQUES.find(x => x.id === id).minLevel;
  T.eq(lvl('monk-iron-fist'), 2, 'Iron Fist is level 2'); T.eq(lvl('monk-soul-armor'), 3, 'Soul Armor is level 3'); T.eq(lvl('monk-tornado'), 4, 'Tornado is level 4');
  const th = id => DEFAULT_TECHNIQUES.find(x => x.id === id);
  T.ok(_techAvailableToClass(th('monk-tornado'), 'Monk'), 'a Monk can choose Tornado');
  T.ok(!_techAvailableToClass(th('monk-tornado'), 'Warrior'), 'a Warrior cannot');
  T.ok(_techAvailableToClass(th('unarmed-1'), 'Warrior'), 'a normal technique stays open to every class');

  const row = (w, a) => MELEE_WEAPONS.find(r => r.weapon === w && r.action === a);
  const block = row('Bare Handed', 'Block'), fist = row('Bare Handed', 'Iron Fist');
  T.ok(block && block.reqTechnique === 'monk-block-1', 'the default bare-handed Block requires Monk Block I');
  T.ok(fist && fist.reqTechnique === 'monk-iron-fist' && fist.damageType === 'crush', 'the default Iron Fist requires its technique and is Smash damage');
  T.ok(!_rowUnlocked([], block), 'no technique, no bare-handed Block');
  T.ok(_rowUnlocked(['monk-block-1'], block), 'Monk Block I unlocks it');
  T.ok(!_rowUnlocked(['monk-block-2'], block), 'tier II alone does not');
  T.ok(!_rowUnlocked([], fist) && _rowUnlocked(['monk-iron-fist'], fist), 'Iron Fist needs its technique');
  T.ok(!_rowUnlocked(null, fist), 'a monster (no techniques) never gets it');
  T.ok(_rowUnlocked([], row('Bare Handed', 'Smash')) && _rowUnlocked(null, { weapon: 'Sword, Long', action: 'Slash' }), 'rows without a Req. Technique are open to everybody');
  T.ok(_rowUnlocked(['x-1'], { weapon: 'Knife', action: 'Backstab', reqTechnique: 'x-1' }), 'any weapon can have a technique-only action');
  T.eq(_rowDamageCategory({ damageType: 'burn' }, 'Slash'), 'burn', 'a set Damage Type wins over the action name');
  T.eq(_rowDamageCategory({}, 'Slash'), 'slash', 'blank: guessed from the name (slash)');
  T.eq(_rowDamageCategory({}, 'Iron Fist'), 'crush', 'blank: anything unrecognised is smash');

  T.eq(_soulArmorType(['monk-soul-armor'], 'None'), 'Soul Armor', 'a bare body area gets Soul Armor');
  T.eq(_soulArmorType(['monk-soul-armor'], 'Steel Plate'), 'Steel Plate', 'worn armor wins');
  T.eq(_soulArmorType([], 'None'), 'None', 'without the technique nothing changes');
  T.ok(getArmorDR('Soul Armor', 'slash') > 0, 'Soul Armor has protection');
  T.ok(!ARMOR_PIECES.some(p => p.material === 'Soul Armor'), 'Soul Armor is not sold as a piece');

  T.eq(_techniqueWhirlReach(['monk-tornado'], 'Bare Handed', 0), 5, 'Tornado reaches 5 ft bare-handed');
  T.eq(_techniqueWhirlReach(['monk-tornado'], 'Bare Handed', 8), 8, 'a weapon keeps its own reach');
});

// ── Wall import ──────────────────────────────────────────────────────────────
test('Walls', 'import accepts good walls, skips bad ones, and gives fresh ids', async T => {
  const good = { type: 'line', points: [{ x_pct: 10, y_pct: 10 }, { x_pct: 50, y_pct: 10 }, { x_pct: 50, y_pct: 60.5 }] };
  const txt = JSON.stringify({ format: 'grim-toll-walls', version: 1, walls: [
    good, { ...good, id: 'x' },
    { type: 'line', points: [{ x_pct: 10, y_pct: 10 }] },                                   // one point
    { type: 'line', points: [{ x_pct: -5, y_pct: 10 }, { x_pct: 20, y_pct: 10 }] },         // out of range
    { type: 'spiral', points: [{ x_pct: 1, y_pct: 1 }, { x_pct: 2, y_pct: 2 }] },           // unknown type
    { type: 'rect', points: [{ x_pct: 1, y_pct: 1 }, { x_pct: 2, y_pct: 2 }, { x_pct: 3, y_pct: 3 }] }, // rect needs 2
    { type: 'line', points: [{ x_pct: 20, y_pct: 20 }, { x_pct: 30, y_pct: 20 }], door: true, blocksVision: false },
  ] });
  const r = _wallsFromImport(txt);
  T.eq(r.walls.length, 3, 'usable count');
  T.eq(r.skipped, 4, 'skipped count');
  T.ok(r.walls[0].id !== r.walls[1].id && r.walls[1].id !== 'x', 'ids not fresh');
  T.ok(r.walls[0].blocksVision === true && r.walls[0].blocksMovement === true, 'defaults should block');
  T.ok(r.walls[2].door === true && r.walls[2].open === false && r.walls[2].blocksVision === false, 'door flags');
  T.eq(_wallsFromImport(JSON.stringify([good])).walls.length, 1, 'bare array');
  T.ok(_wallsFromImport('not json').error, 'bad json');
  T.ok(_wallsFromImport('{"a":1}').error, 'no walls list');
});

test('Walls', 'a consumable with a custom name still gets potion art', async T => {
  CONSUMABLES.push({ name: 'Zz Test Blessing', restoreToughness: 0, restoreStamina: 0, restoreBlood: 0, buffAttr: 'Quintessence', buffAmount: 2 });
  try {
    T.eq(_itemIconUrl('Zz Test Blessing'), 'icons/items/potion-4.png', 'buff potion');
    T.eq(_itemIconUrl('Healing Potion'), 'icons/items/potion-1.png', 'name match still wins');
  } finally { CONSUMABLES.pop(); }
});

test('Walls', "a player's heal on another character is handed to the GM instead of being rolled back", async T => {
  const ref = T.char('Pal', { damage: { toughness: 6, stamina: 0, blood: 0, quintessence: 0 } });
  T.stub('refreshUI', () => {}); T.stub('showToast', () => {}); T.stub('_writeErrorToast', () => { throw new Error('should not toast an error'); });
  T.stub('isGM', () => false);
  const sent = [];
  const savedCh = mapChannel; mapChannel = { send: m => sent.push(m.event) };
  T.stubObj(sb, 'from', () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }));
  try {
    const ok = await updateEntity(ref, { damage: { toughness: 1, stamina: 0, blood: 0, quintessence: 0 } });
    T.ok(ok, 'should report success');
    T.eq(T.row(ref).damage.toughness, 1, 'optimistic change kept');
    T.ok(sent.includes('entity-patch-request'), 'request to GM not sent: ' + sent);
  } finally { mapChannel = savedCh; }
});

test('Walls', "a player's wall change is flagged for the GM to save when the database refuses it", async T => {
  T.stub('isGM', () => false); T.stub('scheduleLights', () => {});
  const savedMap = activeMapId; activeMapId = 'T_map';
  const sent = [];
  const savedCh = mapChannel; mapChannel = { send: m => sent.push(m) };
  T.stubObj(sb, 'from', () => ({ update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }) }));
  try {
    await saveMapWalls();
    T.ok(sent.length && sent[0].payload.persist === true, 'persist flag missing');
  } finally { mapChannel = savedCh; activeMapId = savedMap; }
});
test('Walls', 'a roller never names a player by their email', async T => {
  T.stub('isGM', () => false);
  const savedUser = currentUser, savedChar = currentCharacterId;
  currentUser = { email: 'someone@example.com', user_metadata: {} }; currentCharacterId = null;
  try { T.ok(!/@/.test(_rollerWho()), 'email leaked: ' + _rollerWho()); } finally { currentUser = savedUser; currentCharacterId = savedChar; }
});
test('Walls', "a waivable save shows Don't resist and counts as failed", async T => {
  T.stub('_rollerBroadcast', () => {});
  let got = null;
  openRoller({ label: 'T save', target: 99, waive: true, onComplete: n => { got = n; } });
  try {
    T.eq(document.getElementById('roller-waive').style.display, 'inline-block', 'button hidden');
    _rollerWaive();
    await new Promise(r => setTimeout(r, 1700));
    T.ok(got === 100, 'waived roll should be an automatic fail, got ' + got);
    T.eq(document.getElementById('roller-result-label').textContent, 'NOT RESISTING', 'label');
  } finally { closeRoller(); }
});
test('Walls', 'Enter roll: a typed number becomes the roll, bad numbers are refused', async T => {
  T.stub('_rollerBroadcast', () => {});
  const savedOn = _rollerManualOn; _rollerManualOn = true;
  let got = null;
  openRoller({ label: 'T manual', target: 50, onComplete: n => { got = n; } });
  try {
    T.eq(_roller.phase, 'manual', 'should wait for a typed number');
    const inp = document.getElementById('roller-manual-val');
    inp.value = '150'; _rollerManualSubmit();
    T.eq(_roller.phase, 'manual', 'out-of-range number should be refused');
    inp.value = '42'; _rollerManualSubmit();
    await new Promise(r => setTimeout(r, 1700));
    T.eq(got, 42, 'typed value should be the roll');
    T.eq(document.getElementById('roller-result-label').textContent, 'SUCCESS', '42 vs 50 should succeed');
  } finally { closeRoller(); _rollerManualOn = savedOn; }
});
test('Walls', "area saves: a player may roll only their own flagged token; the auto button leaves players waiting", async T => {
  T.stub('isGM', () => false);
  const savedTok = mapTokens, savedFlags = aoeFlaggedIds, savedName = _aoeSpellName, savedChar = currentCharacterId;
  mapTokens = { a: { id: 'a', entity_type: 'character', entity_id: 'me' }, b: { id: 'b', entity_type: 'character', entity_id: 'other' } };
  aoeFlaggedIds = new Set(['a', 'b']); _aoeSpellName = 'Fireball'; currentCharacterId = 'me';
  try {
    T.ok(_aoeMyFlaggedToken('a'), 'own flagged token should be rollable');
    T.ok(!_aoeMyFlaggedToken('b'), "someone else's token should not");
  } finally { mapTokens = savedTok; aoeFlaggedIds = savedFlags; _aoeSpellName = savedName; currentCharacterId = savedChar; }
  const savedSt = aoeResolveState;
  aoeResolveState = { spell: {}, remaining: [{ id: 'p', entity_type: 'character', entity_id: 'x' }], pushes: [] };
  try { await _aoeResolveRemainingFast(false); T.eq(aoeResolveState.remaining.length, 1, 'player should still be waiting'); }
  finally { aoeResolveState = savedSt; }
});
test('Walls', 'Character Mode warns a GM when the loaded character is not the one on the map', async T => {
  T.stub('isGM', () => true);
  const s = { cc: currentCharacterId, camp: currentCampaignId, map: activeMapId, toks: mapTokens, cache: playCharCache };
  const nav = document.getElementById('gm-config-nav'), navDisp = nav && nav.style.display; if (nav) nav.style.display = 'none';
  const nameEl = document.getElementById('char-name'), savedName = nameEl.value;
  try {
    currentCharacterId = 'lv4'; currentCampaignId = 'c'; activeMapId = 'm'; nameEl.value = 'Fez';
    mapTokens = { t1: { id: 't1', entity_type: 'character', entity_id: 'lv1', label: 'Fez' } };
    playCharCache = { lv1: { name: 'Fez', stats: { XP: 0 } } };
    updateCharMapBanner();
    const el = document.getElementById('char-map-banner');
    T.ok(el.style.display !== 'none' && /different/.test(el.textContent), 'twin warning missing: ' + el.textContent);
    T.ok(/Open the one on the map/.test(el.innerHTML), 'button missing');
    mapTokens = { t1: { id: 't1', entity_type: 'character', entity_id: 'lv4', label: 'Fez' } };
    updateCharMapBanner();
    T.eq(el.style.display, 'none', 'no banner when the loaded character is on the map');
    // after leaving Play Mode the live tokens are gone; the snapshot taken at exit is used instead
    mapTokens = {}; _offPlayCharTokens = [{ entity_id: 'lv1', label: 'Fez' }];
    updateCharMapBanner();
    T.ok(el.style.display !== 'none' && /different/.test(el.textContent), 'banner should use the exit snapshot');
    _offPlayCharTokens = [];
  } finally {
    currentCharacterId = s.cc; currentCampaignId = s.camp; activeMapId = s.map; mapTokens = s.toks; playCharCache = s.cache;
    nameEl.value = savedName; if (nav) nav.style.display = navDisp; updateCharMapBanner();
  }
});
test('Walls', 'a dead token shows a small skull at its upper right and hides other condition icons', async T => {
  T.stub('getTokenSize', () => 100);
  T.stub('_dlgRefreshIfOpenFor', () => {}); T.stub('_updateTokenRing', () => {}); T.stub('scheduleLights', () => {});
  T.stub('_fogApplyTokenVisibility', () => {});
  const el = document.createElement('div');
  el.id = 'token-zz-dead'; el.innerHTML = '<span class="token-label">Zz</span>';
  document.body.appendChild(el);
  const saved = mapTokens;
  mapTokens = { 'zz-dead': { id: 'zz-dead', entity_type: 'item', conditions: ['dead', 'prone'] } };
  try {
    _refreshTokenBadges('zz-dead');
    const ov = el.querySelector('.token-cond-overlay'), img = ov && ov.querySelector('img');
    T.ok(img && img.style.width === '70px', 'skull should be 70% of the token size, got ' + (img && img.style.width));
    T.ok(/\+ 35px/.test(ov.style.left) && /- 35px/.test(ov.style.top), 'skull offset: ' + ov.style.left + ' / ' + ov.style.top);
    T.ok(Number(ov.style.zIndex) > 21, 'skull should sit above the health rings');
    T.ok(!el.querySelector('.token-label-icons'), 'other condition icons should be hidden on a dead token');
    mapTokens['zz-dead'].conditions = ['prone'];
    _refreshTokenBadges('zz-dead');
    T.ok(el.querySelector('.token-label-icons'), 'icons come back when the token is revived');
  } finally { mapTokens = saved; el.remove(); }
});
test('Walls', "a player looking at a monster sees its name, health, conditions and held items only", async T => {
  T.stub('isGM', () => false);
  T.token('zzfoe', 10, 10, 'creature', 'ZZE1', ['prone']);
  sessionCreatureCache['ZZE1'] = { id: 'ZZE1', name: 'Zz Foe', species: 'Goblin', body_type: 'Humanoid', stats: {}, skills: {}, features: {},
    damage: { toughness: 2, stamina: 0, blood: 0, quintessence: 0 }, weapons: [], equipment: [], armor: {}, held_items: { right: 'Axe, Hatchet' } };
  const el = document.createElement('div');
  const saved = currentCharacterId; currentCharacterId = 'someone-else';
  try {
    renderEntityPanel('creature::zzfoe', { container: el, header: 'mini' });
    const t = el.innerText;
    T.ok(/Zz Foe/.test(t) && /Toughness/.test(t) && /Prone/.test(t) && /Axe, Hatchet/.test(t), 'name, health, condition and held item should show: ' + t.slice(0, 200));
    T.ok(!/Quintessence/.test(t), 'no Quintessence');
    T.ok(!/Power|Day Vision|Education|Language|View All|Height|Weight/i.test(t), 'no stat sheet: ' + t.slice(0, 300));
  } finally { currentCharacterId = saved; delete sessionCreatureCache['ZZE1']; }
});
test('Walls', 'only the GM can pass a character on; the change sets the owner and the Player name', async T => {
  const sent = [];
  T.stubObj(sb, 'from', () => ({ update: p => ({ eq: () => ({ select: async () => { sent.push(p); return { data: [{ id: 'zzc', user_id: p.user_id }], error: null }; } }) }) }));
  T.stub('showToast', () => {}); T.stub('logCombat', () => {}); T.stub('buildTokensCharFilters', () => {});
  const savedCache = _tokensCharsCache, savedGm = currentCampaignGmId;
  _tokensCharsCache = [{ id: 'zzc', name: 'Zz Char', user_id: 'old', stats: { PlayerName: 'Old', Power: 5 } }];
  currentCampaignGmId = 'gmid';
  try {
    T.stub('isGM', () => false);
    T.eq(await transferCharacter('zzc', 'new', 'New Player'), false, 'a player must be refused');
    T.eq(sent.length, 0, 'nothing should be written for a player');
    T.stub('isGM', () => true);
    T.eq(await transferCharacter('zzc', 'new', 'New Player'), true, 'GM transfer');
    T.eq(sent[0].user_id, 'new', 'owner changed');
    T.eq(sent[0].stats.PlayerName, 'New Player', 'Player name follows the owner');
    T.eq(sent[0].stats.Power, 5, 'the rest of the stats are kept');
    await transferCharacter('zzc', 'gmid', 'ignored');
    T.eq(sent[1].stats.PlayerName, '', 'passing back to the GM clears the Player name');
  } finally { _tokensCharsCache = savedCache; currentCampaignGmId = savedGm; }
});
