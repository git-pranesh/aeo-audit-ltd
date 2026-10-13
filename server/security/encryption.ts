/**
 * Authenticated encryption (AES-256-GCM) for customer OpenRouter keys.
 *
 * The encryption key lives in the KEY_ENCRYPTION_SECRET environment variable
 * (32 random bytes, base64) — never in Firestore. Firestore only ever stores
 * { ciphertext, iv, tag, v }. `v` lets us rotate: add KEY_ENCRYPTION_SECRET_V2,
 * bump CURRENT_VERSION, and old records still decrypt with their own version.
 *
 * Generate a secret with:  openssl rand -base64 32
 */

import crypto from 'crypto';

export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string;         // base64, 12 bytes
  tag: string;        // base64, 16 bytes
  v: number;          // key version
}

const CURRENT_VERSION = 1;

function getKey(version: number): Buffer {
  const envName = version === 1 ? 'KEY_ENCRYPTION_SECRET' : `KEY_ENCRYPTION_SECRET_V${version}`;
  const raw = process.env[envName];
  if (!raw) throw new Error(`${envName} is not configured`);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`${envName} must be 32 bytes (base64-encoded)`);
  return key;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(CURRENT_VERSION), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    v: CURRENT_VERSION,
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(secret.v), Buffer.from(secret.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Fail fast at boot rather than on the first customer request. */
export function assertEncryptionConfigured(): void {
  getKey(CURRENT_VERSION);
}
