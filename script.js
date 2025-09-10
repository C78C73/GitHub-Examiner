let chartDataCache = null;
let chartInstances = { lang: null, fork: null, star: null, activeDays: null, activeTimes: null };
let chartTypes = { lang: 'line', fork: 'line', star: 'line' };


function destroyCharts() {
  for (const key in chartInstances) {
    if (chartInstances[key]) {
      chartInstances[key].destroy();
      chartInstances[key] = null;
    }
  }
  // Remove calendar
  const cal = document.getElementById('contribCalendar');
  if (cal) cal.innerHTML = '';
}

// Central renderer: shows the charts section, destroys previous charts and renders all charts + calendar
function renderCharts() {
  const section = document.getElementById('chartsSection');
  if (section) { section.style.display = 'block'; section.classList.remove('charts-hidden'); }
  if (!chartDataCache) return;
  // clear previous chart instances and calendar
  destroyCharts();

  // Render each chart if data exists
  try { renderLangChart(); } catch (e) { console.error('lang chart error', e); }
  try { renderForkChart(); } catch (e) { console.error('fork chart error', e); }
  try { renderStarChart(); } catch (e) { console.error('star chart error', e); }
  try { renderActiveDaysChart(); } catch (e) { console.error('active days chart error', e); }
  try { renderActiveTimesChart(); } catch (e) { console.error('active times chart error', e); }

  try { renderContributionCalendar(chartDataCache.calendar || {}); } catch (e) { console.error('calendar render error', e); }
  try { renderCommitCountCard(); } catch (e) { console.error('commit count card error', e); }
  try { enableChartDragDrop(); } catch (e) { console.error('dragdrop init error', e); }
  try { renderFollowers(); } catch (e) { console.error('followers render error', e); }
  // ensure legend classes are correct after rendering
  try { updateLegendClasses(); } catch (e) { console.warn('updateLegendClasses failed', e); }
}

// scan chart containers and toggle .no-legend when the .card-legend is empty
function updateLegendClasses() {
  const containers = document.querySelectorAll('.chart-container');
  containers.forEach(c => {
    const legend = c.querySelector('.card-legend');
    if (!legend || legend.children.length === 0) c.classList.add('no-legend');
    else c.classList.remove('no-legend');
  });
}

function getAuthHeaders() {
  // Priority: input field -> sessionStorage -> window.__DEFAULT_GH_TOKEN
  const inputEl = document.getElementById('githubToken');
  const inputVal = inputEl ? (inputEl.value||'').trim() : '';
  const sessionVal = sessionStorage.getItem('gh_token') || '';
  const defaultVal = (window.__DEFAULT_GH_TOKEN || '').trim();
  const token = inputVal || sessionVal || defaultVal;
  if (token) return { Authorization: `token ${token}` };
  return {};
}

// Helper: save token to session if checkbox is checked
function trySaveSessionToken() {
  const remember = document.getElementById('rememberToken');
  const input = document.getElementById('githubToken');
  if (!input) return;
  const val = input.value && input.value.trim();
  if (remember && remember.checked && val) {
    sessionStorage.setItem('gh_token', val);
  }
}

function clearSessionToken() {
  sessionStorage.removeItem('gh_token');
  const input = document.getElementById('githubToken'); if (input) input.value = '';
  const remember = document.getElementById('rememberToken'); if (remember) remember.checked = false;
}

// Fetch all pages for a user's repos (per_page=100)
async function fetchAllRepos(username, headers, progressCb, abortSignal) {
  let all = [];
  let page = 1;
  while (true) {
    if (abortSignal && abortSignal.aborted) throw new Error('aborted');
    const url = `https://api.github.com/users/${username}/repos?per_page=100&page=${page}`;
    const resp = await safeFetch(url, { headers, signal: abortSignal });
    const arr = await resp.json();
    if (!Array.isArray(arr)) break;
    all.push(...arr);
    if (progressCb) progressCb(all.length);
    if (arr.length < 100) break;
    page++;
  }
  return all;
}

