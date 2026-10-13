/**
 * Citation Rocket — Side Panel Logic
 * Handles auth state, scan trigger, result rendering.
 */

const CR_APP = 'https://app.citationrocket.com';

// ─── State ────────────────────────────────────────────────────────────────────

let currentTab = null;
let currentAudit = null;
let authState = { signedIn: false, email: null, plan: 'free' };

// Full-analysis request de-dup / race guards (see fetchSignedInData).
let signedInInflightKey = null;
let signedInRenderedKey = null;
let signedInSeq = 0;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadAuthState();
  await getCurrentTab();
  renderAuthBtn();
  renderDomain();
  bindEvents();
  // Restore audit if we have one for current domain
  if (currentAudit) {
    renderResults(currentAudit);
    showState('results');
  }
  // If already signed in and have an audit, fetch full data
  if (authState.signedIn && authState.authToken && currentAudit) {
    fetchSignedInData();
  }
});

async function loadAuthState() {
  return new Promise(resolve => {
    chrome.storage.local.get(
      ['authToken', 'userEmail', 'userPlan'],
      (data) => {
        if (data.authToken) {
          authState = {
            signedIn: true,
            email: data.userEmail || '',
            plan: data.userPlan || 'free',
            authToken: data.authToken,
          };
        }
        resolve(undefined);
      });
  });
}

async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab || null;
    // Restore cached audit for this domain if it exists
    if (currentTab?.url) {
      try {
        const domain = new URL(currentTab.url).hostname.replace('www.', '');
        const cached = await chrome.storage.local.get(`audit_${domain}`);
        if (cached[`audit_${domain}`]) {
          currentAudit = cached[`audit_${domain}`];
        }
      } catch {}
    }
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

async function fetchSignedInData() {
  if (!authState.signedIn || !authState.authToken || !currentAudit) return;

  const lockedSection = document.querySelector('.locked-section');
  if (!lockedSection) return;

  // De-dupe concurrent/identical requests. This function fires both from the
  // result render (renderResults) and on panel open, so two near-simultaneous
  // calls could both resolve — and a slower one whose Wikidata lookup hit a
  // transient timeout (returning "not found") would overwrite the correct
  // result ~2s later (the "worked then vanished" flicker). Rule: at most one
  // request per page, skip if already shown, and only the latest may render.
  const reqKey = currentAudit.pageUrl || currentAudit.domain || '';
  if (signedInInflightKey === reqKey || signedInRenderedKey === reqKey) return;
  signedInInflightKey = reqKey;
  const seq = ++signedInSeq;
  const isStale = () => seq !== signedInSeq;

  lockedSection.innerHTML = `
    <div class="locked-header">
      <div class="locked-title" style="color:#818cf8;">
        Loading your full analysis...
      </div>
      <div style="display:flex;align-items:center;gap:8px;
                  padding:12px 0 4px;">
        <div style="width:20px;height:20px;border:2px solid 
                    rgba(99,102,241,0.2);border-top-color:#6366f1;
                    border-radius:50%;animation:spin 0.8s linear infinite;">
        </div>
        <span style="font-size:12px;color:#64748b;">
          Running E-E-A-T, Knowledge Graph and Reddit checks...
        </span>
      </div>
    </div>
  `;

  try {
    const response = await fetch(`${CR_APP}/api/extension/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authState.authToken}`,
      },
      body: JSON.stringify({
        url: currentAudit.pageUrl,
        html: currentAudit._html || '',
        text: currentAudit._text || '',
        domain: currentAudit.domain,
        wikidataQid: currentAudit._wikidataQid || null,
        plan: authState.plan || 'free',
      }),
    });
    if (isStale()) return;

    if (response.status === 401) {
      // Token expired — clear it and show re-auth prompt
      chrome.storage.local.remove(['authToken', 'userEmail', 'userPlan']);
      authState = { signedIn: false, email: null, plan: 'free', authToken: null };
      renderAuthBtn();
      signedInRenderedKey = null;

      const lockedSection = document.querySelector('.locked-section');
      if (lockedSection) {
        lockedSection.innerHTML = `
          <div class="locked-header">
            <div class="locked-title" style="color:#fbbf24;">
              ⚠️ Session expired
            </div>
            <div class="locked-subtitle">
              Your session has expired. Sign in again to see 
              E-E-A-T, Knowledge Graph and Reddit analysis.
            </div>
            <div style="padding:12px 0 4px;">
              <button onclick="document.getElementById('auth-btn').click()"
                style="background:#6366f1;color:#fff;border:none;
                       padding:8px 16px;border-radius:6px;font-size:12px;
                       font-weight:700;cursor:pointer;">
                Sign In Again
              </button>
            </div>
          </div>
        `;
      }
      return;
    }

    if (!response.ok) {
      throw new Error('Server returned ' + response.status);
    }

    const data = await response.json();
    if (isStale()) return;
    if (data.success && data.blueprint) {
      renderSignedInResults(data.blueprint, lockedSection);
      signedInRenderedKey = reqKey;
    } else {
      throw new Error('No blueprint data in response');
    }

  } catch (err) {
    if (!isStale()) {
      lockedSection.innerHTML = `
        <div class="locked-header">
          <div class="locked-title" style="color:#f87171;">
            ⚠️ Could not load full analysis
          </div>
          <div class="locked-subtitle">${err.message}</div>
        </div>
      `;
    }
  } finally {
    if (signedInInflightKey === reqKey) signedInInflightKey = null;
  }
}

