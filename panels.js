// ═══ panels.js — unified entity panel renderer (Phase 2a, REFACTOR_SPEC.md) ═══
// One renderer for every left-panel view: own character, active combatant,
// token info (character or creature). Section builders are pure functions of
// a getEntity() view. Interactivity uses event delegation via data-pa
// attributes — no inline onclick strings built from data (see spec §2.2).
//
// Depends on globals from index.html: getEntity, ensureEntityLoaded,
// healthBarsHtml, CONDITION_DEFS, getConditions, setCondition, ATTRIBUTES,
// SKILLS, calcSkillSuccess, calcMaxSpeed, calcAttributes, getCarriedWeight,
// MELEE_WEAPONS, RANGED_WEAPONS, normalizeWeaponName, calcHitValue,
// atCombatants, _newSlots, _atSharedRound, _atIsCombatActive, _atSharedActive,
// _atStateFromGM, atRollInitiative, atOpenSlotModal, atClearSlot,
// atAcceptAction, openRoller, isGM, currentCharacterId, playCharCache,
// sessionCreatureCache, mapTokens, resolveAvatarUrl, backToMyCharacter,
// _playSetHand, _acSetHand, _pathFindToken, getLoadoutItemNames.

function _paEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Collapsible section. Header toggles the body via delegation (data-pa).
function _paSection(title, content) {
  return `
    <div style="margin-bottom:6px;border:1px solid var(--border);border-radius:4px;overflow:hidden;">
      <div data-pa="collapse"
           style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;cursor:pointer;background:var(--bg3);font-size:0.66rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);">
        ${title}<span style="font-size:0.7rem;opacity:0.5;">▾</span>
      </div>
      <div style="padding:6px 8px;">${content}</div>
    </div>`;
}

// ── Section builders ──────────────────────────────────────────────────────────

function _paSecHealth(ent, canEdit) {
  // Players never see monster health (original design rule)
  if (ent.type !== 'char' && !isGM()) return '';
  const entityType = ent.type === 'char' ? 'character' : 'creature';
  const html = canEdit
    ? healthBarsHtml(ent.attrs.Toughness, ent.attrs.Stamina, ent.damage, entityType, ent.id)
    : healthBarsHtml(ent.attrs.Toughness, ent.attrs.Stamina, ent.damage);
  return _paSection('Health', html);
}

function _paSecConditions(ent) {
  if (!ent.tokenId) return _paSection('Conditions',
    `<div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">No token on map.</div>`);
  const canEdit = isGM();
  const active = ent.conditions;
  const chips = CONDITION_DEFS.map(def => {
    const on = active.has(def.key);
    const style = on
      ? `background:${def.color}22;border-color:${def.color};color:${def.color};`
      : `background:var(--bg3);border-color:var(--border);color:var(--text-dim);`;
    const pa = canEdit
      ? `data-pa="cond" data-token="${_paEsc(ent.tokenId)}" data-key="${def.key}" data-on="${on ? 0 : 1}"`
      : '';
    return `<div title="${_paEsc(def.desc)}" ${pa}
      style="display:flex;align-items:center;gap:5px;padding:4px 8px;border-radius:4px;border:1px solid;font-size:0.72rem;${style}${canEdit ? 'cursor:pointer;' : 'cursor:default;'}user-select:none;">
      <span>${def.icon}</span><span>${def.label}</span></div>`;
  }).join('');
  const note = !canEdit
    ? '<div style="font-size:0.65rem;color:var(--text-dim);margin-top:4px;font-style:italic;">GM controls conditions.</div>' : '';
  return _paSection('Conditions', `<div style="display:flex;flex-wrap:wrap;gap:5px;">${chips}</div>${note}`);
}

// Combat section is now minimal: just an initiative-roll prompt, and only until
// it's rolled. Everything else (actions, done, queued readout) lives in the
// persistent active-turn banner. Players can't see the GM's right-panel
// tracker, so this is their initiative entry point; it vanishes once rolled.
function _paSecCombat(ent, canEdit, prefixHtml) {
  const c = atCombatants.find(x => x.id === ent.ref);
  if (!c || !canEdit || c.initiative != null) return '';
  return _paSection('Combat', `
    <div class="at-action-row">
      <span style="font-size:0.72rem;color:var(--text-dim);">Initiative not rolled</span>
      <button class="at-btn primary" data-pa="roll-init" data-id="${_paEsc(ent.ref)}" style="margin-left:auto;">🎲 Roll</button>
    </div>`);
}

