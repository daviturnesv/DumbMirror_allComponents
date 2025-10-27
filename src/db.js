import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { config } from "./config.js";

let client;
let database;
const databaseConfig = {
  mongoUri: config.mongoUri,
  mongoDbName: config.mongoDbName
};

export function configureDatabase({ mongoUri, mongoDbName }) {
  if (mongoUri) {
    databaseConfig.mongoUri = mongoUri;
  }
  if (mongoDbName) {
    databaseConfig.mongoDbName = mongoDbName;
  }
  if (client) {
    throw new Error("Cannot reconfigure database after the client has been initialized");
  }
}

async function getClient() {
  if (client) {
    return client;
  }
  client = new MongoClient(databaseConfig.mongoUri, {
    maxPoolSize: 10
  });
  await client.connect();
  database = client.db(databaseConfig.mongoDbName);
  await ensureIndexes(database);
  return client;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("mirrors").createIndex({ ownerId: 1 }),
    db.collection("mirrors").createIndex({ secretHash: 1 })
  ]);
}

export async function disconnectDatabase() {
  if (client) {
    await client.close();
    client = undefined;
    database = undefined;
  }
}

async function getDb() {
  if (!database) {
    await getClient();
  }
  return database;
}

export async function createUser({ email, password }) {
  const db = await getDb();
  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = Date.now();
  const { insertedId } = await db.collection("users").insertOne({
    email,
    passwordHash,
    createdAt
  });
  return { id: insertedId.toHexString(), email, createdAt };
}

export async function findUserByEmail(email) {
  const db = await getDb();
  const user = await db.collection("users").findOne({ email });
  return normalizeUser(user);
}

export async function getUserById(id) {
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
  return normalizeUser(user);
}

function normalizeUser(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    passwordHash: doc.passwordHash,
    createdAt: doc.createdAt
  };
}

export async function createMirror({ ownerId, name, secretRaw }) {
  const db = await getDb();
  const secretHash = await bcrypt.hash(secretRaw, 10);
  const createdAt = Date.now();
  const { insertedId } = await db.collection("mirrors").insertOne({
    ownerId,
    name,
    secretHash,
    createdAt
  });
  return { id: insertedId.toHexString(), name, createdAt };
}

export async function getMirrorById(id) {
  const db = await getDb();
  const mirror = await db.collection("mirrors").findOne({ _id: new ObjectId(id) });
  return normalizeMirror(mirror);
}

export async function listMirrorsByOwner(ownerId) {
  const db = await getDb();
  const mirrors = await db.collection("mirrors")
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .toArray();
  return mirrors.map((mirror) => normalizeMirror(mirror));
}

export async function verifyMirrorSecret(mirrorId, secret) {
  const db = await getDb();
  const mirror = await db.collection("mirrors").findOne({ _id: new ObjectId(mirrorId) });
  if (!mirror) return false;
  return bcrypt.compare(secret, mirror.secretHash);
}

function normalizeMirror(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toHexString(),
    ownerId: doc.ownerId,
    name: doc.name,
    createdAt: doc.createdAt
  };
}