// Fetch all commits for a single repo (paginated)
async function fetchAllCommitsForRepo(owner, repo, since, until, headers, abortSignal) {
  let all = [];
  let page = 1;
  while (true) {
    if (abortSignal && abortSignal.aborted) throw new Error('aborted');
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${since}&until=${until}&per_page=100&page=${page}`;
    const resp = await safeFetch(url, { headers, signal: abortSignal });
    const arr = await resp.json();
    if (!Array.isArray(arr)) break;
    all.push(...arr);
    if (arr.length < 100) break;
    page++;
  }
  return all;
}

// safeFetch: retries on 429/403 or transient network errors with exponential backoff
async function safeFetch(url, opts = {}, retries = 4, backoff = 800) {
  const signal = opts && opts.signal;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) throw new Error('aborted');
    try {
      const resp = await fetch(url, opts);
      if (resp.status === 429 || resp.status === 403) {
        // Rate limit or forbidden - try to backoff and retry if attempts remain
        const reset = resp.headers.get('x-ratelimit-reset');
        const wait = reset ? Math.max(1000, (parseInt(reset) * 1000 - Date.now())) : backoff * Math.pow(2, attempt);
        if (attempt === retries) return resp; // give up
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return resp;
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt)));
    }
  }
}

async function renderFollowers() {
  const content = document.getElementById('followersContent');
  if (!content) return;
  // show loading
  content.textContent = 'Loading…';
  try {
    const urlInput = document.getElementById('githubLink').value || '';
    const username = urlInput.includes('github.com/') ? urlInput.split('github.com/')[1].replace(/\/+$/,'').split('/')[0] : urlInput.replace(/\/+$/,'').split('/')[0];
    if (!username) { content.textContent = 'No username'; return; }
    const headers = getAuthHeaders();
    const resp = await fetch(`https://api.github.com/users/${username}`, { headers });
    const data = await resp.json();
    if (data && (data.followers !== undefined)) {
      content.innerHTML = `<div style="font-size:1.4rem;color:#e6ffe6;">${data.followers}</div><div style="font-size:0.9rem;color:#b6ffb6;">followers</div><div style="margin-top:8px;color:#aaffcc;">Following: ${data.following}</div>`;
    } else {
      content.textContent = 'N/A';
    }
  } catch (err) {
    console.error('followers fetch error', err);
    content.textContent = 'Error';
  }
}

