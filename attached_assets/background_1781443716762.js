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

// Handle messages from content scripts and auth page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

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
});
