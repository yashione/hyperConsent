const crypto = require('crypto');

const variations = [
  'alice|HJ|OPO|GRANTED|1|0',
  'alice|HJ|OPO|GRANTED|1',
  'alice|HJ|OPO|GRANTED|1|undefined',
  'alice|HJ|OPO|GRANTED|1|null',
  'alice|HJ|OPO|GRANTED|1|',
  'alice|HJ|OPO|GRANTED|1|0|',
  'alice|HJ|OPO|GRANTED|1|0|',
  // What if properties were undefined/empty?
  'undefined|undefined|undefined|undefined|1|0',
  'alice|bank-a|testing-purpose|GRANTED|1|0',
  'alice|bank-a|testing-purpose|GRANTED|1',
  // Let's check with userId/consumerId property names
  // If the object used userId instead of user_id, consent.user_id would be undefined
  'undefined|HJ|OPO|GRANTED|1|0',
  'alice|undefined|OPO|GRANTED|1|0',
  'undefined|undefined|OPO|GRANTED|1|0',
  'undefined|HJ|OPO|GRANTED|1',
];

const target = '7a63b942052fbbae6aab7d4a54c0d49eb5de2612cdb4d0632ca60e20acdccc4e';

for (const v of variations) {
  const hash = crypto.createHash('sha256').update(v).digest('hex');
  console.log(`Payload: "${v}" -> Hash: ${hash} [${hash === target ? 'MATCH!!!' : 'NO'}]`);
}
