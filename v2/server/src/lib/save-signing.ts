import { createHmac } from 'crypto';

const SIGNING_KEY = process.env.SAVE_SIGNING_KEY || process.env.JWT_SECRET || 'dev-save-key';
const ALGORITHM = 'sha256';

export function signSaveData(data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return createHmac(ALGORITHM, SIGNING_KEY).update(payload).digest('hex');
}

export function verifySaveSignature(data: unknown, signature: string): boolean {
  const expected = signSaveData(data);
  if (expected.length !== signature.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}
