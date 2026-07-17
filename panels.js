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

function _paSecCombat(ent, canEdit, prefixHtml) {
  const c = atCombatants.find(x => x.id === ent.ref);
  if (!c) return _paSection('Combat',
    (prefixHtml || '') + `<div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;">Not in action tracker.</div>`);
  if (!c.slots) c.slots = _newSlots();
  const round = _atSharedRound();
  const initBadge = c.initiative != null
    ? `<span style="color:var(--gold2);font-weight:bold;font-size:0.95rem;">${c.initiative}</span>`
    : `<span style="color:var(--text-dim);font-style:italic;">Not rolled</span>`;
  const rollBtn = !canEdit ? '' : (c.initiative == null
    ? `<button class="at-btn primary" data-pa="roll-init" data-id="${_paEsc(ent.ref)}" style="margin-left:auto;">🎲 Roll</button>`
    : `<button class="at-btn" data-pa="roll-init" data-id="${_paEsc(ent.ref)}" style="margin-left:auto;" title="Re-roll">↺</button>`);
  const slotDefs = [{ key: 'right', icon: '⚔' }, { key: 'left', icon: '🛡' }, { key: 'move', icon: '🏃' }];
  const slotsHtml = slotDefs.map(({ key, icon }) => {
    const sl = c.slots[key];
    const locked = key !== 'right' && c.slots.right?.locksAll;
    if (locked) return `<div class="at-slot at-slot-locked"><span class="at-slot-icon">🔒</span><span class="at-slot-action empty">${_paEsc(c.slots.right?.label || '')}</span></div>`;
    let durTag = '';
    if (sl) {
      if (sl.durationRounds < 9999) { if (sl.durationRounds > 1) durTag = `<span class="at-slot-dur">${sl.startRound + sl.durationRounds - round}r</span>`; }
      else durTag = `<span class="at-slot-dur">∞</span>`;
    }
    const actionSpan = sl ? `<span class="at-slot-action">${_paEsc(sl.label)}</span>${durTag}` : `<span class="at-slot-action empty">—</span>`;
    const setBtn = canEdit ? `<button class="at-btn at-slot-set-btn" data-pa="open-slot" data-id="${_paEsc(ent.ref)}" data-slot="${key}">${sl ? '⚙' : '+'}</button>` : '';
    const clrBtn = (canEdit && sl) ? `<button class="at-btn danger at-slot-clr-btn" data-pa="clear-slot" data-id="${_paEsc(ent.ref)}" data-slot="${key}">✕</button>` : '';
    return `<div class="at-slot"><span class="at-slot-icon">${icon}</span>${actionSpan}${setBtn}${clrBtn}</div>`;
  }).join('');
  return _paSection('Combat', `
    ${prefixHtml || ''}
    <div class="at-action-row" style="margin-bottom:6px;">
      <span style="font-size:0.72rem;color:var(--text-dim);">Initiative</span>
      ${initBadge}${rollBtn}
    </div>
    <div class="at-slots">${slotsHtml}</div>`);
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
  const acHasAction = ac.slots?.right || ac.slots?.left || ac.slots?.move;
  const canControl = isGM() || (ac.type === 'char' && ac.id.split('::')[1] === currentCharacterId);
  const actionBtns = canControl ? `
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px;">
      <button class="at-btn primary" style="flex:1;" onclick="atOpenSlotModal('${acSafeId}','right')" title="Right arm">⚔ R</button>
      <button class="at-btn" style="flex:1;" onclick="atOpenSlotModal('${acSafeId}','left')" title="Left arm">🛡 L</button>
      <button class="at-btn" style="flex:1;" onclick="atOpenSlotModal('${acSafeId}','move')" title="Movement">🏃 M</button>
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
      ${actionBtns}
    </div>`;
}

// ── Top-level play panel (replaces legacy renderPlayCharacter body) ───────────

function renderPlayPanel(el) {
  const banner = _paActiveBanner();

  // During combat everyone sees the active combatant's sheet
  if (_atIsCombatActive()) {
    const ac = _atSharedActive();
    if (ac && getEntity(ac.id)) {
      renderEntityPanel(ac.id, { container: el, header: 'mini', prefixHtml: banner });
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
    el.innerHTML = banner +
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
    prefixHtml: banner,
    attrs: attrs || undefined,
    carried,
    name: charName || undefined,
    skills: (typeof skillInvestments !== 'undefined' && Object.keys(skillInvestments).length) ? skillInvestments : undefined,
    loadout,
    combatPrefix,
  });
}
