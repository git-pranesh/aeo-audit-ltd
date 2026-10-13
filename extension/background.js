/**
 * Background Service Worker
 * Opens the sidebar when toolbar icon is clicked.
 * Handles auth token storage from the extension-auth page.
 */

const CR_APP_URL = 'https://citationrocket.com';

// Open sidebar when toolbar icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.error('Failed to open side panel:', err);
  }
});

// Notify side panel when user switches tabs
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({
      action: 'tabChanged',
      url: tab.url || '',
      domain: tab.url ? new URL(tab.url).hostname.replace('www.', '') : '',
    }).catch(() => {});
  } catch {}
});

// Notify side panel when a tab finishes loading
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
      if (activeTab?.id === tabId) {
        chrome.runtime.sendMessage({
          action: 'tabChanged',
          url: tab.url || '',
          domain: tab.url ? new URL(tab.url).hostname.replace('www.', '') : '',
        }).catch(() => {});
      }
    });
  }
});

// Handle messages from content scripts and auth page
async function getRedditMentionsViaGoogle(brandName) {
  return new Promise(async (resolve) => {
    const query = `site:reddit.com "${brandName}"`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=en`;

    let tab;
    try {
      tab = await chrome.tabs.create({ url: searchUrl, active: false });
    } catch (err) {
      return resolve({ found: null, status: 'error', mentionCount: null, topSubreddits: [] });
    }

    const timeout = setTimeout(async () => {
      chrome.tabs.onUpdated.removeListener(listener);
      await chrome.tabs.remove(tab.id).catch(() => {});
      resolve({ found: null, status: 'timeout', mentionCount: null, topSubreddits: [] });
    }, 15000);

    const listener = async (tabId, changeInfo) => {
      if (tabId !== tab.id || changeInfo.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeout);

      await new Promise(r => setTimeout(r, 800));

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (
              document.querySelector('#captcha-form') ||
              document.querySelector('form[action*="sorry"]') ||
              document.title.toLowerCase().includes('unusual traffic') ||
              document.body.textContent.includes('unusual traffic')
            ) {
              return { blocked: true };
            }
            const statsEl = document.querySelector('#result-stats');
            const statsText = statsEl?.textContent || '';
            const countMatch = statsText.match(/([\d,]+)\s+result/);
            const totalResults = countMatch
              ? parseInt(countMatch[1].replace(/,/g, ''), 10)
              : 0;
            const subreddits = [...new Set(
              Array.from(document.querySelectorAll('a[href]'))
                .map(a => {
                  const m = a.href.match(/reddit\.com\/r\/([a-zA-Z0-9_]+)/);
                  return m ? 'r/' + m[1] : null;
                })
                .filter(s => s && s !== 'r/reddit.com' && s !== 'r/all')
            )].slice(0, 5);
            const titles = Array.from(document.querySelectorAll('h3'))
              .slice(0, 3)
              .map(h => h.textContent.trim())
              .filter(Boolean);
            return { totalResults, subreddits, titles, blocked: false };
          },
        });

        await chrome.tabs.remove(tab.id).catch(() => {});
        const data = results?.[0]?.result;

        if (!data || data.blocked) {
          resolve({ found: null, status: 'blocked', mentionCount: null, topSubreddits: [] });
        } else {
          resolve({
            found: data.totalResults > 0,
            mentionCount: data.totalResults,
            topSubreddits: data.subreddits,
            titles: data.titles,
            status: 'ok',
          });
        }
      } catch (err) {
        await chrome.tabs.remove(tab.id).catch(() => {});
        resolve({ found: null, status: 'error', mentionCount: null, topSubreddits: [] });
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // Fetch robots.txt / llms.txt for a domain. Runs in the service worker,
  // which has <all_urls> host_permissions and is exempt from page-origin CORS.
  if (message.action === 'fetchRobots') {
    (async () => {
      const domain = message.domain;
      let robotsTxt = '';
      let llmsTxtExists = false;
      try {
        const [robotsRes, llmsRes] = await Promise.allSettled([
          fetch(`https://${domain}/robots.txt`, { signal: AbortSignal.timeout(6000) }),
          fetch(`https://${domain}/llms.txt`, { method: 'HEAD', signal: AbortSignal.timeout(5000) }),
        ]);
        if (robotsRes.status === 'fulfilled' && robotsRes.value.ok) {
          robotsTxt = await robotsRes.value.text();
        }
        llmsTxtExists = llmsRes.status === 'fulfilled' && llmsRes.value.ok;
      } catch {}
      sendResponse({ ok: true, robotsTxt, llmsTxtExists });
    })();
    return true; // async
  }

  // Auth token received from citationrocket.com/extension-auth page
  if (message.action === 'storeAuthToken') {
    chrome.storage.local.set({
      authToken: message.token,
      userEmail: message.email,
      userPlan: message.plan || 'free',
    }, () => {
      console.log('CR Extension: auth token stored for', message.email);
      sendResponse({ success: true });
    });
    return true; // async
  }

  // Sign out
  if (message.action === 'clearAuthToken') {
    chrome.storage.local.remove(['authToken', 'userEmail', 'userPlan'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Relay audit result from content script to side panel
  if (message.action === 'auditComplete') {
    // Broadcast to any open side panel ports
    chrome.runtime.sendMessage(message).catch(() => {
      // Side panel may not be open — that's fine
    });
    sendResponse({ received: true });
    return true;
  }

  // Reddit presence check via Google search (background can open tabs, content scripts cannot)
  if (message.action === 'checkRedditMentions') {
    getRedditMentionsViaGoogle(message.brandName)
      .then(result => sendResponse({ result }))
      .catch(() => sendResponse({
        result: { found: null, status: 'error', mentionCount: null, topSubreddits: [] }
      }));
    return true; // keep async channel open
  }
});

// Handle messages from app.citationrocket.com (external web page)
// onExternalMessage is required for messages sent via
// chrome.runtime.sendMessage(extensionId, ...) from web pages
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  // Verify sender is our app (security check)
  const allowedOrigins = [
    'https://app.citationrocket.com',
    'https://citationrocket.com',
    'https://be4e9385-33eb-45eb-bfc7-7d9a4b7842d2-00-12fqwfmhs9ymw.pike.replit.dev',
  ];

  if (!allowedOrigins.includes(sender.origin || '')) {
    console.warn('CR Extension: rejected message from', sender.origin);
    sendResponse({ success: false, error: 'Unauthorized origin' });
    return true;
  }

  if (message.action === 'storeAuthToken') {
    chrome.storage.local.set({
      authToken: message.token,
      userEmail: message.email,
      userPlan: message.plan || 'free',
    }, () => {
      console.log('CR Extension: auth token stored via external message for', message.email);
      sendResponse({ success: true });
      // Return user to original window and close auth tab
      chrome.storage.local.get(['preAuthWindowId'], (data) => {
        if (data.preAuthWindowId) {
          chrome.windows.update(data.preAuthWindowId, { focused: true });
          chrome.storage.local.remove('preAuthWindowId');
        }
        if (sender.tab?.id) {
          setTimeout(() => {
            chrome.tabs.remove(sender.tab.id);
          }, 1500);
        }
      });
    });
    return true; // keep channel open for async response
  }

  sendResponse({ success: false, error: 'Unknown action' });
  return true;
});
