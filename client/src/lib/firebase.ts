import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Firebase is used for sign-in only. All data goes through the API server,
// so the browser never needs Firestore access (rules deny it entirely).
const app = initializeApp({
  // Public web config (safe to ship); env vars override for other projects.
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAcW6zjnp9yMCUl_CkcBykXJ4hXMrL5Mhk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ai-citation-51aba.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-citation-51aba",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1037837052897:web:ceaa62ae524d0ae0a940a0",
});

export const auth = getAuth(app);
export default app;
