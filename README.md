# Consent Management MVP

Local testable MVP for append-only consent records using Hyperledger Fabric chaincode, a Node.js Fabric Gateway, FastAPI, and React.

## Structure

- `blockchain/chaincode/consent`: Go chaincode and CouchDB indexes.
- `gateway/nodejs`: HTTP gateway for Fabric transaction submit/query calls. It runs in mock mode by default for local UI/API development.
- `backend/fastapi`: REST API, JWT login, and consent endpoints.
- `frontend`: React/Vite consent UI.
- `docker`: Dockerfiles and compose setup for the application services.

Consent changes are versioned. A revoke action creates `CONSENT#<id>#v000002` instead of overwriting `CONSENT#<id>#v000001`.

By default the Docker app runs in mock gateway mode (`FABRIC_MOCK=true`). That mode uses an in-memory JavaScript `Map` so the API and UI can be tested before Fabric certificates are configured. It is not writing to a real Fabric ledger until `FABRIC_MOCK=false` and Fabric identity/TLS variables are provided.

## Quick Start In Mock Mode

```bash
cd ~/consent-management
docker compose -f docker/docker-compose.yml up --build
```

Open `http://localhost:5174` and sign in with. If you are running Vite manually, `http://localhost:5173` is also allowed by the backend CORS config.

- username: `alice`
- password: `alice123`

The Docker gateway is exposed on `http://localhost:3002` because `3001` was already in use locally. Backend-to-gateway traffic still uses the internal Docker service port `3001`.

## Run Services Manually

Gateway:

```bash
cd gateway/nodejs
npm install
FABRIC_MOCK=true npm run dev
```

Backend:

```bash
cd backend/fastapi
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Deploy Chaincode To Fabric Test Network

The Fabric samples are already under `blockchain/`. From the test network folder:

```bash
cd blockchain/test-network
./network.sh up createChannel -s couchdb
./network.sh deployCC -ccn consentcc -ccp ../chaincode/consent -ccl go
```

Set `FABRIC_MOCK=false` and provide the gateway Fabric certificate/key/TLS environment variables when you want the Node gateway to use the real network.
