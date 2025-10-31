#!/usr/bin/env node
// Simple smoke test: checks /health, creates a user and logs in.
const BASE = process.env.SMOKE_URL || process.env.RENDER_URL || 'http://127.0.0.1:8081';
const email = process.env.SMOKE_EMAIL || `smoke-${Date.now()}@example.com`;
const password = process.env.SMOKE_PASS || 'SmokePwd123!';

async function req(path, opts = {}){
  const url = `${BASE}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch(e){ body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function run(){
  console.log('[smoke] base:', BASE);
  console.log('[smoke] health -> GET /health');
  let r = await req('/health');
  if(!r.ok){ console.error('[smoke] health failed', r.status, r.body); process.exit(2); }
  console.log('[smoke] health ok:', r.body);

  console.log('[smoke] creating user', email);
  r = await req('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if(!r.ok){ console.error('[smoke] create user failed', r.status, r.body); process.exit(3); }
  console.log('[smoke] created:', r.body && r.body.user && r.body.user.id);

  console.log('[smoke] logging in');
  r = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if(!r.ok){ console.error('[smoke] login failed', r.status, r.body); process.exit(4); }
  console.log('[smoke] login ok, token length=', r.body && r.body.token ? r.body.token.length : 0);

  console.log('[smoke] SUCCESS');
  process.exit(0);
}

run().catch(err => { console.error('[smoke] error', err && err.stack || err); process.exit(10); });
