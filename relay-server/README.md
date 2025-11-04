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
- `GET /api/mirrors/:mirrorId/sensors/latest` — obtém a leitura mais recente transmitida pelo espelho
- `GET /api/mirrors/:mirrorId/sensors/summary` — recupera o pacote de resumo emitido quando o módulo envia `SENSORDATA_SUMMARY`
- `GET /api/mirrors/:mirrorId/sensors/report` — devolve o último relatório agregado (ex.: comandos de relatório ou resumo IA)

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