function _paSecStats(attrs) {
  const groups = [
    { label: 'Physical',  keys: ATTRIBUTES.filter(a => a.group === 'physical') },
    { label: 'Cognitive', keys: ATTRIBUTES.filter(a => a.group === 'cognitive') },
    { label: 'Senses',    keys: ATTRIBUTES.filter(a => a.group === 'senses') },
  ];
  const content = groups.map(g => `
    <div style="margin-bottom:8px;">
      <div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:3px;">${g.label}</div>
      ${g.keys.map(a => `<div class="ps-stat-row"><span class="ps-stat-label">${a.label}</span><span class="ps-stat-val">${attrs[a.key] != null ? Math.round(attrs[a.key]) : '—'}</span></div>`).join('')}
    </div>`).join('');
  return _paSection('Stats', content);
}

function _paSecEquip(ent, attrs, canEdit, loadoutOverride) {
  const held = ent.held || {};
  let html = '';
  if (canEdit) {
    let options = loadoutOverride || ent.loadout;
    if (ent.type !== 'char') {
      options = [...new Set([
        ...MELEE_WEAPONS.map(r => r.weapon),
        ...RANGED_WEAPONS.map(r => r.weapon),
      ])].sort();
    }
    const selStyle = 'width:100%;font-size:0.78rem;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:3px;padding:3px 6px;margin-bottom:4px;font-family:Georgia,serif;';
    html += ['right', 'left'].map(side => {
      const cur = held[side] || '';
      const opts = ['', ...options].map(n =>
        `<option value="${_paEsc(n)}"${n === cur ? ' selected' : ''}>${_paEsc(n) || '— Bare Hand —'}</option>`).join('');
      return `<div style="margin-bottom:6px;">
        <div style="font-size:0.62rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;">${side === 'right' ? 'Right Hand' : 'Left Hand'}</div>
        <select style="${selStyle}" data-pa="set-hand" data-side="${side}">${opts}</select>
      </div>`;
    }).join('');
  } else {
    html += `
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:3px;">Right: <span style="color:var(--text);">${_paEsc(held.right || 'Bare Hand')}</span></div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:6px;">Left: <span style="color:var(--text);">${_paEsc(held.left || 'Bare Hand')}</span></div>`;
  }
  // Hit/damage rows for held weapons — same math for every entity
  const sizeAdj = attrs._targetAdj ?? 1;
  let rows = '';
  for (const side of ['right', 'left']) {
    const itemName = held[side];
    if (!itemName) continue;
    const norm = normalizeWeaponName(itemName);
    const wRows = [
      ...MELEE_WEAPONS.filter(r => normalizeWeaponName(r.weapon) === norm && r.damageMax > 0),
      ...RANGED_WEAPONS.filter(r => normalizeWeaponName(r.weapon) === norm),
    ];
    wRows.forEach(r => {
      const hit = calcHitValue(r.hitFormula, attrs);
      const adj = hit != null ? Math.round(hit * sizeAdj) : null;
      rows += `<div class="ps-stat-row">
        <span class="ps-stat-label">${_paEsc(r.action)} (${_paEsc(itemName)})</span>
        <span class="ps-stat-val">${adj != null ? `HIT ${adj}` : '—'}${r.damageMax ? ` · DMG ${r.damageMax}` : ''}</span></div>`;
    });
  }
  return _paSection('Equipment', html + rows);
}

function _paSecArmor(ent) {
  const labels = { head: 'Head', torso: 'Torso', rarm: 'R.Arm', larm: 'L.Arm', rleg: 'R.Leg', lleg: 'L.Leg' };
  const armor = ent.armor || {};
  const rows = Object.keys(labels).map(s =>
    `<div class="ps-stat-row"><span class="ps-stat-label">${labels[s]}</span><span class="ps-stat-val" style="font-size:0.72rem;">${_paEsc(armor[s] || 'None')}</span></div>`).join('');
  return _paSection('Armor', rows);
}

function _paSecSkills(skills, attrs) {
  const invested = Object.entries(skills || {}).filter(([, pts]) => pts > 0);
  const content = invested.length
    ? invested.map(([name, pts]) => {
        const skill = SKILLS.find(s => s.name === name);
        const pct = calcSkillSuccess(skill, attrs, pts);
        return `<div class="ps-stat-row">
          <span class="ps-stat-label" style="flex:1;">${_paEsc(name)}</span>
          <span class="ps-stat-val ps-rollable" style="min-width:36px;text-align:right;" data-pa="roll-skill" data-name="${_paEsc(name)}" data-pct="${pct}">${pct}%</span>
        </div>`;
      }).join('')
    : `<div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">No skills invested.</div>`;
  return _paSection('Skills', content);
}

