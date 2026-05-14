# Implementation Notes

This workspace follows the executive summary with a Phase 1-first layout.

## Current MVP Mode

The Node gateway defaults to `FABRIC_MOCK=true`, which keeps append-only consent version records in memory. This lets the FastAPI backend and React frontend run before Fabric certificates and wallets are wired in.

Each consent record is stored as a versioned ledger entry:

- `CONSENT#<consent_id>#v000001` for the original grant/revoke decision.
- `CONSENT#<consent_id>#v000002` and onward for later changes such as revoke or grant.

Older versions are never overwritten. The current state is derived by reading the highest version for a consent ID.

## Fabric Mode

To use the real Fabric network:

1. Start the Fabric test network with CouchDB.
2. Deploy `blockchain/chaincode/consent` as `consentcc`.
3. Set `FABRIC_MOCK=false`.
4. Provide these gateway variables:
   - `FABRIC_CERT_PATH`
   - `FABRIC_KEY_PATH`
   - `FABRIC_TLS_CERT_PATH`
   - `FABRIC_PEER_ENDPOINT`
   - `FABRIC_PEER_HOST_ALIAS`
   - `FABRIC_CHANNEL`
   - `FABRIC_CHAINCODE`

The real-network configuration is intentionally environment-driven so local certificates and private keys stay out of source control.