function renderLangChart() {
  if (chartInstances.lang) chartInstances.lang.destroy();
  const ctx = document.getElementById("langChart");
  const isLine = chartTypes.lang === 'line';
  chartInstances.lang = new Chart(ctx, {
    type: chartTypes.lang,
    data: {
      labels: chartDataCache.lang.labels,
      datasets: [{
        data: chartDataCache.lang.data,
        label: isLine ? 'Languages' : undefined,
        backgroundColor: isLine ? 'rgba(0,0,0,0)' : chartDataCache.lang.colors,
        borderColor: isLine ? chartDataCache.lang.colors : undefined,
        fill: isLine ? false : undefined,
        tension: isLine ? 0.3 : undefined,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { ticks: { display: false }, grid: { display: false } } },
    }
  });
  // language legend on the right
  try {
    const legend = document.getElementById('langLegend');
    if (legend) {
      legend.innerHTML = '';
      const labels = chartDataCache.lang.labels || [];
      const colors = chartDataCache.lang.colors || [];
      labels.forEach((name, i) => {
        const it = document.createElement('div'); it.className = 'legend-item';
        const sw = document.createElement('div'); sw.className = 'color-swatch'; sw.style.background = colors[i] || '#0f3d2e';
        const txt = document.createElement('div'); txt.textContent = name; txt.style.color = '#e6ffe6'; txt.style.fontSize = '0.95rem';
        it.appendChild(sw); it.appendChild(txt); legend.appendChild(it);
      });
    }
  } catch (e) { console.warn('lang legend fail', e); }
    // expand canvas if there is no legend
    const container = document.getElementById(containerId).closest('.chart-container');
    if (legend.children.length === 0) container.classList.add('no-legend'); else container.classList.remove('no-legend');
}

function renderForkChart() {
  if (chartInstances.fork) chartInstances.fork.destroy();
  const ctx = document.getElementById("forkChart");
  const isLine = chartTypes.fork === 'line';
  chartInstances.fork = new Chart(ctx, {
    type: chartTypes.fork,
    data: {
      labels: chartDataCache.fork.labels,
      datasets: [{
        label: isLine ? 'Forks' : (chartTypes.fork === 'pie' ? undefined : 'Forks'),
        data: chartDataCache.fork.data,
        backgroundColor: isLine ? 'rgba(0,0,0,0)' : chartDataCache.fork.colors,
        borderColor: isLine ? chartDataCache.fork.colors : undefined,
        fill: isLine ? false : undefined,
        tension: isLine ? 0.3 : undefined,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true,
      maintainAspectRatio: false,
      scales: chartTypes.fork === 'pie' ? undefined : {
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#b6ffb6' } },
        x: { ticks: { display: false }, grid: { display: false } }
      },
    }
  });
  // build legend on the right side: show name + color swatch
  try {
    const legend = document.getElementById('forkLegend');
    if (legend) {
      legend.innerHTML = '';
      const labels = chartDataCache.fork.labels || [];
      const colors = chartDataCache.fork.colors || [];
      labels.forEach((name, i) => {
        const it = document.createElement('div'); it.className = 'legend-item';
        const sw = document.createElement('div'); sw.className = 'color-swatch'; sw.style.background = colors[i] || '#0f3d2e';
        const txt = document.createElement('div'); txt.textContent = name; txt.style.color = '#e6ffe6'; txt.style.fontSize = '0.95rem';
        it.appendChild(sw); it.appendChild(txt); legend.appendChild(it);
      });
    }
  } catch (e) { console.warn('legend render fail', e); }
    // expand canvas if legend empty
    const container = document.getElementById(containerId).closest('.chart-container');
    if (legend.children.length === 0) container.classList.add('no-legend'); else container.classList.remove('no-legend');
}

function renderStarChart() {
  if (chartInstances.star) chartInstances.star.destroy();
  const ctx = document.getElementById("starChart");
  const isLine = chartTypes.star === 'line';
  chartInstances.star = new Chart(ctx, {
    type: chartTypes.star,
    data: {
      labels: chartDataCache.star.labels,
      datasets: [{
        label: isLine ? 'Stars' : (chartTypes.star === 'pie' ? undefined : 'Stars'),
        data: chartDataCache.star.data,
        backgroundColor: isLine ? 'rgba(0,0,0,0)' : chartDataCache.star.colors,
        borderColor: isLine ? chartDataCache.star.colors : undefined,
        fill: isLine ? false : undefined,
        tension: isLine ? 0.3 : undefined,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true,
      maintainAspectRatio: false,
      scales: chartTypes.star === 'pie' ? undefined : {
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: '#b6ffb6' } },
        x: { ticks: { display: false }, grid: { display: false } }
      },
    }
  });
  try {
    const legend = document.getElementById('starLegend');
    if (legend) {
      legend.innerHTML = '';
      const labels = chartDataCache.star.labels || [];
      const colors = chartDataCache.star.colors || [];
      labels.forEach((name, i) => {
        const it = document.createElement('div'); it.className = 'legend-item';
        const sw = document.createElement('div'); sw.className = 'color-swatch'; sw.style.background = colors[i] || '#875';
        const txt = document.createElement('div'); txt.textContent = name; txt.style.color = '#e6ffe6'; txt.style.fontSize = '0.95rem';
        it.appendChild(sw); it.appendChild(txt); legend.appendChild(it);
      });
    }
  } catch (e) { console.warn('legend render fail', e); }
    // expand canvas if legend empty
    const container = document.getElementById(containerId).closest('.chart-container');
    if (legend.children.length === 0) container.classList.add('no-legend'); else container.classList.remove('no-legend');
}

function renderActiveDaysChart() {
  if (chartInstances.activeDays) chartInstances.activeDays.destroy();
  let max = Math.max(...chartDataCache.activeDays.data);
  // scale exactly to the highest amount (don't round to nearest 5)
  let yMax = Math.max(max, 1);
  chartInstances.activeDays = new Chart(document.getElementById("activeDaysChart"), {
    type: 'bar',
    data: {
      labels: chartDataCache.activeDays.labels,
      datasets: [{
        label: "Commits",
        data: chartDataCache.activeDays.data,
        backgroundColor: '#00ff88',
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          min: 0,
          max: yMax,
          ticks: { color: '#b6ffb6', stepSize: 1, precision: 0 },
          grid: { color: '#133d2b' }
        },
        x: {
          ticks: { color: '#b6ffb6' },
          grid: { color: '#133d2b' }
        }
      }
    }
  });
}

function renderActiveTimesChart() {
  if (chartInstances.activeTimes) chartInstances.activeTimes.destroy();
  const dataArr = chartDataCache.activeTimes.data || [];
  const labels = chartDataCache.activeTimes.labels || [];
  let max = dataArr.length ? Math.max(...dataArr) : 1;
  let yMax = Math.max(max, 1);
  chartInstances.activeTimes = new Chart(document.getElementById('activeTimesChart'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'Commits', data: dataArr, backgroundColor: '#00ff88' }]
    },
    options: {
      plugins: { legend: { display: false } },
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, min: 0, max: yMax, ticks: { color: '#b6ffb6', stepSize: 1, precision: 0 }, grid: { color: '#133d2b' } },
        x: { ticks: { color: '#b6ffb6' }, grid: { color: '#133d2b' } }
      }
    }
  });
}

