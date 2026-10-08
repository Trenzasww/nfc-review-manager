'use strict';

// ── State ──────────────────────────────────────────────────
let state = {
  businesses: [],
  goals: [],
  providers: [],
  settings: {
    cardsBought: 20,
    totalCost: 0
  },
  currentPage: 'dashboard',
  currentFinTab: 'resumen',
  searchQuery: '',
  chartDays: 7,
  addMode: 'detailed'
};

// ── Cloud sync (optional Firebase) ──────────────────────────
const cloud = {
  ready: false,
  db: null,
  docRef: null,
  lastPushedJSON: '',
  pushTimer: null,

  async init() {
    if (!window.CLOUD_SYNC_ENABLED || !window.firebase) return;
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      this.db = firebase.firestore();
      this.docRef = this.db.collection('nfc_manager').doc('shared');
      this.ready = true;
      setCloudBadge('on');

      this.docRef.onSnapshot(snap => {
        if (!snap.exists) return;
        const data = snap.data();
        const incoming = JSON.stringify(data);
        if (incoming === this.lastPushedJSON) return; // our own write echoing back
        if (Array.isArray(data.businesses)) state.businesses = data.businesses;
        if (Array.isArray(data.goals))      state.goals      = data.goals;
        if (Array.isArray(data.providers))  state.providers  = data.providers;
        if (data.settings) state.settings = Object.assign(state.settings, data.settings);
        saveLocal();
        renderAll();
        showToast('☁️ Datos sincronizados');
      }, () => setCloudBadge('error'));
    } catch (e) {
      setCloudBadge('error');
    }
  },

  push() {
    if (!this.ready || !this.docRef) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      const payload = {
        businesses: state.businesses,
        goals: state.goals,
        providers: state.providers,
        settings: state.settings,
        updatedAt: Date.now()
      };
      this.lastPushedJSON = JSON.stringify(payload);
      this.docRef.set(payload).catch(() => setCloudBadge('error'));
    }, 500);
  }
};

function setCloudBadge(status) {
  const b = el('cloud-badge');
  if (!b) return;
  if (status === 'on')    { b.textContent = '☁️ Sincronizado'; b.className = 'cloud-badge on'; }
  if (status === 'error') { b.textContent = '⚠️ Sin conexión nube'; b.className = 'cloud-badge error'; }
  if (status === 'off')   { b.textContent = '💾 Solo en este dispositivo'; b.className = 'cloud-badge off'; }
}

// ── Persistence (local) ─────────────────────────────────────
function loadState() {
  try {
    const biz  = localStorage.getItem('nfc_businesses');
    const cfg  = localStorage.getItem('nfc_settings');
    const goa  = localStorage.getItem('nfc_goals');
    const prov = localStorage.getItem('nfc_providers');
    if (biz)  state.businesses = JSON.parse(biz);
    if (goa)  state.goals      = JSON.parse(goa);
    if (prov) state.providers  = JSON.parse(prov);
    if (cfg) {
      const s = JSON.parse(cfg);
      state.settings = Object.assign(state.settings, s);
    }
  } catch (e) { /* start fresh if storage unavailable */ }
}

function saveLocal() {
  try {
    localStorage.setItem('nfc_businesses', JSON.stringify(state.businesses));
    localStorage.setItem('nfc_goals', JSON.stringify(state.goals));
    localStorage.setItem('nfc_providers', JSON.stringify(state.providers));
    localStorage.setItem('nfc_settings', JSON.stringify(state.settings));
  } catch (e) {}
}

function saveBizData() { saveLocal(); cloud.push(); }
function saveGoals()   { saveLocal(); cloud.push(); }
function saveProviders(){ saveLocal(); cloud.push(); }

