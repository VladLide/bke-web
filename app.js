'use strict';

// The browser consumes precompiled state deltas; it does NOT interpret events.
// Event type/payload is used only to decide how to *animate* a change.

const state = { timeline: null, labels: null, graph: null, coords: {}, lang: 'en',
                idx: 0, tokens: {}, placeMarkers: {}, territoryLayers: {},
                detail: null, playing: null };

const map = L.map('map', { zoomControl: true, minZoom: 4, maxZoom: 10 })
  .setView([33.5, 40], 5);
// Muted dark basemap without labels — historical overlays are the focus, and
// modern city names are noise on a 2000 BC map. Our own place labels sit on top.
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO', subdomains: 'abcd', maxZoom: 10
}).addTo(map);

const routeLayer = L.layerGroup().addTo(map);

function label(id) {
  const l = state.labels[state.lang] || {};
  return l[id] || (state.labels.en && state.labels.en[id]) || id;
}
const nm = label;                      // event templates read cleaner as nm(...) — NOT L, that's Leaflet's global
function bc(year) { return year < 0 ? `${-year} BC` : `${year} AD`; }

// ---- UI i18n: chrome strings, controlled vocab, and per-language event
// templates. Entity NAMES come from labels.json (compiler); everything else
// here is app chrome and lives in the app. Missing key/lang → English fallback.
const I18N = {
  en: {
    ui: { parents: 'Parents', spouse: 'Spouse', children: 'Children', hereNow: 'Here now',
          events: 'Events', eventsHere: 'Events here', sources: 'Sources', at: 'at',
          beginning: 'Beginning', begin: 'Move the slider to begin.',
          navMap: 'Map & timeline', navGraph: 'Knowledge graph', langLabel: 'Language',
          sub: 'The Abraham vertical slice — one canonical model, rendered as a map projection.',
          legAlive: 'alive', legDead: 'dead', legJourney: 'journey', legTerritory: 'territory',
          foot: 'Click a place or a person on the map for its relations, events, and sources. Data is precompiled by the BKE compiler — the browser applies state deltas and never re-interprets events.' },
    status: { alive: 'alive', dead: 'dead', unborn: 'unborn' },
    conf: { confirmed: 'confirmed', probable: 'probable', possible: 'possible',
            tradition: 'tradition', unknown: 'unknown' },
    subtype: { patriarch: 'patriarch', matriarch: 'matriarch', person: 'person',
               place: 'place', city: 'city', town: 'town', field: 'field', cave: 'cave',
               mountain: 'mountain', region: 'region', land: 'land', well: 'well' },
    kind: { binding: 'binding', blessing: 'blessing', deliverance: 'deliverance',
            rename: 'renaming', dream: 'dream', famine: 'famine', expulsion: 'expulsion' },
    ev: {
      PersonBorn: p => `${nm(p.person)} is born at ${nm(p.place)}`,
      PersonDied: p => `${nm(p.person)} dies at ${nm(p.place)}`,
      Migration: p => `${p.subjects.map(nm).join(', ')} travel to ${nm(p.to)}`,
      Marriage: p => `${nm(p.spouses[0])} marries ${nm(p.spouses[1])}`,
      CovenantMade: p => `Covenant (${p.name || 'covenant'}) with ${p.parties.map(nm).join(', ')}`,
      TerritoryGranted: p => `${nm(p.territory)} granted to ${nm(p.grantee)}`,
      CityDestroyed: p => `${nm(p.city)} is destroyed`,
      LandAcquired: p => `${nm(p.owner)} acquires ${nm(p.land)}`,
      Occurrence: p => occ('en', p),
    },
  },
  uk: {
    ui: { parents: 'Батьки', spouse: 'Подружжя', children: 'Діти', hereNow: 'Тут зараз',
          events: 'Події', eventsHere: 'Події тут', sources: 'Джерела', at: 'у',
          beginning: 'Початок', begin: 'Посуньте повзунок, щоб почати.',
          navMap: 'Карта і час', navGraph: 'Граф знань', langLabel: 'Мова',
          sub: 'Вертикальний зріз Авраама — одна канонічна модель як проекція на карту.',
          legAlive: 'живий', legDead: 'помер', legJourney: 'подорож', legTerritory: 'територія',
          foot: 'Клацніть місце або особу на карті, щоб побачити зв\'язки, події та джерела. Дані попередньо скомпільовані компілятором BKE — браузер застосовує дельти стану й ніколи не інтерпретує події заново.' },
    status: { alive: 'живий', dead: 'помер', unborn: 'ще не народжений' },
    conf: { confirmed: 'підтверджено', probable: 'ймовірно', possible: 'можливо',
            tradition: 'традиція', unknown: 'невідомо' },
    subtype: { patriarch: 'патріарх', matriarch: 'матріарх', person: 'особа',
               place: 'місце', city: 'місто', town: 'містечко', field: 'поле', cave: 'печера',
               mountain: 'гора', region: 'край', land: 'земля', well: 'колодязь' },
    kind: { binding: 'жертвопринесення', blessing: 'благословення', deliverance: 'визволення',
            rename: 'перейменування', dream: 'сон', famine: 'голод', expulsion: 'вигнання' },
    ev: {
      PersonBorn: p => `${nm(p.person)} народжується в ${nm(p.place)}`,
      PersonDied: p => `${nm(p.person)} помирає в ${nm(p.place)}`,
      Migration: p => `${p.subjects.map(nm).join(', ')} прямують до ${nm(p.to)}`,
      Marriage: p => `${nm(p.spouses[0])} одружується з ${nm(p.spouses[1])}`,
      CovenantMade: p => `Завіт (${p.name || 'завіт'}) з ${p.parties.map(nm).join(', ')}`,
      TerritoryGranted: p => `${nm(p.territory)} даровано ${nm(p.grantee)}`,
      CityDestroyed: p => `${nm(p.city)} зруйновано`,
      LandAcquired: p => `${nm(p.owner)} набуває ${nm(p.land)}`,
      Occurrence: p => occ('uk', p),
    },
  },
};
function t(section, key) {
  const cur = I18N[state.lang] && I18N[state.lang][section];
  return (cur && cur[key]) || (I18N.en[section] && I18N.en[section][key]) || key;
}
function applyChrome() {   // translate static page chrome tagged with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t('ui', el.dataset.i18n); });
}
function kindLabel(lang, kind) {
  return (I18N[lang].kind && I18N[lang].kind[kind]) || (kind || '').replace(/_/g, ' ');
}
function occ(lang, p) {
  const who = (p.participants || []).map(nm).join(', ');
  return kindLabel(lang, p.kind) + (who ? ': ' + who : '');
}
// clickable pill → opens that entity's detail (lets you reach overlapping markers)
function pill(kind, id) {
  return `<span class="d-link" data-kind="${kind}" data-id="${id}">${label(id)}</span>`;
}

