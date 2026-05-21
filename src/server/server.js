const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const { createAuthMiddleware } = require("./auth");
const { readState, writeState, compareUpdatedAt } = require("./state-store");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(process.cwd(), "public");
const CLIENT_DIR = path.join(process.cwd(), "src", "client");
const isDev = process.env.NODE_ENV === "development";

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

async function installFrontend() {
  if (!isDev) {
    app.use("/src/client", express.static(CLIENT_DIR, {
      etag: true,
      maxAge: "1h"
    }));
  }

  app.use(express.static(PUBLIC_DIR, {
    etag: true,
    index: false,
    maxAge: isDev ? 0 : "1h"
  }));

  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      appType: "custom",
      server: { middlewareMode: true }
    });
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      try {
        const templatePath = path.join(PUBLIC_DIR, "index.template.html");
        const template = await fs.readFile(templatePath, "utf8");
        const html = await vite.transformIndexHtml(
          req.originalUrl,
          template
            .replace("    <!-- RYTHM_CLIENT_CSS -->", "")
            .replace("    <!-- RYTHM_CLIENT_JS -->", '    <script type="module" src="/src/client/main.ts"></script>')
        );
        res.status(200).type("html").send(html);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });
    return;
  }

  app.get("*", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
  });
}

function installErrorHandler() {
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ ok: false, code: "SERVER_ERROR" });
  });
}

async function main() {
  await installFrontend();
  installErrorHandler();
  app.listen(PORT, () => {
    console.log(`rythm listening on http://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