function saveSettings(notify) {
  const qty  = parseInt(document.getElementById('fin-cards-qty')?.value) || 20;
  const cost = parseFloat(document.getElementById('fin-total-cost')?.value) || 0;
  state.settings.cardsBought = Math.max(1, qty);
  state.settings.totalCost   = Math.max(0, cost);
  saveLocal();
  cloud.push();
  if (notify) showToast('💾 Guardado');
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

document.querySelectorAll('[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

function switchFinTab(tab) {
  state.currentFinTab = tab;
  document.querySelectorAll('.fin-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.fintab === tab));
  document.querySelectorAll('.fin-tab-panel').forEach(p => p.classList.toggle('hidden', p.dataset.fintab !== tab));
  renderAll();
}

// ── Computed values ────────────────────────────────────────
function unitsOf(b) { return Math.max(1, parseInt(b.qty) || 1); }

function getStats() {
  const unitsSold = state.businesses.reduce((s, b) => s + unitsOf(b), 0);
  const revenue   = state.businesses.reduce((s, b) => s + (b.salePrice || 0), 0);
  const costPerCard = state.settings.cardsBought > 0
    ? state.settings.totalCost / state.settings.cardsBought
    : 0;
  const costSold = unitsSold * costPerCard;
  const profit   = revenue - costSold;
  const available = Math.max(0, state.settings.cardsBought - unitsSold);
  const margin   = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  const entriesCount = state.businesses.length;

  return { sold: unitsSold, entriesCount, revenue, costPerCard, costSold, profit, available, margin };
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

  const ratio = state.settings.cardsBought > 0
    ? Math.min(100, (s.sold / state.settings.cardsBought) * 100) : 0;
  el('sb-ratio').textContent = `${s.sold} / ${state.settings.cardsBought}`;
  el('sb-fill').style.width  = ratio + '%';

  el('stat-sold').textContent    = s.sold;
  el('stat-avail').textContent   = `de ${state.settings.cardsBought} disponibles (${s.available} libres)`;
  el('stat-revenue').textContent = fmt$(s.revenue);
  el('stat-cost').textContent    = fmt$(s.costSold);
  el('stat-profit').textContent  = fmt$(s.profit);

  renderRecent();
  renderChart();

  if (state.currentPage === 'negocios') renderBusinesses();
  if (state.currentPage === 'nfc')      renderNfcBizList();
  if (state.currentPage === 'finanzas') {
    renderFinanzas(s);
    renderGoals(s);
    renderProviders();
    renderDailyLog(s);
  }

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
        <div class="recent-name">${esc(b.name)} ${unitsOf(b) > 1 ? `<span class="qty-chip">×${unitsOf(b)}</span>` : ''}</div>
        <div class="recent-date">${fmtDate(b.soldDate) || 'Sin fecha'}</div>
      </div>
      <div class="recent-price">${fmt$(b.salePrice)}</div>
    </div>
  `).join('');
}

// ── Chart: ganancia últimos N días ─────────────────────────
let chartInstance = null;

function setChartDays(n) {
  state.chartDays = n;
  document.querySelectorAll('.chart-range-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.days) === n));
  renderChart();
}

function buildDailySeries(days) {
  const s = getStats();
  const labels = [];
  const revenueArr = [];
  const profitArr = [];

  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayKeys.push(d.toISOString().slice(0, 10));
  }

  const byDate = {};
  state.businesses.forEach(b => {
    if (!b.soldDate) return;
    if (!byDate[b.soldDate]) byDate[b.soldDate] = { revenue: 0, units: 0 };
    byDate[b.soldDate].revenue += (b.salePrice || 0);
    byDate[b.soldDate].units   += unitsOf(b);
  });

  dayKeys.forEach(key => {
    const [y, m, d] = key.split('-');
    labels.push(`${d}/${m}`);
    const rec = byDate[key] || { revenue: 0, units: 0 };
    revenueArr.push(Math.round(rec.revenue));
    profitArr.push(Math.round(rec.revenue - rec.units * s.costPerCard));
  });

  return { labels, revenueArr, profitArr };
}

function renderChart() {
  const canvas = el('revenue-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  const { labels, revenueArr, profitArr } = buildDailySeries(state.chartDays);
  const totalRev = revenueArr.reduce((a,b) => a+b, 0);
  const totalProfit = profitArr.reduce((a,b) => a+b, 0);
  el('chart-summary') && (el('chart-summary').innerHTML =
    `Facturado: <strong class="green-text">${fmt$(totalRev)}</strong> · Ganancia: <strong style="color:${totalProfit>=0?'var(--g-green)':'var(--g-red)'}">${fmt$(totalProfit)}</strong>`);

  if (chartInstance) { chartInstance.destroy(); }

  const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    && document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255,255,255,.08)' : 'rgba(20,21,43,.07)';
  const textColor = isDark ? '#8890bc' : '#6b7190';

  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Facturado',
          data: revenueArr,
          borderColor: '#4285F4',
          backgroundColor: 'rgba(66,133,244,0.12)',
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#4285F4',
          borderWidth: 2.5
        },
        {
          label: 'Ganancia neta',
          data: profitArr,
          borderColor: '#34A853',
          backgroundColor: 'rgba(52,168,83,0.10)',
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointBackgroundColor: '#34A853',
          borderWidth: 2.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { family: 'DM Sans', size: 11 }, boxWidth: 10, usePointStyle: true } },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmt$(ctx.parsed.y)}` }
        }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, callback: v => fmt$(v) } }
      }
    }
  });
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
            <div class="biz-name">${esc(b.name)} ${unitsOf(b) > 1 ? `<span class="qty-chip">×${unitsOf(b)} NFC</span>` : ''}</div>
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
  saveSettings(true);
  renderAll();
}

