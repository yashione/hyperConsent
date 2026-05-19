const ConsentHasher = require('./ConsentHasher');
const ConsentSigner = require('./ConsentSigner');
const PurgeStrategy = require('./PurgeStrategy');
const ReplayLogStrategy = require('./ReplayLogStrategy');

/**
 * High-level SOLID recovery orchestrator.
 * Adheres strictly to Dependency Inversion (DIP) and Open/Closed (OCP) principles.
 */
class ConsentSelfHealer {
  /**
   * @param {IConsentRepository} repository Abstraction of the storage repository
   * @param {string} strategyName Either 'PURGE' or 'REPLAY_LOG'
   */
  constructor(repository, strategyName = 'REPLAY_LOG') {
    this.repo = repository;
    
    // Choose healing strategy dynamically (Strategy Pattern)
    if (strategyName === 'PURGE') {
      this.strategy = new PurgeStrategy();
    } else {
      this.strategy = new ReplayLogStrategy();
    }
  }

  /**
   * Helper to format double-digit/six-digit version IDs.
   */
  versionId(consentId, vNum) {
    return `CONSENT#${consentId}#v${String(vNum).zfill(6)}`;
  }

  /**
   * Runs the self-healing algorithm across all records.
   * @returns {Promise<Object>} Summary report of the healing process
   */
  async healLedger() {
    console.log(`[SelfHealer] Initiating ledger self-healing recovery using strategy: ${this.strategy.constructor.name}...`);
    
    // Fetch all raw documents from the database (LSP in action!)
    const allDocs = await this.repo.getAllConsentsRaw();
    
    // Group documents by consent_id
    const groups = new Map();
    for (const doc of allDocs) {
      if (!groups.has(doc.consent_id)) {
        groups.set(doc.consent_id, []);
      }
      groups.get(doc.consent_id).push(doc);
    }

    const reports = [];
    let totalCorruptedFound = 0;

    // String zfill helper
    if (!String.prototype.zfill) {
      String.prototype.zfill = function(size) {
        let s = this;
        while (s.length < size) s = "0" + s;
        return s;
      };
    }

    // Process each history chain
    for (const [consentId, versions] of groups.entries()) {
      console.log(`[SelfHealer] Scanning history chain for Consent ID: "${consentId}" (${versions.length} versions)...`);
      // Sort history chronologically from Version 1 up to N
      versions.sort((a, b) => a.version - b.version);
      
      let corruptionIndex = -1;

      for (let i = 0; i < versions.length; i++) {
        const doc = versions[i];
        console.log(`[SelfHealer] -> Auditing Version ${doc.version} (_id: "${doc._id}")...`);
        
        try {
          // 1. Verify sequence order
          if (doc.version !== i + 1) {
            throw new Error(`Version index gap detected (expected ${i + 1}, got ${doc.version})`);
          }

          // 2. Verify previous version ID linkage
          if (i > 0) {
            const expectedPrevID = `CONSENT#${consentId}#v${String(i).padStart(6, '0')}`;
            if (doc.previous_version_id !== expectedPrevID) {
              throw new Error(`Previous version ID mismatch (expected "${expectedPrevID}", got "${doc.previous_version_id}")`);
            }

            const expectedPrevHash = versions[i - 1].hash || '0';
            if (doc.previous_hash && doc.previous_hash !== expectedPrevHash) {
              throw new Error(`Hash chain linkage broken (expected "${expectedPrevHash}", got "${doc.previous_hash}")`);
            }

            // Verify timestamp sequence
            const prevTime = new Date(versions[i - 1].created_at).getTime();
            const currTime = new Date(doc.created_at).getTime();
            if (currTime < prevTime) {
              throw new Error(`Timestamp regression detected (previous: ${versions[i - 1].created_at}, current: ${doc.created_at})`);
            }
          }

          // 3. Verify content SHA-256 hash integrity
          if (doc.hash) {
            const computedHash = ConsentHasher.calculateHash(doc, doc.previous_hash || '0');
            if (doc.hash !== computedHash) {
              throw new Error(`Content hash mismatch (expected "${computedHash}", got "${doc.hash}")`);
            }
          }

          // 4. Verify Elliptic Curve digital signature authenticity (Mandatory!)
          if (!doc.signature) {
            throw new Error('Missing digital signature (unsigned manual injection)');
          }
          const isValidSig = ConsentSigner.verifyConsent(doc, doc.signature, doc.previous_hash || '0');
          if (!isValidSig) {
            throw new Error('Invalid digital signature (forged record)');
          }

          console.log(`[SelfHealer]    Version ${doc.version} passed all cryptographic checks!`);

        } catch (err) {
          // Cryptographic validation failed! We have located the corruption starting point!
          console.warn(`[SelfHealer] ❌ Corruption detected on consent "${consentId}" at Version ${doc.version}: ${err.message}`);
          corruptionIndex = i;
          break; // Stop scanning this chain immediately; subsequent blocks are corrupted by extension
        }
      }

      // If corruption was located, trigger the recovery strategy
      if (corruptionIndex !== -1) {
        totalCorruptedFound++;
        console.log(`[SelfHealer] Triggering ${this.strategy.constructor.name} for consent "${consentId}" starting at Version ${versions[corruptionIndex].version}...`);
        const report = await this.strategy.execute(consentId, versions, corruptionIndex, this.repo);
        reports.push(report);
      } else {
        console.log(`[SelfHealer] ✅ Consent "${consentId}" is 100% intact.`);
      }
    }

    return {
      status: 'SUCCESS',
      timestamp: new Date().toISOString(),
      strategyUsed: this.strategy.constructor.name,
      corruptedConsentsFound: totalCorruptedFound,
      recoveryReports: reports
    };
  }
}

module.exports = ConsentSelfHealer;