function enableChartDragDrop() {
  const container = document.getElementById('chartsSection');
  if (!container) return;
  const chartCards = Array.from(container.querySelectorAll('.chart-card'));
  chartCards.forEach(card => {
    let handle = card.querySelector('.drag-handle');
    if (!handle) {
      handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.textContent = '☰';
      card.style.position = 'relative';
      card.appendChild(handle);
    }

    handle.setAttribute('draggable', 'true');
    handle.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.id);
      e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
  // temporarily hide the dragged element so elementFromPoint can detect underlying cards
  card.style.display = 'none';
      // create placeholder
      const placeholder = document.createElement('div');
      placeholder.className = 'chart-card placeholder';
      placeholder.style.width = `${card.offsetWidth}px`;
      placeholder.style.height = `${card.offsetHeight}px`;
      placeholder.dataset.placeholder = 'true';
      card.parentNode.insertBefore(placeholder, card.nextSibling);
      window.__dragState = { dragged: card, placeholder };
      // disable pointer events on canvas while dragging
      card.querySelectorAll('canvas').forEach(c => c.style.pointerEvents = 'none');
      // invisible drag image
      const ghost = document.createElement('div'); ghost.style.width = '0px'; ghost.style.height = '0px'; document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 0, 0); setTimeout(() => document.body.removeChild(ghost), 0);
    });

    handle.addEventListener('dragend', () => {
      const state = window.__dragState || {};
      const dragged = state.dragged;
      const placeholder = state.placeholder;
      if (placeholder && placeholder.parentNode) placeholder.parentNode.replaceChild(dragged, placeholder);
      if (dragged) {
        dragged.classList.remove('dragging');
        // restore display
        dragged.style.display = '';
        dragged.querySelectorAll('canvas').forEach(c => c.style.pointerEvents = 'auto');
      }
      delete window.__dragState;
      // cleanup any placeholders
      container.querySelectorAll('.chart-card.placeholder').forEach(p => p.parentNode && p.parentNode.removeChild(p));
    });
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const state = window.__dragState;
    if (!state) return;
    const placeholder = state.placeholder;
    const x = e.clientX; const y = e.clientY;
    // find the closest chart-card under pointer
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    // find the charts-row that the pointer is over (support multiple rows)
    const row = el.closest ? el.closest('.charts-row') : null;
    const targetCard = el.closest ? el.closest('.chart-card') : null;
    if (targetCard && targetCard !== state.dragged && targetCard.parentNode) {
      const rect = targetCard.getBoundingClientRect();
      const insertBefore = (x < rect.left + rect.width/2);
      // size placeholder to match the target card for better visual placement
      placeholder.style.width = `${rect.width}px`;
      placeholder.style.height = `${rect.height}px`;
      if (insertBefore) targetCard.parentNode.insertBefore(placeholder, targetCard);
      else targetCard.parentNode.insertBefore(placeholder, targetCard.nextSibling);
      return;
    }
    if (row) {
      const cards = Array.from(row.querySelectorAll('.chart-card'));
      if (cards.length === 0) { row.appendChild(placeholder); return; }
      const last = cards[cards.length-1];
      const lastRect = last.getBoundingClientRect();
      // size placeholder to match last card
      placeholder.style.width = `${lastRect.width}px`;
      placeholder.style.height = `${lastRect.height}px`;
      // if pointer is to the right of the last card center, append after last
      if (x > lastRect.left + lastRect.width/2) last.parentNode.insertBefore(placeholder, last.nextSibling);
      else last.parentNode.insertBefore(placeholder, last);
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const state = window.__dragState;
    if (!state) return;
    const { dragged, placeholder } = state;
    if (placeholder && placeholder.parentNode) placeholder.parentNode.replaceChild(dragged, placeholder);
    if (dragged) {
      dragged.classList.remove('dragging');
      dragged.querySelectorAll('canvas').forEach(c => c.style.pointerEvents = 'auto');
    }
    delete window.__dragState;
  });
}

  // --- Commit Count Card ---
  function renderCommitCountCard() {
      // update calendar commit count element instead
      const calCard = document.getElementById('calendarCommitCount') || document.getElementById('commitCountCard');
      if (!calCard) return;
      let totalCommits = 0;
      if (chartDataCache && chartDataCache.calendar) {
        totalCommits = Object.values(chartDataCache.calendar).reduce((a, b) => a + b, 0);
      }
      calCard.innerHTML = `<span style="background:rgba(20,40,30,0.7);border-radius:10px;padding:8px 12px;box-shadow:0 1px 8px #0a1a120a;color:#aaffcc;font-size:1rem;">Total commits this year: <b>${totalCommits}</b></span>`;
  }

