const crypto = require('crypto');
const AsymmetricKeyManager = require('./AsymmetricKeyManager');

/**
 * High-level service dedicated to cryptographically signing consent payloads and
 * verifying asymmetric digital signatures.
 * Follows Single Responsibility Principle (SRP) for document signing workflows.
 */
class ConsentSigner {
  constructor() {
    // Load keys from key manager on instantiation
    const { privateKey, publicKey } = AsymmetricKeyManager.getKeys();
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  /**
   * Determinstically serializes consent properties into a pipe-delimited payload.
   * @param {Object} consent - The consent document fields.
   * @returns {string} The deterministic payload string.
   */
  serialize(consent, previousHash = '0') {
    return [
      consent.user_id,
      consent.consumer_id,
      consent.purpose,
      consent.status,
      consent.version.toString(),
      previousHash || '0'
    ].join('|');
  }

  /**
   * Digitally signs the consent payload using the secure Private Key.
   * @param {Object} consent - The consent document fields.
   * @param {string} previousHash - The hash of the previous version.
   * @returns {string} Hex-encoded digital signature.
   */
  signConsent(consent, previousHash = '0') {
    const payload = this.serialize(consent, previousHash);
    const sign = crypto.createSign('sha256');
    sign.update(payload);
    sign.end();
    return sign.sign(this.privateKey, 'hex');
  }

  /**
   * Verifies the digital signature of a consent using the Public Key.
   * @param {Object} consent - The consent document fields.
   * @param {string} signature - The hex-encoded signature to verify.
   * @param {string} previousHash - The hash of the previous version.
   * @returns {boolean} True if the signature is authentic and valid.
   */
  verifyConsent(consent, signature, previousHash = '0') {
    if (!signature) return false;
    const payload = this.serialize(consent, previousHash);
    const verify = crypto.createVerify('sha256');
    verify.update(payload);
    verify.end();
    return verify.verify(this.publicKey, signature, 'hex');
  }
}

module.exports = new ConsentSigner();
