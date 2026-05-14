const assert = require('node:assert/strict');
const test = require('node:test');

const contract = require('../src/contract');

test('mock gateway appends a revoke version instead of overwriting', async () => {
  const created = await contract.createConsent('test-consent', 'alice', 'bank-a', 'KYC', 'GRANTED');
  const revoked = await contract.revokeConsent('test-consent');
  const granted = await contract.grantConsent('test-consent');
  const rows = await contract.listConsents({ user_id: 'alice' });

  assert.equal(created.version, 1);
  assert.equal(created.status, 'GRANTED');
  assert.equal(revoked.version, 2);
  assert.equal(revoked.status, 'REVOKED');
  assert.equal(revoked.previous_version_id, created.id);
  assert.equal(granted.version, 3);
  assert.equal(granted.status, 'GRANTED');
  assert.equal(granted.previous_version_id, revoked.id);
  assert.deepEqual(
    rows.map((row) => [row.consent_id, row.version, row.status, row.is_latest]),
    [
      ['test-consent', 3, 'GRANTED', true],
      ['test-consent', 2, 'REVOKED', false],
      ['test-consent', 1, 'GRANTED', false]
    ]
  );
});
