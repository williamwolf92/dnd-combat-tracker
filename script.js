 // ────────────────────────────────────────
 // CONDITION LIST
 // ────────────────────────────────────────
 const CONDITIONS = [
   { id:'exhaustion',    lbl:'Agotado' },
   { id:'grappled',      lbl:'Amarrado' },
   { id:'frightened',    lbl:'Asustado' },
   { id:'stunned',       lbl:'Aturdido' },
   { id:'blinded',       lbl:'Cegado' },
   { id:'charmed',       lbl:'Encantado' },
   { id:'poisoned',      lbl:'Envenenado' },
   { id:'incapacitated', lbl:'Incapacitado' },
   { id:'unconscious',   lbl:'Inconsciente' },
   { id:'invisible',     lbl:'Invisible' },
   { id:'paralyzed',     lbl:'Paralizado' },
   { id:'petrified',     lbl:'Petrificado' },
   { id:'restrained',    lbl:'Restringido' },
   { id:'deafened',      lbl:'Sordo' },
   { id:'prone',         lbl:'Tumbado' },
 ];

// ────────────────────────────────────────
// MONSTER AUTOCOMPLETE DATA
// ────────────────────────────────────────
let monstersData       = [];
let currentSuggestions = [];
let bestiaryIndex      = new Map(); // clave: nombre en minúsculas (sin .md) -> nombre real de archivo (sin .md)

const MONSTERS_CACHE_KEY = 'dnd_monsters_cache';

// Parsea una línea CSV respetando campos entre comillas (soporta comas y comillas dobles escapadas)
function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  fields.push(cur);
  return fields.map(f => f.trim());
}

function parseMonstersText(text) {
  const results = [];
  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return results;

  // Leer encabezado para mapear columnas: name,init,hp,ac
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const idxName   = header.indexOf('name');
  const idxInit   = header.indexOf('init');
  const idxHp     = header.indexOf('hp');
  const idxAc     = header.indexOf('ac');
  const idxSource = header.indexOf('source');

  if (idxName === -1 || idxInit === -1 || idxHp === -1 || idxAc === -1) {
    return results;
  }

  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const cols   = parseCSVLine(t);
    const name   = cols[idxName];
    const init   = cols[idxInit];
    const hp     = cols[idxHp];
    const ac     = cols[idxAc];
    const source = idxSource !== -1 ? (cols[idxSource] || '') : '';
    if (name && init !== undefined && hp !== undefined && ac !== undefined) {
      results.push({
        name:   name.trim(),
        init:   init.trim(),
        hp:     hp.trim(),
        ac:     ac.trim(),
        source: source.trim()
      });
    }
  }
  return results;
}

async function loadMonstersData() {
  // Helper: XHR loader — handles file:// (status 0) and http:// (status 200)
  function xhrLoad(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onload = () => {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`XHR ${xhr.status}`));
        }
      };
      xhr.onerror   = () => reject(new Error('XHR error'));
      xhr.ontimeout = () => reject(new Error('XHR timeout'));
      xhr.send();
    });
  }

  // 1. Try fetch (HTTP/HTTPS)
  let text = null;
  try {
    const res = await fetch('add_monsters_index.csv');
    if (res.ok) text = await res.text();
  } catch(e) { /* fetch blocked on file:// — try XHR */ }

  // 2. Try XHR (works on file:// in Firefox and some Chromium builds)
  if (!text) {
    try { text = await xhrLoad('add_monsters_index.csv'); } catch(e) {}
  }

  if (text) {
    const parsed = parseMonstersText(text);
    if (parsed.length > 0) {
      monstersData = parsed;
      try { localStorage.setItem(MONSTERS_CACHE_KEY, JSON.stringify(parsed)); } catch(e) {}
      console.log(`Monsters loaded: ${parsed.length} entries`);
      return;
    }
  }

  // 3. Fall back to localStorage cache (works after any prior online load)
  try {
    const cached = localStorage.getItem(MONSTERS_CACHE_KEY);
    if (cached) {
      monstersData = JSON.parse(cached);
      console.log(`Monsters loaded from cache: ${monstersData.length} entries`);
    }
  } catch(e) { console.warn('Could not load monsters data:', e); }
}

async function loadBestiaryIndex() {
  function xhrLoad(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 5000;
      xhr.onload = () => {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`XHR ${xhr.status}`));
        }
      };
      xhr.onerror   = () => reject(new Error('XHR error'));
      xhr.ontimeout = () => reject(new Error('XHR timeout'));
      xhr.send();
    });
  }

  let text = null;
  try {
    const res = await fetch('bestiary_stats_index.txt');
    if (res.ok) text = await res.text();
  } catch(e) {}
  if (!text) {
    try { text = await xhrLoad('bestiary_stats_index.txt'); } catch(e) {}
  }
  if (!text) { console.warn('Could not load bestiary index'); return; }

  for (const line of text.split('\n')) {
    const t = line.trim().replace(/\r/g, '');
    if (t.toLowerCase().endsWith('.md')) {
      const realName = t.slice(0, -3); // quita ".md" conservando mayúsculas/minúsculas originales
      bestiaryIndex.set(realName.toLowerCase(), realName);
    }
  }
  console.log(`Bestiary index loaded: ${bestiaryIndex.size} entries`);
}

// Busca el archivo .md correspondiente a un nombre de monstruo.
// No hay conversión de nombre: "Wolf (MPMM)" busca directamente "Wolf (MPMM).md",
// sin distinguir mayúsculas/minúsculas.
function findBestStatFile(name) {
  const key = name.trim().toLowerCase();
  if (bestiaryIndex.has(key)) return bestiaryIndex.get(key);
  // Strip trailing number suffix (e.g. "Goblin 1" → "Goblin")
  const stripped = name.replace(/\s+\d+$/, '').trim();
  if (stripped !== name) {
    const strippedKey = stripped.toLowerCase();
    if (bestiaryIndex.has(strippedKey)) return bestiaryIndex.get(strippedKey);
  }
  return null;
}

