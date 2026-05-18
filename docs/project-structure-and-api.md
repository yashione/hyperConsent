# Project Structure and Code Documentation

This document describes the project layout, core classes, data models, and important functions in the consent-management application.

## Project Overview

`hyperConsent` is a local-testable MVP for append-only consent records. It contains:

- A Go Hyperledger Fabric smart contract for ledger records.
- A Node.js gateway that talks to Fabric, or runs in mock mode for local development.
- A FastAPI backend that handles authentication and exposes REST endpoints to the frontend.
- A React/Vite frontend for creating, granting, revoking, and viewing consent records.
- Docker configuration for running the application services together.

Consent changes are immutable. Creating a consent writes version `v000001`; revoke/grant actions create `v000002`, `v000003`, and so on. Older versions are kept for history.

## Top-Level Structure

```text
.
|-- README.md
|-- .env.example
|-- backend/
|   `-- fastapi/
|       |-- main.py
|       |-- auth.py
|       |-- models.py
|       |-- requirements.txt
|       `-- tests/
|-- blockchain/
|   |-- chaincode/
|   |   `-- consent/
|   |       |-- consent_chaincode.go
|   |       |-- go.mod
|   |       `-- go.sum
|   `-- test-network/
|-- docker/
|   |-- backend.Dockerfile
|   |-- frontend.Dockerfile
|   |-- gateway.Dockerfile
|   `-- docker-compose.yml
|-- docs/
|   |-- implementation-notes.md
|   `-- project-structure-and-api.md
|-- frontend/
|   |-- index.html
|   |-- package.json
|   `-- src/
|       |-- App.jsx
|       |-- services/
|       |   `-- api.js
|       `-- styles.css
|-- gateway/
|   `-- nodejs/
|       |-- connection.json
|       |-- package.json
|       |-- src/
|       |   |-- app.js
|       |   `-- contract.js
|       `-- tests/
`-- k8s/
```

## Runtime Flow

1. The user signs in through the React frontend.
2. The frontend sends credentials to FastAPI `/login`.
3. FastAPI returns a JWT bearer token.
4. Authenticated frontend requests go to FastAPI consent endpoints.
5. FastAPI validates the token and forwards consent operations to the Node gateway.
6. The Node gateway either:
   - uses an in-memory mock store when `FABRIC_MOCK` is not `false`, or
   - submits/evaluates transactions against Fabric when `FABRIC_MOCK=false`.
7. In Fabric mode, the Go smart contract stores versioned consent records on the ledger.

## Backend: FastAPI

Location: `backend/fastapi`

### `models.py`

Defines Pydantic models used by the API.

#### `Token`

Response model for login.

Fields:

- `access_token`: JWT token string.
- `token_type`: Token type, currently `bearer`.

#### `User`

Represents an authenticated API user.

Fields:

- `username`: User identifier.

#### `ConsentRequest`

Request body for creating consent records.

Fields:

- `user_id`: Owner of the consent. Required.
- `consumer_id`: Consumer organization requesting consent. Required.
- `purpose`: Purpose for using the data. Required.
- `status`: Either `GRANTED` or `REVOKED`. Defaults to `GRANTED`.

#### `ConsentResponse`

Response model for consent records. It extends `ConsentRequest`.

Additional fields:

- `id`: Version-specific ledger/storage key, such as `CONSENT#abc#v000001`.
- `consent_id`: Stable consent identifier shared by all versions.
- `version`: Numeric version.
- `action`: Action that created the version, either `GRANTED` or `REVOKED`.
- `previous_version_id`: Version key for the previous record, if any.
- `is_latest`: Whether this is the latest known version.
- `created_at`: Creation timestamp.
- `updated_at`: Update timestamp.

### `auth.py`

Provides demo authentication and JWT handling.

#### Constants

- `SECRET_KEY`: JWT signing secret. It is currently a development value and should be changed for production.
- `ALGORITHM`: JWT algorithm, currently `HS256`.
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Token lifetime in minutes.
- `DEMO_USERS`: In-memory demo credentials for `alice` and `admin`.

#### `create_access_token(data: dict) -> str`

Creates a signed JWT from the supplied payload and adds an expiry timestamp.

#### `authenticate_user(username: str, password: str) -> User | None`

Checks the supplied credentials against `DEMO_USERS`. Returns a `User` when credentials are valid, otherwise `None`.

#### `login_for_token(form_data: OAuth2PasswordRequestForm) -> Token`

FastAPI dependency used by `/login`. It validates username/password form data and returns a bearer token. Invalid credentials return HTTP `401`.

#### `get_current_user(token: str) -> User`

FastAPI dependency for protected routes. It decodes and validates the bearer token, then returns the authenticated `User`. Invalid tokens return HTTP `401`.

### `main.py`

Defines the FastAPI application, CORS configuration, and REST routes.

#### Constants

- `GATEWAY_URL`: Base URL for the Node gateway. Defaults to `http://localhost:3001`.
- `DEFAULT_CORS_ORIGINS`: Local frontend origins allowed during development.

#### `health()`

Route: `GET /health`

Returns API health status.

#### `system_status()`

