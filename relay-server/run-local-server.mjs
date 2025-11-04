import { createRelayServer } from './src/server.js';

(async function(){
  const relay = createRelayServer();
  await relay.start();
  console.log('[local-runner] Relay started and will keep running (press Ctrl+C to stop)');
  // keep process alive
  await new Promise(() => {});
})();
