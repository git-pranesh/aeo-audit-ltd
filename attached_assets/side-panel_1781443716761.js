/**
 * Citation Rocket — Side Panel Logic
 * Handles auth state, scan trigger, result rendering.
 */

const CR_APP = 'https://citationrocket.com';

// ─── State ────────────────────────────────────────────────────────────────────

let currentTab = null;
let currentAudit = null;
let authState = { signedIn: false, email: null, plan: 'free' };

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadAuthState();
  await getCurrentTab();
  renderAuthBtn();
  renderDomain();
  bindEvents();
});

async function loadAuthState() {
  return new Promise(resolve => {
    chrome.storage.local.get(['authToken', 'userEmail', 'userPlan'], (data) => {
      if (data.authToken) {
        authState = {
          signedIn: true,
          email: data.userEmail || '',
          plan: data.userPlan || 'free',
        };
      }
      resolve();
    });
  });
}

async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab || null;
  } catch {
    currentTab = null;
  }
}

function renderAuthBtn() {
  const btn = document.getElementById('auth-btn');
  if (authState.signedIn) {
    btn.textContent = authState.email ? authState.email.split('@')[0] : 'Account';
    btn.className = 'auth-pill signed-in';
  } else {
    btn.textContent = 'Sign In Free';
    btn.className = 'auth-pill signed-out';
  }
}

function renderDomain() {
  const el = document.getElementById('domain-text');
  if (currentTab?.url) {
    try {
      el.textContent = new URL(currentTab.url).hostname.replace('www.', '');
    } catch {
      el.textContent = 'Unknown page';
    }
  } else {
    el.textContent = 'No page loaded';
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

function bindEvents() {
  document.getElementById('scan-btn').addEventListener('click', runScan);

  document.getElementById('auth-btn').addEventListener('click', () => {
    if (authState.signedIn) {
      // Show sign-out option
      if (confirm(`Sign out of ${authState.email}?`)) {
        chrome.storage.local.remove(['authToken', 'userEmail', 'userPlan'], () => {
          authState = { signedIn: false, email: null, plan: 'free' };
          renderAuthBtn();
        });
      }
    } else {
      chrome.tabs.create({ url: `${CR_APP}/extension-auth` });
    }
  });

  // Listen for auth token stored by background script
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.authToken) {
      loadAuthState().then(() => {
        renderAuthBtn();
      });
    }
  });
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

async function runScan() {
  if (!currentTab?.id) {
    showError('No active tab found. Try refreshing.');
    return;
  }

  const url = currentTab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('edge://')) {
    showError('Cannot scan browser pages. Navigate to a website first.');
    return;
  }

  showState('loading');
  document.getElementById('scan-btn').disabled = true;

  try {
    // Send message to content script in current tab
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'runAudit',
    });

    if (!response?.audit) {
      throw new Error(response?.error || 'No audit data returned');
    }

    currentAudit = response.audit;
    renderResults(currentAudit);
    showState('results');

  } catch (err) {
    // Content script may not be injected yet (e.g. extension just installed)
    // Try injecting it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content.js'],
      });
      // Retry
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'runAudit' });
      if (!response?.audit) throw new Error('Retry failed');
      currentAudit = response.audit;
      renderResults(currentAudit);
      showState('results');
    } catch {
      showError('Could not analyze this page. Try refreshing the page and scanning again.');
    }
  } finally {
    document.getElementById('scan-btn').disabled = false;
  }
}

// ─── Render Results ───────────────────────────────────────────────────────────

function renderResults(audit) {
  const { score, grade, modules, bonus, criticalIssues, domain, pageUrl } = audit;

  // Score color
  const color = score >= 65 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#f87171';

  // Score ring
  const circumference = 213.6;
  const offset = circumference - (score / 100) * circumference;
  const ring = document.getElementById('score-ring-fill');
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = color;

  document.getElementById('score-num').textContent = score;
  document.getElementById('score-num').style.color = color;

  const gradeEl = document.getElementById('score-grade');
  gradeEl.textContent = grade;
  gradeEl.style.color = color;

  // Critical banner
  renderCriticalBanner(criticalIssues);

  // Bonus signals
  renderBonusGrid(bonus);

  // Modules
  renderModules(modules);

  // CTA
  const fullAuditUrl = `${CR_APP}/?url=${encodeURIComponent(pageUrl || 'https://' + domain)}`;
  document.getElementById('cta-full-audit').href = fullAuditUrl;

  // Update sign-in CTA based on auth state
  const signInCta = document.getElementById('cta-signin');
  if (authState.signedIn) {
    signInCta.textContent = `View full E-E-A-T analysis for ${domain} →`;
    signInCta.href = fullAuditUrl;
  }
}

