import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const encoded = process.env.AVENOR_CONNECTION_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error('Bank connection encryption key is not configured');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Bank connection encryption key must be a base64-encoded 32-byte value');
  return key;
}

export function encryptConnectionSecret(plainText: string): string {
  if (!plainText) throw new Error('Cannot encrypt an empty connection secret');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptConnectionSecret(encoded: string): string {
  const parts = encoded.split('.');
  if (parts.length !== 3) throw new Error('Stored bank connection secret has an invalid format');
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
