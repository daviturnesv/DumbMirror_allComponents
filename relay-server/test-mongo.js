// test-mongo-insecure.js
import { MongoClient } from "mongodb";

const uri = process.env.TEST_MONGO_URI || process.env.MONGODB_URI || "PASTE_YOUR_URI_HERE";
const dbName = process.env.TEST_MONGO_DB || process.env.MONGODB_DB || "dumbmirror";

async function run() {
  console.log('[local-test] Using URI (host part):', uri.split('@').pop?.()?.slice?.(0,120) ?? uri);
  // Attempt insecure connection (tlsAllowInvalidCertificates true) for debug
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true
  });
  try {
    console.log('[local-test] connecting (insecure) ...');
    await client.connect();
    console.log('[local-test] connected (insecure).');
    const db = client.db(dbName);
    const sample = await db.collection('users').findOne({});
    console.log('[local-test] sample user keys:', sample ? Object.keys(sample) : 'no docs');
  } catch (err) {
    console.error('[local-test] insecure error:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
  } finally {
    try { await client.close(); } catch (_) {}
  }
}
run();