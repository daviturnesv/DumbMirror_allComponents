import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { findUserByEmail, getUserById } from "./db.js";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function generateUserToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: TOKEN_TTL_SECONDS });
}

export async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header missing" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    req.user = { id: user.id, email: user.email };
    return next();
  } catch (error) {
    console.warn("[auth] Token verification failed", error.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function validateUserCredentials(email, password) {
  const existing = await findUserByEmail(email);
  if (!existing) return null;
  const isValid = await bcrypt.compare(password, existing.passwordHash);
  if (!isValid) return null;
  return { id: existing.id, email: existing.email };
}
