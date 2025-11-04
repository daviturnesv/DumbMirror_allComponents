relay-server — setup & debugging

This small README documents the steps used to configure and test the relay-server with MongoDB Atlas and Render (how we debugged TLS/connection issues and how to run the service locally).

Important: this project is academic. The instructions below trade some production-hardening for convenience. Do NOT use `0.0.0.0/0` in a real production environment.

## Environment variables (required)

- `MONGODB_URI` — full connection string to your Atlas cluster (SRV or standard connection string). Example: `mongodb+srv://<user>:<password>@sensordata.ccjtygn.mongodb.net` or long form.
- `MONGODB_DB` — database name to use (e.g. `dumbmirror-test`).
- `JWT_SECRET` — secret used to sign JWT tokens.
- `ALLOW_INSECURE_MONGO` — removed from production; used only previously for debugging. Do not set this in production.

## Quick local testing

1. Make sure your machine IP is added to the Atlas IP Access List (Project > Network Access). For fast debugging you can temporarily add `0.0.0.0/0` — but remove it afterwards.

2. Run TLS diagnostic (repo includes helper scripts):

```powershell
# From repo root
# Test TLS handshake to a shard host
node .\relay-server\tls-check.js ac-vn0xsv5-shard-00-00.ccjtygn.mongodb.net 27017

# Run a small Mongo connection script that uses MONGODB_URI env var
node .\relay-server\test-mongo.js
```

3. Start server locally (set env vars in the same terminal):

```powershell
$env:MONGODB_URI = "<your uri>"
$env:MONGODB_DB = "dumbmirror-test"
$env:JWT_SECRET = "some-secret"
# Ensure ALLOW_INSECURE_MONGO is NOT set
Remove-Item Env:\ALLOW_INSECURE_MONGO -ErrorAction SilentlyContinue
# DumbMirror Relay Server

Relay service that brokers commands between the DumbMirror Android app and MagicMirror installations, enabling remote control even when the mirror and app are on different networks.

## Features

- REST API for user registration, login, mirror provisioning, and command dispatch
- Socket.IO namespace (`/mirror`) for mirrors to maintain persistent connections
- Command forwarding with online/offline awareness
- SQLite persistence using `better-sqlite3`

## Getting Started

```bash
cp .env.example .env
npm install
npm run start
```

The server listens on the port defined by `PORT` (default `8081`).

### REST Endpoints

- `POST /api/users` — register a new account `{ email, password }`
- `POST /api/auth/login` — authenticate and receive a JWT `{ email, password }`
- `GET /api/auth/me` — verify current token; returns `{ user: { id, email } }`
- `GET /api/mirrors` — list mirrors owned by the authenticated user
- `POST /api/mirrors` — create a mirror; response returns generated `secret`
- `GET /api/mirrors/:mirrorId/status` — retrieve online status and last heartbeat
- `POST /api/mirrors/:mirrorId/commands` — forward a notification/payload to the connected mirror

All `/api/*` routes (except user creation/login) require a bearer token in the `Authorization` header.

### Mirror Socket Protocol

Mirrors connect to `ws(s)://<host>:<port>/mirror` using Socket.IO and must immediately emit:

```json
{
	"mirrorId": "UUID returned by /api/mirrors",
	"secret": "secret returned by /api/mirrors"
}
```

Events:

- `authenticate` — mirror -> server; server replies with `auth-success` or `auth-error`
- `execute-command` — server -> mirror; payload `{ commandId, notification, payload }`
- `command-result` — mirror -> server; payload `{ commandId, success, data }`
- `heartbeat` — mirror -> server (optional periodic ping)
- `mirror-status` — broadcast to `/mirror` namespace clients on connect/disconnect

### Development Scripts

- `npm run dev` — start server with automatic reload via nodemon
- `npm run lint` — run ESLint on source files

## Roadmap

- Add refresh tokens and token revocation
- Persist command audit log
- Implement mirror-side module to consume this protocol
- Harden validation rate limiting and TLS termination guidance

---

## relay-server — setup & debugging

This small README documents the steps used to configure and test the relay-server with MongoDB Atlas and Render (how we debugged TLS/connection issues and how to run the service locally).

Important: this project is academic. The instructions below trade some production-hardening for convenience. Do NOT use `0.0.0.0/0` in a real production environment.

## Environment variables (required)

- `MONGODB_URI` — full connection string to your Atlas cluster (SRV or standard connection string). Example: `mongodb+srv://<user>:<password>@sensordata.ccjtygn.mongodb.net` or long form.
- `MONGODB_DB` — database name to use (e.g. `dumbmirror-test`).
- `JWT_SECRET` — secret used to sign JWT tokens.
- `ALLOW_INSECURE_MONGO` — removed from production; used only previously for debugging. Do not set this in production.

## Quick local testing

1. Make sure your machine IP is added to the Atlas IP Access List (Project > Network Access). For fast debugging you can temporarily add `0.0.0.0/0` — but remove it afterwards.

2. Run TLS diagnostic (repo includes helper scripts):

```powershell
# From repo root
# Test TLS handshake to a shard host
node .\relay-server\tls-check.js ac-vn0xsv5-shard-00-00.ccjtygn.mongodb.net 27017

# Run a small Mongo connection script that uses MONGODB_URI env var
node .\relay-server\test-mongo.js
```

3. Start server locally (set env vars in the same terminal):

```powershell
$env:MONGODB_URI = "<your uri>"
$env:MONGODB_DB = "dumbmirror-test"
$env:JWT_SECRET = "some-secret"
# Ensure ALLOW_INSECURE_MONGO is NOT set
Remove-Item Env:\ALLOW_INSECURE_MONGO -ErrorAction SilentlyContinue
cd .\relay-server
node src/server.js
```

4. Test endpoints (in a separate terminal so the server keeps running):

```powershell
Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:8081/health'
Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:8081/api/users' -ContentType 'application/json' -Body (ConvertTo-Json @{ email='test@example.com'; password='Senha123!' })
Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:8081/api/auth/login' -ContentType 'application/json' -Body (ConvertTo-Json @{ email='test@example.com'; password='Senha123!' })
```
