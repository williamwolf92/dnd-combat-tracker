 // ────────────────────────────────────────
 // CONDITION LIST
 // ────────────────────────────────────────
 const CONDITIONS = [
   { id:'blinded',       lbl:'Blinded' },
   { id:'charmed',       lbl:'Charmed' },
   { id:'deafened',      lbl:'Deafened' },
   { id:'exhaustion',    lbl:'Exhaustion' },
   { id:'frightened',    lbl:'Frightened' },
   { id:'grappled',      lbl:'Grappled' },
   { id:'incapacitated', lbl:'Incapacitated' },
   { id:'invisible',     lbl:'Invisible' },
   { id:'paralyzed',     lbl:'Paralyzed' },
   { id:'petrified',     lbl:'Petrified' },
   { id:'poisoned',      lbl:'Poisoned' },
   { id:'prone',         lbl:'Prone' },
   { id:'restrained',    lbl:'Restrained' },
   { id:'stunned',       lbl:'Stunned' },
   { id:'unconscious',   lbl:'Unconscious' },
   // Note: D.o.T. removed from selectable CONDITIONS; D.o.T. chip is now fixed on cards
 ];

// ────────────────────────────────────────
// MONSTER AUTOCOMPLETE DATA
// ────────────────────────────────────────
let monstersData       = [];
let currentSuggestions = [];

const MONSTERS_CACHE_KEY = 'dnd_monsters_cache';

function parseMonstersText(text) {
  const results = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const nM    = t.match(/n:([^/]+)/);
    const initM = t.match(/init:([^/]+)/);
    const hpM   = t.match(/hp:([^/]+)/);
    const acM   = t.match(/ac:([^/]+)/);
    if (nM && initM && hpM && acM) {
      results.push({
        name: nM[1].trim(),
        init: initM[1].trim(),
        hp:   hpM[1].trim(),
        ac:   acM[1].trim()
      });
    }
  }
  return results;
}

async function loadMonstersData() {
  // 1. Try fetch (works when served via HTTP/HTTPS)
  try {
    const res = await fetch('monsters.txt');
    if (res.ok) {
      const text = await res.text();
      const parsed = parseMonstersText(text);
      if (parsed.length > 0) {
        monstersData = parsed;
        // Save to localStorage so the app works offline on next load
        try { localStorage.setItem(MONSTERS_CACHE_KEY, JSON.stringify(parsed)); } catch(e) {}
        console.log(`Monsters loaded from file: ${parsed.length} entries`);
        return;
      }
    }
  } catch(e) { /* fetch unavailable (e.g. file:// protocol) — fall through to cache */ }

  // 2. Fall back to localStorage cache (works offline / file:// after first online load)
  try {
    const cached = localStorage.getItem(MONSTERS_CACHE_KEY);
    if (cached) {
      monstersData = JSON.parse(cached);
      console.log(`Monsters loaded from cache: ${monstersData.length} entries`);
    }
  } catch(e) { console.warn('Could not load monsters data:', e); }
}

