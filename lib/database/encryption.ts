import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

// Lazy initialization to avoid build-time errors when env var isn't set
let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) {
    const ENCRYPTION_KEY = process.env.DATABASE_ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY) {
      throw new Error('DATABASE_ENCRYPTION_KEY must be set in environment variables');
    }
    _key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
  }
  return _key;
}

/**
 * Encrypt sensitive database credentials
 */
export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt database credentials
 */
export function decryptPassword(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const [ivHex, authTagHex, encryptedData] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