function setChartType(which) {
  if (which === 'lang') {
    chartTypes.lang = document.getElementById('langChartType').value;
    renderLangChart();
  }
  if (which === 'fork') {
    chartTypes.fork = document.getElementById('forkChartType').value;
    renderForkChart();
  }
  if (which === 'star') {
    chartTypes.star = document.getElementById('starChartType').value;
    renderStarChart();
  }
}

function renderBigContributions(calendarData) {
  const summaryEl = document.getElementById('bigContribSummary');
  const calEl = document.getElementById('bigContribCalendar');
  if (!summaryEl || !calEl) return;
  // compute totals and longest streak approx
  const total = Object.values(calendarData).reduce((a,b)=>a+b,0);
  let dates = Object.keys(calendarData).sort();
  // longest streak (simple algorithm)
  let longest = 0, current = 0, prev = null;
  for (let d of dates) {
    if (calendarData[d] > 0) {
      if (prev) {
        let p = new Date(prev);
        p.setDate(p.getDate() + 1);
        if (p.toISOString().slice(0,10) === d) {
          current++;
        } else {
          current = 1;
        }
      } else {
        current = 1;
      }
      prev = d;
    } else {
      current = 0;
      prev = d;
    }
    if (current > longest) longest = current;
  }

  summaryEl.innerHTML = `
    <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;">
      <div style="flex:0 0 auto;"><strong style="font-size:1.1rem;color:#e6ffe6;">${total}</strong><div style="font-size:0.9rem;color:#b6ffb6;">commits this year</div></div>
      <div style="flex:0 0 auto;"><strong style="font-size:1.1rem;color:#e6ffe6;">${longest}</strong><div style="font-size:0.9rem;color:#b6ffb6;">longest streak (days)</div></div>
      <div style="flex:1 1 240px;color:#cffff0;">A quick glance at your contribution intensity. Hover squares to see commits per day.</div>
    </div>
  `;

  // render a compact month-row calendar similar to GitHub screenshot
  let year = parseInt(document.getElementById('calendarYear').value) || new Date().getFullYear();
  let months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let html = '<div style="display:flex;flex-direction:row;gap:8px;overflow:auto;padding:6px 0;">';
  for (let m=0;m<12;m++){
    let first = new Date(year,m,1);
    let last = new Date(year,m+1,0);
    let days = last.getDate();
    html += `<div style="min-width:48px;">
      <div style="color:#aaffcc;font-size:0.85rem;text-align:center;margin-bottom:6px;">${months[m]}</div>
      <div style="display:grid;grid-template-columns:repeat(7,12px);gap:4px;justify-content:center;">`;
    for (let d=1; d<=days; d++){
      let dateStr = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      let count = calendarData[dateStr] || 0;
      let level = 0;
      if (count > 0) level = 1;
      if (count > 2) level = 2;
      if (count > 5) level = 3;
      if (count > 10) level = 4;
      if (count > 20) level = 5;
      html += `<div title='${dateStr}: ${count}' class='contrib-cell' data-count='${level}' style='width:12px;height:12px;margin:0;'></div>`;
    }
    html += '</div></div>';
  }
  html += '</div>';
  calEl.innerHTML = html;
}