// ── Event delegation ──────────────────────────────────────────────────────────
// Bound by assignment (el.onclick = …) so re-renders never stack listeners.

function _paBind(el, ctx) {
  el.onclick = (e) => {
    const t = e.target.closest('[data-pa]');
    if (!t || !el.contains(t)) return;
    const d = t.dataset;
    switch (d.pa) {
      case 'collapse': {
        const body = t.nextElementSibling;
        if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
        break;
      }
      case 'back': backToMyCharacter(); break;
      case 'cond': setCondition(d.token, d.key, d.on === '1'); break;
      case 'roll-skill': openRoller({ label: d.name, target: +d.pct, targetLabel: 'or less' }); break;
      case 'roll-init': atRollInitiative(d.id); break;
      case 'open-slot': atOpenSlotModal(d.id, d.slot); break;
      case 'clear-slot': atClearSlot(d.id, d.slot); break;
    }
  };
  el.onchange = (e) => {
    const t = e.target.closest('[data-pa="set-hand"]');
    if (!t) return;
    const side = t.dataset.side;
    const value = t.value;
    if (ctx.isOwnSheet && document.getElementById('ps-hand-' + side)) {
      _playSetHand(side, value);
    } else {
      _acSetHand(ctx.ent.type, ctx.ent.id, side, value);
    }
  };
}

// ── The renderer ──────────────────────────────────────────────────────────────
// opts: { container, header: 'back'|'self'|'mini'|'none', prefixHtml,
//         attrs, carried, name, avatar, skills, loadout, combatPrefix, canEdit }

function renderEntityPanel(ref, opts = {}) {
  const el = opts.container || document.getElementById('play-char-content');
  if (!el) return;
  const ent = getEntity(ref);
  if (!ent) {
    el.innerHTML = (opts.prefixHtml || '') +
      `<div style="color:var(--text-dim);font-size:0.8rem;">No data for this entity.</div>`;
    return;
  }
  const canEdit = opts.canEdit ?? (isGM() || (ent.type === 'char' && ent.id === currentCharacterId));
  const attrs   = opts.attrs  || ent.attrs;
  const skills  = opts.skills || ent.skills;
  const name    = opts.name   || ent.name || '—';
  const isOwnSheet = ent.type === 'char' && ent.id === currentCharacterId;

  const speed = calcMaxSpeed(attrs, opts.carried || 0);
  const speedStr = speed != null ? Math.round(speed) + ' ft/s' : '—';
  const sizeStr = attrs._targetAdj != null ? attrs._targetAdj : '—';
  const sub = [ent.species, ent.bodyType].filter(Boolean).join(' · ');

  let headerHtml = '';
  if (opts.header === 'back' || opts.header === 'self') {
    const backBtn = opts.header === 'back'
      ? `<button data-pa="back" style="font-size:0.7rem;color:var(--text-dim);background:none;border:1px solid var(--border);border-radius:3px;padding:2px 8px;cursor:pointer;margin-bottom:10px;font-family:Georgia,serif;">${isGM() ? '← Back' : '← My Character'}</button>`
      : '';
    const avatarSrc = opts.avatar !== undefined ? opts.avatar : resolveAvatarUrl(ent.avatarUrl);
    const fallbackIcon = ent.type === 'char' ? '🧙' : '👾';
    const avatarHtml = avatarSrc
      ? `<img src="${_paEsc(avatarSrc)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`
      : `<span style="font-size:1.4rem;opacity:0.4;">${fallbackIcon}</span>`;
    headerHtml = `${backBtn}
      <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;">
        <div class="ps-compact-avatar">${avatarHtml}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:1rem;color:var(--gold2);font-weight:bold;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_paEsc(name)}</div>
          <div style="font-size:0.72rem;color:var(--text-dim);">${_paEsc(sub)}</div>
          <div style="display:flex;gap:12px;margin-top:5px;">
            <div><div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;">Max Speed</div><div style="font-size:0.82rem;color:var(--text);">${speedStr}</div></div>
            <div><div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;">Size</div><div style="font-size:0.82rem;color:var(--text);">${sizeStr}</div></div>
          </div>
        </div>
      </div>`;
  } else if (opts.header === 'mini') {
    headerHtml = `
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:6px;">${_paEsc(sub)}</div>
      <div style="display:flex;gap:12px;margin-bottom:10px;">
        <div><div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;">Max Speed</div><div style="font-size:0.82rem;">${speedStr}</div></div>
        <div><div style="font-size:0.6rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;">Size</div><div style="font-size:0.82rem;">${sizeStr}</div></div>
      </div>`;
  }

  el.innerHTML = `
    ${opts.prefixHtml || ''}
    ${headerHtml}
    ${_paSecHealth(ent, canEdit)}
    ${_paSecConditions(ent)}
    ${_paSecCombat(ent, canEdit, opts.combatPrefix)}
    ${_paSecStats(attrs)}
    ${_paSecEquip(ent, attrs, canEdit, opts.loadout)}
    ${_paSecArmor(ent)}
    ${_paSecSkills(skills, attrs)}`;

  _paBind(el, { ent, isOwnSheet });
}

