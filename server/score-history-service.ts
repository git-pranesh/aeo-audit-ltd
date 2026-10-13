import { initializeApp, getApp } from 'firebase/app';
import { getFirestore, doc, collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';

function getFirestoreDb() {
  let app;
  try { app = getApp('score-history-app'); } catch {
    app = initializeApp({
      apiKey: process.env.VITE_FIREBASE_API_KEY,
      projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    }, 'score-history-app');
  }
  return getFirestore(app);
}

export interface ScoreHistoryEntry {
  runId: string;
  runAt: string;
  overallScore: number;
  letterGrade: string;
  platformScores: {
    chatgpt: number;
    perplexity: number;
    gemini: number;
    claude: number;
  };
  type: 'initial' | 'reaudit';
}

export async function saveScoreHistory(
  auditId: string,
  scores: {
    overallScore: number;
    letterGrade: string;
    platformScores: { chatgpt: number; perplexity: number; gemini: number; claude: number };
  },
  type: 'initial' | 'reaudit'
): Promise<string> {
  const db = getFirestoreDb();
  const historyRef = collection(db, 'audits', auditId, 'scoreHistory');

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: ScoreHistoryEntry = {
    runId,
    runAt: new Date().toISOString(),
    overallScore: scores.overallScore,
    letterGrade: scores.letterGrade,
    platformScores: scores.platformScores,
    type,
  };

  const docRef = await addDoc(historyRef, entry);
  console.log(`✅ Score history saved: ${type} entry for audit ${auditId} (doc: ${docRef.id})`);
  return docRef.id;
}

export async function getScoreHistory(auditId: string): Promise<ScoreHistoryEntry[]> {
  const db = getFirestoreDb();
  const historyRef = collection(db, 'audits', auditId, 'scoreHistory');
  const q = query(historyRef, orderBy('runAt', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data() as ScoreHistoryEntry);
}