function onNameInput() {
  const query     = document.getElementById('a-name').value.trim().toLowerCase();
  const container = document.getElementById('monster-suggestions');
  if (!query) { container.innerHTML = ''; currentSuggestions = []; return; }

  // Priority: startsWith first, then contains — max 3 total
  const starts   = monstersData.filter(m => m.name.toLowerCase().startsWith(query));
  const contains = monstersData.filter(m => !m.name.toLowerCase().startsWith(query) && m.name.toLowerCase().includes(query));
  currentSuggestions = [...starts, ...contains].slice(0, 3);

  if (currentSuggestions.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = currentSuggestions
    .map((m, i) => `<div class="monster-suggestion-item" onmousedown="event.preventDefault()" onclick="selectMonsterSuggestion(${i})">${esc(m.name)}</div>`)
    .join('');
}

function selectMonsterSuggestion(idx) {
  const m = currentSuggestions[idx];
  if (!m) return;
  document.getElementById('a-name').value = m.name;
  document.getElementById('a-init').value = m.init;
  document.getElementById('a-hp').value   = m.hp;
  document.getElementById('a-ac').value   = m.ac;
  document.getElementById('monster-suggestions').innerHTML = '';
  currentSuggestions = [];
}

// ────────────────────────────────────────
// STATE
// ────────────────────────────────────────
let combatants   = [];
let queue        = [];
let uid          = 1;
let round        = 1;
let started      = false;
let roundFirstId = null;
let history      = [];
let combatStartRoster = [];   // {name, type} of combatants at start of each combat
let currentScreen = 'screenHome';

// Modal state
let hpTarget     = null;
let hpStr        = '';
let statusTarget = null;
let pendingConds = [];

// Roll modal state
let rollStr      = '';
let rollAdvType  = 'normal'; // 'normal' | 'advantage' | 'disadvantage'

// Attack modal state
let attackTarget     = null;
let selectedAttackType = 'normal';

// HP mod toggle state
let hpModSelected = null; // 'resist' | 'vuln' | null

// Delete confirmation state
let pendingDeleteId = null;

// D.o.T. modal state
let dotTarget        = null;
let dotStr           = '';
let dotTimingSelected = 'start'; // 'start' | 'end' | 'round'

// D.o.T. remove confirmation state
let dotRemoveTarget  = null;

// ────────────────────────────────────────
// PERSISTENCIA (localStorage)
// ────────────────────────────────────────
const STORAGE_KEY = 'dnd_combat_state';

function saveState() {
  const state = { combatants, queue, uid, round, started, roundFirstId, history, combatStartRoster };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {
    console.warn('Error saving state:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    combatants        = state.combatants        || [];
    queue             = state.queue             || [];
    uid               = state.uid               ?? 1;
    round             = state.round             ?? 1;
    started           = state.started           ?? false;
    roundFirstId      = state.roundFirstId      ?? null;
    history           = state.history           || [];
    combatStartRoster = state.combatStartRoster || [];

    // ── Migrate old dotTurns-based state to new dotTiming system ──
    combatants.forEach(c => {
      if (c.dotFormula && !c.dotTiming) {
        // Old system: dotTurns > 0 means still active
        if (c.dotTurns && c.dotTurns > 0) {
          c.dotTiming = 'start';
        } else {
          // dotTurns was 0 — DoT had expired, clear it
          c.dotFormula = null;
          c.dotTiming  = null;
        }
      }
      delete c.dotTurns; // clean up legacy field
    });

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

// ────────────────────────────────────────
// SCREEN MANAGEMENT
// ────────────────────────────────────────
function switchScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(screenId).style.display = 'flex';
  currentScreen = screenId;
  
  document.querySelectorAll('.footer-btn').forEach(btn => btn.classList.remove('active'));
  const screens = ['screenHome', 'screenCombat', 'screenHistory'];
  const idx = screens.indexOf(screenId);
  if (idx >= 0) document.querySelectorAll('.footer-btn')[idx].classList.add('active');

  const sharedHeader  = document.getElementById('sharedHeader');
  const hCombat       = document.getElementById('sharedHeaderCombat');
  const hHistory      = document.getElementById('sharedHeaderHistory');

  if (screenId === 'screenCombat') {
    sharedHeader.style.display  = 'flex';
    hCombat.style.display       = 'flex';
    hHistory.style.display      = 'none';
    renderCombatScreen();
  } else if (screenId === 'screenHistory') {
    sharedHeader.style.display  = 'flex';
    hCombat.style.display       = 'none';
    hHistory.style.display      = 'flex';
    populateHistoryFilter();
    renderHistoryLog();
  } else {
    sharedHeader.style.display  = 'none';
    hCombat.style.display       = 'none';
    hHistory.style.display      = 'none';
  }
}

// ────────────────────────────────────────
// HISTORY LOGGING
// ────────────────────────────────────────
function addHistory(msg, type = 'event') {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  history.push({ time, msg, type });
  saveState();
}

function populateHistoryFilter() {
  const sel = document.getElementById('historyFilter');
  const currentVal = sel.value;
  sel.innerHTML = '<option value="all">All</option>';
  combatStartRoster.forEach(c => {
    const prefix = c.type === 'player' ? '(P)' : '(M)';
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = `${prefix} ${c.name}`;
    sel.appendChild(opt);
  });
  // Restore previous selection if still valid
  if ([...sel.options].some(o => o.value === currentVal)) {
    sel.value = currentVal;
  } else {
    sel.value = 'all';
  }
}

function applyHistoryFilter() {
  renderHistoryLog();
}

function renderHistoryLog() {
  const log = document.getElementById('historyLog');
  const sel = document.getElementById('historyFilter');
  const filterVal = sel ? sel.value : 'all';

  let entries = history;
  if (filterVal !== 'all') {
    const escaped = esc(filterVal);
    entries = history.filter(e => e.msg.includes(escaped));
  }

  if (entries.length === 0) {
    log.innerHTML = `<div class="empty-state">
      <span class="empty-dragon">📜</span>
      <h3>No events yet</h3>
      <p>History will appear here</p>
    </div>`;
    return;
  }
  const reversed = entries.slice().reverse();
  log.innerHTML = reversed.map((e, i) => `<div class="history-entry" style="animation: slideIn 0.3s ease-out ${i*0.05}s both;">
    <div class="entry-time">${e.time}</div>
    <div class="entry-msg">${e.msg}</div>
  </div>`).join('');
}

function clearHistory() {
  history = [];
  combatStartRoster = [];
  saveState();
  populateHistoryFilter();
  renderHistoryLog();
  toast('History cleared');
}

// ────────────────────────────────────────
// COMBAT START CONDITION
// Enable if: (≥1 player AND ≥1 monster) OR ≥2 players
// ────────────────────────────────────────
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
  document.getElementById('monster-suggestions').innerHTML = '';
  currentSuggestions = [];
  openModal('addModal');
  setTimeout(() => document.getElementById('a-name').focus(), 120);
}

// ── Initiative stepper buttons ──
function initStep(delta) {
  const inp = document.getElementById('a-init');
  const val = inp.value.trim();

  if (!val) {
    inp.value = delta > 0 ? '+1' : '-1';
    return;
  }

  if (val.startsWith('+') || val.startsWith('-')) {
    const n = parseInt(val, 10);
    if (!isNaN(n)) {
      const next = n + delta;
      inp.value = next >= 0 ? `+${next}` : `${next}`;
    }
  } else {
    const n = parseInt(val, 10);
    if (!isNaN(n)) {
      inp.value = String(Math.max(1, n + delta));
    } else {
      inp.value = '1';
    }
  }
}

// ── Parse initiative: "+X"/"-X" → 1d20+mod, plain "N" → N ──
function parseInitiative(str) {
  if (!str) return null;
  str = str.trim();
  if (/^[+\-]\d+$/.test(str)) {
    const mod = parseInt(str, 10);
    const roll = Math.floor(Math.random() * 20) + 1;
    return roll + mod;
  }
  const n = parseInt(str, 10);
  if (!isNaN(n) && n > 0) return n;
  return null;
}

// ── HP input filter: only digits, 'd', '+', '-' ──
function filterHpInput(el) {
  el.value = el.value.replace(/[^0-9d+\-]/g, '');
}

// ── Init. input filter: only digits, '+', '-' ──
function filterInitInput(el) {
  el.value = el.value.replace(/[^0-9+\-]/g, '');
}

// ── HP dice roller: supports #  |  #d#  |  #d#±# ──
function parseDiceOrNumber(str) {
  if (!str) return null;
  str = str.trim();

  if (!str.includes('d')) {
    const n = parseInt(str, 10);
    return isNaN(n) || n <= 0 ? null : n;
  }

  const m = str.match(/^(\d+)d(\d+)(?:([\+\-])(\d+))?$/);
  if (!m) return null;

  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const op    = m[3] || '+';
  const mod   = m[4] ? parseInt(m[4], 10) : 0;

  if (count < 1 || sides < 1) return null;

  let rolled = 0;
  for (let i = 0; i < count; i++) rolled += Math.floor(Math.random() * sides) + 1;
  return op === '+' ? rolled + mod : rolled - mod;
}

function addCombatant(type) {
  const name = document.getElementById('a-name').value.trim();
  if (!name) { toast('✦ Please, enter name'); return; }

  const initStr = document.getElementById('a-init').value.trim();
  const hpStr   = document.getElementById('a-hp').value.trim();
  const ac      = Math.max(1, parseInt(document.getElementById('a-ac').value) || 10);

  const init = parseInitiative(initStr) ?? 10;
  const hp   = Math.max(1, parseDiceOrNumber(hpStr) ?? 10);

  const c = { id: uid++, name, init, hp, maxHp: hp, ac, conds: [], isDead: false, type };
  combatants.push(c);
  insertInQueue(c.id);

  // If combat is already running, add to roster so history filter picks them up
  if (started && !combatStartRoster.some(r => r.name === c.name)) {
    combatStartRoster.push({ name: c.name, type: c.type });
    if (currentScreen === 'screenHistory') populateHistoryFilter();
  }

  closeModal('addModal');
  saveState();
  render();

  addHistory(`<b>${esc(name)}</b> enter combat:<br>Init: ${init} | ❤️: ${hp} | 🛡: ${ac}`, 'event');
  toast(`${esc(name)} enter combat - Init.: ${init}`);
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
  const c = getC(id);
  if (!c) return;
  pendingDeleteId = id;
  document.getElementById('deleteConfirmName').textContent = c.name;
  openModal('deleteConfirmModal');
}

function confirmDelete() {
  if (!pendingDeleteId) return;

  const id = pendingDeleteId;
  const c  = getC(id);
  const name = c ? c.name : 'Unknown';

  closeModal('deleteConfirmModal');
  pendingDeleteId = null;

  const listEl = document.getElementById('listCombat');
  const el     = listEl ? listEl.querySelector(`.card[data-id="${id}"]`) : null;

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
    addHistory(`<b>${esc(name)}</b> removed from combat`, 'event');

    const remaining = listEl ? [...listEl.querySelectorAll('.card[data-id]')].filter(c => c !== el) : [];
    const snap = new Map();
    remaining.forEach(c => snap.set(c.dataset.id, c.getBoundingClientRect()));

    if (el) el.remove();
    render();

    if (listEl) {
      listEl.querySelectorAll('.card[data-id]').forEach(card => {
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
    }
  };

  if (el) {
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
// AC AND ATTACK
// ────────────────────────────────────────
function openAttackModal(id) {
  attackTarget = id;
  document.getElementById('attackBonus').value = '0';
  setAttackType('normal');
  document.getElementById('attackResult').style.display = 'none';
  openModal('attackModal');
}

function setAttackType(type) {
  if (selectedAttackType === type) {
    selectedAttackType = 'normal';
  } else {
    selectedAttackType = type;
  }
  document.querySelectorAll('.attack-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === selectedAttackType);
  });
}

function attackBonusChange(delta) {
  const inp = document.getElementById('attackBonus');
  inp.value = String(parseInt(inp.value || '0') + delta);
}

function executeAttack() {
  const c = getC(attackTarget);
  if (!c) return;

  const bonus = parseInt(document.getElementById('attackBonus').value || '0');
  const type  = selectedAttackType;

  let roll1 = Math.floor(Math.random() * 20) + 1;
  let roll2 = null;
  let usedRoll = roll1;

  if (type === 'advantage') {
    roll2    = Math.floor(Math.random() * 20) + 1;
    usedRoll = Math.max(roll1, roll2);
  } else if (type === 'disadvantage') {
    roll2    = Math.floor(Math.random() * 20) + 1;
    usedRoll = Math.min(roll1, roll2);
  }

  const total = usedRoll + bonus;
  const hit   = total >= c.ac;
  const crit  = usedRoll === 20;

  let resultMsg = '';
  if (crit) {
    resultMsg = '<span style="color:#ff0000; font-weight:bold;">💥 CRITICAL HIT!</span>';
  } else {
    resultMsg = `<span style="color:${hit ? 'var(--green)' : 'var(--red)'}; font-weight:bold;">${hit ? 'HIT' : 'MISS'}</span>`;
  }

  const bonusStr = (bonus !== 0) ? ` (${bonus > 0 ? '+' : ''}${bonus})` : '';
  let formula = '';

  if (type === 'normal') {
    formula = `🎲 1d20: ${usedRoll}${bonusStr} = ${total} ${total >= c.ac ? '≥' : '<'} 🛡${c.ac}`;
  } else if (type === 'advantage') {
    const higher = Math.max(roll1, roll2);
    formula = `🎲 2d20 (${roll1}/${roll2}): ${higher}${bonusStr} = ${higher + bonus} ${higher + bonus >= c.ac ? '≥' : '<'} 🛡${c.ac}`;
  } else if (type === 'disadvantage') {
    const lower = Math.min(roll1, roll2);
    formula = `🎲 2d20 (${roll1}/${roll2}): ${lower}${bonusStr} = ${lower + bonus} ${lower + bonus >= c.ac ? '≥' : '<'} 🛡${c.ac}`;
  }

  document.getElementById('resultMessage').innerHTML = resultMsg;
  document.getElementById('resultFormula').textContent = formula;
  document.getElementById('attackResult').style.display = 'block';

  addHistory(`Attack vs. <b>${esc(c.name)}</b> | <b>${crit ? 'CRITICAL!' : (hit ? 'HIT' : 'MISS')}</b><br>${formula}`, 'attack');
}

function acChange(id, delta) {
  const c = getC(id);
  if (!c) return;
  c.ac = Math.max(1, (c.ac || 0) + delta);
  saveState();
  render();
  addHistory(`<b>${esc(c.name)}</b> changed AC to <b>${c.ac}</b>`, 'event');
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
    // Record combatants in roster for history filtering (avoid name duplicates)
    combatants.forEach(c => {
      if (!combatStartRoster.some(r => r.name === c.name)) {
        combatStartRoster.push({ name: c.name, type: c.type });
      }
    });
    saveState();
    render();
    const sortedForLog = [...combatants].sort((a, b) => b.init - a.init);
    const rosterLines  = sortedForLog.map(c => {
      const color = c.type === 'player' ? 'var(--green)' : 'var(--red)';
      return `<span style="color:${color};font-weight:700;">${esc(c.name)}</span> — Init:${c.init} ❤️:${c.hp} 🛡:${c.ac}`;
    }).join('<br>');
    addHistory(`⚔️ <b>START COMBAT!</b><br>${rosterLines}`, 'event');
    toast('⚔️ START COMBAT!');
    // Apply "start" D.o.T. for the first active combatant
    applyDotOnStart(queue[0]);
    return;
  }

  const listEl    = document.getElementById('listCombat');
  const leavingId = String(queue[0]);
  const leavingEl = listEl ? listEl.querySelector(`.card[data-id="${leavingId}"]`) : null;

  const doTurnChange = () => {
    const snap = new Map();
    if (listEl) {
      listEl.querySelectorAll('.card[data-id]').forEach(card => {
        if (card !== leavingEl) snap.set(card.dataset.id, card.getBoundingClientRect());
      });
    }

    if (leavingEl) leavingEl.remove();

    const done = queue.shift();
    queue.push(done);

    // Apply "end" D.o.T. for the combatant whose turn just ended
    applyDotOnEnd(done);

    const roundChanged = queue[0] === roundFirstId;
    if (roundChanged) {
      round++;
      // Apply "round" D.o.T. for all combatants with that timing
      applyDotOnRound();
    }

    // Apply "start" D.o.T. for the new active combatant
    applyDotOnStart(queue[0]);

    saveState();
    renderCombatScreen();

    if (roundChanged) {
      addHistory(`🔄 <b>ROUND ${round}</b>`, 'round');
      toast(`🔄 ROUND ${round}`);
    }

    if (listEl) {
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

      const returnEl = listEl.querySelector(`.card[data-id="${leavingId}"]`);
      if (returnEl) {
        returnEl.style.animation = 'none';
        void returnEl.offsetHeight;
        returnEl.style.animation = 'cardReturn 0.38s 0.18s cubic-bezier(0.34, 1.1, 0.64, 1) both';
        returnEl.addEventListener('animationend', () => { returnEl.style.animation = 'none'; }, { once: true });
      }
    }
  };

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

  combatants.forEach(c => {
    if (c.type === 'player') {
      c.hp        = c.maxHp;
      c.isDead    = false;
      c.conds     = [];
      c.dotFormula = null;
      c.dotTiming  = null;
    }
  });

  addHistory('🏆 <b>COMBAT ENDED - VICTORY!</b>', 'event');
  saveState();
  render();
  setTimeout(() => openModal('combatEndModal'), 300);
}

function closeCombatEnd() {
  closeModal('combatEndModal');
  combatants = combatants.filter(c => c.type === 'player');
  queue = queue.filter(id => {
    const c = getC(id);
    return c && c.type === 'player';
  });
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
  hpTarget      = id;
  hpStr         = '';
  hpModSelected = null;
  document.getElementById('btnResist').classList.remove('active');
  document.getElementById('btnVuln').classList.remove('active');
  refreshDisp();
  openModal('hpModal');
}

// Toggle Resist./Vuln. — tap again to deselect
function hpModToggle(val) {
  if (hpModSelected === val) {
    hpModSelected = null;
    document.getElementById('btnResist').classList.remove('active');
    document.getElementById('btnVuln').classList.remove('active');
  } else {
    hpModSelected = val;
    document.getElementById('btnResist').classList.toggle('active', val === 'resist');
    document.getElementById('btnVuln').classList.toggle('active', val === 'vuln');
  }
}

function npPress(d) {
  if (hpStr.length >= 10) return;

  if (d === 'd') {
    if (hpStr.length === 0) return;
    if (hpStr.includes('d')) return;
    if (hpStr.match(/[+\-]/)) return;
  }

  if (d === '±') {
    if (!hpStr.includes('d')) return;
    if (hpStr.includes('+')) {
      hpStr = hpStr.replace('+', '-');
    } else if (hpStr.includes('-')) {
      hpStr = hpStr.replace('-', '+');
    } else {
      const afterD = hpStr.split('d')[1];
      if (!afterD || afterD.length === 0) return;
      hpStr += '+';
    }
  } else {
    hpStr += d;
  }

  refreshDisp();
}

function npBack() {
  hpStr = hpStr.slice(0, -1);
  refreshDisp();
}

function refreshDisp() {
  const el = document.getElementById('hpDisp');
  el.textContent = hpStr || '_';
  el.style.fontSize = '40px';
}

function applyHP(sign) {
  const c = getC(hpTarget);
  closeModal('hpModal');
  if (!c) return;

  const parsed = parseDiceOrNumber(hpStr);
  if (parsed === null || parsed === 0) return;

  // Resistance/vulnerability only apply to damage (sign < 0)
  const hpMod = hpModSelected || 'none';

  const oldHp  = c.hp;
  let finalAmt = parsed;
  let modType  = 'none';

  if (sign < 0) {
    if (hpMod === 'resist') {
      finalAmt = Math.max(1, Math.floor(parsed / 2));
      modType  = 'resist';
    } else if (hpMod === 'vuln') {
      finalAmt = parsed * 2;
      modType  = 'vuln';
    }
  }

  c.hp = Math.max(0, c.hp + sign * finalAmt);

  if (oldHp > 0 && c.hp === 0) {
    c.isDead = true;
    addHistory(`<b>${esc(c.name)}:</b></br>☠️ HP reduced to 0`, 'death');
    toast(`☠️ ${esc(c.name)}'s HP reduced to 0`);
  } else {
    if (sign < 0) {
      if (modType === 'resist') {
        addHistory(`<b>${esc(c.name)}</b> 🛡 <b>resists</b> ${parsed} damage<br>Takes only 🩸<b>${finalAmt}</b> damage`, 'damage');
        toast(`<span style="color:var(--red);">🛡 ${esc(c.name)} resists the damage</span>`);
      } else if (modType === 'vuln') {
        addHistory(`<b>${esc(c.name)}</b> is 💥 <b>vulnerable</b> to ${parsed} damage<br>Takes 🩸<b>${finalAmt}</b> damage`, 'damage');
        toast(`<span style="color:var(--red);">💥 ${esc(c.name)} is vulnerable to damage</span>`);
      } else {
        addHistory(`<b>${esc(c.name)}</b> takes🩸<b>${finalAmt}</b> damage`, 'damage');
        toast(`<span style="color:var(--red);">🩸${esc(c.name)} takes ${finalAmt} damage</span>`);
      }
    } else {
      addHistory(`<b>${esc(c.name)}</b> receives 💚 <b>${finalAmt}</b> heal`, 'heal');
      toast(`<span style="color:var(--green);">💚 ${esc(c.name)} heals ${finalAmt}</span>`);
    }
  }

  saveState();
  render();
  checkCombatEnd();
}

// ────────────────────────────────────────
// ROLL MODAL
// ────────────────────────────────────────
function openRollModal() {
  rollStr = '';
  rollAdvType = 'normal';
  document.querySelectorAll('.roll-adv-btn').forEach(b => b.classList.remove('active'));
  refreshRollDisp();
  openModal('rollModal');
}

function setRollAdvType(type) {
  if (rollAdvType === type) {
    rollAdvType = 'normal';
    rollStr = '';
  } else {
    rollAdvType = type;
    rollStr = '2d20';
  }
  document.querySelectorAll('.roll-adv-btn').forEach(btn => {
    btn.classList.toggle('active', btn.id === `rollAdvBtn-${rollAdvType}`);
  });
  refreshRollDisp();
}

function rollPress(d) {
  if (rollStr.length >= 10) return;

  if (d === 'd') {
    if (rollStr.length === 0) return;
    if (rollStr.includes('d')) return;
    if (rollStr.match(/[+\-]/)) return;
  }

  if (d === '±') {
    if (!rollStr.includes('d')) return;
    if (rollStr.includes('+')) {
      rollStr = rollStr.replace('+', '-');
    } else if (rollStr.includes('-')) {
      rollStr = rollStr.replace('-', '+');
    } else {
      const afterD = rollStr.split('d')[1];
      if (!afterD || afterD.length === 0) return;
      rollStr += '+';
    }
  } else {
    // In adv mode, digits are only allowed after the ± sign has been added
    if (rollAdvType !== 'normal' && !rollStr.match(/^2d20[+-]/)) return;
    rollStr += d;
  }

  refreshRollDisp();
}

function rollBack() {
  if (rollAdvType !== 'normal') {
    if (rollStr.length > 4) rollStr = rollStr.slice(0, -1); // never delete below '2d20'
    refreshRollDisp();
    return;
  }
  rollStr = rollStr.slice(0, -1);
  refreshRollDisp();
}

function refreshRollDisp() {
  const el = document.getElementById('rollDisplay');
  el.textContent = rollStr || '_';
  el.style.fontSize = '42px';
}

function rollExecute() {
  if (rollAdvType !== 'normal') {
    let bonus = 0;
    let bonusStr = '';
    const bonusMatch = rollStr.match(/^2d20([+-]\d+)$/);
    if (bonusMatch) {
      bonus    = parseInt(bonusMatch[1]);
      bonusStr = bonus > 0 ? `+${bonus}` : `${bonus}`;
    }

    const roll1    = Math.floor(Math.random() * 20) + 1;
    const roll2    = Math.floor(Math.random() * 20) + 1;
    const usedRoll = rollAdvType === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
    const total    = usedRoll + bonus;
    const typeLabel = rollAdvType === 'advantage' ? 'Advantage' : 'Disadvantage';
    const formula  = `🎲 2d20 (${roll1}/${roll2}): ${usedRoll}${bonusStr} = ${total}`;

    addHistory(`🎲 Roll [${typeLabel}]<br>${formula}`, 'roll');
    toast(`🎲 [${typeLabel}] ${usedRoll}${bonusStr} = ${total}`);

    rollStr     = '';
    rollAdvType = 'normal';
    document.querySelectorAll('.roll-adv-btn').forEach(b => b.classList.remove('active'));
    refreshRollDisp();
    closeModal('rollModal');
    return;
  }

  const parsed = parseDiceOrNumber(rollStr);
  if (parsed === null) return;
  addHistory(`🎲 Rolled ${rollStr} = ${parsed}`, 'roll');
  toast(`🎲 ${rollStr} = ${parsed}`);
  rollStr = '';
  refreshRollDisp();
  closeModal('rollModal');
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
   // D.o.T. removed from the selectable grid; build from CONDITIONS only
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
   if (c) {
     const oldConds = [...c.conds];
     c.conds = [...pendingConds];

     // Log gained / lost conditions
     const added   = c.conds.filter(id => !oldConds.includes(id));
     const removed = oldConds.filter(id => !c.conds.includes(id));

     added.forEach(id => {
       const cd = getCond(id);
       if (cd) addHistory(`<b>${esc(c.name)}</b> gains condition:<br>🟢 <b>${cd.lbl}</b>`, 'condition');
     });
     removed.forEach(id => {
       const cd = getCond(id);
       if (cd) addHistory(`<b>${esc(c.name)}</b> loses condition:<br>🔴 <b>${cd.lbl}</b>`, 'condition');
     });
   }
   closeModal('statusModal');
   saveState();
   render();
 }

 function removeCondition(cid, condId) {
   const c = getC(cid);
   if (c) {
     const cd = getCond(condId);
     c.conds = c.conds.filter(id => id !== condId);
     if (cd) addHistory(`<b>${esc(c.name)}</b> loses condition:<br>🔴 <b>${cd.lbl}</b>`, 'condition');
   }
   saveState();
   render();
 }

// ────────────────────────────────────────
// BUILD CARD HTML
// ────────────────────────────────────────
 function buildCard(c, idx) {
   const isActive  = started && idx === 0;
   const hpPct     = c.maxHp > 0 ? c.hp / c.maxHp : 0;
   const isLow     = hpPct > 0 && hpPct <= 0.2;
   const isZero    = c.hp === 0;
   const typeClass = c.type === 'player' ? 'player' : 'monster';

   // Build normal condition chips (D.o.T. and Focus are fixed and handled separately)
   const chips = c.conds.map(condId => {
     const cd = getCond(condId);
     return cd
       ? `<span class="chip" onclick="removeCondition(${c.id},'${condId}')" title="Click to remove">${cd.lbl}</span>`
       : '';
   }).join('');

   // Fixed D.o.T. chip — active state drives click behavior
   const dotIsActive = !!c.dotFormula;
   const dotActiveClass = dotIsActive ? ' active' : '';
   // Show timing initial on chip when active: •S •E •R
   const timingMap = { start: '(S)', end: '(E)', round: '(R)' };
   const timingMark = dotIsActive && c.dotTiming ? ` ${timingMap[c.dotTiming] || ''}` : '';
   const dotClickFn = dotIsActive ? `openDotRemoveModal(${c.id})` : `openDotModal(${c.id})`;
   const dotTitle   = dotIsActive ? 'D.o.T. active — tap to remove' : 'Tap to add D.o.T.';
   const dotChip = `<span class="chip dot-chip${dotActiveClass}" onclick="${dotClickFn}" title="${dotTitle}">D.o.T.${esc(timingMark)}</span>`;

   // Fixed Focus chip (toggle)
   const focusClass = c.focus ? 'focus-chip active' : 'focus-chip';
   const focusChip = `<span class="chip ${focusClass}" onclick="toggleFocus(${c.id})" title="Toggle Focus">Focus</span>`;

   const classes = `card ${typeClass}${isActive ? ' is-active' : ''}`;

   const innerHTML = `${isActive ? '<div class="active-badge">In turn</div>' : ''}
 <div class="card-head">
   <div class="init-circle">${c.init}</div>
   <div class="card-name ${isZero ? 'is-dead' : ''}">${esc(c.name)}</div>
   <button class="btn-remove" onclick="removeCombatant(${c.id})" title="Remove combatant">❌️</button>
 </div>
 <div class="card-stats">
   <div class="hp-disp ${isLow ? 'low' : ''} ${isZero ? 'zero' : ''}" onclick="openHpModal(${c.id})" style="cursor:pointer;">
     <span class="stat-ico">❤️</span>
     <span class="stat-lbl">:</span>
     <span class="stat-val">${c.hp}/${c.maxHp}</span>
   </div>
   <div style="display:flex;align-items:center;gap:6px;">
     <div class="ac-wrap" style="cursor:pointer;" onclick="openAttackModal(${c.id})">
       <div class="ac-disp">
         <span class="stat-ico">🛡</span>
         <span class="stat-lbl">:</span>
         <span class="stat-val">${c.ac}</span>
       </div>
     </div>
     <div class="ac-adjust" title="Adjust AC">
       <button class="ac-btn" onclick="acChange(${c.id},1)">+</button>
       <button class="ac-btn" onclick="acChange(${c.id},-1)">−</button>
     </div>
   </div>
   <button class="add-cond-btn" onclick="openStatusModal(${c.id})">Cond.</button>
 </div>
 <div class="cond-row">
   ${dotChip}
   ${focusChip}
   ${chips}
 </div>`;

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

  const roundEl = document.getElementById('combatRoundNum');
  if (roundEl) roundEl.textContent = round;

  const btn = document.getElementById('nextBtnCombat');
  if (btn) {
    if (!started) {
      btn.textContent = '▶ Start';
      btn.disabled    = !canStartCombat();
    } else {
      btn.textContent = '▶ Next';
      btn.disabled    = queue.length === 0;
    }
  }

  const clearBtn = document.getElementById('btnClearHistory');
  if (clearBtn) clearBtn.disabled = started;

  const listEl = document.getElementById('listCombat');
  if (!listEl) return;

  if (queue.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <span class="empty-dragon">🐲</span>
        <h3>✦ The battlefield is empty ✦</h3>
        <p>Add players and monsters to start the combat</p>
      </div>`;
    return;
  }

  const emptyEl = listEl.querySelector('.empty-state');
  if (emptyEl) emptyEl.remove();

  const orderedEls = queue.map((id, idx) => {
    const c = getC(id);
    if (!c) return null;

    const { classes, innerHTML } = buildCard(c, idx);
    let el = listEl.querySelector(`.card[data-id="${id}"]`);

    if (el) {
      if (el.className !== classes)   el.className = classes;
      if (el.innerHTML !== innerHTML) el.innerHTML = innerHTML;
    } else {
      el = document.createElement('div');
      el.className  = classes;
      el.dataset.id = String(id);
      el.innerHTML  = innerHTML;
    }
    return el;
  }).filter(Boolean);

  [...listEl.querySelectorAll('.card[data-id]')].forEach(el => {
    if (!orderedEls.includes(el)) el.remove();
  });

  orderedEls.forEach((el, idx) => {
    const currentAtIdx = listEl.children[idx];
    if (currentAtIdx !== el) listEl.insertBefore(el, currentAtIdx || null);
  });
}

 // ────────────────────────────────────────
 // D.O.T. & FOCUS — modal and logic
 // ────────────────────────────────────────

 // ── Open modal to configure D.o.T. (only when not already active) ──
 function openDotModal(id) {
   dotTarget = id;
   dotStr = '';
   dotTimingSelected = 'start';
   // Reset timing buttons to default (Start)
   ['start','end','round'].forEach(n => {
     const btn = document.getElementById(`dotTiming-${n}`);
     if (btn) btn.classList.toggle('active', n === 'start');
   });
   refreshDotDisp();
   openModal('dotModal');
 }

 // ── Select timing toggle ──
 function setDotTiming(t) {
   dotTimingSelected = t;
   ['start','end','round'].forEach(n => {
     const btn = document.getElementById(`dotTiming-${n}`);
     if (btn) btn.classList.toggle('active', n === t);
   });
 }

 function dotPress(d) {
   if (dotStr.length >= 10) return;
   if (d === 'd') {
     if (dotStr.length === 0) return;
     if (dotStr.includes('d')) return;
     if (dotStr.match(/[+\-]/)) return;
   }
   if (d === '±') {
     if (!dotStr.includes('d')) return;
     if (dotStr.includes('+')) {
       dotStr = dotStr.replace('+', '-');
     } else if (dotStr.includes('-')) {
       dotStr = dotStr.replace('-', '+');
     } else {
       const afterD = dotStr.split('d')[1];
       if (!afterD || afterD.length === 0) return;
       dotStr += '+';
     }
   } else {
     dotStr += d;
   }
   refreshDotDisp();
 }

 function dotBack() { dotStr = dotStr.slice(0,-1); refreshDotDisp(); }

 function refreshDotDisp() {
   const el = document.getElementById('dotDisplay');
   el.textContent = dotStr || '_';
   el.style.fontSize = '42px';
 }

 function applyDot() {
   const c = getC(dotTarget);
   if (!c) return closeModal('dotModal');
   const parsed = parseDiceOrNumber(dotStr);
   if (parsed === null) { toast('Invalid D.o.T. formula'); return; }
   c.dotFormula = dotStr;
   c.dotTiming  = dotTimingSelected;
   const timingLabel = { start: 'Start of turn', end: 'End of turn', round: 'Each round' }[dotTimingSelected];
   addHistory(`<b>${esc(c.name)}</b> gets D.o.T.:<br>🩸${esc(dotStr)} • ${timingLabel}`, 'condition');
   toast(`${c.name} gets D.o.T. (${timingLabel})`);
   closeModal('dotModal');
   saveState();
   render();
 }

 // ── Open removal confirmation modal when chip is tapped while active ──
 function openDotRemoveModal(id) {
   dotRemoveTarget = id;
   const c = getC(id);
   const nameEl = document.getElementById('dotRemoveName');
   if (nameEl) nameEl.textContent = c ? c.name : '';
   openModal('dotRemoveModal');
 }

 function confirmRemoveDot() {
   const c = getC(dotRemoveTarget);
   if (c) {
     c.dotFormula = null;
     c.dotTiming  = null;
     addHistory(`<b>${esc(c.name)}</b> D.o.T. removed`, 'condition');
     toast(`${c.name} — D.o.T. removed`);
   }
   closeModal('dotRemoveModal');
   dotRemoveTarget = null;
   saveState();
   render();
 }

 // ── Focus toggle ──
 function toggleFocus(id) {
   const c = getC(id);
   if (!c) return;
   c.focus = !c.focus;
   if (c.focus) {
     addHistory(`<b>${esc(c.name)}</b> gains Focus`, 'condition');
     toast(`${c.name} focused`);
   } else {
     addHistory(`<b>${esc(c.name)}</b> loses Focus`, 'condition');
     toast(`${c.name} unfocused`);
   }
   saveState();
   render();
 }

 // ── Apply direct D.o.T. damage to a single combatant ──
 function applyDirectDamage(c, timingLabel) {
   if (!c || !c.dotFormula) return;
   const parsed = parseDiceOrNumber(c.dotFormula);
   const dmg = (parsed === null) ? 0 : parsed;
   if (dmg <= 0) return;
   const oldHp = c.hp;
   c.hp = Math.max(0, c.hp - dmg);
   if (oldHp > 0 && c.hp === 0) {
     c.isDead = true;
     addHistory(`<b>${esc(c.name)}:</b><br>☠️ HP reduced to 0 (from D.o.T.)`, 'death');
     toast(`☠️ ${esc(c.name)}'s HP reduced to 0`);
   } else {
     addHistory(`<b>${esc(c.name)}</b> takes <br>🩸<b>${dmg}</b> D.o.T. damage (${timingLabel})`, 'damage');
     toast(`<span style="color:var(--red);">🩸 ${esc(c.name)} takes ${dmg} D.o.T.</span>`);
   }
   saveState();
   render();
   checkCombatEnd();
 }

 // ── Fire D.o.T. at the START of a combatant's turn ──
 function applyDotOnStart(id) {
   const c = getC(id);
   if (c && c.dotFormula && c.dotTiming === 'start') {
     applyDirectDamage(c, 'start of turn');
   }
 }

 // ── Fire D.o.T. at the END of a combatant's turn ──
 function applyDotOnEnd(id) {
   const c = getC(id);
   if (c && c.dotFormula && c.dotTiming === 'end') {
     applyDirectDamage(c, 'end of turn');
   }
 }

 // ── Fire D.o.T. for all combatants with "round" timing ──
 function applyDotOnRound() {
   combatants.forEach(c => {
     if (c.dotFormula && c.dotTiming === 'round') {
       applyDirectDamage(c, 'end of round');
     }
   });
 }

 // ────────────────────────────────────────
 // RENDER COMBAT SCREEN
 // ────────────────────────────────────────
 function renderCombatScreen() {
   document.getElementById('combatRoundNum').textContent = round;
   render();
 }

// ────────────────────────────────────────
// TOAST
// ────────────────────────────────────────
function toast(msg) {
  const el = document.getElementById('toast');
  el.innerHTML = msg;
  el.classList.add('vis');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('vis'), 2800);
}

// ────────────────────────────────────────
// KEYBOARD
// ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['addModal','hpModal','statusModal','attackModal','deleteConfirmModal','rollModal','dotModal','dotRemoveModal'].forEach(closeModal);
  }
});

// Hide suggestions if name input loses focus
document.getElementById('a-name').addEventListener('blur', () => {
  setTimeout(() => {
    document.getElementById('monster-suggestions').innerHTML = '';
    currentSuggestions = [];
  }, 200);
});

// ────────────────────────────────────────
// VISUAL VIEWPORT — keep modals & toast
// above the virtual keyboard on mobile
// ────────────────────────────────────────
function onViewportChange() {
  const vv = window.visualViewport;
  if (!vv) return;

  const keyboardH = window.innerHeight - vv.height - vv.offsetTop;

  document.querySelectorAll('.overlay').forEach(el => {
    el.style.top    = vv.offsetTop + 'px';
    el.style.height = vv.height + 'px';
  });

  const toastEl = document.getElementById('toast');
  toastEl.style.bottom = (30 + Math.max(0, keyboardH)) + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', onViewportChange);
  window.visualViewport.addEventListener('scroll', onViewportChange);
}

// ────────────────────────────────────────
// INIT
// ────────────────────────────────────────
loadState();
loadMonstersData();
render();
switchScreen('screenHome');
renderHistoryLog();