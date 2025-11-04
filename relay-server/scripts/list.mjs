#!/usr/bin/env node
import { db } from '../src/db.js';

function listAll(emailFilter) {
  const users = db.prepare('SELECT id, email, created_at AS createdAt FROM users ORDER BY created_at DESC').all();
  const mirrors = db.prepare(`
    SELECT m.id, m.name, m.owner_id AS ownerId, m.created_at AS createdAt, u.email
    FROM mirrors m
    JOIN users u ON u.id = m.owner_id
    ORDER BY m.created_at DESC
  `).all();

  const filter = (rows) => emailFilter ? rows.filter(r => (r.email || '').toLowerCase() === emailFilter.toLowerCase()) : rows;

  console.log('=== Users ===');
  for (const u of filter(users)) {
    console.log(`- ${u.email} (id=${u.id}, createdAt=${new Date(u.createdAt).toISOString()})`);
  }

  console.log('\n=== Mirrors ===');
  for (const m of filter(mirrors)) {
    console.log(`- ${m.name} (id=${m.id}, ownerEmail=${m.email}, createdAt=${new Date(m.createdAt).toISOString()})`);
  }
}

const emailArg = process.argv[2];
listAll(emailArg);