function renderContributionCalendar(calendarData) {
  const cal = document.getElementById('contribCalendar');
  const legend = document.getElementById('calendarLegend');
  if (!cal) return;
  let year = parseInt(document.getElementById('calendarYear').value) || new Date().getFullYear();
  // Build a GitHub-style weekly grid (columns = ISO weeks, rows = Sun-Sat)
  const total = Object.values(calendarData).reduce((a,b)=>a+b,0);
  const commitCountEl = document.getElementById('calendarCommitCount');
  if (commitCountEl) commitCountEl.textContent = `Total commits in ${year}: ${total}`;

  // collect counts for the year and compute quantiles for coloring
  const dailyCounts = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0,10);
    dailyCounts.push(calendarData[key] || 0);
  }
  const sorted = [...dailyCounts].sort((a,b) => a-b);
  function quantile(q){ const idx = Math.floor(q*sorted.length); return sorted[Math.min(idx, sorted.length-1)]; }
  const q1 = quantile(0.6), q2 = quantile(0.8), q3 = quantile(0.9), q4 = quantile(0.97);

  // build weeks: GitHub starts weeks on Sunday, columns span from first Sunday before Jan 1 to last Saturday after Dec 31
  const firstSunday = new Date(start);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay());
  const lastSaturday = new Date(end);
  lastSaturday.setDate(lastSaturday.getDate() + (6 - lastSaturday.getDay()));
  const weeks = [];
  for (let wStart = new Date(firstSunday); wStart <= lastSaturday; wStart.setDate(wStart.getDate() + 7)) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(wStart);
      d.setDate(d.getDate() + i);
      if (d < start || d >= end) {
        week.push(null);
      } else {
        const k = d.toISOString().slice(0,10);
        week.push({ date: k, count: calendarData[k] || 0 });
      }
    }
    weeks.push(week);
  }

  // render HTML: columns are weeks
  let html = '<div style="display:flex;justify-content:center;">';
  html += '<div class="calendar-grid">';
  for (let wk of weeks) {
    html += '<div class="calendar-week">';
    for (let cell of wk) {
      if (!cell) {
        html += `<div class='contrib-cell' data-count='0' style='opacity:0.08;'></div>`;
        continue;
      }
      const c = cell.count;
      let level = 0;
      if (c > 0) level = 1;
      if (c > q1) level = 2;
      if (c > q2) level = 3;
      if (c > q3) level = 4;
      if (c > q4) level = 5;
      html += `<div class='contrib-cell' data-count='${level}' title='${cell.date}: ${c} commits'></div>`;
    }
    html += '</div>';
  }
  html += '</div></div>';
  cal.innerHTML = html;

  if (legend) {
    legend.innerHTML = `<span style='margin-right:8px;'>Less</span>` +
      [0,1,2,3,4,5].map(l => `<span class='contrib-cell' data-count='${l}' style='display:inline-block;vertical-align:middle;'></span>`).join('') +
      `<span style='margin-left:8px;'>More</span>`;
  }
}

function setAllChartsType() {
  const val = document.getElementById('allChartType').value;
  chartTypes.lang = val;
  chartTypes.fork = val;
  chartTypes.star = val;
  renderCharts();
}


