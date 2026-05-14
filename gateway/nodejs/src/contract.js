const fs = require('fs/promises');
const path = require('path');

const mode = process.env.FABRIC_MOCK === 'false' ? 'fabric' : 'mock';
const store = new Map();

function versionId(consentId, version) {
  return `CONSENT#${consentId}#v${String(version).padStart(6, '0')}`;
}

function isValidStatus(status) {
  return status === 'GRANTED' || status === 'REVOKED';
}

function latestConsent(consentId) {
  return [...store.values()]
    .filter((consent) => consent.consent_id === consentId)
    .sort((a, b) => b.version - a.version)[0];
}

function withLatestFlags(consents) {
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

function applyFilters(consents, filters = {}) {
  return consents.filter((consent) => {
    return (!filters.user_id || consent.user_id === filters.user_id)
      && (!filters.consumer_id || consent.consumer_id === filters.consumer_id)
      && (!filters.status || consent.status === filters.status);
  });
}

async function createConsent(id, userId, consumerId, purpose, status = 'GRANTED') {
  if (!id || !userId || !consumerId || !purpose || !status) {
    throw new Error('id, user_id, consumer_id, purpose, and status are required');
  }
  if (!isValidStatus(status)) {
    throw new Error('status must be GRANTED or REVOKED');
  }
  if (mode === 'fabric') {
    return submitFabric('CreateConsent', [id, userId, consumerId, purpose, status], id);
  }

  if (latestConsent(id)) {
    throw new Error(`consent ${id} already exists`);
  }
  const now = new Date().toISOString();
  const key = versionId(id, 1);
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
  store.set(key, consent);
  return consent;
}

async function getConsent(id) {
  if (mode === 'fabric') {
    return evaluateFabric('GetConsent', [id]);
  }
  const consent = latestConsent(id);
  if (!consent) {
    throw new Error(`consent ${id} not found`);
  }
  return { ...consent, is_latest: true };
}

async function listConsents(filters = {}) {
  if (mode === 'fabric') {
    let consents = [];
    if (filters.user_id) consents = await evaluateFabric('GetConsentsByUser', [filters.user_id]);
    else if (filters.consumer_id) consents = await evaluateFabric('GetConsentsByConsumer', [filters.consumer_id]);
    else if (filters.status) consents = await evaluateFabric('GetConsentsByStatus', [filters.status]);
    return withLatestFlags(applyFilters(consents, filters));
  }

  return withLatestFlags(applyFilters([...store.values()], filters));
}

async function getConsentHistory(id) {
  if (mode === 'fabric') {
    return withLatestFlags(await evaluateFabric('GetConsentHistory', [id]));
  }

  const consents = [...store.values()].filter((consent) => consent.consent_id === id);
  if (!consents.length) {
    throw new Error(`consent ${id} not found`);
  }
  return withLatestFlags(consents);
}

async function revokeConsent(id) {
  return appendConsentAction(id, 'REVOKED');
}

async function grantConsent(id) {
  return appendConsentAction(id, 'GRANTED');
}

async function appendConsentAction(id, status) {
  if (mode === 'fabric') {
    const transactionName = status === 'GRANTED' ? 'GrantConsent' : 'RevokeConsent';
    await submitFabric(transactionName, [id], id);
    return evaluateFabric('GetConsent', [id]);
  }

  const consent = await getConsent(id);
  if (consent.status === status) {
    throw new Error(`consent ${id} is already ${status}`);
  }

  const now = new Date().toISOString();
  const nextVersion = consent.version + 1;
  const key = versionId(id, nextVersion);
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
  store.set(key, next);
  return next;
}

async function submitFabric(functionName, args, id) {
  const contract = await connectFabric();
  await contract.submitTransaction(functionName, ...args);
  return evaluateFabric('GetConsent', [id]);
}

async function evaluateFabric(functionName, args) {
  const contract = await connectFabric();
  const bytes = await contract.evaluateTransaction(functionName, ...args);
  return JSON.parse(Buffer.from(bytes).toString('utf8'));
}

async function connectFabric() {
  const { connect, signers } = require('@hyperledger/fabric-gateway');
  const grpc = require('@grpc/grpc-js');
  const crypto = require('crypto');

  const ccpPath = process.env.FABRIC_CCP || path.resolve(__dirname, '../connection.json');
  const mspId = process.env.FABRIC_MSP_ID || 'Org1MSP';
  const certPath = process.env.FABRIC_CERT_PATH;
  const keyPath = process.env.FABRIC_KEY_PATH;
  const tlsCertPath = process.env.FABRIC_TLS_CERT_PATH;
  const peerEndpoint = process.env.FABRIC_PEER_ENDPOINT || 'localhost:7051';
  const peerHostAlias = process.env.FABRIC_PEER_HOST_ALIAS || 'peer0.org1.example.com';
  const channelName = process.env.FABRIC_CHANNEL || 'mychannel';
  const chaincodeName = process.env.FABRIC_CHAINCODE || 'consentcc';

  await fs.access(ccpPath).catch(() => {});
  const tlsRootCert = await fs.readFile(tlsCertPath);
  const client = new grpc.Client(peerEndpoint, grpc.credentials.createSsl(tlsRootCert), {
    'grpc.ssl_target_name_override': peerHostAlias
  });
  const credentials = {
    mspId,
    credentials: await fs.readFile(certPath)
  };
  const privateKey = crypto.createPrivateKey(await fs.readFile(keyPath));
  const signer = signers.newPrivateKeySigner(privateKey);
  const gateway = connect({ client, identity: credentials, signer });
  return gateway.getNetwork(channelName).getContract(chaincodeName);
}

module.exports = {
  mode,
  createConsent,
  getConsent,
  listConsents,
  getConsentHistory,
  grantConsent,
  revokeConsent
};
