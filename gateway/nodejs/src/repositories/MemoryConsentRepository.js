const IConsentRepository = require('./IConsentRepository');
const ConsentHasher = require('../utils/ConsentHasher');
const ConsentSigner = require('../utils/ConsentSigner');

/**
 * Concrete implementation of IConsentRepository backed by an in-memory Map.
 * Used for local standalone development where persistence is not required.
 */
class MemoryConsentRepository extends IConsentRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  versionId(consentId, version) {
    return `CONSENT#${consentId}#v${String(version).padStart(6, '0')}`;
  }

  isValidStatus(status) {
    return status === 'GRANTED' || status === 'REVOKED';
  }

  latestConsent(consentId) {
    return [...this.store.values()]
      .filter((consent) => consent.consent_id === consentId)
      .sort((a, b) => b.version - a.version)[0];
  }

  withLatestFlags(consents) {
    const latestVersions = new Map();
    for (const consent of consents) {
      const current = latestVersions.get(consent.consent_id) || 0;
      latestVersions.set(consent.consent_id, Math.max(current, consent.version));
    }

    return consents
      .map((consent) => ({
        ...consent,
        is_latest: latestVersions.get(consent.consent_id) === consent.version
      }))
      .sort((a, b) => {
        if (a.consent_id === b.consent_id) return b.version - a.version;
        return b.created_at.localeCompare(a.created_at);
      });
  }

  applyFilters(consents, filters = {}) {
    return consents.filter((consent) => {
      return (!filters.user_id || consent.user_id === filters.user_id)
        && (!filters.consumer_id || consent.consumer_id === filters.consumer_id)
        && (!filters.status || consent.status === filters.status);
    });
  }

  async createConsent(id, userId, consumerId, purpose, status = 'GRANTED') {
    if (!id || !userId || !consumerId || !purpose || !status) {
      throw new Error('id, user_id, consumer_id, purpose, and status are required');
    }
    if (!this.isValidStatus(status)) {
      throw new Error('status must be GRANTED or REVOKED');
    }

    if (this.latestConsent(id)) {
      throw new Error(`consent ${id} already exists`);
    }
    const now = new Date().toISOString();
    const key = this.versionId(id, 1);
    const consent = {
      docType: 'consent_version',
      id: key,
      consent_id: id,
      version: 1,
      user_id: userId,
      consumer_id: consumerId,
      purpose,
      status,
      action: status,
      created_at: now,
      updated_at: now,
      is_latest: true
    };
    const hash = ConsentHasher.calculateHash(consent, '0');
    consent.hash = hash;
    consent.previous_hash = '0';

    // Generate asymmetric digital signature using the Private Key
    const signature = ConsentSigner.signConsent(consent, '0');
    consent.signature = signature;
    this.store.set(key, consent);
    return consent;
  }

  async getConsent(id) {
    const consent = this.latestConsent(id);
    if (!consent) {
      throw new Error(`consent ${id} not found`);
    }
    return { ...consent, is_latest: true };
  }

  async listConsents(filters = {}) {
    return this.withLatestFlags(this.applyFilters([...this.store.values()], filters));
  }

  async getConsentHistory(id) {
    const consents = [...this.store.values()].filter((consent) => consent.consent_id === id);
    if (!consents.length) {
      throw new Error(`consent ${id} not found`);
    }
    return this.withLatestFlags(consents);
  }

  async revokeConsent(id) {
    return this.appendConsentAction(id, 'REVOKED');
  }

  async grantConsent(id) {
    return this.appendConsentAction(id, 'GRANTED');
  }

  async appendConsentAction(id, status) {
    const consent = await this.getConsent(id);
    if (consent.status === status) {
      throw new Error(`consent ${id} is already ${status}`);
    }

    const now = new Date().toISOString();
    const nextVersion = consent.version + 1;
    const key = this.versionId(id, nextVersion);
    const next = {
      docType: 'consent_version',
      id: key,
      consent_id: id,
      version: nextVersion,
      user_id: consent.user_id,
      consumer_id: consent.consumer_id,
      purpose: consent.purpose,
      status,
      action: status,
      previous_version_id: consent.id,
      created_at: now,
      updated_at: now,
      is_latest: true
    };
    const previousHash = consent.hash || '0';
    const nextHash = ConsentHasher.calculateHash(next, previousHash);
    next.hash = nextHash;
    next.previous_hash = previousHash;

    // Generate asymmetric digital signature linked to previous block hash
    const signature = ConsentSigner.signConsent(next, previousHash);
    next.signature = signature;
    this.store.set(key, next);
    return next;
  }

  async auditLedger() {
    const docs = [...this.store.values()];
    const groups = new Map();
    for (const doc of docs) {
      if (!groups.has(doc.consent_id)) {
        groups.set(doc.consent_id, []);
      }
      groups.get(doc.consent_id).push(doc);
    }

    for (const [consentId, versions] of groups.entries()) {
      versions.sort((a, b) => a.version - b.version);

      for (let i = 0; i < versions.length; i++) {
        const doc = versions[i];

        if (doc.version !== i + 1) {
          throw new Error(`integrity error: version mismatch at index ${i} (expected ${i + 1}, got ${doc.version})`);
        }

        const expectedPrevHash = i === 0 ? '0' : versions[i - 1].hash || '0';

        if (i > 0) {
          const expectedPrevID = this.versionId(consentId, i);
          if (doc.previous_version_id !== expectedPrevID) {
            throw new Error(`integrity error: previous version ID mismatch at version ${doc.version}`);
          }

          if (doc.previous_hash && doc.previous_hash !== expectedPrevHash) {
            throw new Error(`integrity error: cryptographic hash chain link broken at version ${doc.version} of consent ${consentId} (expected previous hash "${expectedPrevHash}", got "${doc.previous_hash}")`);
          }

          const prevTime = new Date(versions[i - 1].created_at).getTime();
          const currTime = new Date(doc.created_at).getTime();
          if (currTime < prevTime) {
            throw new Error(`integrity error: timestamp regression at version ${doc.version}`);
          }
        }

        if (doc.hash) {
          const computedHash = ConsentHasher.calculateHash(doc, doc.previous_hash || '0');
          if (doc.hash !== computedHash) {
            throw new Error(`integrity error: cryptographic signature mismatch at version ${doc.version} of consent ${consentId} (expected hash "${computedHash}", got "${doc.hash}"). Document has been tampered with!`);
          }
        }

        // Verify elliptic curve digital signature to prove origin authenticity (Mandatory!)
        if (!doc.signature) {
          throw new Error(`security error: digital signature is missing at version ${doc.version} of consent ${consentId}. This document has been manually injected (unsigned)!`);
        }
        const isValidSig = ConsentSigner.verifyConsent(doc, doc.signature, doc.previous_hash || '0');
        if (!isValidSig) {
          throw new Error(`security error: digital signature verification failed at version ${doc.version} of consent ${consentId}. This document has been manually injected or forged (Private Key signature is invalid)!`);
        }
      }
    }
    return 'passed';
  }
}

module.exports = MemoryConsentRepository;
