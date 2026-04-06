// ────────────────────────────────────────
// CONDITION LIST
// ────────────────────────────────────────
const CONDITIONS = [
  { id:'blinded',       lbl:'Blinded'       },
  { id:'charmed',       lbl:'Charmed'    },
  { id:'deafened',      lbl:'Deafened'  },
  { id:'exhaustion',    lbl:'Exhaustion'  },
  { id:'frightened',    lbl:'Frightened'     },
  { id:'grappled',      lbl:'Greappled'     },
  { id:'incapacitated', lbl:'Incapacitated' },
  { id:'invisible',     lbl:'Invisible'    },
  { id:'paralyzed',     lbl:'Paralyzed'   },
  { id:'petrified',     lbl:'Petrified'  },
  { id:'poisoned',      lbl:'Poisoned'   },
  { id:'prone',         lbl:'Prone'      },
  { id:'restrained',    lbl:'Restrained'  },
  { id:'stunned',       lbl:'Stunned'     },
  { id:'unconscious',   lbl:'Unconcious' },
];

// ────────────────────────────────────────
// STATE
// ────────────────────────────────────────
let combatants   = [];
let queue        = [];
let uid          = 1;
let round        = 1;
let started      = false;
let roundFirstId = null;

// Modal state
let hpTarget     = null;
let hpStr        = '';
let statusTarget = null;
let pendingConds = [];

// ────────────────────────────────────────
// PERSISTENCIA (localStorage)
// ────────────────────────────────────────
const STORAGE_KEY = 'dnd_combat_state';

function saveState() {
  const state = { combatants, queue, uid, round, started, roundFirstId };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {
    console.warn('Error saving state:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    combatants   = state.combatants   || [];
    queue        = state.queue        || [];
    uid          = state.uid          ?? 1;
    round        = state.round        ?? 1;
    started      = state.started      ?? false;
    roundFirstId = state.roundFirstId ?? null;
  } catch(e) {
    console.warn('Error loading state:', e);
  }
}

// ────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────
const getC    = id => combatants.find(c => c.id === id);
const getCond = id => CONDITIONS.find(c => c.id === id);

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Enable "Start Combat": (≥1 player AND ≥1 monster) OR ≥2 players
function canStartCombat() {
  const players  = combatants.filter(c => c.type === 'player').length;
  const monsters = combatants.filter(c => c.type === 'monster').length;
  return (players >= 1 && monsters >= 1) || players >= 2;
}

// ────────────────────────────────────────
// MODAL HELPERS
// ────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function ovrClick(e, id) { if (e.target.id === id) closeModal(id); }

// ────────────────────────────────────────
// ADD COMBATANT
// ────────────────────────────────────────
function openAddModal() {
  ['a-name','a-init','a-hp','a-ac'].forEach(i => document.getElementById(i).value = '');
  openModal('addModal');
  setTimeout(() => document.getElementById('a-name').focus(), 120);
}

function addCombatant(type) {
  const name = document.getElementById('a-name').value.trim();
  if (!name) { toast('✦ Please, enter name'); return; }

  const init = parseInt(document.getElementById('a-init').value) || 10;
  const hp   = Math.max(1, parseInt(document.getElementById('a-hp').value) || 10);
  const ac   = Math.max(1, parseInt(document.getElementById('a-ac').value) || 10);

  const c = { id: uid++, name, init, hp, maxHp: hp, ac, conds: [], isDead: false, type };
  combatants.push(c);
  insertInQueue(c.id);

  closeModal('addModal');
  saveState();
  render();

  toast(`${name} enter the combat - Initiative: ${init}`);
}

function insertInQueue(newId) {
  const newC = getC(newId);
  for (let i = 0; i < queue.length; i++) {
    const c = getC(queue[i]);
    if (c && newC.init > c.init) { queue.splice(i, 0, newId); return; }
  }
  queue.push(newId);
}

function removeCombatant(id) {
  const listEl = document.getElementById('list');
  const el     = listEl.querySelector(`.card[data-id="${id}"]`);

  const doRemove = () => {
    combatants = combatants.filter(c => c.id !== id);
    queue      = queue.filter(q => q !== id);
    if (roundFirstId === id) roundFirstId = queue[0] || null;

    if (combatants.length === 0) {
      started      = false;
      round        = 1;
      roundFirstId = null;
    }

    saveState();

    // Snapshot remaining cards so we can FLIP them upward
    const remaining = [...listEl.querySelectorAll('.card[data-id]')].filter(c => c !== el);
    const snap = new Map();
    remaining.forEach(c => snap.set(c.dataset.id, c.getBoundingClientRect()));

    if (el) el.remove();
    render();

    // FLIP — slide remaining cards up smoothly
    listEl.querySelectorAll('.card[data-id]').forEach(card => {
      const old = snap.get(card.dataset.id);
      if (!old) return;
      const now = card.getBoundingClientRect();
      const dy  = old.top - now.top;
      if (Math.abs(dy) < 1) return;

      card.style.transition = 'none';
      card.style.transform  = `translateY(${dy}px)`;
      void card.offsetHeight; // force reflow
      card.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.1, 0.64, 1)';
      card.style.transform  = '';
      card.addEventListener('transitionend', () => {
        card.style.transition = '';
      }, { once: true });
    });
  };

  if (el) {
    // Slide-out exit animation via inline style (not affected by render's className updates)
    el.style.transition    = 'transform 0.24s ease-in, opacity 0.24s ease-in';
    el.style.pointerEvents = 'none';
    void el.offsetHeight;
    el.style.transform = 'translateX(64px) scale(0.92)';
    el.style.opacity   = '0';
    setTimeout(doRemove, 260);
  } else {
    doRemove();
  }
}

