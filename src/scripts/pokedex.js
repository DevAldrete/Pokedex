const API = 'https://pokeapi.co/api/v2';
const grid = document.getElementById('grid');
const search = document.getElementById('search');
const typeFilter = document.getElementById('typeFilter');
const sorter = document.getElementById('sorter');
const shinyToggle = document.getElementById('shinyToggle');
const resetBtn = document.getElementById('reset');
const toast = document.getElementById('toast');
const sentinel = document.getElementById('sentinel');

// Modal refs
const dlg = document.getElementById('detail');
const dName = document.getElementById('d-name');
const dArt = document.getElementById('d-art');
const dTypes = document.getElementById('d-types');
const dStats = document.getElementById('d-stats');
const dAbilities = document.getElementById('d-abilities');
const dFlavor = document.getElementById('d-flavor');
const dEvo = document.getElementById('d-evo');
const dId = document.getElementById('d-id');
const dH = document.getElementById('d-height');
const dW = document.getElementById('d-weight');
const closeBtn = document.getElementById('close');

// Simple cache to avoid repeat network calls
const cache = new Map();
const speciesCache = new Map();
const evoCache = new Map();

let page = 0;
const pageSize = 60; // big tasty chunks
let list = []; // current working set
let allBasicList = []; // id+name from initial index

function showToast(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.hidden = true, 1400); }

// Fetch helpers with caching
async function get(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Network error');
  const data = await res.json();
  cache.set(url, data);
  return data;
}

async function getPokemonByName(name) {
  const url = `${API}/pokemon/${name}`;
  return get(url);
}

async function getSpecies(id) {
  const url = `${API}/pokemon-species/${id}`;
  if (speciesCache.has(url)) return speciesCache.get(url);
  const data = await get(url);
  speciesCache.set(url, data); return data;
}

async function getEvolutionChain(url) {
  if (evoCache.has(url)) return evoCache.get(url);
  const data = await get(url); evoCache.set(url, data); return data;
}

// Build base list once for search/sort without hammering API
async function bootstrap() {
  showToast('Booting Pokédex…');
  // Grab count first
  const meta = await get(`${API}/pokemon?limit=1`);
  const total = meta.count || 1010;
  const firstBatch = await get(`${API}/pokemon?limit=${total}`);
  // Extract id from URL
  allBasicList = firstBatch.results.map(r => {
    const m = r.url.match(/\/pokemon\/(\d+)\/?$/);
    return { id: m ? Number(m[1]) : 0, name: r.name };
  }).filter(x => x.id > 0);
  list = [...allBasicList];
  page = 0; grid.innerHTML = '';
  // Populate type filter
  const types = await get(`${API}/type`);
  types.results.filter(t => !['shadow', 'unknown'].includes(t.name)).forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.name; opt.textContent = `Type: ${t.name}`; typeFilter.appendChild(opt);
  });
  loadNext();
}

function sortList() {
  const [key, dir] = sorter.value.split('-');
  list.sort((a, b) => {
    const A = key === 'id' ? a.id : a.name;
    const B = key === 'id' ? b.id : b.name;
    return (A > B ? 1 : A < B ? -1 : 0) * (dir === 'asc' ? 1 : -1);
  });
}

function applyFilters() {
  const q = search.value.trim().toLowerCase();
  const type = typeFilter.value;
  if (!q && !type) { list = [...allBasicList]; sortList(); resetGrid(); return }
  // filter by query first
  let filtered = allBasicList.filter(p => q ? (p.name.includes(q) || String(p.id) === q) : true);
  if (!type) { list = filtered; sortList(); resetGrid(); return }
  // type filter requires checking each Pokemon's types. We'll do a cheap pass with limited concurrency
  filtered = filtered.slice();
  showToast('Filtering by type…');
  Promise.all(filtered.map(async p => {
    const d = await getPokemonByName(p.id);
    return d.types.some(t => t.type.name === type) ? p : null;
  })).then(rows => {
    list = rows.filter(Boolean); sortList(); resetGrid();
  });
}

function resetGrid() {
  grid.innerHTML = ''; page = 0; loadNext();
}

async function loadNext() {
  const start = page * pageSize; const end = start + pageSize;
  const slice = list.slice(start, end);
  if (slice.length === 0) { showToast('End of list'); return }
  page++;
  showToast(`Loading ${slice.length}…`);
  // hydrate details for each slice concurrently but render progressively
  const promises = slice.map(async base => {
    const data = await getPokemonByName(base.id);
    return renderCard(data);
  });
  const nodes = await Promise.all(promises);
  const frag = document.createDocumentFragment();
  nodes.forEach(n => frag.appendChild(n));
  grid.appendChild(frag);
}

function typeBadge(name) {
  const s = document.createElement('span'); s.className = `badge t-${name}`; s.textContent = name; return s;
}

