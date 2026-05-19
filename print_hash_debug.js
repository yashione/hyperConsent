const crypto = require('crypto');
const ConsentHasher = require('./gateway/nodejs/src/utils/ConsentHasher');

const doc = {
  _id: "CONSENT#044198f0-5e24-43d0-9b23-a6c07ca76bd3#v000001",
  _rev: "2-4b3919bd34bb6f0ee8920329cd032560",
  docType: "consent_version",
  consent_id: "044198f0-5e24-43d0-9b23-a6c07ca76bd3",
  version: 1,
  user_id: "alice",
  consumer_id: "HJ",
  purpose: "OPO",
  status: "GRANTED",
  action: "GRANTED",
  created_at: "2026-05-19T04:33:39.259Z",
  updated_at: "2026-05-19T04:33:39.259Z",
  hash: "7a63b942052fbbae6aab7d4a54c0d49eb5de2612cdb4d0632ca60e20acdccc4e",
  previous_hash: "0"
};

const payload = [
  doc.user_id,
  doc.consumer_id,
  doc.purpose,
  doc.status,
  doc.version.toString(),
  doc.previous_hash || '0'
].join('|');

console.log('PAYLOAD:', JSON.stringify(payload));
console.log('SHA256 OF PAYLOAD:', crypto.createHash('sha256').update(payload).digest('hex'));
console.log('ConsentHasher CALLED PAYLOAD:', ConsentHasher.calculateHash(doc, doc.previous_hash));
