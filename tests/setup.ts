import { vi, beforeEach } from 'vitest';
import { FakeFirestore, DELETE } from './fake-firestore';

export const fakeDb = new FakeFirestore();
export const deletedAuthUsers: string[] = [];

process.env.KEY_ENCRYPTION_SECRET = Buffer.alloc(32, 9).toString('base64');

vi.mock('../server/firebase-admin', () => ({
  adminDb: fakeDb,
  adminAuth: {
    verifyIdToken: async (token: string) => {
      // Test tokens look like "uid:email:verified"
      const [uid, email, verified] = token.split(':');
      if (!uid) throw new Error('invalid');
      return { uid, email, email_verified: verified === 'true' };
    },
    deleteUser: async (uid: string) => { deletedAuthUsers.push(uid); },
    getUserByEmail: async () => { throw new Error('not found'); },
  },
  default: {},
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => DELETE },
}));

beforeEach(() => {
  fakeDb.reset();
  deletedAuthUsers.length = 0;
});
