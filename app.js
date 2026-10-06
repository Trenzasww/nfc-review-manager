'use strict';

// ── State ──────────────────────────────────────────────────
let state = {
  businesses: [],
  settings: {
    cardsBought: 20,
    totalCost: 0
  },
  currentPage: 'dashboard',
  searchQuery: ''
};

// ── Persistence ────────────────────────────────────────────
function loadState() {
  try {
    const biz = localStorage.getItem('nfc_businesses');
    const cfg = localStorage.getItem('nfc_settings');
    if (biz) state.businesses = JSON.parse(biz);
    if (cfg) {
      const s = JSON.parse(cfg);
      state.settings = Object.assign(state.settings, s);
    }
  } catch (e) { /* start fresh if storage unavailable */ }
}

function saveBizData() {
  try { localStorage.setItem('nfc_businesses', JSON.stringify(state.businesses)); } catch (e) {}
}

function saveSettings() {
  const qty  = parseInt(document.getElementById('fin-cards-qty')?.value) || 20;
  const cost = parseFloat(document.getElementById('fin-total-cost')?.value) || 0;
  state.settings.cardsBought = Math.max(1, qty);
  state.settings.totalCost   = Math.max(0, cost);
  try { localStorage.setItem('nfc_settings', JSON.stringify(state.settings)); } catch (e) {}
}

