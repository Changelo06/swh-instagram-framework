// Local-first auth for chiqo.ai.
//
// One-tenant local app — pre-provisioned users live in `server/users.json`
// (gitignored). Login sets an HMAC-signed httpOnly cookie containing the
// user id; downstream routes read `req.user` after passing through
// `requireAuth`. No JWTs, no third-party libs.
//
// Helper for adding users without hand-rolling scrypt:
//   node scripts/add-user.js <email> <password> [label]

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_PATH = path.join(__dirname, "users.json");

const COOKIE_NAME = "chiqo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Session secret. Loaded from env if set, otherwise generated once and
// persisted next to users.json so cookies survive server restarts. Living
// outside the repo (gitignored beside users.json) is fine for a local app.
const SECRET_PATH = path.join(__dirname, ".session-secret");
function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (fs.existsSync(SECRET_PATH)) return fs.readFileSync(SECRET_PATH, "utf8").trim();
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, secret + "\n", { mode: 0o600 });
  return secret;
}
const SECRET = getSessionSecret();

// ---------------------------------------------------------------------------
// User store
// ---------------------------------------------------------------------------

export function loadUsers() {
  if (!fs.existsSync(USERS_PATH)) return { users: [] };
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
  } catch (e) {
    console.error("[auth] users.json is malformed:", e.message);
    return { users: [] };
  }
}

function saveUsers(store) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(store, null, 2) + "\n", {
    mode: 0o600,
  });
}

function findUserByEmail(email) {
  const store = loadUsers();
  const lc = String(email || "").trim().toLowerCase();
  return store.users.find((u) => u.email?.toLowerCase() === lc) || null;
}

function findUserById(id) {
  const store = loadUsers();
  return store.users.find((u) => u.id === id) || null;
}

// ---------------------------------------------------------------------------
// Password hashing — scrypt is built into Node, ~64 MB / iter is fine for a
// single-machine app.
// ---------------------------------------------------------------------------

// Use Node's scrypt defaults (N=2^14, r=8, p=1) so we don't need to bump
// maxmem. That cost is plenty for a single-tenant local app — auth is a
// brake against casual access on a shared machine, not a security boundary
// against state-level attackers.
const SCRYPT_KEYLEN = 64;

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$default$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPassword(plain, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) return false;
  const parts = stored.split("$");
  if (parts.length !== 4) return false;
  const [, , saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  let actual;
  try {
    actual = crypto.scryptSync(plain, salt, expected.length);
  } catch {
    return false;
  }
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}

// ---------------------------------------------------------------------------
// Session cookie — HMAC-signed `userId.expMs.sig`. Tampering breaks the sig;
// expired tokens are rejected even with a valid sig.
// ---------------------------------------------------------------------------

function sign(payload) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
}

function makeToken(userId) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expected = sign(`${userId}.${expStr}`);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))
  ) {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return { userId };
}

function parseCookies(header) {
  const out = {};
  if (!header || typeof header !== "string") return out;
  for (const segment of header.split(";")) {
    const [name, ...rest] = segment.trim().split("=");
    if (!name) continue;
    out[name] = decodeURIComponent(rest.join("="));
  }
  return out;
}

function setSessionCookie(res, token) {
  // SameSite=Lax + httpOnly is the right posture for a local app served on
  // the same origin as the API. Don't set Secure — chiqo runs on plain http
  // localhost.
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
  );
}

// ---------------------------------------------------------------------------
// Express plumbing
// ---------------------------------------------------------------------------

// Read the session cookie (if any) and attach `req.user` for every request.
// Subsequent route handlers can choose to require it or not.
export function attachUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  const session = verifyToken(token);
  if (session) {
    const user = findUserById(session.userId);
    if (user) {
      // Strip secret fields before exposing on the request.
      const { passwordHash, ...safe } = user;
      req.user = safe;
    }
  }
  next();
}

// Reject a request unless `attachUser` resolved a user.
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "auth required" });
  }
  next();
}

export function loginRouter() {
  const router = express.Router();

  router.post("/login", express.json(), (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const user = findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      // Same message either way — don't leak which half was wrong.
      return res.status(401).json({ error: "invalid email or password" });
    }
    setSessionCookie(res, makeToken(user.id));
    res.json({
      user: { id: user.id, email: user.email, label: user.label || null },
    });
  });

  router.post("/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Tiny "who am I" endpoint the client polls on load.
  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "auth required" });
    res.json({ user: req.user });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Per-user usage logging — appends one JSONL row per model call.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "..");
const USAGE_LOG = path.join(ROOT, ".chiqo", "usage.jsonl");

// Hard-coded Anthropic prices (USD per 1M tokens) for the models we actually
// call from this app. If Anthropic changes pricing, edit here. Numbers are
// public list prices; missing models fall through to zero cost rather than
// guessing.
const PRICES_PER_MTOK = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
};

function priceFor(model) {
  return (
    PRICES_PER_MTOK[model] ||
    PRICES_PER_MTOK[String(model || "").toLowerCase()] ||
    null
  );
}

export function computeCostUsd({ model, usage }) {
  const p = priceFor(model);
  if (!p || !usage) return 0;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  const cost =
    (input * p.input +
      output * p.output +
      cacheRead * p.cacheRead +
      cacheCreate * p.cacheCreate) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6; // 6-decimal precision
}

export function logUsage({ userId, model, usage, route }) {
  try {
    const dir = path.dirname(USAGE_LOG);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const row = {
      ts: new Date().toISOString(),
      userId: userId || null,
      route: route || null,
      model: model || null,
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      cacheReadTokens: usage?.cache_read_input_tokens || 0,
      cacheCreateTokens: usage?.cache_creation_input_tokens || 0,
      costUsd: computeCostUsd({ model, usage }),
    };
    fs.appendFileSync(USAGE_LOG, JSON.stringify(row) + "\n");
  } catch (e) {
    // Usage logging is best-effort — never break the request because we
    // failed to write a metric row.
    console.warn("[auth] usage log write failed:", e.message);
  }
}

// Export for the add-user helper script.
export { saveUsers };
