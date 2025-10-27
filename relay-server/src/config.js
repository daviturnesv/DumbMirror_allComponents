import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const config = {
  port: Number(process.env.PORT || 8081),
  jwtSecret: process.env.JWT_SECRET || "dev-secret",
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/dumbmirror",
  mongoDbName: process.env.MONGODB_DB || "dumbmirror"
};

if (config.jwtSecret === "dev-secret") {
  console.warn("[config] Using fallback JWT secret. Please set JWT_SECRET in .env for production.");
}

if (process.env.MONGODB_URI === undefined) {
  console.warn("[config] Using fallback MongoDB URI. Please set MONGODB_URI in .env for production.");
}
