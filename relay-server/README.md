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
cd .\relay-server
node src/server.js
```

4. Test endpoints (in a separate terminal so the server keeps running):

```powershell
Invoke-RestMethod -Method GET -Uri 'http://127.0.0.1:8081/health'
Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:8081/api/users' -ContentType 'application/json' -Body (ConvertTo-Json @{ email='test@example.com'; password='Senha123!' })
Invoke-RestMethod -Method POST -Uri 'http://127.0.0.1:8081/api/auth/login' -ContentType 'application/json' -Body (ConvertTo-Json @{ email='test@example.com'; password='Senha123!' })
```

## Deploy to Render (what we did)

1. Create a new Web Service in Render that points to this repo/branch (`relay-server-deploy`).
2. In the Render dashboard > Environment > set the environment variables:
   - `MONGODB_URI` (Atlas connection string)
   - `MONGODB_DB` (set to `dumbmirror-test` for testing)
   - `JWT_SECRET`
   - Remove any `ALLOW_INSECURE_MONGO` variable (or leave unset / 0).
3. Start the service. Check Logs > Live tail for startup messages.

## If you hit TLS / connection failures in Render

1. Confirm Atlas IP Access List includes the Render instance's public IP(s) — if you don't have those, temporarily add `0.0.0.0/0` to test connectivity.
2. Open Render Shell and run the same diagnostic scripts (`node relay-server/tls-check.js ...` and `node relay-server/test-mongo.js`) to reproduce the error from the Render host.
3. If TLS fails in Render but works locally after adding your dev IP, likely Atlas is blocking Render IPs or the cluster is Private Endpoint-only.

## Security notes

- Do not keep `0.0.0.0/0` on the Atlas allowlist longer than necessary. For an academic project on free tiers it's convenient, but insecure.
- Prefer private networking / VPC peering / Private Endpoint when available for production workloads.

## Smoke tests (recommended)

- After deploy, run:
```powershell
Invoke-RestMethod -Method GET -Uri 'https://<your-render-service>/health'
Invoke-RestMethod -Method POST -Uri 'https://<your-render-service>/api/users' -ContentType 'application/json' -Body (ConvertTo-Json @{ email='rendertest@example.com'; password='Senha123!' })
```

## What I changed during debugging

- Added connection and insert logs to `src/db.js` to surface connection errors and the inserted user id.
- Removed an insecure TLS fallback (previously enabled via `ALLOW_INSECURE_MONGO`) and committed that change.

If you want, I can add a short smoke-test script in the repo to run the health + login sequence automatically.

---
If anything here is unclear or you want me to add the smoke-test script and wire a CI job, tell me and I can implement it next.
