// tls-check.js
import tls from 'node:tls';

const host = process.argv[2] || 'ac-vn0xsv5-shard-00-00.ccjtygn.mongodb.net';
const port = Number(process.argv[3] || 27017);

const socket = tls.connect({
  host,
  port,
  servername: host,
  rejectUnauthorized: false, // não falha por CA, só para inspecionar handshake
  timeout: 10000
}, () => {
  console.log('[tls-check] connected OK');
  console.log('[tls-check] protocol:', socket.getProtocol());
  console.log('[tls-check] cipher:', socket.getCipher());
  console.log('[tls-check] peer cert subject:', socket.getPeerCertificate().subject || '(none)');
  socket.end();
});

socket.on('error', (err) => {
  console.error('[tls-check] ERROR', err && err.message ? err.message : err);
  console.error(err && err.stack ? err.stack : '');
  process.exitCode = 1;
});
socket.on('timeout', () => {
  console.error('[tls-check] timeout');
  socket.destroy();
});