// ── Navigation ─────────────────────────────────────────────
function navigateTo(page) {
  state.currentPage = page;

  document.querySelectorAll('.page').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  document.querySelectorAll('.bnav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  renderAll();
}

// Wire up nav buttons
document.querySelectorAll('[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

// ── Computed values ────────────────────────────────────────
function getStats() {
  const sold     = state.businesses.length;
  const revenue  = state.businesses.reduce((s, b) => s + (b.salePrice || 0), 0);
  const costPerCard = state.settings.cardsBought > 0
    ? state.settings.totalCost / state.settings.cardsBought
    : 0;
  const costSold = sold * costPerCard;
  const profit   = revenue - costSold;
  const available = Math.max(0, state.settings.cardsBought - sold);
  const margin   = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  return { sold, revenue, costPerCard, costSold, profit, available, margin };
}

// ── Formatting ─────────────────────────────────────────────
function fmt$(n) {
  if (n === null || n === undefined) return '$0';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function fmtDate(d) {
  if (!d) return '';
  try {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  } catch { return d; }
}

// ── renderAll ──────────────────────────────────────────────
function renderAll() {
  const s = getStats();

  // Sidebar progress
  const ratio = state.settings.cardsBought > 0
    ? Math.min(100, (s.sold / state.settings.cardsBought) * 100) : 0;
  el('sb-ratio').textContent = `${s.sold} / ${state.settings.cardsBought}`;
  el('sb-fill').style.width  = ratio + '%';

  // Dashboard stats
  el('stat-sold').textContent    = s.sold;
  el('stat-avail').textContent   = `de ${state.settings.cardsBought} disponibles (${s.available} libres)`;
  el('stat-revenue').textContent = fmt$(s.revenue);
  el('stat-cost').textContent    = fmt$(s.costSold);
  el('stat-profit').textContent  = fmt$(s.profit);

  renderRecent();

  if (state.currentPage === 'negocios') renderBusinesses();
  if (state.currentPage === 'nfc')      renderNfcBizList();
  if (state.currentPage === 'finanzas') renderFinanzas(s);

  // Sync fin inputs
  const finQty  = document.getElementById('fin-cards-qty');
  const finCost = document.getElementById('fin-total-cost');
  if (finQty  && document.activeElement !== finQty)  finQty.value  = state.settings.cardsBought;
  if (finCost && document.activeElement !== finCost) finCost.value = state.settings.totalCost || '';
  el('cost-per-card') && (el('cost-per-card').textContent = fmt$(s.costPerCard));
}

function el(id) { return document.getElementById(id); }

// ── Recent (dashboard) ──────────────────────────────────────
function renderRecent() {
  const container = el('recent-list');
  if (!container) return;

  const last5 = [...state.businesses]
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  if (!last5.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏪</div>
        <p>Todavía no agregaste ningún negocio</p>
        <button class="btn-primary" onclick="openModal()">Agregar primer negocio</button>
      </div>`;
    return;
  }

  container.innerHTML = last5.map(b => `
    <div class="recent-item">
      <div>
        <div class="recent-name">${esc(b.name)}</div>
        <div class="recent-date">${fmtDate(b.soldDate) || 'Sin fecha'}</div>
      </div>
      <div class="recent-price">${fmt$(b.salePrice)}</div>
    </div>
  `).join('');
}

// ── Businesses grid ────────────────────────────────────────
function renderBusinesses() {
  const container = el('businesses-grid');
  if (!container) return;

  let list = state.businesses.filter(b =>
    !state.searchQuery ||
    b.name.toLowerCase().includes(state.searchQuery.toLowerCase())
  );

  list = [...list].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!list.length) {
    container.innerHTML = state.searchQuery
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><p>No hay resultados para "${esc(state.searchQuery)}"</p></div>`
      : `<div class="empty-state"><div class="empty-icon">🏪</div><p>No hay negocios cargados todavía</p><button class="btn-primary" onclick="openModal()">Agregar primer negocio</button></div>`;
    return;
  }

  container.innerHTML = list.map(b => {
    const reviewLink = b.reviewLink || (b.placeId ? reviewUrl(b.placeId) : '');
    const links = [];
    if (reviewLink)  links.push(`<a href="${reviewLink}" target="_blank" class="biz-link review">⭐ Google Review</a>`);
    if (b.mapsLink)  links.push(`<a href="${esc(b.mapsLink)}" target="_blank" class="biz-link maps">📍 Maps</a>`);
    if (reviewLink)  links.push(`<button class="biz-link nfc-copy" onclick="copyText('${reviewLink}', 'Link copiado')">📋 Copiar link NFC</button>`);

    return `
      <div class="biz-card">
        <div class="biz-card-hdr">
          <div>
            <div class="biz-name">${esc(b.name)}</div>
            ${b.soldDate ? `<div class="biz-date">Vendido el ${fmtDate(b.soldDate)}</div>` : ''}
          </div>
          <div class="biz-actions">
            <button class="btn-icon" onclick="openModal('${b.id}')" title="Editar">✏️</button>
            <button class="btn-icon danger" onclick="deleteBusiness('${b.id}')" title="Eliminar">🗑️</button>
          </div>
        </div>
        <div class="biz-price-row">
          <span class="biz-price-label">Precio de venta</span>
          <span class="biz-price-val">${fmt$(b.salePrice)}</span>
        </div>
        ${links.length ? `<div class="biz-links">${links.join('')}</div>` : ''}
        ${b.notes ? `<div class="biz-notes">${esc(b.notes)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function filterBusinesses() {
  state.searchQuery = el('search-input')?.value || '';
  renderBusinesses();
}

// ── NFC page businesses ────────────────────────────────────
function renderNfcBizList() {
  const container = el('nfc-biz-list');
  if (!container) return;

  const withPid = state.businesses.filter(b => b.placeId || b.reviewLink);
  if (!withPid.length) {
    container.innerHTML = `<div class="empty-state"><p>Agregá negocios con Place ID para verlos acá</p></div>`;
    return;
  }

  container.innerHTML = withPid.map(b => {
    const link = b.reviewLink || (b.placeId ? reviewUrl(b.placeId) : '');
    return `
      <div class="nfc-biz-item">
        <div>
          <div class="nfc-biz-name">${esc(b.name)}</div>
          ${b.placeId ? `<div class="nfc-biz-pid">${esc(b.placeId)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${link ? `<a href="${link}" target="_blank" class="btn-outline-blue" style="font-size:11px;padding:5px 10px">⭐ Ver review</a>` : ''}
          ${link ? `<button class="btn-ghost-sm" onclick="loadPlaceId('${b.placeId || ''}','${link}')">📋 Cargar</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function loadPlaceId(pid, link) {
  const inp = el('place-id-input');
  if (inp) { inp.value = pid; generateNfcLink(); }
  if (!pid && link) {
    const fullInp = el('full-link-input');
    if (fullInp) { fullInp.value = link; el('copy-btn').disabled = false; el('link-id-display').textContent = link.split('placeid=')[1] || '—'; }
  }
}

// ── Steppers (+ / −) ───────────────────────────────────────
function stepNumber(inputEl, delta, min) {
  let v = parseFloat(inputEl.value) || 0;
  v = Math.max(min, v + delta);
  inputEl.value = v;
  return v;
}

function adjustCardsQty(delta) {
  const inp = el('fin-cards-qty');
  if (!inp) return;
  stepNumber(inp, delta, 1);
  saveSettings();
  renderAll();
}

function adjustTotalCost(delta) {
  const inp = el('fin-total-cost');
  if (!inp) return;
  stepNumber(inp, delta, 0);
  saveSettings();
  renderAll();
}

function adjustPrice(delta) {
  const inp = el('f-price');
  if (!inp) return;
  stepNumber(inp, delta, 0);
}

// ── Finanzas ───────────────────────────────────────────────
function renderFinanzas(s) {
  if (!s) s = getStats();

  el('cost-per-card')   && (el('cost-per-card').textContent   = fmt$(s.costPerCard));
  el('pl-income')       && (el('pl-income').textContent       = fmt$(s.revenue));
  el('pl-cost-sold')    && (el('pl-cost-sold').textContent    = '−' + fmt$(s.costSold));
  el('pl-net')          && (el('pl-net').textContent          = fmt$(s.profit));

  if (el('pl-net')) {
    el('pl-net').style.color = s.profit >= 0
      ? 'var(--g-green)' : 'var(--g-red)';
  }

  const badge = el('margin-badge');
  if (badge) {
    if (s.revenue > 0) {
      const positive = s.margin >= 0;
      badge.textContent = `Margen de ganancia: ${s.margin}%`;
      badge.style.background = positive ? 'var(--g-green-bg)' : 'var(--g-red-bg)';
      badge.style.color      = positive ? 'var(--g-green)' : 'var(--g-red)';
    } else {
      badge.textContent = '';
    }
  }

  renderSalesList(s);
}

function renderSalesList(s) {
  const container = el('sales-list');
  if (!container) return;

  const list = [...state.businesses].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><p>Agregá negocios para ver el detalle</p></div>`;
    return;
  }

  container.innerHTML = list.map(b => {
    const profit = (b.salePrice || 0) - s.costPerCard;
    const profitColor = profit >= 0 ? 'var(--g-green)' : 'var(--g-red)';
    return `
      <div class="sales-item">
        <div class="sales-item-left">
          <div class="sales-item-name">${esc(b.name)}</div>
          <div class="sales-item-date">${b.soldDate ? fmtDate(b.soldDate) : 'Sin fecha'}</div>
        </div>
        <div class="sales-item-right">
          <div class="sales-item-price">${fmt$(b.salePrice)}</div>
          <div class="sales-item-profit" style="color:${profitColor}">Ganancia: ${fmt$(profit)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Modal ──────────────────────────────────────────────────
function openModal(id) {
  const overlay = el('modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (id) {
    const b = state.businesses.find(x => x.id === id);
    if (!b) return;
    el('modal-title').textContent = 'Editar Negocio';
    el('edit-id').value   = b.id;
    el('f-name').value    = b.name;
    el('f-price').value   = b.salePrice || '';
    el('f-date').value    = b.soldDate || '';
    el('f-placeid').value = b.placeId || '';
    el('f-review').value  = b.reviewLink || '';
    el('f-maps').value    = b.mapsLink || '';
    el('f-notes').value   = b.notes || '';
  } else {
    el('modal-title').textContent = 'Agregar Negocio';
    el('edit-id').value   = '';
    el('f-name').value    = '';
    el('f-price').value   = '';
    el('f-date').value    = todayStr();
    el('f-placeid').value = '';
    el('f-review').value  = '';
    el('f-maps').value    = '';
    el('f-notes').value   = '';
  }

  setTimeout(() => el('f-name')?.focus(), 50);
}

function closeModal() {
  el('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function overlayClose(e) {
  if (e.target === el('modal-overlay')) closeModal();
}

function saveBusiness() {
  const name  = el('f-name').value.trim();
  const price = parseFloat(el('f-price').value);
  if (!name) { el('f-name').focus(); showToast('⚠️ Ingresá el nombre del negocio'); return; }
  if (isNaN(price) || price < 0) { el('f-price').focus(); showToast('⚠️ Ingresá un precio válido'); return; }

  const id      = el('edit-id').value || uid();
  const placeId = el('f-placeid').value.trim();
  const review  = el('f-review').value.trim() || (placeId ? reviewUrl(placeId) : '');

  const obj = {
    id,
    name,
    salePrice:  price,
    soldDate:   el('f-date').value,
    placeId,
    reviewLink: review,
    mapsLink:   el('f-maps').value.trim(),
    notes:      el('f-notes').value.trim(),
    createdAt:  Date.now()
  };

  const idx = state.businesses.findIndex(b => b.id === id);
  if (idx >= 0) {
    obj.createdAt = state.businesses[idx].createdAt;
    state.businesses[idx] = obj;
    showToast('✅ Negocio actualizado');
  } else {
    if (state.businesses.length >= state.settings.cardsBought) {
      if (!confirm(`Ya vendiste ${state.settings.cardsBought} tarjetas (tu total comprado). ¿Querés igualmente agregar este negocio?`)) return;
    }
    state.businesses.push(obj);
    showToast('✅ Negocio agregado');
  }

  saveBizData();
  closeModal();
  renderAll();
}

function deleteBusiness(id) {
  const b = state.businesses.find(x => x.id === id);
  if (!b) return;
  if (!confirm(`¿Eliminar "${b.name}"? Esta acción no se puede deshacer.`)) return;
  state.businesses = state.businesses.filter(x => x.id !== id);
  saveBizData();
  renderAll();
  showToast('🗑️ Negocio eliminado');
}

function autoFillReview() {
  const pid = el('f-placeid')?.value.trim();
  if (!pid) return;
  const reviewInp = el('f-review');
  if (reviewInp && !reviewInp.value) {
    reviewInp.value = reviewUrl(pid);
  } else if (reviewInp && reviewInp.value.includes('writereview?placeid=')) {
    reviewInp.value = reviewUrl(pid);
  }
}

// ── NFC link generator ─────────────────────────────────────
function generateNfcLink() {
  const pid     = (el('place-id-input')?.value || '').trim();
  const display = el('link-id-display');
  const fullInp = el('full-link-input');
  const copyBtn = el('copy-btn');

  if (!pid) {
    if (display) display.textContent = '—';
    if (fullInp) fullInp.value = 'https://search.google.com/local/writereview?placeid=';
    if (copyBtn) copyBtn.disabled = true;
    return;
  }

  const url = reviewUrl(pid);
  if (display) display.textContent = pid;
  if (fullInp) fullInp.value = url;
  if (copyBtn) copyBtn.disabled = false;
}

function copyNfcLink() {
  const url = el('full-link-input')?.value;
  if (!url || url === 'https://search.google.com/local/writereview?placeid=') return;
  copyText(url, '✅ Link copiado. Pegalo en NFC Tools');
  const toast = el('copy-toast');
  if (toast) {
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
  }
}

function clearPlaceId() {
  const inp = el('place-id-input');
  if (inp) { inp.value = ''; generateNfcLink(); }
}

function openPlaceFinder() {
  window.open('https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder', '_blank');
}

// ── Helpers ────────────────────────────────────────────────
function reviewUrl(pid) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(pid)}`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function copyText(text, msg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(msg || '📋 Copiado'))
      .catch(() => fallbackCopy(text, msg));
  } else {
    fallbackCopy(text, msg);
  }
}

function fallbackCopy(text, msg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); showToast(msg || '📋 Copiado'); }
  catch { showToast('⚠️ No se pudo copiar'); }
  document.body.removeChild(ta);
}

function copyField(fieldId) {
  const inp = el(fieldId);
  if (inp && inp.value) copyText(inp.value, '📋 Link copiado');
}

let toastTimer;
function showToast(msg) {
  const toast = el('app-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

// ── Boot ───────────────────────────────────────────────────
loadState();
renderAll();
navigateTo('dashboard');