// ── Active combatant banner (shared header during combat) ─────────────────────

function _paActiveBanner() {
  if (!_atIsCombatActive()) return '';
  const ac = _atSharedActive();
  if (!ac) return '';
  const acEnt = getEntity(ac.id);
  const acAvatar = acEnt ? resolveAvatarUrl(acEnt.avatarUrl) : (ac.avatar || '');
  const acImg = acAvatar
    ? `<img src="${_paEsc(acAvatar)}" style="width:36px;height:36px;object-fit:cover;object-position:top center;border-radius:50%;border:2px solid var(--gold);flex-shrink:0;">`
    : `<div style="width:36px;height:36px;border-radius:50%;border:2px solid var(--gold);background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0;">⚔</div>`;
  const acSafeId = ac.id.replace(/'/g, "\\'");
  const slots = ac.slots || {};
  const acHasAction = Object.values(slots).some(Boolean);
  const canControl = isGM() || (ac.type === 'char' && ac.id.split('::')[1] === currentCharacterId);
  // Compact readout of assigned actions (the slot rows are gone from the panel)
  const queued = Object.values(slots).filter(Boolean)
    .map(s => _paEsc(s.label.split(' —')[0].trim())).join(' · ');
  const queuedLine = queued
    ? `<div style="font-size:0.68rem;color:var(--gold2);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">⚔ ${queued}</div>`
    : '';
  const actionBtns = canControl ? `
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
      <button class="at-btn primary" style="flex:2;" onclick="atOpenSlotModal('${acSafeId}','')">⚡ Actions</button>
      <button class="at-btn${acHasAction ? ' primary' : ''}" style="flex:1;" onclick="atAcceptAction('${acSafeId}')">✓ Done</button>
    </div>` : '';
  return `
    <div style="background:rgba(201,168,76,0.12);border:1px solid var(--gold);border-radius:6px;padding:8px 10px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${acImg}
        <div style="min-width:0;flex:1;">
          <div style="font-size:0.6rem;color:var(--gold2);text-transform:uppercase;letter-spacing:0.1em;">Active — Round ${_atSharedRound()}</div>
          <div style="font-size:0.9rem;color:var(--gold2);font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_paEsc(ac.name)}</div>
        </div>
      </div>
      ${queuedLine}
      ${actionBtns}
    </div>`;
}

// Render the active-turn banner into its OWN persistent element (above the
// scrolling panel content), so token clicks / move mode / token-info re-renders
// never wipe it. Called by every panel refresh path.
function _renderActiveBanner() {
  const el = document.getElementById('play-active-banner');
  if (!el) return;
  const html = _atIsCombatActive() ? _paActiveBanner() : '';
  el.innerHTML = html;
  el.style.padding = html ? '10px 12px 0' : '0';
}

// ── Top-level play panel (replaces legacy renderPlayCharacter body) ───────────

// If the active combatant's data isn't cached yet (e.g. a creature whose
// session_creatures row hasn't loaded on this client), fetch it and
// re-render — instead of silently falling back to the own-character view,
// which made "Next" look like it wasn't updating the panel at all.
let _paLoadingActiveId = null;
async function _paEnsureActiveLoaded(ac) {
  if (_paLoadingActiveId === ac.id) return; // already fetching
  _paLoadingActiveId = ac.id;
  if (ac.type === 'char') await ensureEntityLoaded(ac.id);
  else await loadSessionCreatureCache();
  if (_paLoadingActiveId === ac.id) _paLoadingActiveId = null;
  refreshUI();
}

function renderPlayPanel(el) {
  _renderActiveBanner(); // persistent element above the content

  // During combat everyone sees the active combatant's sheet
  if (_atIsCombatActive()) {
    const ac = _atSharedActive();
    if (ac) {
      const ent = getEntity(ac.id);
      if (ent) {
        renderEntityPanel(ac.id, { container: el, header: 'mini' });
        return;
      }
      // Not cached yet — show a loading state for THIS combatant, not a
      // fallback to someone else's sheet, and fetch the missing data.
      el.innerHTML =
        `<div style="color:var(--text-dim);font-size:0.8rem;font-style:italic;">Loading ${_paEsc(ac.name)}…</div>`;
      _paEnsureActiveLoaded(ac);
      return;
    }
  }

  // Own character view
  const myRef = currentCharacterId ? 'char::' + currentCharacterId : null;
  const nameEl = document.getElementById('char-name');
  const charName = nameEl ? nameEl.value : '';

  // Auto-add own character to the tracker if their token is on the map
  if (myRef && !atCombatants.find(x => x.id === myRef)) {
    const onMap = Object.values(mapTokens || {}).some(
      t => t.entity_type === 'character' && t.entity_id === currentCharacterId);
    if (onMap) {
      atCombatants.push({ id: myRef, name: charName || 'Character', avatar: null,
        type: 'char', initiative: null, tieBreak: null, slots: _newSlots() });
    }
  }

  if (!myRef || !getEntity(myRef)) {
    el.innerHTML =
      `<div style="color:var(--text-dim);font-size:0.8rem;font-style:italic;">
        ${myRef ? 'Character not loaded yet.' : 'No character selected. Save a character to see it here.'}
      </div>`;
    return;
  }

  // Live builder attrs when the sheet is loaded (it edits this character)
  let attrs = null, carried = 0;
  try {
    attrs = calcAttributes();
    carried = getCarriedWeight(attrs).total || 0;
  } catch (e) { attrs = null; }

  // Turn indicator inside the combat section
  const isMyTurn = _atStateFromGM && _atStateFromGM.activeId === myRef;
  const roundLabel = _atStateFromGM ? `Round ${_atStateFromGM.round}` : '';
  const combatPrefix = `
    ${roundLabel ? `<div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.08em;">${roundLabel}</div>` : ''}
    ${isMyTurn ? `<div style="background:rgba(201,168,76,0.18);border:1px solid var(--gold);border-radius:4px;padding:5px 8px;text-align:center;font-size:0.85rem;color:var(--gold2);font-weight:bold;margin-bottom:6px;">⚔ YOUR TURN</div>` : ''}`;

  // Live loadout from the builder tables when present
  let loadout = null;
  try {
    const names = getLoadoutItemNames();
    if (names.length) loadout = names;
  } catch (e) {}

  renderEntityPanel(myRef, {
    container: el,
    header: 'self',
    attrs: attrs || undefined,
    carried,
    name: charName || undefined,
    skills: (typeof skillInvestments !== 'undefined' && Object.keys(skillInvestments).length) ? skillInvestments : undefined,
    loadout,
    combatPrefix,
  });
}

// ═══ Combat action dialog (Phase 2b — spec §2.4) ══════════════════════════════
// One dialog whose layout is the body hierarchy: full-body actions on top,
// then one section per body-plan channel. Movement is defined on the map;
// the dialog only shows how much of the round's movement is already used.
// Principle: manage details, don't enforce rules — conditions are a banner,
// not a gate. The one deliberate exception: ≥50% movement used disables
// Evade/Retreat, because it reflects movement already spent.

const BODY_PLANS = {
  Humanoid:   [ { key: 'right',     label: 'Right Arm', icon: '⚔' },
                { key: 'left',      label: 'Left Arm',  icon: '🛡' } ],
  Quadruped:  [ { key: 'bite',      label: 'Bite',      icon: '🦷' },
                { key: 'claws',     label: 'Claws',     icon: '🐾' } ],
  Serpentine: [ { key: 'bite',      label: 'Bite',      icon: '🦷' },
                { key: 'constrict', label: 'Constrict', icon: '🐍' } ],
  Avian:      [ { key: 'beak',      label: 'Beak',      icon: '🦅' },
                { key: 'talons',    label: 'Talons',    icon: '🐾' } ],
  Insectoid:  [ { key: 'mandibles', label: 'Mandibles', icon: '🪲' },
                { key: 'forelimbs', label: 'Forelimbs', icon: '🦗' } ],
  Draconic:   [ { key: 'bite',      label: 'Bite',      icon: '🦷' },
                { key: 'claws',     label: 'Claws',     icon: '🐾' },
                { key: 'breath',    label: 'Breath',    icon: '🔥' },
                { key: 'tail',      label: 'Tail',      icon: '🐉' } ],
};
function _paBodyPlan(bodyType) { return BODY_PLANS[bodyType] || BODY_PLANS.Humanoid; }

let _dlgCombatantId = null;

// Set when an attack is picked from the dialog (which must close so the
// user can click a target on the map). Cleared and consumed by
// _dlgMaybeReopen once the attack flow ends — hit, miss, or cancelled —
// so the dialog reappears for the next channel instead of stranding the
// user on the Combat section's small per-slot buttons.
let _dlgReopenId = null;

function _dlgMaybeReopen() {
  if (!_dlgReopenId) return;
  const id = _dlgReopenId;
  _dlgReopenId = null;
  const c = atCombatants.find(x => x.id === id);
  if (!c) return;
  // Only reopen if it's still meaningfully this combatant's moment
  if (_atIsCombatActive() && _atSharedActive()?.id === id) atOpenActionDialog(id);
}

// closeRoller is defined in index.html, loaded before this file — wrap it
// so any attack-resolution roller (hit, miss, stray-shot follow-up) hands
// control back to the action dialog when it finishes.
if (typeof closeRoller === 'function') {
  const _origCloseRoller = closeRoller;
  closeRoller = function () {
    _origCloseRoller();
    _dlgMaybeReopen();
  };
}

function atOpenActionDialog(combatantId /*, focusKey */) {
  _dlgCombatantId = combatantId;
  const overlay = document.getElementById('at-action-modal');
  const body    = document.getElementById('at-dialog-body');
  if (!overlay || !body) return;
  overlay.style.display = 'flex';
  _dlgRender(body);
}

function _dlgDurLabel(dur) {
  return dur >= 99 ? '∞' : `${Math.max(1, Math.ceil(dur / 3))}r`;
}

// One selectable chip. data-dact carries the click behavior.
function _dlgChip({ label, sub, lit, disabled, title, data }) {
  const base = 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:4px;font-size:0.78rem;font-family:Georgia,serif;user-select:none;border:1px solid ';
  const style = disabled
    ? base + 'var(--border);background:var(--bg3);color:var(--text-dim);opacity:0.4;cursor:not-allowed;'
    : lit
      ? base + 'var(--gold);background:rgba(201,168,76,0.18);color:var(--gold2);cursor:pointer;'
      : base + 'var(--border);background:var(--bg3);color:var(--text);cursor:pointer;';
  const attrs = disabled ? '' : Object.entries(data || {})
    .map(([k, v]) => `data-${k}="${_paEsc(v)}"`).join(' ');
  return `<div ${attrs} title="${_paEsc(title || '')}" style="${style}">
    ${_paEsc(label)}${sub ? `<span style="font-size:0.68rem;color:${lit ? 'var(--gold2)' : 'var(--text-dim)'};">${_paEsc(sub)}</span>` : ''}${lit ? ' ✓' : ''}
  </div>`;
}

function _dlgSection(title, chipsHtml, dimmed) {
  return `
    <div style="margin-top:12px;${dimmed ? 'opacity:0.5;' : ''}">
      <div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-dim);margin-bottom:5px;">${title}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">${chipsHtml}</div>
    </div>`;
}

function _dlgRender(body) {
  const combatantId = _dlgCombatantId;
  const c = atCombatants.find(x => x.id === combatantId);
  if (!c) { atCloseModal(); return; }
  if (!c.slots) c.slots = _newSlots();
  const ent = getEntity(combatantId);
  const attrs = ent?.attrs || {};
  const conds = ent?.conditions || new Set();
  const plan  = _paBodyPlan(ent?.bodyType);
  const round = _atSharedRound();

  // ── Header + condition banner ──────────────────────────────────────────────
  const picked = Object.entries(c.slots).filter(([, s]) => s).map(([, s]) => s.label);
  const staminaCost = picked.reduce((sum, l) => sum + _staminaCostForLabel(l), 0);
  const summary = picked.length
    ? `${picked.join(' · ')}${staminaCost ? ` — ${staminaCost} stamina` : ''}`
    : 'No actions chosen yet';
  const blockers = ['unconscious', 'dead', 'stunned', 'paralyzed'].filter(k => conds.has(k));
  const banner = blockers.length
    ? `<div style="background:rgba(224,85,85,0.12);border:1px solid #e05555;border-radius:4px;padding:5px 8px;font-size:0.75rem;color:#e05555;margin-bottom:8px;">
        ${_paEsc(c.name)} is ${blockers.join(', ')} — actions recorded anyway; the table decides.
      </div>`
    : '';

  // ── Movement indicator (read-only; movement happens on the map) ────────────
  const mv = c.slots.move;
  const maxFeet  = Math.max(1, Math.round((calcMaxSpeed(attrs, 0) || 5) * 3));
  const usedFeet = mv ? (mv.feet != null ? mv.feet : parseInt((mv.label.match(/\((\d+) ft\)/) || [])[1] || '0', 10)) : 0;
  const movePct  = Math.min(100, Math.round((usedFeet / maxFeet) * 100));
  const halfUsed = usedFeet >= maxFeet / 2;
  const moveHtml = `
    <div style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-dim);margin-bottom:2px;">
        <span>🏃 Movement this round</span><span>${usedFeet} / ${maxFeet} ft</span>
      </div>
      <div style="background:var(--bg3);border-radius:3px;height:6px;overflow:hidden;">
        <div style="width:${movePct}%;height:100%;background:${halfUsed ? '#c97040' : 'var(--gold)'};"></div>
      </div>
      ${halfUsed ? `<div style="font-size:0.62rem;color:#c97040;margin-top:2px;">Over half movement used — Evade and Retreat unavailable this round.</div>` : ''}
    </div>`;

  // ── Full body section ──────────────────────────────────────────────────────
  const isProne = conds.has('prone');
  let fullChips = '';
  if (isProne) {
    fullChips += _dlgChip({
      label: 'Stand Up', sub: '1r', lit: c.slots.move?.label === 'Stand Up',
      title: 'Prone — stand up first!',
      data: { dact: 'set', slot: 'move', label: 'Stand Up', dur: 2, locks: 0 },
    });
  }
  fullChips += AT_FULLBODY.map(a => {
    const lit = c.slots.full?.label === a.label;
    const disabled = halfUsed && (a.label === 'Evade' || a.label === 'Retreat');
    return _dlgChip({
      label: a.label, sub: _dlgDurLabel(a.dur), lit, disabled,
      title: disabled ? 'Over half movement used this round' : '',
      data: lit ? { dact: 'off', slot: 'full' }
                : { dact: 'set', slot: 'full', label: a.label, dur: a.dur, locks: 1 },
    });
  }).join('');

  // ── Channel sections from the body plan ────────────────────────────────────
  const fullActive = !!c.slots.full;
  const channelHtml = plan.map(ch => {
    const cur = c.slots[ch.key];
    let chips = '';
    if (cur) {
      chips += _dlgChip({
        label: cur.label, sub: _dlgDurLabel(cur.durationRounds * 3), lit: true,
        title: 'Click to clear',
        data: { dact: 'off', slot: ch.key },
      });
    }
    const held = (ch.key === 'right' || ch.key === 'left') ? (ent?.held?.[ch.key] || '') : '';
    if (held) {
      const norm = normalizeWeaponName(held);
      const rows = [
        ...MELEE_WEAPONS.filter(r => normalizeWeaponName(r.weapon) === norm).map(r => ({ r, ranged: false })),
        ...RANGED_WEAPONS.filter(r => normalizeWeaponName(r.weapon) === norm).map(r => ({ r, ranged: true })),
      ];
      chips += rows.map(({ r, ranged }) => {
        const lbl = `${r.action} — ${held}`;
        if (cur?.label === lbl) return ''; // already shown as the lit chip
        const dur = r.action.toLowerCase().includes('load') || r.action.toLowerCase().includes('nock') ? 3
                  : r.action.toLowerCase().includes('aim') ? 2 : 1;
        const sub = (r.damageMax ? `dmg ${r.damageMax}` : ranged && r.rangeIncrement ? `${r.rangeIncrement}ft` : '') || `${dur}r`;
        const defensive = r.action === 'Block' || r.action === 'Parry';
        return _dlgChip({
          label: r.action, sub,
          data: defensive
            ? { dact: 'set', slot: ch.key, label: lbl, dur: dur * 3, locks: 0 }
            : { dact: 'attack', slot: ch.key, label: lbl, dur: dur * 3,
                item: held, action: r.action, ranged: ranged ? 1 : 0,
                range: ranged ? (r.rangeIncrement || 5) : (r.reach ?? 0) },
        });
      }).join('');
    } else if (ch.key === 'right' || ch.key === 'left') {
      chips += AT_UNARMED.map(a => cur?.label === a.label ? '' : _dlgChip({
        label: a.label, sub: _dlgDurLabel(a.dur),
        data: { dact: 'set', slot: ch.key, label: a.label, dur: a.dur, locks: 0 },
      })).join('');
    } else {
      // Natural attack channel — generic entries until natural weapons get
      // their own table alongside MELEE_WEAPONS
      chips += [{ label: `${ch.label} Attack`, dur: 1 }, { label: `${ch.label} Grab`, dur: 2 }, { label: 'Hold', dur: 99 }]
        .map(a => cur?.label === a.label ? '' : _dlgChip({
          label: a.label, sub: _dlgDurLabel(a.dur),
          data: { dact: 'set', slot: ch.key, label: a.label, dur: a.dur, locks: 0 },
        })).join('');
    }
    const heldNote = held ? ` — ${held}` : '';
    return _dlgSection(`${ch.icon || '⚔'} ${_paEsc(ch.label)}${_paEsc(heldNote)}`, chips, fullActive);
  }).join('');

  // ── Arcane section (characters with arcane skills) ─────────────────────────
  let arcaneHtml = '';
  if (ent?.type === 'char' && typeof SPELL_ACTIONS !== 'undefined') {
    const hasArcane = Object.keys(ent.skills || {}).some(k => (SKILLS.find(s => s.name === k) || {}).type === 'Arcane');
    if (hasArcane) {
      const target = plan.find(ch => !c.slots[ch.key])?.key || plan[0].key;
      arcaneHtml = _dlgSection('✨ Arcane', SPELL_ACTIONS.map(a => _dlgChip({
        label: a.label, sub: _dlgDurLabel(a.dur),
        data: { dact: 'set', slot: target, label: a.label, dur: a.dur, locks: 0 },
      })).join(''), fullActive);
    }
  }

  // ── Custom action + footer ─────────────────────────────────────────────────
  const channelOpts = [`<option value="full">Full body</option>`]
    .concat(plan.map(ch => `<option value="${_paEsc(ch.key)}">${_paEsc(ch.label)}</option>`)).join('');
  const selStyle = 'font-size:0.75rem;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:3px;padding:4px 6px;font-family:Georgia,serif;';

  body.innerHTML = `
    <h3 style="margin:0 0 2px;">${_paEsc(c.name)} — Round ${round}</h3>
    <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:8px;">${_paEsc(summary)}</div>
    ${banner}
    ${moveHtml}
    ${_dlgSection('⚡ Full Body — replaces arm and movement actions', fullChips, false)}
    ${channelHtml}
    ${arcaneHtml}
    <div style="display:flex;gap:6px;margin-top:14px;">
      <input type="text" id="dlg-custom-label" placeholder="Custom action…" style="${selStyle}flex:1;">
      <select id="dlg-custom-slot" style="${selStyle}">${channelOpts}</select>
      <input type="number" id="dlg-custom-dur" min="1" max="40" value="1" title="rounds" style="${selStyle}width:52px;">
      <button class="at-btn" data-dact="custom">Add</button>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
      <button class="at-btn" data-dact="close">Close</button>
      <button class="at-btn primary" data-dact="end-turn">✓ End Turn</button>
    </div>`;

  body.onclick = _dlgClick;
}

async function _dlgClick(e) {
  const t = e.target.closest('[data-dact]');
  if (!t) return;
  const d = t.dataset;
  const id = _dlgCombatantId;
  const body = document.getElementById('at-dialog-body');
  try {
    await _dlgAct(d, id, body);
  } catch (err) {
    console.error('action dialog:', err);
    // Surface the failure instead of dying silently — spec: manage, don't hide
    const note = document.createElement('div');
    note.style.cssText = 'background:rgba(224,85,85,0.15);border:1px solid #e05555;border-radius:4px;padding:5px 8px;font-size:0.72rem;color:#e05555;margin-top:8px;';
    note.textContent = 'Action failed: ' + (err?.message || err);
    body?.appendChild(note);
  }
}

async function _dlgAct(d, id, body) {
  switch (d.dact) {
    case 'set':
      await atSetSlot(id, d.slot, d.label, +d.dur, d.locks === '1');
      _dlgRender(body);
      break;
    case 'off':
      atClearSlot(id, d.slot);
      _dlgRender(body);
      break;
    case 'attack':
      await atSetSlot(id, d.slot, d.label, +d.dur, false);
      _dlgReopenId = id; // reopen once targeting + the roll resolve
      atCloseModal();
      enterAttackMode(id, d.item, d.action, d.ranged === '1', +d.range);
      break;
    case 'custom': {
      const label  = document.getElementById('dlg-custom-label')?.value.trim();
      const slot   = document.getElementById('dlg-custom-slot')?.value || 'full';
      const rounds = parseInt(document.getElementById('dlg-custom-dur')?.value) || 1;
      if (!label) return;
      await atSetSlot(id, slot, label, rounds * 3, slot === 'full');
      _dlgRender(body);
      break;
    }
    case 'end-turn':
      atAcceptAction(id);
      atCloseModal();
      break;
    case 'close':
      atCloseModal();
      break;
  }
}
