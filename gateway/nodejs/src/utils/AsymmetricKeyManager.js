const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Handles generation, storage, and loading of asymmetric ECDSA key pairs.
 * Follows Single Responsibility Principle (SRP) for cryptographic key management.
 */
class AsymmetricKeyManager {
  constructor() {
    this.keysDir = path.join(__dirname, '..', '..', 'keys');
    this.privateKeyPath = path.join(this.keysDir, 'private.pem');
    this.publicKeyPath = path.join(this.keysDir, 'public.pem');
  }

  /**
   * Initializes and returns the secure Private and Public keys.
   * Generates a new EC prime256v1 key pair if not present.
   * @returns {{privateKey: string, publicKey: string}} PEM formatted keys.
   */
  getKeys() {
    if (!fs.existsSync(this.keysDir)) {
      fs.mkdirSync(this.keysDir, { recursive: true });
    }

    if (!fs.existsSync(this.privateKeyPath) || !fs.existsSync(this.publicKeyPath)) {
      console.log('[Crypto] Generating secure Elliptic Curve prime256v1 keypair (Fabric standard)...');
      
      const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      fs.writeFileSync(this.privateKeyPath, privateKey);
      fs.writeFileSync(this.publicKeyPath, publicKey);
    }

    return {
      privateKey: fs.readFileSync(this.privateKeyPath, 'utf8'),
      publicKey: fs.readFileSync(this.publicKeyPath, 'utf8')
    };
  }
}

module.exports = new AsymmetricKeyManager();
