const assert = require('node:assert/strict');
const test = require('node:test');

const contract = require('../src/contract');

test('mock gateway appends a revoke version instead of overwriting', async () => {
  const created = await contract.createConsent('test-consent', 'alice', 'bank-a', 'KYC', 'GRANTED');
  const revoked = await contract.revokeConsent('test-consent');
  const rows = await contract.listConsents({ user_id: 'alice' });

  assert.equal(created.version, 1);
  assert.equal(created.status, 'GRANTED');
  assert.equal(revoked.version, 2);
  assert.equal(revoked.status, 'REVOKED');
  assert.equal(revoked.previous_version_id, created.id);
  assert.deepEqual(
    rows.map((row) => [row.consent_id, row.version, row.status, row.is_latest]),
    [
      ['test-consent', 2, 'REVOKED', true],
      ['test-consent', 1, 'GRANTED', false]
    ]
  );
});
