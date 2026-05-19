const path = require('path');
const CouchDbConsentRepository = require('./gateway/nodejs/src/repositories/CouchDbConsentRepository');
const ConsentSelfHealer = require('./gateway/nodejs/src/utils/ConsentSelfHealer');

// Override environment variables to connect to CouchDB from WSL
// Note: when running from host WSL, we connect to localhost:5984 (which is mapped to the host)
process.env.COUCHDB_URL = 'http://admin:admin123@localhost:5984';
process.env.COUCHDB_DB_NAME = 'consents_db';

async function run() {
  console.log('--- STARTING CRYPTOGRAPHIC HEALER TEST ---');
  const repo = new CouchDbConsentRepository();
  await repo.initPromise;

  const testId = 'test-consent-' + Math.random().toString(36).substring(2, 9);
  console.log(`1. Creating fresh consent chain with ID: "${testId}"`);

  // Create Version 1 (GRANTED)
  const v1 = await repo.createConsent(testId, 'alice', 'bank-a', 'testing-purpose', 'GRANTED');
  console.log(`   Created Version 1:`, v1.id);

  // Create Version 2 (REVOKED)
  const v2 = await repo.revokeConsent(testId);
  console.log(`   Created Version 2 (Revoked):`, v2.id);

  // Create Version 3 (GRANTED)
  const v3 = await repo.grantConsent(testId);
  console.log(`   Created Version 3 (Granted):`, v3.id);

  // Verify all docs from DB
  console.log('\n2. Retrieving all consent docs from CouchDB...');
  const allDocsBefore = await repo.getAllConsentsRaw();
  console.log(`   Found ${allDocsBefore.length} total consent documents in CouchDB.`);
  
  // Find our Version 2 document
  const v2Doc = allDocsBefore.find(d => d._id === v2.id);
  if (!v2Doc) {
    throw new Error(`Could not find Version 2 document in DB!`);
  }

  // 3. Simulate a DBA Hack: modify Version 2 content directly
  console.log('\n3. [DBA ATTACK] Tampering with Version 2 in CouchDB...');
  const tamperedDoc = {
    ...v2Doc,
    purpose: 'STOLEN KYC DATA' // Alter the purpose field!
  };
  
  // Use raw update to bypass the repository's signer validations
  await repo.updateConsentVersion(v2Doc._id, tamperedDoc);
  console.log('   Version 2 has been tampered with in CouchDB.');

  // 4. Verify Ledger (Auditor)
  console.log('\n4. Running Cryptographic Security Audit...');
  try {
    const auditResult = await repo.auditLedger();
    console.log(`   Audit Result: ${auditResult}`);
  } catch (err) {
    console.warn(`   Audit detected tampering as expected: ${err.message}`);
  }

  // 5. Trigger Self Healer
  console.log('\n5. Invoking Self Healer (ReplayLogStrategy)...');
  const healer = new ConsentSelfHealer(repo, 'REPLAY_LOG');
  const healReport = await healer.healLedger();
  console.log('   Heal Report:', JSON.stringify(healReport, null, 2));

  // 6. Verify Ledger again
  console.log('\n6. Running Security Audit after Healing...');
  const postAuditResult = await repo.auditLedger();
  console.log(`   Post-Heal Audit Result: ${postAuditResult}`);
  
  if (postAuditResult === 'passed') {
    console.log('\n🎉 SUCCESS: Ledger successfully restored to cryptographic integrity with zero data loss!');
  } else {
    console.log('\n❌ FAILURE: Self-healer failed to restore ledger integrity.');
  }
}

run().catch(err => {
  console.error('Test run threw exception:', err);
});