function renderCriticalBanner(criticalIssues) {
  const banner = document.getElementById('critical-banner');
  const itemsEl = document.getElementById('critical-items');
  const titleEl = document.getElementById('critical-title');

  if (!criticalIssues || criticalIssues.length === 0) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');

  // Check for bot-blocking (most dramatic)
  const botIssue = criticalIssues.find(i => i.type === 'bot-blocking');
  if (botIssue) {
    titleEl.textContent = '🚫 ChatGPT Cannot Read This Site';
    titleEl.style.color = '#ef4444';
    banner.style.background = 'rgba(239,68,68,0.15)';
    banner.style.borderColor = 'rgba(239,68,68,0.4)';
    itemsEl.innerHTML = `
      <div class="critical-item">${botIssue.text}</div>
      <div style="font-size:10px;color:#f87171;margin-top:5px;">
        Fix: Add "Allow: /" rules in your robots.txt for these bots.
        <a href="https://citationrocket.com/docs/robots-fix" target="_blank"
           style="color:#818cf8;text-decoration:none;margin-left:4px;">
          See fix →
        </a>
      </div>
    `;
  } else {
    titleEl.textContent = `⚠️ ${criticalIssues.length} Critical Issue${criticalIssues.length > 1 ? 's' : ''}`;
    itemsEl.innerHTML = criticalIssues.map(i =>
      `<div class="critical-item">• ${i.text}</div>`
    ).join('');
  }
}

function renderBonusGrid(bonus) {
  const grid = document.getElementById('bonus-grid');
  const { wikidataResult, g2Result } = bonus;

  grid.innerHTML = `
    <div class="bonus-card">
      <div class="bonus-icon">${wikidataResult.found ? '✅' : '❌'}</div>
      <div class="bonus-name">Wikidata Entity</div>
      <div class="bonus-value ${wikidataResult.found ? 'green' : 'red'}">
        ${wikidataResult.found ? wikidataResult.qNumber || 'Found' : 'Not found'}
      </div>
    </div>
    <div class="bonus-card">
      <div class="bonus-icon">${g2Result.found ? '✅' : '❌'}</div>
      <div class="bonus-name">G2 Profile</div>
      <div class="bonus-value ${g2Result.found ? 'green' : 'red'}">
        ${g2Result.found ? 'Profile found' : 'No profile'}
      </div>
    </div>
  `;
}

function renderModules(modules) {
  const container = document.getElementById('modules-container');

  const moduleList = [
    { key: 'botScore',       emoji: '🤖', name: 'AI Bot Access' },
    { key: 'answerScore',    emoji: '💡', name: 'Answer Capsule' },
    { key: 'schemaScore',    emoji: '🏗️',  name: 'Schema' },
    { key: 'freshnessScore', emoji: '⏱️',  name: 'Freshness' },
    { key: 'fanOutScore',    emoji: '📐', name: 'Fan-Out Coverage' },
  ];

  container.innerHTML = moduleList.map(({ key, emoji, name }) => {
    const mod = modules[key];
    if (!mod) return '';

    const pct = mod.score / mod.max;
    const color = pct >= 0.65 ? '#4ade80' : pct >= 0.4 ? '#fbbf24' : '#f87171';
    const isCritical = key === 'botScore' && mod.citationBotsBlocked?.length > 0;

    const issuesHtml = mod.issues?.length > 0
      ? mod.issues.map(i => `<div class="module-issue">${i}</div>`).join('')
      : `<div class="module-pass">✓ No issues detected</div>`;

    return `
      <div class="module-card ${isCritical ? 'critical-card' : ''}">
        <div class="module-header">
          <div class="module-name">${emoji} ${name}</div>
          <div class="module-score-badge" style="color:${color}">
            ${mod.score}<span style="font-size:10px;color:#475569;font-weight:400">/${mod.max}</span>
          </div>
        </div>
        <div class="module-bar-track">
          <div class="module-bar-fill"
               style="width:${Math.round(pct*100)}%;background:${color}"></div>
        </div>
        <div class="module-issues">${issuesHtml}</div>
      </div>
    `;
  }).join('');
}

// ─── State management ─────────────────────────────────────────────────────────

function showState(state) {
  ['idle', 'loading', 'error', 'results'].forEach(s => {
    document.getElementById(`state-${s}`).style.display = s === state ? 'block' : 'none';
  });
}

function showError(msg) {
  document.getElementById('error-text').textContent = msg;
  showState('error');
}
