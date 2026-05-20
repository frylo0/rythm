const path = require("path");
const express = require("express");
const { createAuthMiddleware } = require("./auth");
const { readState, writeState, compareUpdatedAt } = require("./state-store");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(process.cwd(), "public");
const CLIENT_DIR = path.join(process.cwd(), "src", "client");

app.use(express.json({ limit: "2mb" }));

let cachedStatePromise = null;
async function getState() {
  if (!cachedStatePromise) {
    cachedStatePromise = readState();
  }
  return cachedStatePromise;
}

async function replaceState(state) {
  cachedStatePromise = Promise.resolve(state);
  await writeState(state);
}

const auth = createAuthMiddleware(getState);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "rythm" });
});

app.get("/api/auth/status", auth.status);
app.post("/api/auth/login", auth.login);
app.post("/api/auth/logout", auth.logout);

app.get("/api/state", auth.requireAuth, async (req, res, next) => {
  try {
    res.json({ ok: true, state: await getState() });
  } catch (error) {
    next(error);
  }
});

app.put("/api/state", auth.requireAuth, async (req, res, next) => {
  try {
    const incoming = req.body && req.body.state;
    if (!incoming || !incoming.updatedAt || !Array.isArray(incoming.activities) || !Array.isArray(incoming.timeline)) {
      return res.status(400).json({ ok: false, code: "BAD_STATE" });
    }
    const current = await getState();
    const force = req.query.force === "1";
    if (!force && compareUpdatedAt(current.updatedAt, incoming.updatedAt) > 0) {
      return res.status(409).json({
        ok: false,
        code: "SERVER_STATE_IS_NEWER",
        serverUpdatedAt: current.updatedAt,
        state: current
      });
    }
    await replaceState(incoming);
    return res.json({ ok: true, serverUpdatedAt: incoming.updatedAt });
  } catch (error) {
    next(error);
  }
});

app.use("/src/client", express.static(CLIENT_DIR, {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.use(express.static(PUBLIC_DIR, {
  etag: true,
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ ok: false, code: "SERVER_ERROR" });
});

app.listen(PORT, () => {
  console.log(`rythm listening on http://localhost:${PORT}`);
});
