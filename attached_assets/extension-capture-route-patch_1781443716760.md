# Extension Capture Route Patch

Add this route to server/routes.ts inside registerRoutes().
Place it near the other public endpoints (around line 2460, near the waitlist/contact routes).
No auth required — this is anonymous public data about websites, not users.

## Add this import at the top of routes.ts (with other imports):

```typescript
// Already imported: import { writeToDataset } from './audit-dataset';
// No new imports needed — uses existing Firestore connection
```

## Add this route inside registerRoutes():

```typescript
// POST /api/extension/capture — Anonymous AEO signal capture from browser extension
// Receives public website data (never user data) from extension users
// Builds the Citation Rocket AEO dataset passively
app.post('/api/extension/capture', async (req, res) => {
  try {
    const { domain, signals, source } = req.body;

    // Validate — must have a domain
    if (!domain || typeof domain !== 'string' || domain.length > 200) {
      return res.status(400).json({ error: 'Invalid domain' });
    }

    // Sanitize domain
    const cleanDomain = domain.toLowerCase().replace(/[^a-z0-9.-]/g, '').substring(0, 100);
    if (!cleanDomain) return res.status(400).json({ error: 'Invalid domain' });

    // Store to extension_signals Firestore collection
    // Separate from audit_dataset (which has full audits)
    // This stores lightweight passive signals from extension users
    const { getFirestore, doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { initializeApp, getApp } = await import('firebase/app');

    let app;
    try { app = getApp('extension-capture-app'); }
    catch {
      app = initializeApp({
        apiKey: process.env.VITE_FIREBASE_API_KEY,
        projectId: process.env.VITE_FIREBASE_PROJECT_ID,
      }, 'extension-capture-app');
    }

    const db = getFirestore(app);
    const recordId = `${cleanDomain}_${Date.now()}`;

    await setDoc(doc(db, 'extension_signals', recordId), {
      domain: cleanDomain,
      signals: signals || {},
      source: source || 'extension',
      capturedAt: new Date().toISOString(),
      // Never store: IP addresses, user IDs, page URLs, query text
    });

    // Fire-and-forget — don't wait for this
    console.log(`📊 Extension capture: ${cleanDomain} (${source || 'extension'})`);

    return res.json({ success: true });

  } catch (err: any) {
    // Silent fail to client — never let data capture break the extension
    console.warn('⚠️ Extension capture failed (non-blocking):', err?.message);
    return res.json({ success: true }); // always return success to extension
  }
});
```

## Also add the extension-auth page route (for login flow):

```typescript
// GET /extension-auth — Page that reads Firebase session and passes token to extension
// User visits this page after clicking "Sign In" in the extension
app.get('/extension-auth', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Citation Rocket — Extension Sign In</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #0f0f1a; color: #e2e8f0;
               display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
        .card { background: #12122a; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
                padding: 40px; text-align: center; max-width: 360px; }
        h2 { color: #6366f1; margin-bottom: 8px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .status { margin-top: 20px; font-size: 13px; color: #64748b; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🚀 Citation Rocket</h2>
        <p>Connecting your account to the browser extension...</p>
        <div class="status" id="status">Checking your session...</div>
      </div>
      <script>
        // Read Firebase auth state and pass token to extension
        async function connectExtension() {
          const status = document.getElementById('status');
          try {
            // Firebase auth state will be available if user is logged into citationrocket.com
            // The extension's background script receives the token
            const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js');
            const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js');

            const app = initializeApp({
              apiKey: '${process.env.VITE_FIREBASE_API_KEY}',
              projectId: '${process.env.VITE_FIREBASE_PROJECT_ID}',
              authDomain: '${process.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com',
            });

            const auth = getAuth(app);
            onAuthStateChanged(auth, async (user) => {
              if (user) {
                const token = await user.getIdToken();
                // Send token to extension background script
                if (chrome?.runtime?.sendMessage) {
                  await chrome.runtime.sendMessage({
                    action: 'storeAuthToken',
                    token,
                    email: user.email,
                    plan: 'free', // will be fetched from Firestore on next extension open
                  });
                  status.textContent = '✅ Connected! You can close this tab.';
                } else {
                  status.textContent = 'Extension not found. Make sure Citation Rocket extension is installed.';
                }
              } else {
                status.innerHTML = 'Not signed in. <a href="/login" style="color:#6366f1;">Sign in to Citation Rocket first</a>, then return here.';
              }
            });
          } catch (err) {
            status.textContent = 'Error: ' + err.message;
          }
        }
        connectExtension();
      </script>
    </body>
    </html>
  `);
});
```