function renderSignedInResults(blueprint, lockedSection) {
  const eeat = blueprint.eeat;
  const offsite = blueprint.offsite;

  const scoreColor = (score, max) => {
    const pct = score / max;
    return pct >= 0.65 ? '#4ade80' : pct >= 0.4 ? '#fbbf24' : '#f87171';
  };

  lockedSection.innerHTML = `
    <div class="locked-header" style="background:rgba(34,197,94,0.08);
         border-bottom:1px solid rgba(34,197,94,0.12);">
      <div class="locked-title" style="color:#4ade80;">
        ✅ Full Analysis — ${authState.email}
      </div>
    </div>

    <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:700;color:#cbd5e1;">👤 E-E-A-T Index</div>
        <div style="font-size:14px;font-weight:700;color:${scoreColor(eeat.eeAtScore, 35)};">
          ${eeat.eeAtScore}<span style="font-size:10px;color:#475569;font-weight:400">/35</span>
        </div>
      </div>
      <div style="width:100%;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-bottom:10px;">
        <div style="width:${Math.round(eeat.eeAtScore/35*100)}%;height:100%;background:${scoreColor(eeat.eeAtScore,35)};border-radius:2px;"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        ${[
          ['Experience', eeat.eeAtBreakdown?.experience || 0, 8],
          ['Expertise', eeat.eeAtBreakdown?.expertise || 0, 9],
          ['Authority', eeat.eeAtBreakdown?.authority || 0, 10],
          ['Trust', eeat.eeAtBreakdown?.trust || 0, 8],
        ].map(([label, score, max]) => `
          <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px;">
            <div style="font-size:10px;color:#64748b;">${label}</div>
            <div style="font-size:13px;font-weight:700;color:${scoreColor(score, max)};">${score}/${max}</div>
          </div>
        `).join('')}
      </div>
      ${!eeat.hasAuthorByline ? `<div style="margin-top:8px;font-size:11px;color:#f87171;">• No author byline detected — adds ~40% citation lift</div>` : ''}
      ${!eeat.knowledgeGraphEntityFound ? `<div style="font-size:11px;color:#f87171;">• Not in Google Knowledge Graph</div>` : `<div style="margin-top:8px;font-size:11px;color:#4ade80;">✓ Found in Google Knowledge Graph</div>`}
    </div>

    <div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:700;color:#cbd5e1;">🌐 Off-Site Authority</div>
        <div style="font-size:14px;font-weight:700;color:${scoreColor(offsite.offsiteScore, 30)};">
          ${offsite.offsiteScore}<span style="font-size:10px;color:#475569;font-weight:400">/30</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:5px;">
        <div style="font-size:11px;color:${offsite.wikidataQNumber ? '#4ade80' : '#f87171'};">
          ${offsite.wikidataQNumber ? '✓' : '✗'} Wikidata: ${offsite.wikidataQNumber || 'No entity found'}
        </div>
        <div style="font-size:11px;color:${offsite.wikipediaArticleExists ? '#4ade80' : '#f87171'};">
          ${offsite.wikipediaArticleExists ? '✓' : '✗'} Wikipedia article
        </div>
        <div style="font-size:11px;color:${currentAudit?.bonus?.redditResult?.found ? '#4ade80' : (offsite.redditBrandMentionCount > 0 ? '#4ade80' : '#f87171')};">
          ${(currentAudit?.bonus?.redditResult?.found || offsite.redditBrandMentionCount > 0) ? '✓' : '✗'}
          Reddit: ${currentAudit?.bonus?.redditResult?.mentionCount ?? offsite.redditBrandMentionCount} brand mentions
          ${currentAudit?.bonus?.redditResult?.topSubreddits?.length > 0 ? '· ' + currentAudit.bonus.redditResult.topSubreddits.join(', ') : ''}
        </div>
        ${(currentAudit?.bonus?.redditResult?.mentionCount ?? offsite.redditBrandMentionCount) === 0 ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">Brands with Reddit presence get 3.9x more AI citations</div>` : ''}
      </div>
    </div>

    ${blueprint.criticalGaps && blueprint.criticalGaps.length > 0 ? `
    <div style="padding:12px 14px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#475569;margin-bottom:8px;">Top Fixes</div>
      ${blueprint.criticalGaps.slice(0,3).map(gap => `
        <div style="margin-bottom:8px;padding:8px 10px;background:rgba(239,68,68,0.06);border-left:2px solid #ef4444;border-radius:4px;">
          <div style="font-size:11px;font-weight:600;color:#fca5a5;">${gap.signal}</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px;">${gap.fix} · +${gap.estimatedScoreGain} pts</div>
        </div>
      `).join('')}
      <a href="${CR_APP}/dashboard?url=${encodeURIComponent(currentAudit?.pageUrl || '')}"
         target="_blank"
         style="display:block;background:#6366f1;color:#fff;text-align:center;padding:9px;border-radius:8px;text-decoration:none;font-weight:700;font-size:12px;margin-top:10px;">
        Get Full Playbook + 100 Topics →
      </a>
    </div>` : ''}
  `;
}

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
      const extId = chrome.runtime.id;
      chrome.windows.getCurrent((win) => {
        chrome.storage.local.set({ preAuthWindowId: win.id }, () => {
          chrome.tabs.create({ url: `${CR_APP}/extension-auth?extId=${extId}` });
        });
      });
    }
  });

  // Listen for auth token stored by background script
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.authToken) {
      loadAuthState().then(() => {
        renderAuthBtn();
        // Load auth token for API calls
        chrome.storage.local.get(['authToken'], (data) => {
          authState.authToken = data.authToken;
          signedInRenderedKey = null;
          fetchSignedInData();
        });
      });
    }
  });

  // Update domain display and reset results when tab changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'tabChanged') {
      document.getElementById('domain-text').textContent =
        message.domain || 'Unknown';
      currentAudit = null;
      // Check for cached audit for new domain
      if (message.domain) {
        chrome.storage.local.get(`audit_${message.domain}`, (data) => {
          const cached = data[`audit_${message.domain}`];
          if (cached) {
            currentAudit = cached;
            renderResults(cached);
            showState('results');
          } else {
            showState('idle');
          }
        });
      } else {
        showState('idle');
      }
    }
  });
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

async function runScan() {
  // Always get the CURRENT active tab before scanning
  await getCurrentTab();
  renderDomain();

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
  signedInRenderedKey = null; // explicit scan → force a fresh full analysis

  try {
    // Send message to content script in current tab
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'runAudit',
    });

    if (!response?.audit) {
      throw new Error(response?.error || 'No audit data returned');
    }

    currentAudit = response.audit;
    chrome.storage.local.set({ [`audit_${response.audit.domain}`]: response.audit });
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
      chrome.storage.local.set({ [`audit_${response.audit.domain}`]: response.audit });
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
  renderBonusGrid(audit);

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

function renderBonusGrid(audit) {
  const grid = document.getElementById('bonus-grid');
  const reddit = audit.bonus?.redditResult;

  const redditIcon = reddit?.status === 'ok' && reddit?.found
    ? '✅' : reddit?.status === 'ok' && !reddit?.found
    ? '❌' : '⏳';

  const redditColor = reddit?.status === 'ok' && reddit?.found
    ? 'green' : reddit?.status === 'ok' && !reddit?.found
    ? 'red' : 'muted';

  const redditText = reddit?.status === 'ok' && reddit?.found
    ? `${reddit.mentionCount.toLocaleString()} mentions`
    : reddit?.status === 'ok' && !reddit?.found
    ? 'No mentions found'
    : 'Checking...';

  const subreddits = reddit?.topSubreddits?.length > 0
    ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">
         ${reddit.topSubreddits.join(' · ')}
       </div>`
    : '';

  grid.innerHTML = `
    <div class="bonus-card" style="grid-column:span 2;">
      <div style="display:flex;justify-content:space-between;
                  align-items:center;">
        <div>
          <div class="bonus-name">💬 Reddit Brand Presence</div>
          <div class="bonus-value ${redditColor}">${redditText}</div>
          ${subreddits}
        </div>
        <div class="bonus-icon">${redditIcon}</div>
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
  // If signed in, fetch server-side analysis immediately
  if (authState.signedIn && authState.authToken) {
    fetchSignedInData();
  }
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