// ────────────────────────────────────────
// AC ADJUST
// ────────────────────────────────────────
function changeAC(id, delta) {
  const c = getC(id);
  if (!c) return;
  c.ac = Math.max(1, c.ac + delta);
  saveState();
  render();
}

// ────────────────────────────────────────
// TURN SYSTEM
// ────────────────────────────────────────
function nextTurn() {
  if (queue.length === 0) return;

  if (!started) {
    if (!canStartCombat()) return;
    started      = true;
    roundFirstId = queue[0];
    saveState();
    render();
    return;
  }

  const listEl    = document.getElementById('list');
  const leavingId = String(queue[0]);
  const leavingEl = listEl.querySelector(`.card[data-id="${leavingId}"]`);

  const doTurnChange = () => {
    // Snapshot BEFORE removing leavingEl so remaining cards still occupy their old positions
    const snap = new Map();
    listEl.querySelectorAll('.card[data-id]').forEach(card => {
      if (card !== leavingEl) snap.set(card.dataset.id, card.getBoundingClientRect());
    });

    if (leavingEl) leavingEl.remove(); // remove so render() recreates it fresh at the end

    const done = queue.shift();
    queue.push(done);
    const roundChanged = queue[0] === roundFirstId;
    if (roundChanged) round++;
    saveState();
    render();
    if (roundChanged) toast(`🔔 Round ${round}`);

    // Phase 2 — FLIP remaining cards upward (identical to removeCombatant)
    listEl.querySelectorAll(`.card[data-id]:not([data-id="${leavingId}"])`).forEach(card => {
      const old = snap.get(card.dataset.id);
      if (!old) return;
      const now = card.getBoundingClientRect();
      const dy  = old.top - now.top;
      if (Math.abs(dy) < 1) return;
      card.style.transition = 'none';
      card.style.transform  = `translateY(${dy}px)`;
      void card.offsetHeight;
      card.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.1, 0.64, 1)';
      card.style.transform  = '';
      card.addEventListener('transitionend', () => { card.style.transition = ''; }, { once: true });
    });

    // Phase 3 — returning card enters from the left at the bottom
    const returnEl = listEl.querySelector(`.card[data-id="${leavingId}"]`);
    if (returnEl) {
      returnEl.style.animation = 'none';        // cancel default cardIn (top↓)
      void returnEl.offsetHeight;
      // slight delay so it arrives after others have started moving up
      returnEl.style.animation = 'cardReturn 0.38s 0.18s cubic-bezier(0.34, 1.1, 0.64, 1) both';
      returnEl.addEventListener('animationend', () => { returnEl.style.animation = 'none'; }, { once: true });
    }
  };

  // Phase 1 — active card slides out to the right (same as removeCombatant)
  if (leavingEl) {
    leavingEl.style.transition    = 'transform 0.24s ease-in, opacity 0.24s ease-in';
    leavingEl.style.pointerEvents = 'none';
    void leavingEl.offsetHeight;
    leavingEl.style.transform = 'translateX(64px) scale(0.92)';
    leavingEl.style.opacity   = '0';
    setTimeout(doTurnChange, 260);
  } else {
    doTurnChange();
  }
}

