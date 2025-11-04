import express from "express";
import http from "node:http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { config } from "./config.js";
import {
  createUser,
  findUserByEmail,
  createMirror,
  listMirrorsByOwner,
  getMirrorById,
  verifyMirrorSecret,
  configureDatabase,
  disconnectDatabase
} from "./db.js";
import {
  generateUserToken,
  authenticateRequest,
  validateUserCredentials
} from "./auth.js";

export function createRelayServer({ configOverride } = {}) {
  const effectiveConfig = { ...config, ...(configOverride || {}) };
  if (configOverride?.mongoUri || configOverride?.mongoDbName) {
    configureDatabase({
      mongoUri: configOverride.mongoUri,
      mongoDbName: configOverride.mongoDbName
    });
  }
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: "*"
    }
  });

  const mirrorNamespace = io.of("/mirror");
  const mirrorConnections = new Map(); // mirrorId -> { socket, ownerId, lastSeen }
  const mirrorState = new Map(); // mirrorId -> cached telemetry/state

  const getMirrorState = (mirrorId) => {
    if (!mirrorState.has(mirrorId)) {
      mirrorState.set(mirrorId, {
        sensors: {
          latest: null,
          summary: null,
          report: null
        },
        aiResponses: new Map(),
        aiResponseHistory: [],
        lastSeen: null,
        offlineSince: null
      });
    }
    return mirrorState.get(mirrorId);
  };

  const AI_RESPONSE_HISTORY_LIMIT = 50;

  const processMirrorEvent = (mirrorId, event) => {
    if (!event) {
      return null;
    }
    const receivedAt = Date.now();
    const envelope = {
      notification: event.notification || null,
      payload: event.payload ?? null,
      sender: event.sender || null,
      forwardedAt: event.forwardedAt || null,
      receivedAt
    };
    if (!envelope.notification) {
      return envelope;
    }
    const state = getMirrorState(mirrorId);
    state.lastSeen = receivedAt;

    switch (envelope.notification) {
      case "SENSORDATA_REMOTE_UPDATE": {
        const payload = envelope.payload || {};
        state.sensors.latest = {
          ts: typeof payload.ts === "number" ? payload.ts : receivedAt,
          temperature: typeof payload.temperature === "number" ? payload.temperature : null,
          humidity: typeof payload.humidity === "number" ? payload.humidity : null,
          light: typeof payload.light === "number" ? payload.light : null,
          motion: typeof payload.motion === "boolean" || typeof payload.motion === "number" ? payload.motion : null,
          forwardedAt: envelope.forwardedAt || null,
          receivedAt,
          sender: envelope.sender
        };
        break;
      }
      case "SENSORDATA_SUMMARY": {
        state.sensors.summary = {
          data: envelope.payload || null,
          forwardedAt: envelope.forwardedAt || null,
          receivedAt,
          sender: envelope.sender
        };
        break;
      }
      case "SENSORDATA_REPORT_BROADCAST": {
        state.sensors.report = {
          data: envelope.payload || null,
          forwardedAt: envelope.forwardedAt || null,
          receivedAt,
          sender: envelope.sender
        };
        break;
      }
      case "AI_RESPONSE": {
        if (envelope.payload?.requestId) {
          const response = {
            requestId: envelope.payload.requestId,
            senderId: envelope.payload.senderId || null,
            provider: envelope.payload.provider || null,
            content: envelope.payload.content ?? envelope.payload.response ?? null,
            error: envelope.payload.error || null,
            raw: envelope.payload,
            forwardedAt: envelope.forwardedAt || null,
            receivedAt,
            sender: envelope.sender
          };
          state.aiResponses.set(response.requestId, response);
          state.aiResponseHistory.push(response);
          if (state.aiResponseHistory.length > AI_RESPONSE_HISTORY_LIMIT) {
            state.aiResponseHistory.splice(0, state.aiResponseHistory.length - AI_RESPONSE_HISTORY_LIMIT);
          }
        }
        break;
      }
      default:
        break;
    }

    return envelope;
  };

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  const asyncHandler = (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error("[server] Unhandled error", error);
      next(error);
    }
  };

  app.post("/api/users", asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const user = await createUser({ email, password });
    const token = generateUserToken(user);
    res.status(201).json({ user: { id: user.id, email: user.email }, token });
  }));

  app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = await validateUserCredentials(email, password);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = generateUserToken(user);
    res.json({ user, token });
  }));

  // Returns the authenticated user resolved from the provided Bearer token
  app.get("/api/auth/me", authenticateRequest, (req, res) => {
  // req.user is set by authenticateRequest after validating and resolving the JWT
  res.json({ user: req.user });
  });

  app.get("/api/mirrors", authenticateRequest, asyncHandler(async (req, res) => {
    const mirrors = await listMirrorsByOwner(req.user.id);
    const enriched = mirrors.map((m) => {
      const connection = mirrorConnections.get(m.id);
      return {
        id: m.id,
        name: m.name,
        createdAt: m.createdAt,
        online: Boolean(connection)
      };
    });
    res.json({ mirrors: enriched });
  }));

  app.post("/api/mirrors", authenticateRequest, asyncHandler(async (req, res) => {
    const { name } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: "Mirror name is required" });
    }
    const rawSecret = randomBytes(32).toString("hex");
    const mirror = await createMirror({ ownerId: req.user.id, name, secretRaw: rawSecret });
    res.status(201).json({
      mirror: {
        id: mirror.id,
        name: mirror.name,
        createdAt: mirror.createdAt,
        secret: rawSecret
      }
    });
  }));

  app.get("/api/mirrors/:mirrorId/status", authenticateRequest, asyncHandler(async (req, res) => {
    const { mirrorId } = req.params;
    const mirror = await getMirrorById(mirrorId);
    if (!mirror || mirror.ownerId !== req.user.id) {
      return res.status(404).json({ error: "Mirror not found" });
    }
    const connection = mirrorConnections.get(mirrorId);
    const state = mirrorState.get(mirrorId);
    res.json({
      mirror: {
        id: mirrorId,
        name: mirror.name,
        online: Boolean(connection),
        lastSeen: connection?.lastSeen ?? state?.lastSeen ?? null,
        offlineSince: state?.offlineSince ?? null,
        lastSensorTs: state?.sensors?.latest?.ts ?? null
      }
    });
  }));

  app.post("/api/mirrors/:mirrorId/commands", authenticateRequest, asyncHandler(async (req, res) => {
    const { mirrorId } = req.params;
    const { notification, payload } = req.body || {};
    if (!notification) {
      return res.status(400).json({ error: "Notification is required" });
    }
    const mirror = await getMirrorById(mirrorId);
    if (!mirror || mirror.ownerId !== req.user.id) {
      return res.status(404).json({ error: "Mirror not found" });
    }
    const connection = mirrorConnections.get(mirrorId);
    if (!connection) {
      return res.status(503).json({ error: "Mirror is offline" });
    }
    const commandId = randomBytes(8).toString("hex");
    connection.socket.emit("execute-command", {
      commandId,
      notification,
      payload: payload ?? null
    });
    res.json({ status: "sent", commandId });
  }));

  app.get("/api/mirrors/:mirrorId/sensors/latest", authenticateRequest, asyncHandler(async (req, res) => {
    const { mirrorId } = req.params;
    const mirror = await getMirrorById(mirrorId);
    if (!mirror || mirror.ownerId !== req.user.id) {
      return res.status(404).json({ error: "Mirror not found" });
    }
    const state = mirrorState.get(mirrorId);
    if (!state?.sensors?.latest) {
      return res.status(404).json({ error: "No sensor data available" });
    }
    res.json({
      mirror: { id: mirrorId },
      sensor: state.sensors.latest
    });
  }));

  app.get("/api/mirrors/:mirrorId/sensors/summary", authenticateRequest, asyncHandler(async (req, res) => {
    const { mirrorId } = req.params;
    const mirror = await getMirrorById(mirrorId);
    if (!mirror || mirror.ownerId !== req.user.id) {
      return res.status(404).json({ error: "Mirror not found" });
    }
    const state = mirrorState.get(mirrorId);
    if (!state?.sensors?.summary?.data) {
      return res.status(404).json({ error: "No sensor summary available" });
    }
    res.json({
      mirror: { id: mirrorId },
      summary: state.sensors.summary
    });
  }));

  app.get("/api/mirrors/:mirrorId/sensors/report", authenticateRequest, asyncHandler(async (req, res) => {
    const { mirrorId } = req.params;
    const mirror = await getMirrorById(mirrorId);
    if (!mirror || mirror.ownerId !== req.user.id) {
      return res.status(404).json({ error: "Mirror not found" });
    }
    const state = mirrorState.get(mirrorId);
    if (!state?.sensors?.report) {
      return res.status(404).json({ error: "No sensor report available" });
    }
    res.json({
      mirror: { id: mirrorId },
      report: state.sensors.report
    });
  }));

  app.get("/api/mirrors/:mirrorId/ai/responses", authenticateRequest, asyncHandler(async (req, res) => {
    const { mirrorId } = req.params;
    const { requestId, limit } = req.query || {};
    const mirror = await getMirrorById(mirrorId);
    if (!mirror || mirror.ownerId !== req.user.id) {
      return res.status(404).json({ error: "Mirror not found" });
    }
    const state = mirrorState.get(mirrorId);
    if (!state) {
      return res.json({ mirror: { id: mirrorId }, responses: [] });
    }
    if (requestId) {
      const response = state.aiResponses.get(requestId);
      if (!response) {
        return res.status(404).json({ error: "Response not found" });
      }
      return res.json({ mirror: { id: mirrorId }, response });
    }
    const max = Math.max(1, Math.min(Number(limit) || 10, 50));
    const list = state.aiResponseHistory.slice(-max);
    res.json({ mirror: { id: mirrorId }, responses: list });
  }));

  mirrorNamespace.on("connection", (socket) => {
    console.log("[mirror] incoming connection", socket.id);

    socket.on("authenticate", async ({ mirrorId, secret }) => {
      if (!mirrorId || !secret) {
        socket.emit("auth-error", { error: "Missing mirrorId or secret" });
        socket.disconnect(true);
        return;
      }
      const isValid = await verifyMirrorSecret(mirrorId, secret);
      if (!isValid) {
        console.warn(`[mirror] authentication failed for ${mirrorId}`);
        socket.emit("auth-error", { error: "Invalid credentials" });
        socket.disconnect(true);
        return;
      }
      const mirror = await getMirrorById(mirrorId);
      mirrorConnections.set(mirrorId, {
        socket,
        ownerId: mirror.ownerId,
        lastSeen: Date.now()
      });
      socket.data.mirrorId = mirrorId;
      const state = getMirrorState(mirrorId);
      state.lastSeen = Date.now();
      state.offlineSince = null;
      console.log(`[mirror] ${mirrorId} authenticated.`);
      socket.emit("auth-success", { mirrorId });
      mirrorNamespace.emit("mirror-status", { mirrorId, online: true });
    });

  socket.on("heartbeat", () => {
    const { mirrorId } = socket.data;
    if (!mirrorId) {
      return;
    }
    const connection = mirrorConnections.get(mirrorId);
    if (connection) {
      connection.lastSeen = Date.now();
    }
    const state = mirrorState.get(mirrorId);
    if (state) {
      state.lastSeen = Date.now();
    }
  });

  socket.on("command-result", ({ commandId, success, data }) => {
    const { mirrorId } = socket.data;
    if (!mirrorId) return;
    mirrorNamespace.emit("command-result", { mirrorId, commandId, success, data });
  });

  socket.on("mirror-event", (event) => {
    const { mirrorId } = socket.data;
    if (!mirrorId) {
      return;
    }
    const envelope = processMirrorEvent(mirrorId, event);
    if (!envelope) {
      return;
    }
    mirrorNamespace.emit("mirror-event", { mirrorId, ...envelope });
  });

  socket.on("disconnect", (reason) => {
    const { mirrorId } = socket.data;
    if (mirrorId && mirrorConnections.has(mirrorId)) {
      mirrorConnections.delete(mirrorId);
      const state = getMirrorState(mirrorId);
      state.offlineSince = Date.now();
      mirrorNamespace.emit("mirror-status", { mirrorId, online: false, reason });
      console.log(`[mirror] ${mirrorId} disconnected: ${reason}`);
    }
  });
  });

  async function start() {
    return new Promise((resolve) => {
      server.listen(effectiveConfig.port, () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : effectiveConfig.port;
        console.log(`Relay server listening on port ${port}`);
        resolve(port);
      });
    });
  }

  async function stop() {
    mirrorConnections.clear();
    await new Promise((resolve) => {
      io.close(() => resolve());
    });
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (!error || error.code === "ERR_SERVER_NOT_RUNNING") {
            resolve();
            return;
          }
          reject(error);
        });
      });
    }
    await disconnectDatabase().catch((error) => {
      console.error("[server] Failed to disconnect database", error);
    });
  }

  return {
    app,
    io,
    server,
    start,
    stop,
    config: effectiveConfig
  };
}

const thisFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile)) {
  const relay = createRelayServer();
  relay.start();
}