async function fetchData() {
  let url = document.getElementById("githubLink").value || '';
  let username = url.includes("github.com/") ? url.split("github.com/")[1] : url;
  // sanitize username (strip trailing slashes and extra path)
  username = (username || '').replace(/\/+$/,'').split('/')[0];

  // hide chart cards until we have the repo list
  const section = document.getElementById('chartsSection');
  if (section) { section.style.display = 'block'; section.classList.add('charts-hidden'); }
  const summaryEl = document.getElementById('summary');
  if (summaryEl) summaryEl.innerText = `Loading data for ${username}...`;

  // Save token to session if requested
  trySaveSessionToken();

  // setup abort controller for this run so we can cancel long fetches
  if (window.__fetchController && window.__fetchController.abort) {
    try { window.__fetchController.abort(); } catch(e) {}
  }
  window.__fetchController = new AbortController();
  const abortSignal = window.__fetchController.signal;

  // show cancel button and disable analyze + show spinner
  const cancelBtn = document.getElementById('cancelFetchBtn');
  if (cancelBtn) { cancelBtn.style.display = 'inline-block'; cancelBtn.onclick = () => { window.__fetchController.abort(); const p = document.getElementById('fetchProgress'); if (p) p.textContent = 'Fetch cancelled.'; cancelBtn.style.display = 'none'; } }
  const analyzeBtn = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('analyzeSpinner');
  if (analyzeBtn) analyzeBtn.disabled = true;
  if (spinner) spinner.style.display = 'inline-block';

  // Calendar year selector
  let yearSel = document.getElementById('calendarYear');
  let nowYear = new Date().getFullYear();
  if (yearSel && yearSel.options.length === 0) {
    for (let y = nowYear; y >= nowYear - 4; y--) {
      let opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSel.appendChild(opt);
    }
    yearSel.value = nowYear;
  }
  let year = yearSel ? parseInt(yearSel.value) : nowYear;

  let repos = [];
  try {
    const headers = getAuthHeaders();
    const progressEl = document.getElementById('fetchProgress');
    if (progressEl) progressEl.textContent = 'Fetching repositories...';
    repos = await fetchAllRepos(username, headers, (count) => { if (progressEl) progressEl.textContent = `Fetched ${count} repos...`; }, abortSignal);
    // reveal cards now that repo list is available
    if (section) section.classList.remove('charts-hidden');
    // ensure calendar card is last by default unless user moved it
    const calCard = document.getElementById('calendarCard');
    if (calCard && calCard.parentNode) { const p = calCard.parentNode; if (p.lastElementChild !== calCard) p.appendChild(calCard); }
    if (abortSignal && abortSignal.aborted) throw new Error('aborted');
  } catch (err) {
    console.error('fetch repos error', err);
    if (summaryEl) summaryEl.innerText = `Error fetching repos for ${username}: ${err.message || err}`;
    if (window.__fetchController) { const cb = document.getElementById('cancelFetchBtn'); if (cb) cb.style.display = 'none'; }
    if (analyzeBtn) analyzeBtn.disabled = false; if (spinner) spinner.style.display = 'none';
    return;
  }

  if (repos.message === "Not Found") { alert("User not found!"); if (analyzeBtn) analyzeBtn.disabled = false; if (spinner) spinner.style.display = 'none'; return; }

  if (summaryEl) summaryEl.innerText = `${username} has ${repos.length} public repos`;

  // Languages
  let langCount = {};
  for (let repo of repos) if (repo.language) langCount[repo.language] = (langCount[repo.language] || 0) + 1;
  let sortedLangs = Object.entries(langCount).sort((a,b) => b[1]-a[1]);
  let langLabels = sortedLangs.map(x => x[0]);
  let langData = sortedLangs.map(x => x[1]);
  let langColors = langLabels.map((_,i) => `hsl(${120 + i*30}, 70%, 45%)`);

  // Top by forks
  let topForks = [...repos].sort((a,b) => b.forks_count - a.forks_count).slice(0,5);
  let forkLabels = topForks.map(r => r.name);
  let forkData = topForks.map(r => r.forks_count);
  let forkColors = forkLabels.map((_,i) => `hsl(${180 + i*40}, 80%, 40%)`);

  // Top by stars
  let topStars = [...repos].sort((a,b) => b.stargazers_count - a.stargazers_count).slice(0,5);
  let starLabels = topStars.map(r => r.name);
  let starData = topStars.map(r => r.stargazers_count);
  let starColors = starLabels.map((_,i) => `hsl(${90 + i*40}, 90%, 55%)`);

  // --- Commit activity ---
  let allCommits = [];
  let calendar = {};
  let dayOfWeek = Array(7).fill(0);
  let hourOfDay = Array(24).fill(0);
  let since = new Date(year, 0, 1).toISOString();
  let until = new Date(year + 1, 0, 1).toISOString();

  // Fetch commits for each repo (paginated). Use a concurrency cap to avoid flooding.
  const headersForCommits = getAuthHeaders();
  const maxConcurrency = 4;
  const progressEl = document.getElementById('fetchProgress');
  let completedRepos = 0;
  const queue = repos.slice();
  let aborted = false;
  async function worker() {
    while (queue.length) {
      if (abortSignal && abortSignal.aborted) { aborted = true; break; }
      const repo = queue.shift();
      try {
        const commits = await fetchAllCommitsForRepo(username, repo.name, since, until, headersForCommits, abortSignal);
        if (Array.isArray(commits)) {
          for (let c of commits) {
            if (c.commit && c.commit.author && c.commit.author.date) {
              let d = new Date(c.commit.author.date);
              allCommits.push(d);
              let dstr = d.toISOString().slice(0, 10);
              calendar[dstr] = (calendar[dstr] || 0) + 1;
              dayOfWeek[d.getDay()]++;
              hourOfDay[d.getHours()]++;
            }
          }
        }
      } catch (err) {
        if (err && err.message === 'aborted') { aborted = true; break; }
        console.error('repo commits fetch error', repo.name, err);
      }
      completedRepos++;
      if (progressEl) progressEl.textContent = `Processed ${completedRepos}/${repos.length} repos`;
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(maxConcurrency, repos.length); i++) workers.push(worker());
  await Promise.all(workers);
  if (window.__fetchController) { const cb = document.getElementById('cancelFetchBtn'); if (cb) cb.style.display = 'none'; }
  if (progressEl) progressEl.textContent = aborted ? `Fetch cancelled after ${completedRepos}/${repos.length} repos` : `Completed commit fetch for ${repos.length} repos`;

  // Most active days
  let days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let activeDays = { labels: days, data: dayOfWeek };
  // Top 5 active hours (12h AM/PM)
  let hourEntries = hourOfDay.map((v, i) => [i, v]);
  hourEntries.sort((a, b) => b[1] - a[1]);
  let top5Hours = hourEntries.slice(0, 5);
  function to12h(h) { let ampm = h < 12 ? 'AM' : 'PM'; let hour = h % 12; if (hour === 0) hour = 12; return `${hour} ${ampm}`; }
  let activeTimes = { labels: top5Hours.map(([h]) => `${to12h(h)}`), data: top5Hours.map(([_, v]) => v) };

  chartDataCache = {
    lang: { labels: langLabels, data: langData, colors: langColors },
    fork: { labels: forkLabels, data: forkData, colors: forkColors },
    star: { labels: starLabels, data: starData, colors: starColors },
    activeDays,
    activeTimes,
    calendar
  };

  // re-enable analyze button and hide spinner
  if (analyzeBtn) analyzeBtn.disabled = false;
  if (spinner) spinner.style.display = 'none';

  renderCharts();
}

window.fetchData = fetchData;

// Init: wire up clear token button and prefill session token if present
document.addEventListener('DOMContentLoaded', () => {
  const clearBtn = document.getElementById('clearTokenBtn');
  if (clearBtn) clearBtn.addEventListener('click', (e) => { e.preventDefault(); clearSessionToken(); const p = document.getElementById('fetchProgress'); if (p) p.textContent = 'Token cleared.'; });
  const cancelBtn = document.getElementById('cancelFetchBtn'); if (cancelBtn) cancelBtn.style.display = 'none';
  const sessionVal = sessionStorage.getItem('gh_token');
  if (sessionVal) {
    const input = document.getElementById('githubToken');
    const remember = document.getElementById('rememberToken');
    if (input) input.value = sessionVal;
    if (remember) remember.checked = true;
  }
  // modal wiring
  const remember = document.getElementById('rememberToken');
  const modal = document.getElementById('tokenModal');
  const modalConfirm = document.getElementById('modalConfirm');
  const modalCancel = document.getElementById('modalCancel');
  if (remember && modal) {
    remember.addEventListener('change', (e) => {
      if (remember.checked) {
        modal.style.display = 'flex';
      }
    });
  }
  if (modalConfirm) modalConfirm.addEventListener('click', () => { modal.style.display = 'none'; trySaveSessionToken(); const p = document.getElementById('fetchProgress'); if (p) p.textContent = 'Token saved for session.'; });
  if (modalCancel) modalCancel.addEventListener('click', () => { modal.style.display = 'none'; const remember = document.getElementById('rememberToken'); if (remember) remember.checked = false; });
  // ensure cancel hides if token cleared
  if (clearBtn) clearBtn.addEventListener('click', () => { if (cancelBtn) cancelBtn.style.display = 'none'; });
});