// ── Clasifica un carácter como 'space' (espacio), 'punct' (puntuación),
//    'word' (letra/número/etc.) o 'edge' (inicio/fin de la cadena).
//    Se usa para decidir si una tanda de asteriscos puede abrir y/o cerrar
//    énfasis, siguiendo la misma regla que el markdown estándar.
function mdCharType(ch){
  if (ch === undefined) return 'edge';
  if (/\s/.test(ch)) return 'space';
  if (/[!-\/:-@\[-`{-~]/.test(ch)) return 'punct';
  return 'word';
}

// ── Emparejador de énfasis (negrita/cursiva) con asteriscos ──
// A diferencia de un simple regex, empareja tandas de asteriscos de forma
// correcta aunque el número de asteriscos no coincida en ambos lados
// (p. ej. "*texto**" produce "<em>texto</em>*", dejando el asterisco sobrante
// como texto literal, tal como en markdown estándar), y resuelve
// correctamente el anidado de ***negrita+cursiva***.
function mdParseEmphasis(text){
  const tokens = [];
  const re = /(\*+)|([^*]+)/g;
  let m;
  while ((m = re.exec(text)) !== null){
    if (m[1]) tokens.push({ type:'delim', remaining:m[1].length, parts:[] });
    else tokens.push({ type:'text', val:m[2] });
  }

  for (let i = 0; i < tokens.length; i++){
    if (tokens[i].type !== 'delim') continue;
    const prevText = (i > 0 && tokens[i-1].type === 'text') ? tokens[i-1].val : '';
    const nextText = (i < tokens.length-1 && tokens[i+1].type === 'text') ? tokens[i+1].val : '';
    const beforeChar = prevText.length ? prevText[prevText.length-1] : undefined;
    const afterChar  = nextText.length ? nextText[0] : undefined;
    const beforeType = (i === 0) ? 'edge' : mdCharType(beforeChar);
    const afterType  = (i === tokens.length-1) ? 'edge' : mdCharType(afterChar);

    const leftFlanking  = afterType !== 'space' && afterType !== 'edge' &&
      (afterType !== 'punct' || beforeType === 'space' || beforeType === 'punct' || beforeType === 'edge');
    const rightFlanking = beforeType !== 'space' && beforeType !== 'edge' &&
      (beforeType !== 'punct' || afterType === 'space' || afterType === 'punct' || afterType === 'edge');

    tokens[i].canOpen  = leftFlanking;
    tokens[i].canClose = rightFlanking;
  }

  const stack = [];
  for (let i = 0; i < tokens.length; i++){
    const t = tokens[i];
    if (t.type !== 'delim') continue;

    if (t.canClose){
      const closeEventsThisPass = [];
      while (t.remaining > 0 && stack.length){
        const openIdx = stack[stack.length - 1];
        const opener = tokens[openIdx];
        if (opener.remaining <= 0){ stack.pop(); continue; }
        const use = Math.min(2, t.remaining, opener.remaining);
        const tag = use === 2 ? 'strong' : 'em';
        opener.remaining -= use;
        t.remaining -= use;
        opener.parts.push({ tag, role:'open' });
        closeEventsThisPass.push({ tag, role:'close' });
        if (opener.remaining === 0){
          const idx = stack.indexOf(openIdx);
          if (idx !== -1) stack.splice(idx, 1);
        }
      }
      closeEventsThisPass.reverse();
      t.parts.push(...closeEventsThisPass);
    }
    if (t.remaining > 0 && t.canOpen) stack.push(i);
  }

  let out = '';
  for (const t of tokens){
    if (t.type === 'text'){ out += t.val; continue; }
    for (const p of t.parts){
      if (p.tag === 'strong') out += (p.role === 'open' ? '<strong>' : '</strong>');
      else out += (p.role === 'open' ? '<em>' : '</em>');
    }
    out += '*'.repeat(t.remaining); // asteriscos sobrantes sin pareja → literales
  }
  return out;
}

// ── Stat block modal: conversor Markdown → HTML ──
// (misma lógica que el "Convertidor Markdown a HTML": sin dependencias externas)
function mdInlineFormat(text){
  // escapar
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // negrita / cursiva / negrita+cursiva, con emparejamiento correcto de asteriscos
  text = mdParseEmphasis(text);
  // código en línea
  text = text.replace(/`(.+?)`/g, "<code>$1</code>");
  return text;
}

// Parsea un bloque de líneas (nivel raíz o contenido interno de un blockquote)
// usando siempre la misma lógica, para que el renderizado sea idéntico dentro
// y fuera de una cita. Llama a sí misma de forma recursiva para citas anidadas.
function mdParseLines(lines){
  let html = "";
  let i = 0;
  let inList = false;

  function closeListIfOpen(){
    if(inList){ html += "</ul>\n"; inList = false; }
  }

  while(i < lines.length){
    let line = lines[i];

    if(line.trim() === ""){
      closeListIfOpen();
      i++;
      continue;
    }

    // tabla: fila de encabezado seguida de fila separadora
    if(/^\s*\|.*\|\s*$/.test(line) && lines[i+1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1])){
      closeListIfOpen();
      const headerCells = line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      // fila separadora: detecta alineación por columna (:---, :---:, ---:)
      const alignCells = lines[i+1].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const aligns = alignCells.map(c => {
        const left = c.startsWith(":");
        const right = c.endsWith(":");
        if(left && right) return "center";
        if(right) return "right";
        if(left) return "left";
        return null;
      });
      const alignAttr = idx => aligns[idx] ? " style=\"text-align:" + aligns[idx] + "\"" : "";
      let tbl = "<table>\n<thead><tr>";
      headerCells.forEach((c, idx) => tbl += "<th" + alignAttr(idx) + ">" + mdInlineFormat(c) + "</th>");
      tbl += "</tr></thead>\n<tbody>\n";
      i += 2;
      while(i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])){
        const rowCells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        tbl += "<tr>";
        rowCells.forEach((c, idx) => tbl += "<td" + alignAttr(idx) + ">" + mdInlineFormat(c) + "</td>");
        tbl += "</tr>\n";
        i++;
      }
      tbl += "</tbody>\n</table>\n";
      html += tbl;
      continue;
    }

    // encabezados
    let h = line.match(/^(#{1,6})\s+(.*)$/);
    if(h){
      closeListIfOpen();
      const level = h[1].length;
      html += "<h" + level + ">" + mdInlineFormat(h[2]) + "</h" + level + ">\n";
      i++;
      continue;
    }

    // regla horizontal
    if(/^\s*(---|\*\*\*|___)\s*$/.test(line)){
      closeListIfOpen();
      html += "<hr>\n";
      i++;
      continue;
    }

    // cita (recursiva: el contenido interno se procesa con este mismo parser)
    if(/^\s*>\s?/.test(line)){
      closeListIfOpen();
      let quoteLines = [];
      while(i < lines.length && /^\s*>\s?/.test(lines[i])){
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      html += "<blockquote>\n" + mdParseLines(quoteLines) + "</blockquote>\n";
      continue;
    }

    // lista (con soporte para líneas de continuación "perezosas": una línea
    // simple justo después de un elemento de lista, sin línea vacía de por
    // medio, se anexa al mismo <li> en vez de crear un párrafo aparte)
    let li = line.match(/^\s*[-*]\s+(.*)$/);
    if(li){
      if(!inList){ html += "<ul>\n"; inList = true; }
      let itemLines = [li[1]];
      i++;
      while(i < lines.length){
        let cl = lines[i];
        if(cl.trim() === "") break;
        if(/^\s*[-*]\s+(.*)$/.test(cl)) break;
        if(/^\s*\|.*\|\s*$/.test(cl) && lines[i+1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1])) break;
        if(/^(#{1,6})\s+(.*)$/.test(cl)) break;
        if(/^\s*(---|\*\*\*|___)\s*$/.test(cl)) break;
        if(/^\s*>\s?/.test(cl)) break;
        itemLines.push(cl);
        i++;
      }
      let itemHtml = "";
      for(let idx = 0; idx < itemLines.length; idx++){
        const isLast = idx === itemLines.length - 1;
        const hasHardBreak = /  +$/.test(itemLines[idx]);
        itemHtml += mdInlineFormat(itemLines[idx].trim());
        if(!isLast){
          itemHtml += hasHardBreak ? "<br>\n" : " ";
        }
      }
      html += "<li>" + itemHtml + "</li>\n";
      continue;
    }

    // párrafo normal: se agrupan las líneas consecutivas no vacías
    // (y que no pertenezcan a otro tipo de bloque) en un mismo <p>.
    // Si una línea termina en 2+ espacios, se inserta <br> antes de
    // pasar a la siguiente línea del mismo párrafo (salto de línea estándar).
    closeListIfOpen();
    let paraLines = [];
    while(i < lines.length){
      let pl = lines[i];
      if(pl.trim() === "") break;
      if(/^\s*\|.*\|\s*$/.test(pl) && lines[i+1] && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i+1])) break;
      if(/^(#{1,6})\s+(.*)$/.test(pl)) break;
      if(/^\s*(---|\*\*\*|___)\s*$/.test(pl)) break;
      if(/^\s*>\s?/.test(pl)) break;
      if(/^\s*[-*]\s+(.*)$/.test(pl)) break;
      paraLines.push(pl);
      i++;
    }
    let paraHtml = "";
    for(let idx = 0; idx < paraLines.length; idx++){
      const isLast = idx === paraLines.length - 1;
      const hasHardBreak = /  +$/.test(paraLines[idx]);
      paraHtml += mdInlineFormat(paraLines[idx].trim());
      if(!isLast){
        paraHtml += hasHardBreak ? "<br>\n" : " ";
      }
    }
    html += "<p>" + paraHtml + "</p>\n";
  }

  closeListIfOpen();
  return html;
}

function mdConvertMarkdown(src){
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  return mdParseLines(lines);
}

function renderStatblockMarkdown(md) {
  document.getElementById('statblockContent').innerHTML = `
    <div class="sb-header">
      <button class="sb-close" onclick="closeModal('statblockModal')">✕</button>
    </div>
    <div class="statblock">${mdConvertMarkdown(md)}</div>`;
}

async function openStatblockModal(combatantId) {
  const c = getC(combatantId);
  if (!c || c.type !== 'monster') return;

  // El nombre puede llevar un sufijo de cantidad (ej. "Goblin 1"); se quita
  // antes de combinarlo con el source para armar el nombre buscado.
  // No hay conversión: se busca directamente "Nombre (Source).md",
  // sin distinguir mayúsculas/minúsculas.
  const baseName   = c.name.replace(/\s+\d+$/, '');
  const lookupName = c.source ? `${baseName} (${c.source})` : baseName;

  let filename = findBestStatFile(lookupName);
  // Respaldo: si no hay coincidencia con el source, probar solo con el nombre
  if (!filename && c.source) filename = findBestStatFile(baseName);

  if (!filename) {
    toast('No se encontraron las estadísticas de ' + esc(c.name));
    return;
  }

  document.getElementById('statblockContent').innerHTML =
    '<div class="sb-header"><button class="sb-close" onclick="closeModal(\'statblockModal\')">✕</button></div><div class="sb-loading">Cargando...</div>';
  openModal('statblockModal');

  try {
    const res = await fetch(`bestiary_stats/${encodeURIComponent(filename)}.md`);
    if (!res.ok) throw new Error('Not found');
    const md = await res.text();
    renderStatblockMarkdown(md);
  } catch(e) {
    document.getElementById('statblockContent').innerHTML =
      '<div class="sb-header"><button class="sb-close" onclick="closeModal(\'statblockModal\')">✕</button></div><div class="sb-loading">No se pudieron cargar las estadísticas.</div>';
  }
}


function onNameInput() {
  const nameInput = document.getElementById('a-name');
  const query     = nameInput.value.trim().toLowerCase();
  const container = document.getElementById('monster-suggestions');

  if (!query) { container.innerHTML = ''; currentSuggestions = []; return; }

  // Priority: startsWith first, then contains — max 5 total
  const starts   = monstersData.filter(m => m.name.toLowerCase().startsWith(query));
  const contains = monstersData.filter(m => !m.name.toLowerCase().startsWith(query) && m.name.toLowerCase().includes(query));
  currentSuggestions = [...starts, ...contains].slice(0, 5);

  if (currentSuggestions.length === 0) { container.innerHTML = ''; return; }
  container.innerHTML = currentSuggestions
    .map((m, i) => `<div class="monster-suggestion-item" onmousedown="event.preventDefault()" onclick="selectMonsterSuggestion(${i})">${esc(m.name)}${m.source ? ` <span class="suggestion-source">(${esc(m.source)})</span>` : ''}</div>`)
    .join('');
}

// Combina nombre + source en un solo texto "Nombre (Source)", que es el
// formato que usa el resto de la app (ficha de estadísticas, listado, etc.)
function combineNameSource(name, source) {
  return source ? `${name} (${source})` : name;
}

// Separa un texto "Nombre (Source)" en sus dos partes. Si no hay paréntesis
// al final, source queda vacío.
function splitNameSource(raw) {
  const match = raw.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (match) return { name: match[1].trim(), source: match[2].trim() };
  return { name: raw.trim(), source: '' };
}

function selectMonsterSuggestion(idx) {
  const m = currentSuggestions[idx];
  if (!m) return;
  const nameInput = document.getElementById('a-name');
  nameInput.value = combineNameSource(m.name, m.source);
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
let pendingRollEntries = []; // accumulates roll results before flushing to history on close

// Attack modal state
let attackTarget     = null;
let selectedAttackType = 'normal';

// HP mod toggle state
let hpModSelected = null; // 'resist' | 'vuln' | null
let pendingHpEntries = []; // accumulates HP actions before flushing to history on close


// Delete confirmation state
let pendingDeleteId = null;

// Death Save modal state
let deathSaveTarget  = null;
let deathSaveAdvType = 'normal'; // 'normal' | 'advantage' | 'disadvantage'

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
  sel.innerHTML = '<option value="all">Todos</option>';
  combatStartRoster.forEach(c => {
    const prefix = c.type === 'player' ? '(J)' : '(M)';
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
      <h3>✦ Sin eventos ✦</h3>
      <p>El historial se mostrará aquí</p>
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
  toast('Historial borrado');
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
// Initiative rule state: 'roll' | 'ten'
let initRule = 'roll';
// Initiative advantage state: 'plus' | 'minus' | null
let initAdv = null;

function setInitRule(rule) {
  initRule = rule;
  document.getElementById('initRuleRoll').classList.toggle('active', rule === 'roll');
  document.getElementById('initRule10').classList.toggle('active', rule === 'ten');
}

function setInitAdv(adv) {
  initAdv = initAdv === adv ? null : adv;
  document.getElementById('initAdvPlus').classList.toggle('active', initAdv === 'plus');
  document.getElementById('initAdvMinus').classList.toggle('active', initAdv === 'minus');
}

function openAddModal() {
  ['a-name','a-init','a-hp','a-ac'].forEach(i => document.getElementById(i).value = '');
  document.getElementById('a-qty').value = '1';
  document.getElementById('monster-suggestions').innerHTML = '';
  currentSuggestions = [];
  // Reset initiative toggles
  initRule = 'roll';
  initAdv = null;
  document.getElementById('initRuleRoll').classList.add('active');
  document.getElementById('initRule10').classList.remove('active');
  document.getElementById('initAdvPlus').classList.remove('active');
  document.getElementById('initAdvMinus').classList.remove('active');
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

// ── CON Mod stepper (used in conSave modal) ──
function conSaveStep(delta) {
  const inp = document.getElementById('cs-con');
  const n   = parseInt(inp.value || '0', 10);
  inp.value = String(Math.max(-10, Math.min(10, (isNaN(n) ? 0 : n) + delta)));
}

// ── Qty stepper ──
function qtyStep(delta) {
  const inp = document.getElementById('a-qty');
  const n   = parseInt(inp.value || '1', 10);
  inp.value = String(Math.max(1, Math.min(20, (isNaN(n) ? 1 : n) + delta)));
}

// ── Parse initiative: uses initRule and initAdv toggles ──
// If str is "+X"/"-X" (modifier): apply initRule (roll or 10) + mod + adv bonus
// If str is plain "N" (fixed): use N + adv bonus
function parseInitiative(str) {
  if (!str) return null;
  str = str.trim();

  let advBonus = 0;
  if (initAdv === 'plus')  advBonus = 5;
  if (initAdv === 'minus') advBonus = -5;

  if (/^[+\-]\d+$/.test(str)) {
    const mod = parseInt(str, 10);
    let base;
    if (initRule === 'ten') {
      base = 10;
    } else {
      base = Math.floor(Math.random() * 20) + 1;
    }
    return base + mod + advBonus;
  }
  const n = parseInt(str, 10);
  if (!isNaN(n) && n > 0) return n + advBonus;
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

// ── HP dice roller: supports #  |  #d#  |  #d#±#  |  multi-term e.g. 1d8+4+2d10+5 ──
function parseDiceOrNumber(str) {
  if (!str) return null;
  str = str.trim();

  // Tokenize: split on + or - keeping the sign with each token
  // e.g. "1d8+4+2d10-5" → ["1d8", "+4", "+2d10", "-5"]
  const tokenRe = /[+\-]?(?:\d+d\d+|\d+)/g;
  const tokens  = str.match(tokenRe);
  if (!tokens || tokens.join('').replace(/[+\-]/g,'') !== str.replace(/[+\-]/g,'')) return null;

  let total = 0;

  for (const token of tokens) {
    const sign = token[0] === '-' ? -1 : 1;
    const part = (token[0] === '+' || token[0] === '-') ? token.slice(1) : token;

    if (part.includes('d')) {
      const m = part.match(/^(\d+)d(\d+)$/);
      if (!m) return null;
      const count = parseInt(m[1], 10);
      const sides = parseInt(m[2], 10);
      if (count < 1 || sides < 1) return null;
      let rolled = 0;
      for (let i = 0; i < count; i++) rolled += Math.floor(Math.random() * sides) + 1;
      total += sign * rolled;
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n)) return null;
      total += sign * n;
    }
  }

  return total > 0 ? total : null;
}

function addCombatant(type) {
  const rawName = document.getElementById('a-name').value.trim();
  if (!rawName) { toast('✦ Por favor, ingresa un nombre'); return; }

  const { name, source } = splitNameSource(rawName);
  const initStr = document.getElementById('a-init').value.trim();
  const hpStr   = document.getElementById('a-hp').value.trim();
  const ac      = Math.max(1, parseInt(document.getElementById('a-ac').value) || 10);
  const qty     = Math.max(1, Math.min(20, parseInt(document.getElementById('a-qty').value) || 1));

  closeModal('addModal');

  const toastColor = type === 'player' ? 'var(--green)' : 'var(--red)'; // ← color por tipo
  let lastInit = 10;
  let lastCombatant = null; // ← referencia fuera del loop

  for (let i = 0; i < qty; i++) {
    const combatantName = qty > 1 ? `${name} ${i + 1}` : name;
    const init = parseInitiative(initStr) ?? 10;
    const hp   = Math.max(1, parseDiceOrNumber(hpStr) ?? 10);
    lastInit   = init;

    const c = { id: uid++, name: combatantName, source, init, hp, maxHp: hp, ac, conMod: 0, conds: [], isDead: false, type, successes: 0, failures: 0, permaDead: false };
    combatants.push(c);
    insertInQueue(c.id);
    lastCombatant = c; // ← guardar referencia

    if (started && !combatStartRoster.some(r => r.name === combatantName)) {
      combatStartRoster.push({ name: combatantName, type: c.type });
      if (currentScreen === 'screenHistory') populateHistoryFilter();
    }

    const enterColor = type === 'player' ? 'var(--green)' : 'var(--red)';
    addHistory(`<span style="color:${enterColor};font-weight:700;">${esc(combatantName)}</span> entra al combate:<br>Ini: ${init} | ❤️: ${hp} | 🛡: ${ac}`, 'event');
  }

  saveState();
  render();

  // ↓ Ahora usa lastCombatant y aplica color
  if (qty === 1) {
    toast(`<span style="color:${toastColor};font-weight:700;">${esc(lastCombatant.name)}</span> entra al combate - Ini.: ${lastInit}`);
  } else {
    toast(`<span style="color:${toastColor};font-weight:700;">${qty}× ${esc(name)}</span> entran al combate`);
  }
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
  openModal('deleteConfirmModal');
}

function confirmDelete(mode) {
  closeModal('deleteConfirmModal');

  if (mode === 'this') {
    if (!pendingDeleteId) return;
    _doRemoveSingle(pendingDeleteId);
  } else if (mode === 'all') {
    const ids = [...combatants.map(c => c.id)];
    ids.forEach(id => _doRemoveSingle(id, true));
    _postBatchRemove('Todos los combatientes removidos');
  } else if (mode === 'players') {
    const ids = combatants.filter(c => c.type === 'player').map(c => c.id);
    if (ids.length === 0) { toast('No hay jugadores'); return; }
    ids.forEach(id => _doRemoveSingle(id, true));
    _postBatchRemove('Todos los jugadores removidos');
  } else if (mode === 'monsters') {
    const ids = combatants.filter(c => c.type === 'monster').map(c => c.id);
    if (ids.length === 0) { toast('No hay monstruos'); return; }
    ids.forEach(id => _doRemoveSingle(id, true));
    _postBatchRemove('Todos los monstruos removidos');
  }

  pendingDeleteId = null;
}

// Removes a single combatant by id synchronously (no animation for batch)
function _doRemoveSingle(id, batch = false) {
  const c = getC(id);
  if (!c) return;
  const name = c.name;

  const listEl = document.getElementById('listCombat');
  const el = listEl ? listEl.querySelector(`.card[data-id="${id}"]`) : null;

  combatants = combatants.filter(c => c.id !== id);
  queue      = queue.filter(q => q !== id);
  if (roundFirstId === id) roundFirstId = queue[0] || null;

  if (combatants.length === 0) {
    started = false;
    round = 1;
    roundFirstId = null;
  }

  addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(name)}</span> removido del combate`, 'event');

  if (el) el.remove();

  if (!batch) {
    saveState();
    render();
  }
}

function _postBatchRemove(msg) {
  saveState();
  render();
  toast(msg);
}

// ────────────────────────────────────────
// AC AND ATTACK
// ────────────────────────────────────────
function openAttackModal(id) {
  attackTarget = id;
  document.getElementById('attackBonus').value = '0';
  setAttackType('normal');
  document.getElementById('resultMessage').innerHTML = '<span class="attack-ready-msg">Listo para Atacar</span>';
  document.getElementById('resultFormula').textContent = '';
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
    resultMsg = '<span style="color:#ff0000; font-weight:bold;">💥 ¡IMPACTO CRÍTICO!</span>';
  } else {
    resultMsg = `<span style="color:${hit ? 'var(--green)' : 'var(--red)'}; font-weight:bold;">${hit ? 'IMPACTO' : 'FALLO'}</span>`;
  }

  const bonusStr = (bonus !== 0) ? ` (${bonus > 0 ? '+' : ''}${bonus})` : '';
  let formula = '';

  if (type === 'normal') {
    formula = `🎲 1d20: ${usedRoll}${bonusStr} = <b>${total}</b> ${total >= c.ac ? '≥' : '<'} 🛡${c.ac}`;
  } else if (type === 'advantage') {
    formula = `🎲 2d20 (${roll1}/${roll2}): ${usedRoll}${bonusStr} = <b>${total}</b> ${total >= c.ac ? '≥' : '<'} 🛡${c.ac}`;
  } else if (type === 'disadvantage') {
    formula = `🎲 2d20 (${roll1}/${roll2}): ${usedRoll}${bonusStr} = <b>${total}</b> ${total >= c.ac ? '≥' : '<'} 🛡${c.ac}`;
  }

  document.getElementById('resultMessage').innerHTML = resultMsg;
  document.getElementById('resultFormula').innerHTML = formula;

  addHistory(`Ataque vs. <span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> | <b>${crit ? '¡CRÍTICO!' : (hit ? 'IMPACTA' : 'FALLA')}</b><br>${formula}`, 'attack');
}

function acChange(id, delta) {
  const c = getC(id);
  if (!c) return;
  c.ac = Math.max(1, (c.ac || 0) + delta);
  addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span><br>Cambia su AC a <b>${c.ac}</b>`, 'event');
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
    // Clear history for a fresh combat log — START COMBAT will be the first entry
    history           = [];
    combatStartRoster = [];
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
      return `<span style="color:${color};font-weight:700;">${esc(c.name)}</span><br>Ini: ${c.init} | ❤️: ${c.hp} | 🛡: ${c.ac}<br>`;
    }).join('<br>');
    addHistory(`⚔️<b> COMBATE INICIADO </b>⚔️<br><br>${rosterLines}`, 'event');
    const firstC = getC(queue[0]);
    if (firstC) {
      const turnColor = firstC.type === 'player' ? 'var(--green)' : 'var(--red)';
      addHistory(`Turno de <span style="color:${turnColor};font-weight:700;">${esc(firstC.name)}</span><br>❤️ HP: ${firstC.hp}/${firstC.maxHp}`, 'turn');
    }
    toast('⚔️ COMBATE INICIADO ⚔️');
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

    const roundChanged = queue[0] === roundFirstId;
    if (roundChanged) {
      round++;
    }

    saveState();
    renderCombatScreen();

    const activeC = getC(queue[0]);
    if (activeC) {
      const turnColor = activeC.type === 'player' ? 'var(--green)' : 'var(--red)';
      addHistory(`Turno de <span style="color:${turnColor};font-weight:700;">${esc(activeC.name)}</span><br>❤️ HP: ${activeC.hp}/${activeC.maxHp}`, 'turn');
    }

    if (roundChanged) {
      addHistory(`🔄 <b>RONDA ${round}</b>`, 'round');
      toast(`🔄 RONDA ${round}`);
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
  if (monsters.length > 0 && monsters.every(m => m.permaDead)) {
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
      c.successes = 0;
      c.failures  = 0;
      c.permaDead = false;
    }
  });

  addHistory('⚔️<b> COMBATE TERMINADO </b>⚔️<br>Todos los monstruos han sido derrotados<br><br><b>🏆 ¡VICTORIA! 🏆</b>', 'event');
  saveState();
  render();
  setTimeout(() => openModal('combatEndModal'), 300);
}

function closeCombatEnd() {
  closeModal('combatEndModal');
  started      = false;
  round        = 1;
  roundFirstId = null;
  saveState();
  render();
}

function checkCombatDefeat() {
  if (!started) return;
  const players = combatants.filter(c => c.type === 'player');
  if (players.length > 0 && players.every(p => p.permaDead)) {
    triggerCombatDefeat();
  }
}

function triggerCombatDefeat() {
  started      = false;
  round        = 1;
  roundFirstId = null;
  addHistory('⚔️<b> COMBATE TERMINADO </b>⚔️<br>Todos los jugadores han sido derrotados<br><br>️<b>☠️ ¡DERROTA! ☠️</b>', 'event');
  saveState();
  render();
  setTimeout(() => openModal('combatDefeatModal'), 300);
}

function closeCombatDefeat() {
  closeModal('combatDefeatModal');
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
  const c = getC(id);
  // If combatant is in turn AND at 0 HP (and not permaDead) → Death Save modal
  if (c && c.hp === 0 && !c.permaDead && started && queue[0] === id) {
    openDeathSaveModal(id);
    return;
  }
  pendingHpEntries = [];
  hpTarget      = id;
  hpStr         = '';
  hpModSelected = null;
  document.getElementById('btnResist').classList.remove('active');
  document.getElementById('btnVuln').classList.remove('active');
  refreshDisp();
  const list = document.getElementById('hpResultsList');
  if (list) list.innerHTML = '';
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
  if (d === 'd') {
    if (hpStr.length >= 16) return;
    // Debe haber al menos un dígito antes
    if (hpStr.length === 0) return;
    const lastChar = hpStr[hpStr.length - 1];
    if (!/\d/.test(lastChar)) return;
    // El último token (tras el último +/-) no puede tener ya una 'd'
    const lastSignIdx = Math.max(hpStr.lastIndexOf('+'), hpStr.lastIndexOf('-'));
    const lastToken   = lastSignIdx >= 0 ? hpStr.slice(lastSignIdx + 1) : hpStr;
    if (lastToken.includes('d')) return;
    hpStr += d;

  } else if (d === '±') {
    if (hpStr.length === 0) return;
    const lastChar = hpStr[hpStr.length - 1];
    if (lastChar === '+' || lastChar === '-') {
      // Toggle el último símbolo ± (que es el último carácter)
      hpStr = hpStr.slice(0, -1) + (lastChar === '+' ? '-' : '+');
    } else if (/\d/.test(lastChar) && hpStr.length < 16) {
      // Añade '+' como separador de nuevo término
      hpStr += '+';
    }

  } else {
    // Dígito
    if (hpStr.length >= 16) return;
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
}

function applyHP(sign) {
  const c = getC(hpTarget);
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

  const color    = c.type === 'player' ? 'var(--green)' : 'var(--red)';
  const nameSpan = `<span style="color:${color};font-weight:700;">${esc(c.name)}</span>`;

  if (oldHp > 0 && c.hp === 0) {
    // ── HP reached 0: flush pending + close, then log death ──
    c.isDead    = true;
    c.successes = 0;
    c.failures  = 0;
    c.permaDead = false;
    if (!c.conds.includes('unconscious')) c.conds.push('unconscious');
    _flushAndCloseHp();
    if (c.focus) {
      c.focus = false;
      addHistory(`${nameSpan}<br>🧿 Pierde Concentración`, 'condition');
    }
    addHistory(`${nameSpan}</br>🖤 HP reducidos a 0<br>Empieza <b>Salvaciones de Muerte</b>`, 'death');
    toast(`🖤 ${esc(c.name)} HP reducidos a 0`);

  } else {
    if (sign < 0) {
      // ── Damage ──
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      let histMsg;
      if (modType === 'resist') {
        histMsg = `${nameSpan}<br>🛡 <b>Resiste</b> ${parsed} de daño<br>Solo recibe🩸<b>${finalAmt}</b> de daño`;
        toast(`<span style="color:${color};font-weight:700;">🛡 ${esc(c.name)}</span> resiste el daño`);
      } else if (modType === 'vuln') {
        histMsg = `${nameSpan}<br>💥 Es <b>vulnerable</b> a ${parsed} de daño<br>Recibe🩸<b>${finalAmt}</b> de daño`;
        toast(`<span style="color:${color};font-weight:700;">💥 ${esc(c.name)}</span> es vulnerable al daño`);
      } else {
        histMsg = `${nameSpan}<br>🩸Recibe <b>${finalAmt}</b> de daño`;
        toast(`<span style="color:${color};font-weight:700;">🩸${esc(c.name)}</span> recibe ${finalAmt} de daño`);
      }
      pendingHpEntries.push({ time: t, msg: histMsg, type: 'damage' });

      if (c.focus) {
        // Concentration check: flush + close HP modal, then open conSave
        _flushAndCloseHp();
        openConSaveModal(c, finalAmt);
      } else {
        _addHpResultToDisplay('-', finalAmt, modType);
      }

    } else {
      // ── Heal ──
      if (oldHp === 0 && c.hp > 0) {
        c.isDead    = false;
        c.successes = 0;
        c.failures  = 0;
        c.permaDead = false;
        c.conds     = c.conds.filter(id => id !== 'unconscious');
      }
      const now = new Date();
      const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      const histMsg = `${nameSpan}<br>💚 Recibe <b>${finalAmt}</b> de sanación`;
      pendingHpEntries.push({ time: t, msg: histMsg, type: 'heal' });
      toast(`💚 ${esc(c.name)} recibe ${finalAmt} de sanación`);
      _addHpResultToDisplay('+', finalAmt, 'none');
    }
  }

  saveState();
  render();
  checkCombatEnd();
  checkCombatDefeat();
}

// ── Flush pending HP history entries and close the modal ──
function _flushAndCloseHp() {
  pendingHpEntries.forEach(e => history.push(e));
  if (pendingHpEntries.length > 0) saveState();
  pendingHpEntries = [];
  hpStr = '';
  hpModSelected = null;
  document.getElementById('btnResist').classList.remove('active');
  document.getElementById('btnVuln').classList.remove('active');
  refreshDisp();
  const list = document.getElementById('hpResultsList');
  if (list) list.innerHTML = '';
  closeModal('hpModal');
}

function closeHpModal() { _flushAndCloseHp(); }
function ovrHpClick(e)  { if (e.target.id === 'hpModal') closeHpModal(); }

function _addHpResultToDisplay(sign, amount, modType) {
  const list = document.getElementById('hpResultsList');
  if (!list) return;
  const item = document.createElement('div');
  const isDamage = sign === '-';
  item.className = 'hp-result-item ' + (isDamage ? 'damage' : 'heal');
  let text;
  if (isDamage) {
    if (modType === 'resist')     text = `🛡 Resiste: −${amount}`;
    else if (modType === 'vuln')  text = `💥 Vulnerable: −${amount}`;
    else                          text = `🩸 Daño: −${amount}`;
  } else {
    text = `💚 Sanación: +${amount}`;
  }
  item.textContent = text;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

// ────────────────────────────────────────
// ROLL MODAL
// ────────────────────────────────────────

// Format "1d8+5" → "1d8 (+5)", "1d8-3" → "1d8 (-3)", "1d8" → "1d8", "20" → "20"
function formatRollExpr(str) {
  if (!str) return str;
  const m = str.match(/^(\d+d\d+)([+-]\d+)?$/);
  if (!m) return str;
  return m[2] ? `${m[1]} (${m[2]})` : m[1];
}

function openRollModal() {
  pendingRollEntries = [];
  rollStr = '';
  rollAdvType = 'normal';
  document.querySelectorAll('.roll-adv-btn').forEach(b => b.classList.remove('active'));
  refreshRollDisp();
  const list = document.getElementById('rollResultsList');
  if (list) list.innerHTML = '';
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

    const roll1     = Math.floor(Math.random() * 20) + 1;
    const roll2     = Math.floor(Math.random() * 20) + 1;
    const usedRoll  = rollAdvType === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
    const total     = usedRoll + bonus;
    const typeLabel = rollAdvType === 'advantage' ? 'Ventaja' : 'Desventaja';
    const bonusPart = bonus !== 0 ? ` (${bonusStr})` : '';
    const formula   = `2d20 (${roll1}/${roll2}): ${usedRoll}${bonusPart} = <b>${total}</b>`;
    const msg       = `🎲 Tirada con <b>${typeLabel}</b><br>${formula}`;

    const now = new Date();
    const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    pendingRollEntries.push({ time: t, msg, type: 'roll' });
    toast(`🎲 ${typeLabel}: ${usedRoll}${bonusPart} = ${total}`);
    _addRollResultToDisplay(`${typeLabel}: ${usedRoll}${bonusPart} = ${total}`);
    return;
  }

  const parsed = parseDiceOrNumber(rollStr);
  if (parsed === null) return;
  const label = formatRollExpr(rollStr);
  const msg   = `🎲 Tirada ${label} = <b>${parsed}</b>`;

  const now = new Date();
  const t = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  pendingRollEntries.push({ time: t, msg, type: 'roll' });
  toast(`🎲 ${label} = ${parsed}`);
  _addRollResultToDisplay(`${label} = ${parsed}`);
}

// ── Flush pending roll history entries and close the modal ──
function _flushAndCloseRoll() {
  pendingRollEntries.forEach(e => history.push(e));
  if (pendingRollEntries.length > 0) saveState();
  pendingRollEntries = [];
  rollStr = '';
  rollAdvType = 'normal';
  document.querySelectorAll('.roll-adv-btn').forEach(b => b.classList.remove('active'));
  refreshRollDisp();
  const list = document.getElementById('rollResultsList');
  if (list) list.innerHTML = '';
  closeModal('rollModal');
}

function closeRollModal() { _flushAndCloseRoll(); }
function ovrRollClick(e)  { if (e.target.id === 'rollModal') closeRollModal(); }

function _addRollResultToDisplay(resultStr) {
  const list = document.getElementById('rollResultsList');
  if (!list) return;
  const item = document.createElement('div');
  item.className = 'roll-result-item';
  item.textContent = '🎲 ' + resultStr;
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
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
   if (c) {
     const oldConds = [...c.conds];
     c.conds = [...pendingConds];

     // Log gained / lost conditions
     const added   = c.conds.filter(id => !oldConds.includes(id));
     const removed = oldConds.filter(id => !c.conds.includes(id));

     added.forEach(id => {
       const cd = getCond(id);
       if (cd) addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> gana condición:<br>🔹️<b>${cd.lbl}</b>`, 'condition');
     });
     removed.forEach(id => {
       const cd = getCond(id);
       if (cd) addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> pierde condición:<br>🔸️<b><s>${cd.lbl}</s></b>`, 'condition');
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
     if (cd) addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> pierde condición:<br>🔸️<b><s>${cd.lbl}</s></b>`, 'condition');
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

   // Dynamic HP icon based on death save state
   const hpIco = c.permaDead ? '☠️' : (isZero ? '🖤' : '❤️');

   // Build normal condition chips
   const chips = c.conds.map(condId => {
     const cd = getCond(condId);
     return cd
       ? `<span class="chip" onclick="removeCondition(${c.id},'${condId}')" title="Click to remove">${cd.lbl}</span>`
       : '';
   }).join('');

   // Death Save chips (only when hp=0 and not permaDead)
   let deathChips = '';
   if (isZero && !c.permaDead) {
     deathChips = `<span class="chip ds-chip ds-success" onclick="incrementSuccesses(${c.id})" title="Tap to add success">❤️ ${c.successes || 0}</span><span class="chip ds-chip ds-failure" onclick="incrementFailures(${c.id})" title="Tap to add failure">🖤 ${c.failures || 0}</span>`;
   }

   // Fixed Focus chip (toggle)
   const focusClass = c.focus ? 'focus-chip active' : 'focus-chip';
   const focusChip = `<span class="chip ${focusClass}" onclick="toggleFocus(${c.id})" title="Toggle Focus">🧿 Concentrado</span>`;

   // Notes chip
   const noteClass = (c.note && c.note.trim()) ? 'note-chip active' : 'note-chip';
   const noteChip  = `<span class="chip ${noteClass}" onclick="openNotesModal(${c.id})" title="${(c.note && c.note.trim()) ? 'View/Edit note' : 'Add note'}">📝 Notas</span>`;

   const sourceSpan = c.source ? ` <span class="card-name-source">(${esc(c.source)})</span>` : '';
   const nameEl = c.type === 'monster'
     ? `<div class="card-name ${isZero ? 'is-dead' : ''} monster-name-link" onclick="openStatblockModal(${c.id})" title="View stat block">${esc(c.name)}${sourceSpan}</div>`
     : `<div class="card-name ${isZero ? 'is-dead' : ''}">${esc(c.name)}${sourceSpan}</div>`;

   const classes = `card ${typeClass}${isActive ? ' is-active' : ''}`;

   const hpBarPct  = isZero ? 0 : Math.round(hpPct * 100);
   const hpBarClass = isZero ? 'hp-dead' : (hpPct > 0.5 ? 'hp-high' : (hpPct > 0.2 ? 'hp-mid' : 'hp-low'));

   const innerHTML = `${isActive ? '<div class="active-badge">En turno</div>' : ''}
 <div class="card-head">
   <div class="init-circle">${c.init}</div>
   ${nameEl}
   <button class="btn-remove" onclick="removeCombatant(${c.id})" title="Remove combatant">❌️</button>
 </div>
 <div class="card-stats">
   <div class="hp-disp ${isLow ? 'low' : ''} ${isZero ? 'zero' : ''}" onclick="openHpModal(${c.id})" style="cursor:pointer;">
     <span class="stat-ico">${hpIco}</span>
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
 <div class="card-hp-bar">
   <div class="card-hp-bar-fill ${hpBarClass}" data-hp-pct="${hpBarPct}" style="width:0%;"></div>
 </div>
 <div class="cond-row">
   ${noteChip}
   ${focusChip}
   ${deathChips}
 </div>
 <div class="cond-row cond-row-chips">
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
      btn.textContent = '▶ Iniciar';
      btn.disabled    = !canStartCombat();
    } else {
      btn.textContent = '▶ Sigte.';
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
        <h3>✦ Campo de batalla vacío ✦</h3>
        <p>Agrega jugadores y monstruos para comenzar</p>
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
      // Snapshot current bar width before any DOM change
      const existingBar = el.querySelector('.card-hp-bar-fill');
      const oldWidth = existingBar ? existingBar.style.width : null;

      if (el.className !== classes)   el.className = classes;
      if (el.innerHTML !== innerHTML) {
        el.innerHTML = innerHTML;
        // After innerHTML replaced, restore old width instantly then animate to new
        const newBar = el.querySelector('.card-hp-bar-fill');
        if (newBar && oldWidth !== null) {
          newBar.style.transition = 'none';
          newBar.style.width = oldWidth;
          requestAnimationFrame(() => {
            newBar.style.transition = '';
            newBar.style.width = newBar.dataset.hpPct + '%';
          });
        } else if (newBar) {
          // New card: animate from 0 to value
          requestAnimationFrame(() => {
            newBar.style.width = newBar.dataset.hpPct + '%';
          });
        }
      }
    } else {
      el = document.createElement('div');
      el.className  = classes;
      el.dataset.id = String(id);
      el.innerHTML  = innerHTML;
      // Will animate once inserted — handled after insertBefore below
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

  // Animate HP bars of newly inserted cards (those still at width:0%)
  requestAnimationFrame(() => {
    listEl.querySelectorAll('.card-hp-bar-fill').forEach(bar => {
      if (bar.style.width === '0%' || bar.style.width === '') {
        bar.style.width = bar.dataset.hpPct + '%';
      }
    });
  });
}

 // ────────────────────────────────────────
 // CONCENTRATION SAVE MODAL
 // ────────────────────────────────────────
 let conSaveTarget  = null;
 let conSaveDamage  = 0;
 let conSaveAdvType = 'normal';

 function openConSaveModal(c, damageTaken) {
   conSaveTarget  = c;
   conSaveDamage  = damageTaken;
   conSaveAdvType = 'normal';
   const dc = Math.max(10, Math.floor(damageTaken / 2));
   document.getElementById('conSaveNameLabel').textContent = c.name;
   document.getElementById('cs-dc').value  = dc;
   document.getElementById('cs-con').value = c.conMod || 0;
   document.querySelectorAll('.consave-adv-btn').forEach(b => b.classList.remove('active'));
   openModal('conSaveModal');
 }

 function conSaveDCStep(delta) {
   const inp = document.getElementById('cs-dc');
   const n   = parseInt(inp.value || '10', 10);
   inp.value = String(Math.max(1, Math.min(30, (isNaN(n) ? 10 : n) + delta)));
 }

 function setConSaveAdv(type) {
   conSaveAdvType = conSaveAdvType === type ? 'normal' : type;
   document.querySelectorAll('.consave-adv-btn').forEach(btn => {
     btn.classList.toggle('active', btn.id === `csAdvBtn-${conSaveAdvType}`);
   });
 }

 function executeConSave() {
   const c = conSaveTarget;
   if (!c) return;
   closeModal('conSaveModal');

   const conMod = Math.max(-10, Math.min(10, parseInt(document.getElementById('cs-con').value) || 0));
   const dc     = Math.max(1, Math.min(30, parseInt(document.getElementById('cs-dc').value) || 10));

   let roll1    = Math.floor(Math.random() * 20) + 1;
   let roll2    = null;
   let usedRoll = roll1;

   if (conSaveAdvType === 'advantage') {
     roll2    = Math.floor(Math.random() * 20) + 1;
     usedRoll = Math.max(roll1, roll2);
   } else if (conSaveAdvType === 'disadvantage') {
     roll2    = Math.floor(Math.random() * 20) + 1;
     usedRoll = Math.min(roll1, roll2);
   }

   const total   = usedRoll + conMod;
   const success = total >= dc;
   const modStr  = conMod !== 0 ? ` (${conMod > 0 ? '+' : ''}${conMod})` : '';

   let formula;
   if (conSaveAdvType === 'normal') {
     formula = `🎲 1d20: ${usedRoll}${modStr} = <b>${total}</b>`;
   } else {
     const lbl = conSaveAdvType === 'advantage' ? '<b>Ventaja</b>' : '<b>Desventaja</b>';
     formula   = `🎲 2d20 ${lbl} (${roll1}/${roll2}): ${usedRoll}${modStr} = <b>${total}</b>`;
   }

   addHistory(
     `<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> Concentración (DC <b>${dc}</b>)<br>${formula}<br>${
       success
         ? '✅ <b>ÉXITO</b> - 🧿 Mantiene Concentración'
         : '❌ <b>FALLO</b> - 🧿 Pierde Concentración'
     }`,
     'condition'
   );

   if (success) {
     toast(`🧿 ${esc(c.name)} mantiene concentración (${total} ≥ DC ${dc})`);
   } else {
     c.focus = false;
     toast(`🧿 ${esc(c.name)} pierde concentración (${total} < DC ${dc})`);
   }

   // Remember conMod for next save
   c.conMod = conMod;

   saveState();
   render();
 }

 // ────────────────────────────────────────
 // DEATH SAVE MODAL
 // ────────────────────────────────────────
 function openDeathSaveModal(id) {
   deathSaveTarget  = id;
   deathSaveAdvType = 'normal';
   document.querySelectorAll('.deathsave-adv-btn').forEach(b => b.classList.remove('active'));
   openModal('deathSaveModal');
 }

 function setDeathSaveAdv(type) {
   deathSaveAdvType = deathSaveAdvType === type ? 'normal' : type;
   document.querySelectorAll('.deathsave-adv-btn').forEach(btn => {
     btn.classList.toggle('active', btn.id === `dsAdvBtn-${deathSaveAdvType}`);
   });
 }

 function rollDeathSave() {
   const c = getC(deathSaveTarget);
   if (!c) return;
   closeModal('deathSaveModal');

   let roll1    = Math.floor(Math.random() * 20) + 1;
   let roll2    = null;
   let usedRoll = roll1;

   if (deathSaveAdvType === 'advantage') {
     roll2    = Math.floor(Math.random() * 20) + 1;
     usedRoll = Math.max(roll1, roll2);
   } else if (deathSaveAdvType === 'disadvantage') {
     roll2    = Math.floor(Math.random() * 20) + 1;
     usedRoll = Math.min(roll1, roll2);
   }

   let formula;
   if (deathSaveAdvType === 'normal') {
     formula = `🎲 1d20: <b>${usedRoll}</b>`;
   } else {
     const lbl = deathSaveAdvType === 'advantage' ? 'Ventaja' : 'Desventaja';
     formula   = `🎲 2d20 ${lbl} (${roll1}/${roll2}): <b>${usedRoll}</b>`;
   }

   const color    = c.type === 'player' ? 'var(--green)' : 'var(--red)';
   const nameSpan = `<span style="color:${color};font-weight:700;">${esc(c.name)}</span>`;

   if (usedRoll === 20) {
     addHistory(`${nameSpan} ☠️ Salvación de Muerte<br>${formula}<br>⚡<b>20 NATURAL</b> - Revive con 1 HP`, 'heal');
     _dsRevive(c);
   } else if (usedRoll >= 10) {
     c.successes = Math.min(3, (c.successes || 0) + 1);
     addHistory(`${nameSpan} ☠️ Salvación de Muerte<br>${formula}<br>❤️ <b>ÉXITO</b> (${c.successes}/3)`, 'death');
     toast(`❤️ ${esc(c.name)} éxito (${c.successes}/3)`);
     _dsCheck(c);
   } else if (usedRoll === 1) {
     c.failures = Math.min(3, (c.failures || 0) + 2);
     addHistory(`${nameSpan} ☠️ Salvación de Muerte<br>${formula}<br>🖤 <b>1 NATURAL</b> +2 fallas (${c.failures}/3)`, 'death');
     toast(`🖤 ${esc(c.name)} 1 natural (+2 fallos) (${c.failures}/3)`);
     _dsCheck(c);
   } else {
     c.failures = Math.min(3, (c.failures || 0) + 1);
     addHistory(`${nameSpan} ☠️ Salvación de Muerte<br>${formula}<br>🖤 <b>FALLO</b> (${c.failures}/3)`, 'death');
     toast(`🖤 ${esc(c.name)} fallo (${c.failures}/3)`);
     _dsCheck(c);
   }

   saveState();
   render();
   checkCombatEnd();
   checkCombatDefeat();
 }

 function _dsRevive(c) {
   c.hp        = 1;
   c.isDead    = false;
   c.successes = 0;
   c.failures  = 0;
   c.permaDead = false;
   c.conds     = c.conds.filter(id => id !== 'unconscious');
   toast(`⚡<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> revive con 1 HP!`);
 }

 function _dsDie(c) {
   const color    = c.type === 'player' ? 'var(--green)' : 'var(--red)';
   const nameSpan = `<span style="color:${color};font-weight:700;">${esc(c.name)}</span>`;
   c.permaDead = true;
   c.successes = 0;
   c.failures  = 0;
   c.conds     = c.conds.filter(id => id !== 'unconscious');
   addHistory(`${nameSpan}<br>🖤🖤🖤 <b>3 FALLOS - ☠️ MUERTO ☠️</b>`, 'death');
   toast(`☠️ ${esc(c.name)} está muerto`);
 }

 function _dsCheck(c) {
   if ((c.successes || 0) >= 3) {
     const color    = c.type === 'player' ? 'var(--green)' : 'var(--red)';
     const nameSpan = `<span style="color:${color};font-weight:700;">${esc(c.name)}</span>`;
     addHistory(`${nameSpan}<br>❤️❤️❤️️ <b>3 ÉXITOS - Estabilizado</b><br>Revive con 1 HP`, 'heal');
     _dsRevive(c);
   } else if ((c.failures || 0) >= 3) {
     _dsDie(c);
   }
 }

 function incrementSuccesses(id) {
   const c = getC(id);
   if (!c || c.hp !== 0 || c.permaDead) return;
   c.successes = Math.min(3, (c.successes || 0) + 1);
   toast(`❤️ <span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> éxito (${c.successes}/3)`);
   _dsCheck(c);
   saveState();
   render();
   checkCombatEnd();
   checkCombatDefeat();
 }

 function incrementFailures(id) {
   const c = getC(id);
   if (!c || c.hp !== 0 || c.permaDead) return;
   c.failures = Math.min(3, (c.failures || 0) + 1);
   toast(`🖤 <span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${esc(c.name)}</span> fallo (${c.failures}/3)`);
   _dsCheck(c);
   saveState();
   render();
   checkCombatEnd();
   checkCombatDefeat();
 }

 // ────────────────────────────────────────
 // NOTES MODAL
 // ────────────────────────────────────────
 let notesTarget = null;

 function openNotesModal(id) {
   const c = getC(id);
   if (!c) return;
   notesTarget = id;
   document.getElementById('notesNameLabel').textContent = c.name;
   document.getElementById('notes-textarea').value = c.note || '';
   openModal('notesModal');
   setTimeout(() => document.getElementById('notes-textarea').focus(), 120);
 }

 function saveNote() {
   const c = getC(notesTarget);
   if (!c) return;
   c.note = document.getElementById('notes-textarea').value.trim();
   closeModal('notesModal');
   saveState();
   render();
 }

 // ────────────────────────────────────────
 // FOCUS — toggle
 // ────────────────────────────────────────

 // ── Focus toggle ──
 function toggleFocus(id) {
   const c = getC(id);
   if (!c) return;
   c.focus = !c.focus;
   if (c.focus) {
     addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${c.name}</span><br>🧿 Concentración activada`, 'condition');
     toast(`🧿 <span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${c.name}:</span> Concentración activada`);
   } else {
     addHistory(`<span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${c.name}</span><br>🧿 Concentración desactivada`, 'condition');
     toast(`🧿 <span style="color:${c.type === 'player' ? 'var(--green)' : 'var(--red)'};font-weight:700;">${c.name}:</span> Concentración desactivada`);
   }
   saveState();
   render();
 }


 // ────────────────────────────────────────
 // RENDER COMBAT SCREEN
 // ────────────────────────────────────────
 function renderCombatScreen() {
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
// EXPORT / IMPORT
// ────────────────────────────────────────
function exportCombatState() {
  document.getElementById('export-filename').value = '';
  openModal('exportModal');
  setTimeout(() => document.getElementById('export-filename').focus(), 120);
}

function doExport() {
  const raw  = document.getElementById('export-filename').value.trim();
  const name = raw || 'combat';
  const now  = new Date();
  const dd   = String(now.getDate()).padStart(2, '0');
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const yy   = String(now.getFullYear()).slice(-2);
  const hh   = String(now.getHours()).padStart(2, '0');
  const min  = String(now.getMinutes()).padStart(2, '0');
  const ss   = String(now.getSeconds()).padStart(2, '0');
  const filename = `${name}_${dd}${mm}${yy}_${hh}${min}${ss}.json`;

  const state = { combatants, queue, uid, round, started, roundFirstId, history, combatStartRoster };
  const blob  = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  closeModal('exportModal');
  toast(`💾 Exported: ${filename}`);
}

function importCombatState() {
  openModal('importConfirmModal');
}

function doImport() {
  closeModal('importConfirmModal');
  const input  = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const state       = JSON.parse(ev.target.result);
        combatants        = state.combatants        || [];
        queue             = state.queue             || [];
        uid               = state.uid               ?? 1;
        round             = state.round             ?? 1;
        started           = state.started           ?? false;
        roundFirstId      = state.roundFirstId      ?? null;
        history           = state.history           || [];
        combatStartRoster = state.combatStartRoster || [];
        saveState();
        render();
        populateHistoryFilter();
        renderHistoryLog();
        toast('📂 Combate importado');
      } catch(err) {
        toast('❌ Error: archivo inválido');
      }
    };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
  document.body.removeChild(input);
}

// ────────────────────────────────────────
// KEYBOARD
// ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('rollModal').classList.contains('open')) {
      closeRollModal(); return;
    }
    if (document.getElementById('hpModal').classList.contains('open')) {
      closeHpModal(); return;
    }
    ['addModal','statusModal','attackModal','deleteConfirmModal','conSaveModal','notesModal','statblockModal','deathSaveModal','combatDefeatModal','exportModal','importConfirmModal'].forEach(closeModal);
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
loadBestiaryIndex();
render();
switchScreen('screenHome');
renderHistoryLog();