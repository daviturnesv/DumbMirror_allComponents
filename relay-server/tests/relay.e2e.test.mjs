import test from "ava";
import request from "supertest";
import { io as ioClient } from "socket.io-client";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createRelayServer } from "../src/server.js";
import { configureDatabase, disconnectDatabase } from "../src/db.js";

let memoryServer;
let memoryUri;
const dbName = "dumbmirror-test";

async function resetDatabase() {
  const client = new MongoClient(memoryUri);
  await client.connect();
  const db = client.db(dbName);
  const collections = await db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  await client.close();
}

test.before(async () => {
  memoryServer = await MongoMemoryServer.create();
  memoryUri = memoryServer.getUri();
  configureDatabase({ mongoUri: memoryUri, mongoDbName: dbName });
});

test.beforeEach(async () => {
  await resetDatabase();
});

test.after.always(async () => {
  await disconnectDatabase();
  if (memoryServer) {
    await memoryServer.stop();
  }
});

test.serial("user lifecycle, mirror registration and command flow", async (t) => {
  const relay = createRelayServer({ configOverride: { port: 0 } });
  const port = await relay.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const registerResponse = await request(baseUrl)
      .post("/api/users")
      .send({ email: "user@example.com", password: "secret" })
      .expect(201);

    t.truthy(registerResponse.body?.token, "token returned on registration");
    const token = registerResponse.body.token;

    const mirrorResponse = await request(baseUrl)
      .post("/api/mirrors")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Espelho Sala" })
      .expect(201);

    const { id: mirrorId, secret } = mirrorResponse.body.mirror;
    t.truthy(mirrorId);
    t.truthy(secret);

    const mirrorSocket = ioClient(`${baseUrl.replace("http", "ws")}/mirror`, {
      transports: ["websocket"],
      reconnection: false
    });

    const commandPromise = new Promise((resolve) => {
      mirrorSocket.on("execute-command", (payload) => resolve(payload));
    });

    const authPromise = new Promise((resolve) => {
      mirrorSocket.on("auth-success", resolve);
    });

    mirrorSocket.emit("authenticate", { mirrorId, secret });
    await authPromise;

    await request(baseUrl)
      .post(`/api/mirrors/${mirrorId}/commands`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notification: "TEST_NOTIFICATION", payload: { foo: "bar" } })
      .expect(200);

    const commandPayload = await commandPromise;
    t.is(commandPayload.notification, "TEST_NOTIFICATION");
    t.deepEqual(commandPayload.payload, { foo: "bar" });

    mirrorSocket.emit("command-result", {
      commandId: commandPayload.commandId,
      success: true,
      data: { ack: true }
    });

    mirrorSocket.close();
  } finally {
    await relay.stop();
  }
});
