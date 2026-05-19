const IConsentRepository = require('./IConsentRepository');
const ConsentHasher = require('../utils/ConsentHasher');
const ConsentSigner = require('../utils/ConsentSigner');
const TransactionLogManager = require('../utils/TransactionLogManager');

/**
 * Concrete implementation of IConsentRepository backed by CouchDB.
 * Provides resilient, scalable persistence for mock development or testing environments.
 */
class CouchDbConsentRepository extends IConsentRepository {
  constructor() {
    super();
    const rawUrl = process.env.COUCHDB_URL || 'http://admin:admin123@localhost:5984';
    this.dbName = process.env.COUCHDB_DB_NAME || 'consents_db';

    // Parse URL to isolate credentials for basic authorization header
    const parsedUrl = new URL(rawUrl);
    if (parsedUrl.username && parsedUrl.password) {
      this.auth = Buffer.from(`${parsedUrl.username}:${parsedUrl.password}`).toString('base64');
      parsedUrl.username = '';
      parsedUrl.password = '';
    }
    this.url = parsedUrl.origin;
    this.initPromise = this.init();
  }

  async request(path, options = {}) {
    const url = `${this.url}/${this.dbName}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (this.auth) {
      headers['Authorization'] = `Basic ${this.auth}`;
    }
    return fetch(url, {
      ...options,
      headers,
    });
  }

  async init() {
    try {
      // 1. Check if database exists
      const checkRes = await this.request('', { method: 'GET' });
      if (checkRes.status === 404) {
        console.log(`[CouchDB] Creating database "${this.dbName}"...`);
        // Put request to root /dbName
        const createRes = await fetch(`${this.url}/${this.dbName}`, {
          method: 'PUT',
          headers: this.auth ? { 'Authorization': `Basic ${this.auth}` } : {}
        });
        if (!createRes.ok) {
          throw new Error(`Failed to create database: ${createRes.statusText}`);
        }
      }

      // 2. Proactive self-healing: purge the broken legacy "CONSENT" document if present
      const consentDocRes = await this.request('/CONSENT', { method: 'GET' });
      if (consentDocRes.ok) {
        const consentDoc = await consentDocRes.json();
        console.log(`[CouchDB] Proactively cleaning up legacy broken "CONSENT" document (rev: ${consentDoc._rev})...`);
        await this.request(`/CONSENT?rev=${consentDoc._rev}`, { method: 'DELETE' });
      }

      // 3. Create optimized JSON indexes matching Hyperledger Fabric's fields
      await this.createIndex('indexConsentIdDoc', 'indexConsentId', ['docType', 'consent_id', 'version']);
      await this.createIndex('indexConsentUserDoc', 'indexConsentUser', ['docType', 'user_id', 'consent_id', 'version']);
      await this.createIndex('indexConsentConsumerDoc', 'indexConsentConsumer', ['docType', 'consumer_id', 'consent_id', 'version']);
      await this.createIndex('indexConsentStatusDoc', 'indexConsentStatus', ['docType', 'status', 'consent_id', 'version']);

      console.log(`[CouchDB] Database "${this.dbName}" and indexes initialized successfully.`);
    } catch (error) {
      console.error('[CouchDB] Initialization error:', error.message);
      throw error;
    }
  }

  async createIndex(ddoc, name, fields) {
    const body = {
      index: { fields },
      ddoc,
      name,
      type: 'json'
    };
    const res = await this.request('/_index', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[CouchDB] Warning: Failed to create index ${name}:`, text);
    }
  }

  versionId(consentId, version) {
    return `CONSENT#${consentId}#v${String(version).padStart(6, '0')}`;
  }

  isValidStatus(status) {
    return status === 'GRANTED' || status === 'REVOKED';
  }

  async latestConsent(consentId) {
    await this.initPromise;
    console.log(`[CouchDB DEBUG] latestConsent: searching for consentId = "${consentId}"`);
    const res = await this.request('/_find', {
      method: 'POST',
      body: JSON.stringify({
        selector: {
          docType: 'consent_version',
          consent_id: consentId
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to query latest consent: ${res.statusText}`);
    }
    const data = await res.json();
    console.log(`[CouchDB DEBUG] latestConsent found docs count:`, data.docs ? data.docs.length : 0);
    if (!data.docs || data.docs.length === 0) {
      return null;
    }
    return data.docs.sort((a, b) => b.version - a.version)[0];
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
    await this.initPromise;
    console.log(`[CouchDB DEBUG] createConsent called: id="${id}", userId="${userId}", consumerId="${consumerId}"`);
    if (!id || !userId || !consumerId || !purpose || !status) {
      throw new Error('id, user_id, consumer_id, purpose, and status are required');
    }
    if (!this.isValidStatus(status)) {
      throw new Error('status must be GRANTED or REVOKED');
    }

    const existing = await this.latestConsent(id);
    if (existing) {
      throw new Error(`consent ${id} already exists`);
    }

    const now = new Date().toISOString();
    const key = this.versionId(id, 1);
    console.log(`[CouchDB DEBUG] createConsent: preparing to PUT document with _id = "${key}"`);
    const consent = {
      docType: 'consent_version',
      consent_id: id,
      version: 1,
      user_id: userId,
      consumer_id: consumerId,
      purpose,
      status,
      action: status,
      created_at: now,
      updated_at: now
    };

    // Calculate deterministic SHA-256 signature for genesis block (previousHash = '0')
    const hash = ConsentHasher.calculateHash(consent, '0');
    consent.hash = hash;
    consent.previous_hash = '0';

    // Generate asymmetric digital signature using the Private Key
    const signature = ConsentSigner.signConsent(consent, '0');
    consent.signature = signature;

    const res = await this.request(`/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(consent)
    });

    // Append this successful Genesis transaction to the append-only log file
    TransactionLogManager.logWrite(consent);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[CouchDB DEBUG] PUT failed for key "${key}":`, text);
      throw new Error(`Failed to create consent doc: ${text}`);
    }
    console.log(`[CouchDB DEBUG] createConsent SUCCESS for key "${key}"`);
    return { ...consent, id: key, is_latest: true };
  }

  async getConsent(id) {
    const consent = await this.latestConsent(id);
    if (!consent) {
      throw new Error(`consent ${id} not found`);
    }
    return { ...consent, id: this.versionId(id, consent.version), is_latest: true };
  }

  async listConsents(filters = {}) {
    await this.initPromise;
    const selector = { docType: 'consent_version' };
    if (filters.user_id) selector.user_id = filters.user_id;
    if (filters.consumer_id) selector.consumer_id = filters.consumer_id;
    if (filters.status) selector.status = filters.status;

    const res = await this.request('/_find', {
      method: 'POST',
      body: JSON.stringify({ selector })
    });
    if (!res.ok) {
      throw new Error(`Failed to list consents from CouchDB: ${res.statusText}`);
    }
    const data = await res.json();
    const docs = data.docs.map(doc => ({ ...doc, id: doc._id }));
    return this.withLatestFlags(this.applyFilters(docs, filters));
  }

  async getConsentHistory(id) {
    await this.initPromise;
    const res = await this.request('/_find', {
      method: 'POST',
      body: JSON.stringify({
        selector: {
          docType: 'consent_version',
          consent_id: id
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch history from CouchDB: ${res.statusText}`);
    }
    const data = await res.json();
    if (!data.docs || data.docs.length === 0) {
      throw new Error(`consent ${id} not found`);
    }
    const docs = data.docs.map(doc => ({ ...doc, id: doc._id }));
    return this.withLatestFlags(docs);
  }

  async revokeConsent(id) {
    return this.appendConsentAction(id, 'REVOKED');
  }

  async grantConsent(id) {
    return this.appendConsentAction(id, 'GRANTED');
  }

  async appendConsentAction(id, status) {
    console.log(`[CouchDB DEBUG] appendConsentAction called: id="${id}", status="${status}"`);
    const consent = await this.getConsent(id);
    if (consent.status === status) {
      throw new Error(`consent ${id} is already ${status}`);
    }

    const now = new Date().toISOString();
    const nextVersion = consent.version + 1;
    const key = this.versionId(id, nextVersion);
    console.log(`[CouchDB DEBUG] appendConsentAction: appending version ${nextVersion} (key = "${key}")`);
    const next = {
      docType: 'consent_version',
      consent_id: id,
      version: nextVersion,
      user_id: consent.user_id,
      consumer_id: consent.consumer_id,
      purpose: consent.purpose,
      status,
      action: status,
      previous_version_id: consent.id,
      created_at: now,
      updated_at: now
    };

    // Calculate deterministic hash linking to previous block signature
    const previousHash = consent.hash || '0';
    const nextHash = ConsentHasher.calculateHash(next, previousHash);
    next.hash = nextHash;
    next.previous_hash = previousHash;

    // Generate asymmetric digital signature linked to previous block hash
    const signature = ConsentSigner.signConsent(next, previousHash);
    next.signature = signature;

    const res = await this.request(`/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(next)
    });

    // Append this successful update transaction to the append-only log file
    TransactionLogManager.logWrite(next);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[CouchDB DEBUG] PUT failed for key "${key}":`, text);
      throw new Error(`Failed to append consent action doc: ${text}`);
    }
    console.log(`[CouchDB DEBUG] appendConsentAction SUCCESS for key "${key}"`);
    return { ...next, id: key, is_latest: true };
  }

  async auditLedger() {
    await this.initPromise;
    const res = await this.request('/_find', {
      method: 'POST',
      body: JSON.stringify({
        selector: {
          docType: 'consent_version'
        }
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch records for audit: ${res.statusText}`);
    }
    const data = await res.json();
    const docs = data.docs.map(doc => ({ ...doc, id: doc._id }));

    // Group by consent_id and check sequence links (monotonically increasing)
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

        // Expected previous hash for cryptographic verification
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

        // Verify cryptographic hash of document contents if signature is present
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

  async getAllConsentsRaw() {
    const res = await this.request('/_all_docs?include_docs=true');
    if (!res.ok) {
      const text = await res.text();
      console.error(`[CouchDB DEBUG] getAllConsentsRaw failed:`, text);
      return [];
    }
    const data = await res.json();
    if (!data || !data.rows) return [];
    return data.rows
      .map(row => row.doc)
      .filter(doc => doc && doc.docType === 'consent_version');
  }

  async deleteConsentVersion(id, rev) {
    const res = await this.request(`/${encodeURIComponent(id)}?rev=${rev}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[CouchDB DEBUG] deleteConsentVersion failed for key "${id}":`, text);
      throw new Error(`Failed to delete consent version: ${text}`);
    }
    return res;
  }

  async updateConsentVersion(id, doc) {
    const res = await this.request(`/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(doc)
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[CouchDB DEBUG] updateConsentVersion failed for key "${id}":`, text);
      throw new Error(`Failed to update consent version: ${text}`);
    }
    return res;
  }
}

module.exports = CouchDbConsentRepository;