function adjustTotalCost(delta) {
  const inp = el('fin-total-cost');
  if (!inp) return;
  stepNumber(inp, delta, 0);
  saveSettings(true);
  renderAll();
}

function adjustPrice(delta) {
  const inp = el('f-price');
  if (!inp) return;
  stepNumber(inp, delta, 0);
}

function adjustQty(delta) {
  const inp = el('f-qty');
  if (!inp) return;
  stepNumber(inp, delta, 1);
}

function adjustSimplePrice(delta) {
  const inp = el('fs-price');
  if (!inp) return;
  stepNumber(inp, delta, 0);
}

function adjustSimpleQty(delta) {
  const inp = el('fs-qty');
  if (!inp) return;
  stepNumber(inp, delta, 1);
}

function adjustGoalAmount(delta) {
  const inp = el('g-amount');
  if (!inp) return;
  stepNumber(inp, delta, 0);
}

// ── Finanzas: resumen ───────────────────────────────────────
function renderFinanzas(s) {
  if (!s) s = getStats();

  el('cost-per-card')   && (el('cost-per-card').textContent   = fmt$(s.costPerCard));
  el('pl-income')       && (el('pl-income').textContent       = fmt$(s.revenue));
  el('pl-cost-sold')    && (el('pl-cost-sold').textContent    = '−' + fmt$(s.costSold));
  el('pl-net')          && (el('pl-net').textContent          = fmt$(s.profit));

  if (el('pl-net')) {
    el('pl-net').style.color = s.profit >= 0 ? 'var(--g-green)' : 'var(--g-red)';
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
    const profit = (b.salePrice || 0) - unitsOf(b) * s.costPerCard;
    const profitColor = profit >= 0 ? 'var(--g-green)' : 'var(--g-red)';
    return `
      <div class="sales-item">
        <div class="sales-item-left">
          <div class="sales-item-name">${esc(b.name)} ${unitsOf(b) > 1 ? `<span class="qty-chip">×${unitsOf(b)}</span>` : ''}</div>
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

// ── Finanzas: registro diario ───────────────────────────────
function renderDailyLog(s) {
  const container = el('daily-log-list');
  if (!container) return;
  if (!s) s = getStats();

  const byDate = {};
  state.businesses.forEach(b => {
    const key = b.soldDate || 'sin-fecha';
    if (!byDate[key]) byDate[key] = { units: 0, revenue: 0, entries: [] };
    byDate[key].units   += unitsOf(b);
    byDate[key].revenue += (b.salePrice || 0);
    byDate[key].entries.push(b.name);
  });

  const keys = Object.keys(byDate).sort((a,b) => {
    if (a === 'sin-fecha') return 1;
    if (b === 'sin-fecha') return -1;
    return new Date(b) - new Date(a);
  });

  if (!keys.length) {
    container.innerHTML = `<div class="empty-state"><p>Todavía no hay ventas registradas</p></div>`;
    return;
  }

  container.innerHTML = keys.map(key => {
    const rec = byDate[key];
    const profit = rec.revenue - rec.units * s.costPerCard;
    return `
      <div class="daily-log-item">
        <div class="daily-log-date">${key === 'sin-fecha' ? 'Sin fecha' : fmtDate(key)}</div>
        <div class="daily-log-mid">
          <span class="daily-log-units">${rec.units} NFC</span>
          <span class="daily-log-names">${esc(rec.entries.join(', '))}</span>
        </div>
        <div class="daily-log-right">
          <span class="daily-log-revenue">${fmt$(rec.revenue)}</span>
          <span class="daily-log-profit" style="color:${profit>=0?'var(--g-green)':'var(--g-red)'}">${fmt$(profit)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ── Metas (goals) ────────────────────────────────────────────
function renderGoals(s) {
  const container = el('goals-list');
  if (!container) return;
  if (!s) s = getStats();

  if (!state.goals.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎯</div><p>Todavía no creaste ninguna meta</p><button class="btn-primary" onclick="openGoalModal()">Crear primera meta</button></div>`;
    return;
  }

  const list = [...state.goals].sort((a,b) => b.createdAt - a.createdAt);

  container.innerHTML = list.map(g => {
    const pct = g.targetAmount > 0 ? Math.min(100, (s.revenue / g.targetAmount) * 100) : 0;
    const reached = pct >= 100;
    const remaining = Math.max(0, g.targetAmount - s.revenue);
    return `
      <div class="goal-card ${reached ? 'reached' : ''}">
        <div class="goal-card-hdr">
          <div class="goal-title">${reached ? '🏆 ' : '🎯 '}${esc(g.title)}</div>
          <button class="btn-icon danger" onclick="deleteGoal('${g.id}')" title="Eliminar">🗑️</button>
        </div>
        <div class="goal-amounts">
          <span>${fmt$(s.revenue)}</span>
          <span class="goal-target">de ${fmt$(g.targetAmount)}</span>
        </div>
        <div class="goal-track">
          <div class="goal-fill" style="width:${pct}%"></div>
        </div>
        <div class="goal-footer">
          <span>${pct.toFixed(1)}% completado</span>
          ${reached ? `<span class="goal-done-tag">¡Meta cumplida! 🎉</span>` : `<span>Faltan ${fmt$(remaining)}</span>`}
        </div>
      </div>
    `;
  }).join('');
}

function openGoalModal() {
  el('g-title').value = '';
  el('g-amount').value = '';
  el('goal-modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => el('g-title')?.focus(), 50);
}

function closeGoalModal() {
  el('goal-modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function goalOverlayClose(e) { if (e.target === el('goal-modal-overlay')) closeGoalModal(); }

function saveGoal() {
  const title = el('g-title').value.trim();
  const amount = parseFloat(el('g-amount').value);
  if (!title) { el('g-title').focus(); showToast('⚠️ Ingresá un título para la meta'); return; }
  if (isNaN(amount) || amount <= 0) { el('g-amount').focus(); showToast('⚠️ Ingresá un monto válido'); return; }

  state.goals.push({ id: uid(), title, targetAmount: amount, createdAt: Date.now() });
  saveGoals();
  closeGoalModal();
  renderAll();
  showToast('🎯 Meta creada');
}

function deleteGoal(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  if (!confirm(`¿Eliminar la meta "${g.title}"?`)) return;
  state.goals = state.goals.filter(x => x.id !== id);
  saveGoals();
  renderAll();
  showToast('🗑️ Meta eliminada');
}

// ── Proveedores ──────────────────────────────────────────────
function renderProviders() {
  const container = el('providers-list');
  if (!container) return;

  if (!state.providers.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p>Todavía no agregaste proveedores</p><button class="btn-primary" onclick="openProviderModal()">Agregar primer proveedor</button></div>`;
    return;
  }

  const list = [...state.providers].sort((a,b) => b.createdAt - a.createdAt);

  container.innerHTML = list.map(p => `
    <div class="provider-card">
      <div class="provider-card-hdr">
        <div class="provider-name">${esc(p.name)}</div>
        <div class="biz-actions">
          <button class="btn-icon" onclick="openProviderModal('${p.id}')" title="Editar">✏️</button>
          <button class="btn-icon danger" onclick="deleteProvider('${p.id}')" title="Eliminar">🗑️</button>
        </div>
      </div>
      ${p.cost ? `<div class="provider-row"><span>Costo</span><strong>${esc(p.cost)}</strong></div>` : ''}
      ${p.qtyNote ? `<div class="provider-row"><span>Cantidad a comprar</span><strong>${esc(p.qtyNote)}</strong></div>` : ''}
      ${p.notes ? `<div class="biz-notes">${esc(p.notes)}</div>` : ''}
      ${p.link ? `<a href="${esc(p.link)}" target="_blank" class="btn-outline-blue" style="margin-top:8px">🔗 Ver</a>` : ''}
    </div>
  `).join('');
}

function openProviderModal(id) {
  const overlay = el('provider-modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (id) {
    const p = state.providers.find(x => x.id === id);
    if (!p) return;
    el('provider-modal-title').textContent = 'Editar Proveedor';
    el('p-edit-id').value = p.id;
    el('p-name').value = p.name;
    el('p-link').value = p.link || '';
    el('p-cost').value = p.cost || '';
    el('p-qty').value = p.qtyNote || '';
    el('p-notes').value = p.notes || '';
  } else {
    el('provider-modal-title').textContent = 'Agregar Proveedor';
    el('p-edit-id').value = '';
    el('p-name').value = '';
    el('p-link').value = '';
    el('p-cost').value = '';
    el('p-qty').value = '';
    el('p-notes').value = '';
  }
  setTimeout(() => el('p-name')?.focus(), 50);
}

function closeProviderModal() {
  el('provider-modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function providerOverlayClose(e) { if (e.target === el('provider-modal-overlay')) closeProviderModal(); }

function saveProvider() {
  const name = el('p-name').value.trim();
  if (!name) { el('p-name').focus(); showToast('⚠️ Ingresá el nombre del proveedor'); return; }

  const id = el('p-edit-id').value || uid();
  const obj = {
    id,
    name,
    link: el('p-link').value.trim(),
    cost: el('p-cost').value.trim(),
    qtyNote: el('p-qty').value.trim(),
    notes: el('p-notes').value.trim(),
    createdAt: Date.now()
  };

  const idx = state.providers.findIndex(p => p.id === id);
  if (idx >= 0) {
    obj.createdAt = state.providers[idx].createdAt;
    state.providers[idx] = obj;
    showToast('✅ Proveedor actualizado');
  } else {
    state.providers.push(obj);
    showToast('✅ Proveedor agregado');
  }

  saveProviders();
  closeProviderModal();
  renderAll();
}

function deleteProvider(id) {
  const p = state.providers.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`¿Eliminar el proveedor "${p.name}"?`)) return;
  state.providers = state.providers.filter(x => x.id !== id);
  saveProviders();
  renderAll();
  showToast('🗑️ Proveedor eliminado');
}

// ── Modal: agregar/editar negocio (2 modos) ─────────────────
function setAddMode(mode) {
  state.addMode = mode;
  document.querySelectorAll('.mode-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.mode-panel').forEach(p => p.classList.toggle('hidden', p.dataset.mode !== mode));
}

function openModal(id) {
  const overlay = el('modal-overlay');
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (id) {
    const b = state.businesses.find(x => x.id === id);
    if (!b) return;
    const mode = b.mode === 'simple' ? 'simple' : 'detailed';
    setAddMode(mode);
    document.querySelectorAll('.mode-tab-btn').forEach(btn => btn.disabled = true);

    el('modal-title').textContent = 'Editar Negocio';
    el('edit-id').value   = b.id;

    if (mode === 'simple') {
      el('fs-name').value = b.name;
      el('fs-qty').value  = b.qty || 1;
      el('fs-price').value = b.salePrice || '';
      el('fs-date').value = b.soldDate || '';
    } else {
      el('f-name').value    = b.name;
      el('f-qty').value     = b.qty || 1;
      el('f-price').value   = b.salePrice || '';
      el('f-date').value    = b.soldDate || '';
      el('f-placeid').value = b.placeId || '';
      el('f-review').value  = b.reviewLink || '';
      el('f-maps').value    = b.mapsLink || '';
      el('f-notes').value   = b.notes || '';
    }
  } else {
    document.querySelectorAll('.mode-tab-btn').forEach(btn => btn.disabled = false);
    setAddMode('detailed');
    el('modal-title').textContent = 'Agregar Negocio';
    el('edit-id').value   = '';
    el('f-name').value    = '';
    el('f-qty').value     = 1;
    el('f-price').value   = '';
    el('f-date').value    = todayStr();
    el('f-placeid').value = '';
    el('f-review').value  = '';
    el('f-maps').value    = '';
    el('f-notes').value   = '';
    el('fs-name').value   = '';
    el('fs-qty').value    = 1;
    el('fs-price').value  = '';
    el('fs-date').value   = todayStr();
  }

  setTimeout(() => el(state.addMode === 'simple' ? 'fs-name' : 'f-name')?.focus(), 50);
}

function closeModal() {
  el('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function overlayClose(e) {
  if (e.target === el('modal-overlay')) closeModal();
}

function saveBusiness() {
  const mode = state.addMode;
  const id   = el('edit-id').value || uid();
  let obj;

  if (mode === 'simple') {
    const name  = el('fs-name').value.trim();
    const qty   = parseInt(el('fs-qty').value) || 1;
    const price = parseFloat(el('fs-price').value);
    if (!name) { el('fs-name').focus(); showToast('⚠️ Ingresá el nombre del negocio'); return; }
    if (isNaN(price) || price < 0) { el('fs-price').focus(); showToast('⚠️ Ingresá un monto válido'); return; }

    obj = {
      id, name, mode: 'simple',
      qty, salePrice: price,
      soldDate: el('fs-date').value,
      placeId: '', reviewLink: '', mapsLink: '', notes: '',
      createdAt: Date.now()
    };
  } else {
    const name  = el('f-name').value.trim();
    const qty   = parseInt(el('f-qty').value) || 1;
    const price = parseFloat(el('f-price').value);
    if (!name) { el('f-name').focus(); showToast('⚠️ Ingresá el nombre del negocio'); return; }
    if (isNaN(price) || price < 0) { el('f-price').focus(); showToast('⚠️ Ingresá un precio válido'); return; }

    const placeId = el('f-placeid').value.trim();
    const review  = el('f-review').value.trim() || (placeId ? reviewUrl(placeId) : '');

    obj = {
      id, name, mode: 'detailed',
      qty, salePrice: price,
      soldDate: el('f-date').value,
      placeId,
      reviewLink: review,
      mapsLink: el('f-maps').value.trim(),
      notes: el('f-notes').value.trim(),
      createdAt: Date.now()
    };
  }

  const idx = state.businesses.findIndex(b => b.id === id);
  if (idx >= 0) {
    obj.createdAt = state.businesses[idx].createdAt;
    state.businesses[idx] = obj;
    showToast('✅ Negocio actualizado');
  } else {
    if ((getStats().sold + obj.qty) > state.settings.cardsBought) {
      if (!confirm(`Con esta venta superás las ${state.settings.cardsBought} tarjetas compradas. ¿Querés igualmente agregarla?`)) return;
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
setCloudBadge(window.CLOUD_SYNC_ENABLED ? 'on' : 'off');
renderAll();
navigateTo('dashboard');
cloud.init();