// ---- state reconstruction: fold deltas 0..k across all namespaces ----
function foldState(k) {
  const world = JSON.parse(JSON.stringify(state.timeline.initial)); // {persons, territories}
  for (let i = 0; i < k; i++) {
    const ch = state.timeline.frames[i].changes;
    for (const ns of Object.keys(ch))
      for (const [id, rec] of Object.entries(ch[ns]))
        world[ns][id] = rec;
  }
  return world;
}

function statusOf(rec) {
  if (rec.alive) return 'alive';
  return rec.location ? 'dead' : 'unborn';
}

// ---- describe an event for the readout (per-language template) ----
function describe(f) {
  const tpl = (I18N[state.lang] && I18N[state.lang].ev) || I18N.en.ev;
  const fn = tpl[f.type] || I18N.en.ev[f.type];
  return fn ? fn(f.payload, f) : f.event;
}

// ---- click-info: read-only details for a clicked place / person ----
// Pure display, from data the API already ships — never changes map state.
function fmtRef(ref) {
  const m = /^reference\.([a-z0-9_]+)\.(\d+)\.(\d+)$/.exec(ref);
  if (!m) return ref.replace(/^source\./, '');
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}:${m[3]}`;
}
function nodeOf(id) { return (state.graph && state.graph.nodes || []).find(n => n.id === id) || {}; }
function relationsOf(pid) {
  const r = { parents: [], children: [], spouses: [] };
  for (const e of (state.graph && state.graph.edges) || []) {
    if (e.rel === 'parent_of') {
      if (e.target === pid) r.parents.push(e.source);
      if (e.source === pid) r.children.push(e.target);
    } else if (e.rel === 'spouse') {
      if (e.source === pid) r.spouses.push(e.target);
      if (e.target === pid) r.spouses.push(e.source);
    }
  }
  return r;
}
function eventsInvolving(pid) {
  return state.timeline.frames.filter(f => {
    const p = f.payload;
    return p.person === pid || (p.subjects || []).includes(pid) || (p.parties || []).includes(pid)
      || (p.spouses || []).includes(pid) || (p.participants || []).includes(pid)
      || p.grantee === pid || p.owner === pid || p.from === pid || p.agent === pid;
  });
}
function eventsAt(pl) {
  return state.timeline.frames.filter(f => {
    const p = f.payload;
    return p.place === pl || p.from === pl || p.to === pl || p.territory === pl
      || p.city === pl || p.land === pl;
  });
}
function evLine(f) {
  const cites = (f.sources || []).map(fmtRef).join(', ');
  return `<li><b>${bc(f.year)}</b> ${describe(f)}`
    + (cites ? ` <span class="d-cite">${cites}</span>` : '')
    + (f.confidence ? ` <span class="d-conf">${t('conf', f.confidence)}</span>` : '') + '</li>';
}
function relLine(arr, key) {
  return arr.length
    ? `<div class="d-rel"><span>${t('ui', key)}:</span> ${[...new Set(arr)].map(id => pill('person', id)).join(', ')}</div>` : '';
}
function srcBlock(srcs) {
  return (srcs && srcs.length)
    ? `<div class="d-sec">${t('ui', 'sources')}</div><ul class="d-list">${srcs.map(s => `<li>${fmtRef(s)}</li>`).join('')}</ul>` : '';
}

function showDetail(kind, id) { state.detail = { kind, id }; renderDetail(); }
function closeDetail() { state.detail = null; document.getElementById('detail').hidden = true; }

function renderDetail() {
  const box = document.getElementById('detail');
  if (!state.detail) { box.hidden = true; return; }
  const { kind, id } = state.detail;
  const node = nodeOf(id);
  let html = '<button class="d-close" title="Close">×</button>'
    + `<div class="d-title">${label(id)} <span class="d-type">${t('subtype', node.subtype || node.type || kind)}</span></div>`;

  if (kind === 'person') {
    const rec = foldState(state.idx).persons[id] || {};
    const st = statusOf(rec);
    html += `<div class="d-meta">${t('status', st)}${rec.location ? ' ' + t('ui', 'at') + ' ' + pill('place', rec.location) : ''}`
      + `${rec.spouse ? ' · ⚭ ' + pill('person', rec.spouse) : ''}</div>`;
    const r = relationsOf(id);
    html += relLine(r.parents, 'parents') + relLine(r.spouses, 'spouse') + relLine(r.children, 'children');
    const evs = eventsInvolving(id);
    if (evs.length) html += `<div class="d-sec">${t('ui', 'events')}</div><ul class="d-list">${evs.map(evLine).join('')}</ul>`;
  } else {
    html += `<div class="d-meta">${t('subtype', node.subtype || 'place')}</div>`;
    const here = Object.entries(foldState(state.idx).persons)
      .filter(([, rec]) => rec.location === id).map(([pid]) => pid);
    html += relLine(here, 'hereNow');
    const evs = eventsAt(id);
    if (evs.length) html += `<div class="d-sec">${t('ui', 'eventsHere')}</div><ul class="d-list">${evs.map(evLine).join('')}</ul>`;
  }
  html += srcBlock(node.sources);
  box.innerHTML = html;
  box.hidden = false;
  box.querySelector('.d-close').onclick = closeDetail;
  // clickable relations / roster → navigate to that entity (reaches overlapping markers)
  box.querySelectorAll('.d-link').forEach(el =>
    el.onclick = () => showDetail(el.dataset.kind, el.dataset.id));
}

// ---- render frame k, optionally animating the k-th transition ----
function render(k, animate) {
  state.idx = k;
  const world = foldState(k);
  const persons = world.persons;
  renderTerritories(world.territories, animate);

  document.getElementById('year').textContent =
    k === 0 ? t('ui', 'beginning') : bc(state.timeline.frames[k - 1].year);
  document.getElementById('event-label').textContent =
    k === 0 ? t('ui', 'begin') : describe(state.timeline.frames[k - 1]);
  document.getElementById('counter').textContent = `${k} / ${state.timeline.frames.length}`;
  document.getElementById('slider').value = k;

  // person roster in panel
  const ul = document.getElementById('people');
  ul.innerHTML = '';
  for (const [pid, rec] of Object.entries(persons)) {
    const st = statusOf(rec);
    const li = document.createElement('li');
    li.className = st;
    li.innerHTML = `<span class="dot ${st}"></span>${label(pid)}` +
      (rec.location ? ` <span style="color:#6b7280">· ${label(rec.location)}</span>` : '');
    ul.appendChild(li);
  }

  // routes travelled so far
  routeLayer.clearLayers();
  for (let i = 0; i < k; i++) {
    const f = state.timeline.frames[i];
    if (f.type === 'Migration' && state.coords[f.payload.from] && state.coords[f.payload.to]) {
      const cur = i === k - 1;
      L.polyline([state.coords[f.payload.from], state.coords[f.payload.to]],
        { color: '#f0a830', weight: cur ? 4 : 2.5,
          opacity: cur ? 1 : 0.65, dashArray: cur ? null : '5 6' }).addTo(routeLayer);
    }
  }

  // person tokens
  const transition = k > 0 ? state.timeline.frames[k - 1] : null;
  for (const [pid, rec] of Object.entries(persons)) {
    const st = statusOf(rec);
    let tok = state.tokens[pid];
    const latlng = rec.location ? state.coords[rec.location] : null;
    if (st === 'unborn' || !latlng) { if (tok) { map.removeLayer(tok); state.tokens[pid] = null; } continue; }
    const color = st === 'dead' ? '#6b7280' : '#4a9eff';
    if (!tok) {
      tok = L.circleMarker(latlng, { radius: 6, color: '#0e1013', weight: 1.5,
        fillColor: color, fillOpacity: 0.95 }).bindTooltip(label(pid), { direction: 'top' });
      tok.on('click', () => showDetail('person', pid));
      tok.addTo(map); state.tokens[pid] = tok;
    }
    tok.setStyle({ fillColor: color });
    tok.bindTooltip(label(pid), { direction: 'top' });
    const moved = animate && transition && (transition.payload.subjects || []).includes(pid)
      && tok.getLatLng && !tok.getLatLng().equals(L.latLng(latlng));
    if (moved) tween(tok, tok.getLatLng(), L.latLng(latlng), 700);
    else tok.setLatLng(latlng);
  }

  renderDetail();  // refresh an open detail panel for the new frame
}

const TERRITORY_FILL = 0.16;

function renderTerritories(territories, animate) {
  for (const [tid, rec] of Object.entries(territories || {})) {
    const layer = state.territoryLayers[tid];
    if (!layer) continue;
    if (rec.active) {
      if (!map.hasLayer(layer)) {
        layer.addTo(map).bringToBack();     // sit beneath markers & routes
        if (animate) fadeInPoly(layer, TERRITORY_FILL);
        else layer.setStyle({ fillOpacity: TERRITORY_FILL, opacity: 0.95 });
      }
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }
}

function fadeInPoly(layer, target) {
  const t0 = performance.now(), ms = 900;
  function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    layer.setStyle({ fillOpacity: target * p, opacity: 0.3 + 0.65 * p });
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function tween(marker, from, to, ms) {
  const t0 = performance.now();
  function step(now) {
    const p = Math.min(1, (now - t0) / ms);
    marker.setLatLng([from.lat + (to.lat - from.lat) * p,
                      from.lng + (to.lng - from.lng) * p]);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- controls ----
function go(k, animate) {
  k = Math.max(0, Math.min(state.timeline.frames.length, k));
  render(k, animate);
}
function play() {
  if (state.playing) return stop();
  document.getElementById('play').textContent = '❚❚';
  if (state.idx >= state.timeline.frames.length) go(0, false);
  state.playing = setInterval(() => {
    if (state.idx >= state.timeline.frames.length) return stop();
    go(state.idx + 1, true);
  }, 1400);
}
function stop() {
  clearInterval(state.playing); state.playing = null;
  document.getElementById('play').textContent = '▶';
}

// ---- boot ----
window.bkeLoad().then(({ timeline, labels, geo, graph }) => {
  state.timeline = timeline; state.labels = labels; state.graph = graph;

  for (const feat of geo.features) {
    const pid = feat.properties.name_id;
    if (feat.geometry.type === 'Point') {
      const [lon, lat] = feat.geometry.coordinates;
      state.coords[pid] = [lat, lon];
      state.placeMarkers[pid] = L.circleMarker([lat, lon], { radius: 4, color: '#cbd2db',
        weight: 1, fillColor: '#9aa2ad', fillOpacity: 0.85 })
        .bindTooltip(label(pid), { permanent: true, direction: 'right',
          className: 'place-label', offset: [6, 0] })
        .on('click', () => showDetail('place', pid)).addTo(map);
    } else if (feat.geometry.type === 'Polygon') {
      const ring = feat.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
      // built once, added to the map only when the territory becomes active
      state.territoryLayers[pid] = L.polygon(ring, { color: '#7bd88f', weight: 2.5,
        fillColor: '#7bd88f', fillOpacity: TERRITORY_FILL, opacity: 0.95, dashArray: '6 6' })
        .bindTooltip(label(pid), { sticky: true, className: 'place-label' })
        .on('click', () => showDetail('place', pid));
    }
  }

  const slider = document.getElementById('slider');
  slider.max = timeline.frames.length;
  slider.addEventListener('input', e => { stop(); go(+e.target.value, false); });
  document.getElementById('prev').onclick = () => { stop(); go(state.idx - 1, true); };
  document.getElementById('next').onclick = () => { stop(); go(state.idx + 1, true); };
  document.getElementById('play').onclick = play;
  document.getElementById('lang').onchange = e => {
    state.lang = e.target.value;
    // permanent/cached tooltips are set at bind time — update them explicitly
    for (const [pid, m] of Object.entries(state.placeMarkers)) m.setTooltipContent(label(pid));
    for (const [tid, m] of Object.entries(state.territoryLayers)) m.setTooltipContent(label(tid));
    applyChrome();             // static page chrome
    render(state.idx, false);  // panel roster + person tooltips + readout
    renderDetail();            // re-render an open detail in the new language
  };

  applyChrome();
  render(0, false);
  window.__bke = { state, map, routeLayer, go, render, foldState, showDetail };  // debug/test hook
});
