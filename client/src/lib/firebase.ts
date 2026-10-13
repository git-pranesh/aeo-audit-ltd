import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAcW6zjnp9yMCUl_CkcBykXJ4hXMrL5Mhk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ai-citation-51aba.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ai-citation-51aba",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ai-citation-51aba.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1037837052897",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1037837052897:web:ceaa62ae524d0ae0a940a0",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-QPQQ6DXVCF"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('✅ Firebase initialized');
} catch (error) {
  console.error('❌ Firebase init error:', error);
  throw error;
}

export { app, auth, db };
export default app;
