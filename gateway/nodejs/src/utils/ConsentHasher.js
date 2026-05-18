const crypto = require('crypto');

/**
 * Utility class dedicated to deterministic SHA-256 hashing of consent documents.
 * Ensures data integrity and supports cryptographic chain verification.
 */
class ConsentHasher {
  /**
   * Computes the SHA-256 hash of a consent version document.
   * @param {Object} consent - The consent document fields.
   * @param {string} consent.user_id
   * @param {string} consent.consumer_id
   * @param {string} consent.purpose
   * @param {string} consent.status
   * @param {number} consent.version
   * @param {string} previousHash - The hash of the previous version (use '0' for version 1).
   * @returns {string} The SHA-256 hash.
   */
  static calculateHash(consent, previousHash = '0') {
    const payload = [
      consent.user_id,
      consent.consumer_id,
      consent.purpose,
      consent.status,
      consent.version.toString(),
      previousHash || '0'
    ].join('|');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}

module.exports = ConsentHasher;