Route: `GET /system/status`

Returns API health plus gateway health/mode.

#### `login(token: Token)`

Route: `POST /login`

Returns the token generated by `login_for_token`.

#### `gateway_request(method: str, path: str, **kwargs)`

Shared helper for forwarding requests from FastAPI to the Node gateway. It raises `HTTPException` if the gateway returns an error status.

#### `create_consent(request: ConsentRequest, current_user: User)`

Route: `POST /consents`

Creates a consent record. A normal user can only create consent for their own `user_id`; `admin` can create consent for any user.

#### `read_consent(consent_id: str, _current_user: User)`

Route: `GET /consents/{consent_id}`

Returns the latest version of one consent.

#### `read_consent_history(consent_id: str, _current_user: User)`

Route: `GET /consents/{consent_id}/history`

Returns all versions for one consent.

#### `list_consents(user_id, consumer_id, status, current_user)`

Route: `GET /consents`

Lists consent records. If `user_id` is not supplied, it defaults to the authenticated user's username.

#### `revoke_consent(consent_id: str, _current_user: User)`

Route: `PUT /consents/{consent_id}/revoke`

Creates a new `REVOKED` version of the consent.

#### `grant_consent(consent_id: str, _current_user: User)`

Route: `PUT /consents/{consent_id}/grant`

Creates a new `GRANTED` version of the consent.

## Gateway: Node.js

Location: `gateway/nodejs`

The gateway exposes HTTP endpoints for the backend and contains the integration layer for mock mode and Fabric mode.

### `src/app.js`

Express HTTP server.

#### `GET /health`

Returns gateway health and current mode: `mock` or `fabric`.

#### `POST /consents`

Creates a consent. If the request does not include an `id`, the server generates a UUID.

#### `GET /consents/:id`

Returns the latest version of a consent.

#### `GET /consents/:id/history`

Returns all versions of a consent.

#### `GET /consents`

Lists consent records. Supports filters passed as query parameters.

#### `PUT /consents/:id/revoke`

Appends a revoked version.

#### `PUT /consents/:id/grant`

Appends a granted version.

#### Error Middleware

Converts thrown errors into JSON responses. Messages containing `not found` return HTTP `404`; other gateway errors return HTTP `400`.

### `src/contract.js`

Business logic and Fabric integration.

#### Module State

- `mode`: `fabric` only when `FABRIC_MOCK=false`; otherwise `mock`.
- `store`: In-memory `Map` used by mock mode.

#### `versionId(consentId, version)`

Builds the version key format: `CONSENT#<consentId>#v000001`.

#### `isValidStatus(status)`

Returns `true` only for `GRANTED` and `REVOKED`.

#### `latestConsent(consentId)`

Finds the highest version of a consent in the mock store.

#### `withLatestFlags(consents)`

Marks each consent object with `is_latest` and sorts records by consent/version/date.

#### `applyFilters(consents, filters = {})`

Applies optional `user_id`, `consumer_id`, and `status` filters.

#### `createConsent(id, userId, consumerId, purpose, status = 'GRANTED')`

Creates version `1` of a consent. In Fabric mode, it submits `CreateConsent`. In mock mode, it validates input and stores the first version in memory.

#### `getConsent(id)`

Returns the latest version of a consent. In Fabric mode, it evaluates `GetConsent`.

#### `listConsents(filters = {})`

Returns matching consent records. In Fabric mode, it uses the most specific available Fabric query, then applies remaining filters in JavaScript.

#### `getConsentHistory(id)`

Returns all versions for a consent.

#### `revokeConsent(id)`

Appends a `REVOKED` version by calling `appendConsentAction`.

#### `grantConsent(id)`

Appends a `GRANTED` version by calling `appendConsentAction`.

#### `appendConsentAction(id, status)`

Shared implementation for grant/revoke changes. It refuses to append a duplicate action when the latest version already has the requested status.

#### `submitFabric(functionName, args, id)`

Connects to Fabric, submits a transaction, then reads back the latest consent.

#### `evaluateFabric(functionName, args)`

Connects to Fabric, evaluates a transaction, and parses the JSON response.

#### `connectFabric()`

Builds a Fabric Gateway connection using environment variables for certificates, private key, TLS certificate, peer endpoint, channel, and chaincode name.

## Blockchain: Go Chaincode

Location: `blockchain/chaincode/consent/consent_chaincode.go`

### `SmartContract`

Fabric contract type. It embeds `contractapi.Contract` and exposes transaction functions.

### `Consent`

Ledger record type for one consent version.

Fields:

- `DocType`: Document type, currently `consent_version`.
- `ID`: Version-specific key.
- `ConsentID`: Stable consent ID.
- `Version`: Version number.
- `UserID`: Consent owner.
- `ConsumerID`: Data consumer.
- `Purpose`: Data usage purpose.
- `Status`: Current status for this version.
- `Action`: Action that created this version.
- `PreviousVersionID`: Previous version key.
- `CreatedAt`: Creation timestamp.
- `UpdatedAt`: Update timestamp.

### Chaincode Functions

#### `CreateConsent(ctx, id, userID, consumerID, purpose, status) error`

