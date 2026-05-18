/**
 * Abstract Interface defining the contract for Consent storage.
 * Subclasses must implement all methods to satisfy the Interface Segregation and Liskov Substitution principles.
 */
class IConsentRepository {
  async createConsent(id, userId, consumerId, purpose, status = 'GRANTED') {
    throw new Error('Method "createConsent" must be implemented.');
  }

  async getConsent(id) {
    throw new Error('Method "getConsent" must be implemented.');
  }

  async listConsents(filters = {}) {
    throw new Error('Method "listConsents" must be implemented.');
  }

  async getConsentHistory(id) {
    throw new Error('Method "getConsentHistory" must be implemented.');
  }

  async grantConsent(id) {
    throw new Error('Method "grantConsent" must be implemented.');
  }

  async revokeConsent(id) {
    throw new Error('Method "revokeConsent" must be implemented.');
  }

  async auditLedger() {
    throw new Error('Method "auditLedger" must be implemented.');
  }
}

module.exports = IConsentRepository;
