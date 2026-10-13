import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import LoginModal from '@/components/auth/login-modal';
import SignupModal from '@/components/auth/signup-modal';

export default function ExtensionAuth() {
  const [status, setStatus] = useState<
    'checking' | 'not-logged-in' | 'connecting' | 'success' | 'error'
  >('checking');
  const [message, setMessage] = useState('Checking your session...');
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    const auth = getAuth();
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setStatus('not-logged-in');
        setMessage('Sign in to connect your Citation Rocket account to the extension.');
        return;
      }
      setStatus('connecting');
      setMessage('Signed in as ' + user.email + '. Connecting extension...');
      try {
        const token = await user.getIdToken();
        const w = window as any;
        if (w.chrome?.runtime?.sendMessage) {
          const params = new URLSearchParams(window.location.search);
          const extId = params.get('extId');

          if (!extId) {
            setStatus('error');
            setMessage(
              'Missing extension ID. Please click "Sign In Free" ' +
              'from inside the Citation Rocket extension sidebar.'
            );
            return;
          }

          w.chrome.runtime.sendMessage(
            extId,
            { action: 'storeAuthToken', token, email: user.email, plan: 'free' },
            (response: any) => {
              if (w.chrome.runtime.lastError) {
                setStatus('error');
                setMessage('Extension not detected. Make sure Citation Rocket extension is installed and enabled in Chrome.');
              } else {
                setStatus('success');
                setMessage('✅ Connected! You can close this tab and return to the extension.');
              }
            }
          );
        } else {
          setStatus('error');
          setMessage('Open this page by clicking "Sign In Free" inside the Citation Rocket extension sidebar — not directly in the browser.');
        }
      } catch (err: any) {
        setStatus('error');
        setMessage('Error: ' + err.message);
      }
    });
    return () => unsub();
  }, []);

  const statusColor: Record<string, string> = {
    checking: '#94a3b8',
    'not-logged-in': '#fbbf24',
    connecting: '#fbbf24',
    success: '#4ade80',
    error: '#f87171',
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0f0f1a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{
        background: '#12122a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px', padding: '40px',
        textAlign: 'center', maxWidth: '400px', width: '90%',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>🚀</div>
        <h2 style={{ color: '#6366f1', margin: '0 0 8px', fontSize: '20px' }}>
          Citation Rocket
        </h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 20px' }}>
          Browser Extension — Account Connection
        </p>
        <div style={{
          padding: '14px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.04)',
          color: statusColor[status] || '#94a3b8',
          fontSize: '13px', lineHeight: '1.5', marginBottom: '16px',
        }}>
          {message}
        </div>
        {status === 'not-logged-in' && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowLogin(true)}
              style={{
                background: '#6366f1', color: '#fff',
                border: 'none', padding: '10px 20px',
                borderRadius: '8px', fontWeight: '700',
                fontSize: '13px', cursor: 'pointer',
              }}
            >Sign In</button>
            <button
              onClick={() => setShowSignup(true)}
              style={{
                background: 'rgba(99,102,241,0.15)', color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.3)',
                padding: '10px 20px', borderRadius: '8px',
                fontWeight: '600', fontSize: '13px', cursor: 'pointer',
              }}
            >Create Free Account</button>
          </div>
        )}
        {status === 'success' && (
          <button
            onClick={() => window.close()}
            style={{
              background: '#4ade80', color: '#000',
              border: 'none', padding: '10px 24px',
              borderRadius: '8px', fontWeight: '700',
              fontSize: '13px', cursor: 'pointer',
            }}
          >Close Tab ✓</button>
        )}
      </div>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSwitchToSignup={() => { setShowLogin(false); setShowSignup(true); }}
      />
      <SignupModal
        isOpen={showSignup}
        onClose={() => setShowSignup(false)}
        onSwitchToLogin={() => { setShowSignup(false); setShowLogin(true); }}
      />
    </div>
  );
}
