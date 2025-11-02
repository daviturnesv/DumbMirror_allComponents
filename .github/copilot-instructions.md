# DumbMirror AI Guide

## Idioma Padrão
- Sempre responda em português do Brasil (pt-BR), tanto na conversa quanto em comentários ou mensagens geradas no código.

## Architecture & Flow
- DumbMirror is split into a Relay service (`src/`), MagicMirror front-end (`MagicMirror-master-Original/`), and mobile/IoT clients; the Relay brokers commands between authenticated users and mirrors.
- REST endpoints let the Android app register/login and administer mirrors, while Socket.IO (`/mirror` namespace) pushes commands to MagicMirror instances that authenticate with `mirrorId` + `secret`.
- MongoDB Atlas stores `users` and `mirrors`; IDs are surfaced as strings so client code never manipulates `ObjectId`s directly.

## Relay Server Implementation
- `src/server.js` creates the Express app, wires auth, mirror CRUD, and socket behaviors; reuse the provided `asyncHandler` helper and `authenticateRequest` middleware for new routes.
- Database helpers in `src/db.js` handle hashing (bcrypt) and ensure indexes—always call these instead of touching Mongo collections directly.
- `src/auth.js` centralizes JWT creation/validation (`Bearer` tokens, 7-day TTL); new protected routes must call `authenticateRequest` to populate `req.user`.
- Error responses consistently return `{ error: string }`; keep that format for client expectations and existing tests.

## Local Dev & Testing
- Install Node 18+, `npm install`, then `npm run dev` for hot reload or `npm start` for static run; env vars live in `.env` (see `relay-server/README.md`).
- `tests/relay.e2e.test.mjs` runs with Ava + `mongodb-memory-server`; mimic this pattern for new tests to avoid real Atlas dependencies.
- `npm test` exercises the Ava suite; curl-based smoke scripts (`relay-server/smoke-test.js`) hit `/health`, `/api/users`, `/api/auth/login` against local or Render deployments (`SMOKE_URL`).
- TLS debugging helpers (`relay-server/tls-check.js`, `relay-server/test-mongo.js`) expect env vars and are the canonical way to verify Atlas connectivity before running the service.

## MagicMirror Integration
- The sample MagicMirror config at `MagicMirror-master-Original/config/config.js` shows how mirrors connect: update `relayUrl`, `mirrorId`, and `secret` per environment when testing.
- Mirrors must emit `authenticate` with the secret immediately after connecting; server broadcasts `mirror-status` and `command-result`, so custom modules should listen for those events.
- MagicMirror modules under `MagicMirror-master-Original/modules/` are mostly stock; project-specific work should live in dedicated modules rather than patching the core.

## Patterns & Conventions
- All new routes should be added to `src/server.js`; keep request validation minimal but explicit (return `400` with `{ error }` for missing fields).
- Use `configureDatabase` if you need to override connection details inside tests or scripts; production code reads from `config` only once.
- Socket handlers store state in the `mirrorConnections` map (`mirrorId` -> `{ socket, ownerId, lastSeen }`); extend that structure instead of creating parallel registries.
- Log using `console.*` with `[context]` prefixes, matching existing style for easier Render log filtering.

## Legacy Notes
- The old SQLite scripts in `scripts/list.mjs` and `scripts/reset-db.mjs` are stale (reference removed APIs); avoid invoking them until they are rewritten for MongoDB.
- `README_SUMMARY.md` in `relay-server/` documents the Atlas/Render migration—consult it before changing deployment assumptions.
