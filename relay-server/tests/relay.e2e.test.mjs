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
let mongoReady = true;

async function resetDatabase() {
	if (!mongoReady) return;
	const client = new MongoClient(memoryUri);
	await client.connect();
	const db = client.db(dbName);
	const collections = await db.collections();
	await Promise.all(collections.map((collection) => collection.deleteMany({})));
	await client.close();
}

test.before(async (t) => {
	try {
		memoryServer = await MongoMemoryServer.create();
		memoryUri = memoryServer.getUri();
		configureDatabase({ mongoUri: memoryUri, mongoDbName: dbName });
	} catch (error) {
		mongoReady = false;
		t.log(`[tests] MongoMemoryServer indisponível: ${error.message}`);
	}
});

test.beforeEach(async () => {
	await resetDatabase();
});

test.after.always(async () => {
	if (!mongoReady) {
		return;
	}
	await disconnectDatabase();
	if (memoryServer) {
		await memoryServer.stop();
	}
});

function connectMirrorSocket(baseUrl, mirrorId, secret) {
	return new Promise((resolve, reject) => {
		const socket = ioClient(`${baseUrl.replace("http", "ws")}/mirror`, {
			transports: ["websocket"],
			reconnection: false
		});

		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error("mirror auth timeout"));
		}, 5000);

		const cleanup = () => {
			clearTimeout(timeout);
			socket.off("connect", onConnect);
			socket.off("auth-success", onAuthSuccess);
			socket.off("auth-error", onAuthError);
			socket.off("connect_error", onConnectError);
		};

		const onConnect = () => {
			socket.emit("authenticate", { mirrorId, secret });
		};

		const onAuthSuccess = () => {
			cleanup();
			resolve(socket);
		};

		const onAuthError = (error) => {
			cleanup();
			reject(new Error(error?.error || "mirror auth error"));
		};

		const onConnectError = (error) => {
			cleanup();
			reject(error);
		};

		socket.on("connect", onConnect);
		socket.on("auth-success", onAuthSuccess);
		socket.on("auth-error", onAuthError);
		socket.on("connect_error", onConnectError);
	});
}

test.serial("user lifecycle, mirror registration and command flow", async (t) => {
	if (!mongoReady) {
		t.log("MongoMemoryServer indisponível; teste ignorado.");
		t.pass();
		return;
	}

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

		const mirrorSocket = await connectMirrorSocket(baseUrl, mirrorId, secret);

		const commandPromise = new Promise((resolve) => {
			mirrorSocket.on("execute-command", (payload) => resolve(payload));
		});

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

test.serial("sensor endpoints expose latest, summary and report", async (t) => {
	if (!mongoReady) {
		t.log("MongoMemoryServer indisponível; teste ignorado.");
		t.pass();
		return;
	}

	const relay = createRelayServer({ configOverride: { port: 0 } });
	const port = await relay.start();
	const baseUrl = `http://127.0.0.1:${port}`;

	try {
		const registerResponse = await request(baseUrl)
			.post("/api/users")
			.send({ email: "sensor@example.com", password: "secret" })
			.expect(201);

		const token = registerResponse.body.token;

		const mirrorResponse = await request(baseUrl)
			.post("/api/mirrors")
			.set("Authorization", `Bearer ${token}`)
			.send({ name: "Espelho Sensores" })
			.expect(201);

		const { id: mirrorId, secret } = mirrorResponse.body.mirror;

		const mirrorSocket = await connectMirrorSocket(baseUrl, mirrorId, secret);

		const now = Date.now();
		const latestPayload = {
			ts: now - 1000,
			temperature: 22.5,
			humidity: 55.1,
			light: 120,
			motion: 1
		};

		mirrorSocket.emit("mirror-event", {
			notification: "SENSORDATA_REMOTE_UPDATE",
			payload: latestPayload
		});

		const summaryPayload = {
			ts: now,
			temperature: { avg: 22.5, min: 21.8, max: 23.2 },
			humidity: { avg: 55.1 },
			light: { avg: 120 },
			motion: { ratio: 0.2, events: 3 }
		};

		mirrorSocket.emit("mirror-event", {
			notification: "SENSORDATA_SUMMARY",
			payload: summaryPayload
		});

		const reportPayload = {
			generatedAt: now,
			range: { from: now - 3600000, to: now },
			stats: {
				temperature: { avg: 22.5 },
				humidity: { avg: 55.1 }
			}
		};

		mirrorSocket.emit("mirror-event", {
			notification: "SENSORDATA_REPORT_BROADCAST",
			payload: reportPayload
		});

		await new Promise((resolve) => setTimeout(resolve, 50));

		const latestResponse = await request(baseUrl)
			.get(`/api/mirrors/${mirrorId}/sensors/latest`)
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		t.is(latestResponse.body.sensor.temperature, latestPayload.temperature);
		t.is(latestResponse.body.sensor.humidity, latestPayload.humidity);

		const summaryResponse = await request(baseUrl)
			.get(`/api/mirrors/${mirrorId}/sensors/summary`)
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		t.deepEqual(summaryResponse.body.summary.data, summaryPayload);

		const reportResponse = await request(baseUrl)
			.get(`/api/mirrors/${mirrorId}/sensors/report`)
			.set("Authorization", `Bearer ${token}`)
			.expect(200);

		t.deepEqual(reportResponse.body.report.data, reportPayload);

		mirrorSocket.close();
	} finally {
		await relay.stop();
	}
});