function renderCard(d) {
  const el = document.createElement('article'); el.className = 'card'; el.setAttribute('tabindex', '0');
  el.innerHTML = `
        <div class="pk-header">
          <span class="pk-id">#${String(d.id).padStart(4, '0')}</span>
          <div class="badges"></div>
        </div>
        <div class="sprite-wrap">
          <img class="sprite" alt="${d.name} sprite" loading="lazy" />
        </div>
        <h3 class="pk-name">${d.name}</h3>
        <div class="types"></div>
      `;
  const sprite = el.querySelector('.sprite');
  const setSprite = () => {
    const s = shinyToggle.checked ? d.sprites.front_shiny : d.sprites.front_default || d.sprites.other?.['official-artwork']?.front_default;
    sprite.src = s; sprite.classList.add('shine');
  }
  setSprite();
  d.types.forEach(t => el.querySelector('.badges').appendChild(typeBadge(t.type.name)));
  d.types.forEach(t => el.querySelector('.types').appendChild(typeBadge(t.type.name)));

  el.addEventListener('click', () => openDetail(d.id));
  el.addEventListener('keypress', e => { if (e.key === 'Enter') openDetail(d.id) });
  return el;
}

async function openDetail(id) {
  try {
    showToast('Fetching details…');
    const d = await getPokemonByName(id);
    dName.textContent = d.name;
    dId.textContent = `#${String(d.id).padStart(4, '0')}`;
    dH.textContent = `${(d.height / 10).toFixed(1)} m`;
    dW.textContent = `${(d.weight / 10).toFixed(1)} kg`;
    const art = d.sprites.other?.['official-artwork']?.front_default || d.sprites.front_default;
    dArt.src = art; dArt.alt = d.name;
    dTypes.innerHTML = ''; d.types.forEach(t => dTypes.appendChild(typeBadge(t.type.name)));
    dStats.innerHTML = '';
    d.stats.forEach(s => {
      const wrap = document.createElement('div'); wrap.className = 'stat';
      const label = document.createElement('span'); label.textContent = s.stat.name.replace('-', ' ');
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); bar.appendChild(fill);
      const val = document.createElement('b'); val.textContent = s.base_stat;
      wrap.append(label, bar, val); dStats.appendChild(wrap);
      requestAnimationFrame(() => {
        fill.style.width = Math.min(s.base_stat, 180) / 180 * 100 + '%';
      });
    });
    dAbilities.innerHTML = ''; d.abilities.forEach(a => {
      const span = document.createElement('span'); span.textContent = a.ability.name + (a.is_hidden ? ' (hidden)' : ''); dAbilities.appendChild(span);
    })
    // Flavor text in EN
    dFlavor.textContent = '…';
    const sp = await getSpecies(d.id);
    const en = sp.flavor_text_entries.find(f => f.language.name === 'en');
    dFlavor.textContent = en ? en.flavor_text.replace(/\f|\n|\r/g, ' ') : 'No flavor text.';
    // Evolution chain
    dEvo.innerHTML = '';
    const chainUrl = sp.evolution_chain?.url;
    if (chainUrl) {
      const chain = await getEvolutionChain(chainUrl);
      const steps = [];
      function walk(node) { if (!node) return; steps.push(node.species.name); node.evolves_to?.forEach(walk); }
      walk(chain.chain);
      // dedupe preserving order
      const unique = [...new Set(steps)];
      for (const name of unique) {
        const p = await getPokemonByName(name);
        const step = document.createElement('div'); step.className = 'step'; step.innerHTML = `<img src="${p.sprites.front_default}" width="40" height="40" alt="${p.name}" /> <span style="text-transform:capitalize">${p.name}</span>`;
        step.addEventListener('click', () => openDetail(p.id));
        dEvo.appendChild(step);
      }
    }
    if (!dlg.open) dlg.showModal();
  } catch (e) { console.error(e); showToast('Failed loading details'); }
}

closeBtn.addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close() });

// Controls
sorter.addEventListener('change', () => { sortList(); resetGrid(); });
shinyToggle.addEventListener('change', () => {
  // update visible sprites
  document.querySelectorAll('.card .sprite').forEach((img, idx) => {
    const start = (page - 1) * pageSize; const p = list[start + idx]; if (!p) return;
    getPokemonByName(p.id).then(d => { img.src = shinyToggle.checked ? d.sprites.front_shiny : d.sprites.front_default || d.sprites.other?.['official-artwork']?.front_default; });
  });
});
resetBtn.addEventListener('click', () => {
  search.value = ''; typeFilter.value = ''; sorter.value = 'id-asc'; shinyToggle.checked = false; list = [...allBasicList]; sortList(); resetGrid();
});

// Debounced search and filter
let t;
function scheduleFilters() { clearTimeout(t); t = setTimeout(applyFilters, 250); }
search.addEventListener('input', scheduleFilters);
typeFilter.addEventListener('change', applyFilters);

// Infinite scroll
const io = new IntersectionObserver((ents) => {
  ents.forEach(e => { if (e.isIntersecting) loadNext(); });
}, { rootMargin: '200px' });
io.observe(sentinel);

// Boot
bootstrap().catch(err => { console.error(err); showToast('Failed to start'); });
