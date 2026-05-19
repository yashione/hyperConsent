const ConsentRepositoryFactory = require('./repositories/ConsentRepositoryFactory');

// Resolve the concrete repository dynamically based on environment configuration
const repository = ConsentRepositoryFactory.getRepository();

// Maintain legacy mode variable for healthcheck compatibility
const mode = process.env.FABRIC_MOCK === 'false' ? 'fabric' : 'mock';

/**
 * Creates a new versioned consent entry.
 */
async function createConsent(id, userId, consumerId, purpose, status = 'GRANTED') {
  return repository.createConsent(id, userId, consumerId, purpose, status);
}

/**
 * Returns the latest consent record by its ID.
 */
async function getConsent(id) {
  return repository.getConsent(id);
}

/**
 * Lists consent records applying optional query filters.
 */
async function listConsents(filters = {}) {
  return repository.listConsents(filters);
}

/**
 * Returns the full versioned history of a specific consent record.
 */
async function getConsentHistory(id) {
  return repository.getConsentHistory(id);
}

/**
 * Revokes a consent by appending a new version with status REVOKED.
 */
async function revokeConsent(id) {
  return repository.revokeConsent(id);
}

/**
 * Grants a consent by appending a new version with status GRANTED.
 */
async function grantConsent(id) {
  return repository.grantConsent(id);
}

/**
 * Verifies integrity across the entire ledger.
 */
async function auditLedger() {
  return repository.auditLedger();
}

module.exports = {
  mode,
  repository,
  createConsent,
  getConsent,
  listConsents,
  getConsentHistory,
  grantConsent,
  revokeConsent,
  auditLedger,
};