// ────────────────────────────────────────
// COMBAT END CHECK
// ────────────────────────────────────────
function checkCombatEnd() {
  if (!started) return;
  const monsters = combatants.filter(c => c.type === 'monster');
  if (monsters.length > 0 && monsters.every(m => m.hp === 0)) {
    triggerCombatEnd();
  }
}

function triggerCombatEnd() {
  started      = false;
  round        = 1;
  roundFirstId = null;
  saveState();
  render();
  setTimeout(() => openModal('combatEndModal'), 300);
}

function closeCombatEnd() {
  closeModal('combatEndModal');
  // Clear all combatants after victory
  combatants   = [];
  queue        = [];
  started      = false;
  round        = 1;
  roundFirstId = null;
  saveState();
  render();
}

// ────────────────────────────────────────
// HP NUMPAD
// ────────────────────────────────────────
function openHpModal(id) {
  hpTarget = id;
  hpStr    = '';
  refreshDisp();
  openModal('hpModal');
}

function npPress(d) {
  if (hpStr.length >= 4) return;
  hpStr += d;
  refreshDisp();
}

function npBack() {
  hpStr = hpStr.slice(0, -1);
  refreshDisp();
}

function refreshDisp() {
  document.getElementById('hpDisp').textContent = hpStr || '_';
}

function applyHP(sign) {
  const amount = parseInt(hpStr) || 0;
  const c = getC(hpTarget);
  closeModal('hpModal');
  if (!c || amount === 0) return;

  c.hp = Math.max(0, c.hp + sign * amount);
  if (c.hp === 0) c.isDead = true;

  saveState();
  render();
  checkCombatEnd();
}

// ────────────────────────────────────────
// STATUS CONDITIONS
// ────────────────────────────────────────
function openStatusModal(id) {
  statusTarget = id;
  const c = getC(id);
  pendingConds = c ? [...c.conds] : [];
  buildStatusGrid();
  openModal('statusModal');
}

function buildStatusGrid() {
  document.getElementById('statusGrid').innerHTML = CONDITIONS.map(cd => `
    <div class="s-opt ${pendingConds.includes(cd.id) ? 'chosen' : ''}"
         onclick="toggleCond('${cd.id}', this)">
      <span>${cd.lbl}</span>
    </div>
  `).join('');
}

function toggleCond(id, el) {
  if (pendingConds.includes(id)) {
    pendingConds = pendingConds.filter(c => c !== id);
    el.classList.remove('chosen');
  } else {
    pendingConds.push(id);
    el.classList.add('chosen');
  }
}

function applyStatuses() {
  const c = getC(statusTarget);
  if (c) c.conds = [...pendingConds];
  closeModal('statusModal');
  saveState();
  render();
}

function removeCondition(cid, condId) {
  const c = getC(cid);
  if (c) c.conds = c.conds.filter(id => id !== condId);
  saveState();
  render();
}

// ────────────────────────────────────────
// BUILD CARD HTML
// ────────────────────────────────────────
function buildCard(c, idx) {
  const isActive       = started && idx === 0;
  const hpPct          = c.maxHp > 0 ? c.hp / c.maxHp : 0;
  const isLow          = hpPct > 0 && hpPct <= 0.2;
  const isZero         = c.hp === 0;
  const typeClass      = c.type === 'player' ? 'player' : 'monster';
  const hpEditDisabled = !started ? 'disabled' : '';

  const chips = c.conds.map(condId => {
    const cd = getCond(condId);
    return cd
      ? `<span class="chip" onclick="removeCondition(${c.id},'${condId}')">${cd.lbl}<span class="chip-x">✕</span></span>`
      : '';
  }).join('');

  const classes = `card ${typeClass}${isActive ? ' is-active' : ''}`;

  const innerHTML = `${isActive ? '<div class="active-badge">In turn</div>' : ''}
<div class="card-head">
  <div class="init-circle">${c.init}</div>
  <div class="card-name ${isZero ? 'is-dead' : ''}">${esc(c.name)}</div>
  <button class="btn-remove" onclick="removeCombatant(${c.id})" title="Remove combatant">❌️</button>
</div>
<div class="card-stats">
  <div class="hp-disp ${isLow ? 'low' : ''} ${isZero ? 'zero' : ''}">
    <span class="stat-ico">❤️</span>
    <span class="stat-lbl">:</span>
    <span class="stat-val">${c.hp}/${c.maxHp}</span>
  </div>
  <button class="hp-edit-btn" onclick="openHpModal(${c.id})" title="Modify HP" ${hpEditDisabled}>✏️ HP</button>
  <div class="ac-wrap">
    <div class="ac-disp">
      <span class="stat-ico">🛡</span>
      <span class="stat-lbl">:</span>
      <span class="stat-val">${c.ac}</span>
    </div>
    <div class="ac-btns">
      <button class="ac-btn" onclick="changeAC(${c.id}, 1)" title="+1 AC">+</button>
      <button class="ac-btn" onclick="changeAC(${c.id}, -1)" title="-1 AC">−</button>
    </div>
  </div>
  <button class="add-cond-btn" onclick="openStatusModal(${c.id})">Cond.</button>
</div>
${c.conds.length > 0 ? `<div class="cond-row">${chips}</div>` : ''}`;

  return { classes, innerHTML };
}

