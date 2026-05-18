const fs = require('fs/promises');
const path = require('path');
const IConsentRepository = require('./IConsentRepository');

/**
 * Concrete implementation of IConsentRepository backed by Hyperledger Fabric Gateway.
 * Used in production or integration environments to interact with the real ledger.
 */
class FabricConsentRepository extends IConsentRepository {
  constructor() {
    super();
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
    return this.submitFabric('CreateConsent', [id, userId, consumerId, purpose, status], id);
  }

  async getConsent(id) {
    return this.evaluateFabric('GetConsent', [id]);
  }

  async listConsents(filters = {}) {
    let consents = [];
    if (filters.user_id) consents = await this.evaluateFabric('GetConsentsByUser', [filters.user_id]);
    else if (filters.consumer_id) consents = await this.evaluateFabric('GetConsentsByConsumer', [filters.consumer_id]);
    else if (filters.status) consents = await this.evaluateFabric('GetConsentsByStatus', [filters.status]);
    return this.withLatestFlags(this.applyFilters(consents, filters));
  }

  async getConsentHistory(id) {
    return this.withLatestFlags(await this.evaluateFabric('GetConsentHistory', [id]));
  }

  async revokeConsent(id) {
    await this.submitFabric('RevokeConsent', [id], id);
    return this.getConsent(id);
  }

  async grantConsent(id) {
    await this.submitFabric('GrantConsent', [id], id);
    return this.getConsent(id);
  }

  async submitFabric(functionName, args, id) {
    const contract = await this.connectFabric();
    await contract.submitTransaction(functionName, ...args);
    return this.evaluateFabric('GetConsent', [id]);
  }

  async evaluateFabric(functionName, args) {
    const contract = await this.connectFabric();
    const bytes = await contract.evaluateTransaction(functionName, ...args);
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }

  async connectFabric() {
    const { connect, signers } = require('@hyperledger/fabric-gateway');
    const grpc = require('@grpc/grpc-js');
    const crypto = require('crypto');

    // Resolved relative to src/repositories is '../../connection.json'
    const ccpPath = process.env.FABRIC_CCP || path.resolve(__dirname, '../../connection.json');
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

  async auditLedger() {
    return await this.evaluateFabric('AuditLedger', []);
  }
}

module.exports = FabricConsentRepository;
