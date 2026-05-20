const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const COOKIE_NAME = "rythm_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseCookies(header) {
  const cookies = {};
  String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const index = part.indexOf("=");
      if (index === -1) return;
      cookies[part.slice(0, index)] = decodeURIComponent(part.slice(index + 1));
    });
  return cookies;
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createSessionCookie(secret) {
  const payload = JSON.stringify({ iat: Date.now(), exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(payload).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

function verifySessionCookie(token, secret) {
  if (!token || !token.includes(".")) return false;
  const [encoded, signature] = token.split(".");
  const expected = sign(encoded, secret);
  if (Buffer.byteLength(signature || "") !== Buffer.byteLength(expected)) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.exp > Date.now();
  } catch {
    return false;
  }
}

function cookieOptions(value) {
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function verifyPassword(password) {
  const hash = process.env.RYTHM_PASSWORD_HASH || "";
  if (!hash) return false;
  return bcrypt.compare(String(password || ""), hash);
}

function createAuthMiddleware(getState) {
  const secret = process.env.RYTHM_COOKIE_SECRET || "rythm-dev-secret-change-me";

  async function isAuthEnabled() {
    const state = await getState();
    return Boolean(state.settings && state.settings.authEnabled && process.env.RYTHM_PASSWORD_HASH);
  }

  async function requireAuth(req, res, next) {
    if (!(await isAuthEnabled())) {
      return next();
    }
    const cookies = parseCookies(req.headers.cookie);
    if (verifySessionCookie(cookies[COOKIE_NAME], secret)) {
      res.setHeader("Set-Cookie", cookieOptions(createSessionCookie(secret)));
      return next();
    }
    return res.status(401).json({ ok: false, code: "UNAUTHORIZED" });
  }

  async function status(req, res) {
    const enabled = await isAuthEnabled();
    const cookies = parseCookies(req.headers.cookie);
    res.json({
      ok: true,
      authEnabled: enabled,
      authenticated: !enabled || verifySessionCookie(cookies[COOKIE_NAME], secret)
    });
  }

  async function login(req, res) {
    if (!(await isAuthEnabled())) {
      return res.json({ ok: true });
    }
    if (!(await verifyPassword(req.body && req.body.password))) {
      return res.status(401).json({ ok: false, code: "BAD_PASSWORD" });
    }
    res.setHeader("Set-Cookie", cookieOptions(createSessionCookie(secret)));
    return res.json({ ok: true });
  }

  function logout(req, res) {
    res.setHeader("Set-Cookie", clearCookie());
    res.json({ ok: true });
  }

  return { requireAuth, status, login, logout };
}

module.exports = { createAuthMiddleware };