// ────────────────────────────────────────
// RENDER
// ────────────────────────────────────────
function render() {
  if (combatants.length === 0 && started) {
    started      = false;
    round        = 1;
    roundFirstId = null;
  }

  document.getElementById('roundNum').textContent = round;

  const btn = document.getElementById('nextBtn');

  if (!started) {
    btn.disabled = !canStartCombat();
    document.getElementById('nextIcon').textContent = '⚔️';    
    document.getElementById('nextTxt').textContent  = 'Start Combat';
  } else {
    btn.disabled = queue.length === 0;
    document.getElementById('nextIcon').textContent = '▶';    
    document.getElementById('nextTxt').textContent  = 'Next Turn';
  }

  const listEl = document.getElementById('list');

  if (queue.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-dragon">🐲</span>
        <h3>✦ The battlefield is empty ✦</h3>
        <p>Add players and monsters to start the combat</p>
      </div>`;
    return;
  }

  // Remove empty-state if exist
  const emptyEl = listEl.querySelector('.empty-state');
  if (emptyEl) emptyEl.remove();

  // Rebuild / update card elements
  const orderedEls = queue.map((id, idx) => {
    const c = getC(id);
    if (!c) return null;

    const { classes, innerHTML } = buildCard(c, idx);
    let el = listEl.querySelector(`.card[data-id="${id}"]`);

    if (el) {
      // Solo tocar el DOM si algo cambió — no se re-dispara la animación
      if (el.className !== classes)   el.className = classes;
      if (el.innerHTML !== innerHTML) el.innerHTML = innerHTML;
    } else {
      // Tarjeta nueva: crear elemento (aquí sí se dispara cardIn, es correcto)
      el = document.createElement('div');
      el.className    = classes;
      el.dataset.id   = String(id);
      el.innerHTML    = innerHTML;
    }
    return el;
  }).filter(Boolean);

  // Eliminar tarjetas que ya no están en la cola
  [...listEl.querySelectorAll('.card[data-id]')].forEach(el => {
    if (!orderedEls.includes(el)) el.remove();
  });

  // Garantizar orden correcto; solo mover si la posición cambió
  orderedEls.forEach((el, idx) => {
    const currentAtIdx = listEl.children[idx];
    if (currentAtIdx !== el) listEl.insertBefore(el, currentAtIdx || null);
  });
}

// ────────────────────────────────────────
// TOAST
// ────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('vis');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('vis'), 2800);
}

// ────────────────────────────────────────
// KEYBOARD
// ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['addModal','hpModal','statusModal'].forEach(closeModal);
  }
});

// ────────────────────────────────────────
// VISUAL VIEWPORT — keep modals & toast
// above the virtual keyboard on mobile
// ────────────────────────────────────────
function onViewportChange() {
  const vv = window.visualViewport;
  if (!vv) return;

  // How much the keyboard has pushed up from the bottom
  const keyboardH = window.innerHeight - vv.height - vv.offsetTop;

  // Reposition every open overlay so it fills only the visible area
  document.querySelectorAll('.overlay').forEach(el => {
    el.style.top    = vv.offsetTop + 'px';
    el.style.height = vv.height + 'px';
  });

  // Lift the toast above the keyboard
  const toast = document.getElementById('toast');
  toast.style.bottom = (30 + Math.max(0, keyboardH)) + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportChange);
  window.visualViewport.addEventListener('scroll', onViewportChange);
}

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
loadState();
render();