Validates input, checks that the consent does not already exist, and writes version `1`.

#### `GetConsent(ctx, id) (*Consent, error)`

Returns the latest version of a consent.

#### `RevokeConsent(ctx, id) error`

Appends a new `REVOKED` version.

#### `GrantConsent(ctx, id) error`

Appends a new `GRANTED` version.

#### `appendConsentAction(ctx, id, status) error`

Internal helper for `GrantConsent` and `RevokeConsent`. It reads the latest consent, prevents duplicate status transitions, creates the next version, and writes it to the ledger.

#### `ConsentExists(ctx, id) (bool, error)`

Checks whether version `1` exists for a consent ID.

#### `GetConsentsByUser(ctx, userID) ([]*Consent, error)`

Queries consent versions by `user_id`.

#### `GetConsentsByConsumer(ctx, consumerID) ([]*Consent, error)`

Queries consent versions by `consumer_id`.

#### `GetConsentsByStatus(ctx, status) ([]*Consent, error)`

Queries consent versions by `status`.

#### `GetConsentHistory(ctx, id) ([]*Consent, error)`

Reads versions from `1` upward until no more versions exist.

#### `queryConsentsBySelector(ctx, selector) ([]*Consent, error)`

Builds a CouchDB selector query and delegates to `queryConsents`.

#### `getLatestConsentVersion(ctx, id) (*Consent, error)`

Finds the highest stored version for a consent ID.

#### `getConsentVersion(ctx, id, version) (*Consent, error)`

Reads and unmarshals one version record.

#### `queryConsents(ctx, query) ([]*Consent, error)`

Runs a rich query against the ledger state database and sorts results.

#### `consentVersionKey(id, version) string`

Builds deterministic ledger keys in the format `CONSENT#<id>#v000001`.

#### `isValidConsentStatus(status) bool`

Allows only `GRANTED` or `REVOKED`.

#### `main()`

Creates and starts the Fabric chaincode server.

## Frontend: React

Location: `frontend`

### `src/App.jsx`

Main React component for the application.

#### State Values

- `token`: JWT token stored in local storage after login.
- `username`: Current username. Defaults to `alice`.
- `password`: Login password input. Defaults to `alice123`.
- `consents`: List of consent records shown in the table.
- `systemMode`: Gateway mode from `/system/status`.
- `form`: New-consent form data.
- `message`: Error or notice text.

#### `refresh()`

Loads consent records for the signed-in user.

#### `login(event)`

Submits credentials, stores the token and username, and enters the main app screen.

#### `createConsent(event)`

Creates a consent for the current user and refreshes the list.

#### `revoke(id)`

Revokes the latest version of a consent and refreshes the list.

#### `grant(id)`

Grants the latest version of a consent and refreshes the list.

### `src/services/api.js`

Small API client for the React app.

#### `request(path, options = {})`

Shared fetch wrapper. It parses JSON responses and throws an `Error` when the API response is not successful.

#### `api.status()`

Calls `GET /system/status`.

#### `api.login(username, password)`

Calls `POST /login` using `URLSearchParams` form data.

#### `api.listConsents(token)`

Calls `GET /consents` with bearer authorization.

#### `api.createConsent(token, payload)`

Calls `POST /consents` with JSON payload and bearer authorization.

#### `api.revokeConsent(token, id)`

Calls `PUT /consents/{id}/revoke`.

#### `api.grantConsent(token, id)`

Calls `PUT /consents/{id}/grant`.

## Tests

### `backend/fastapi/tests/test_auth.py`

Covers login success and login failure for the FastAPI app.

### `gateway/nodejs/tests/contract.test.js`

Covers mock gateway versioning behavior. It verifies that revoke and grant actions append new versions and preserve old versions.

## Configuration

Important environment variables:

- `GATEWAY_URL`: FastAPI to Node gateway URL.
- `CORS_ORIGINS`: Comma-separated frontend origins allowed by FastAPI.
- `FABRIC_MOCK`: Set to `false` to use real Fabric mode.
- `FABRIC_CCP`: Fabric connection profile path.
- `FABRIC_MSP_ID`: Fabric MSP ID.
- `FABRIC_CERT_PATH`: Fabric client certificate path.
- `FABRIC_KEY_PATH`: Fabric private key path.
- `FABRIC_TLS_CERT_PATH`: Fabric peer TLS certificate path.
- `FABRIC_PEER_ENDPOINT`: Fabric peer endpoint.
- `FABRIC_PEER_HOST_ALIAS`: TLS host alias for the peer.
- `FABRIC_CHANNEL`: Fabric channel name.
- `FABRIC_CHAINCODE`: Fabric chaincode name.
- `VITE_API_URL`: Frontend API base URL.

## Docker and Deployment Files

### `docker/docker-compose.yml`

Defines local application services for backend, frontend, and gateway.

### `docker/backend.Dockerfile`

Builds the FastAPI backend container.

### `docker/frontend.Dockerfile`

Builds the React/Vite frontend container.

### `docker/gateway.Dockerfile`

Builds the Node.js gateway container.

### `k8s/`

Reserved for Kubernetes manifests or deployment configuration.
