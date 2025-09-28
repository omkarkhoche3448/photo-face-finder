const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(config.security.encryptionKey.padEnd(32, '0').slice(0, 32));

/**
 * Encrypt sensitive data (like OAuth tokens)
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted text in format: iv:authTag:encryptedData
 */
function encrypt(text) {
  if (!text) {
    throw new Error('Text to encrypt cannot be empty');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt encrypted data
 * @param {string} encryptedText - Encrypted text in format: iv:authTag:encryptedData
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText) {
    throw new Error('Encrypted text cannot be empty');
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }

  const [ivHex, authTagHex, encrypted] = parts;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a random encryption key
 * @param {number} length - Key length in bytes (default: 32)
 * @returns {string} - Random hex string
 */
function generateKey(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a password using bcrypt-compatible method
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
  const bcrypt = require('bcrypt');
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches
 */
async function comparePassword(password, hash) {
  const bcrypt = require('bcrypt');
  return bcrypt.compare(password, hash);
}

module.exports = {
  encrypt,
  decrypt,
  generateKey,
  hashPassword,
  comparePassword,
};
