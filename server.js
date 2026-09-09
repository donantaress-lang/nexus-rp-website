
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const DATA_FILE = process.env.SITE_DATA_PATH
  ? path.resolve(process.env.SITE_DATA_PATH)
  : path.join(process.cwd(), "data", "site-data.json");

const SESSIONS = new Map();

function ensureDataFile() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      settings: {},
      factions: [],
      factionServers: [],
      administration: [],
      applications: []
    }, null, 2), "utf8");
  }
}

function readData() {
  ensureDataFile();
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { settings: {}, factions: [], factionServers: [], administration: [], applications: [] };
  }
}

function writeData(value) {
  ensureDataFile();
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, DATA_FILE);
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || "").split(";").forEach(part => {
    const [key, ...rest] = part.trim().split("=");
    if (key) out[key] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function sessionCookie(value, maxAge = 86400) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `nexus_admin=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function cleanupSessions() {
  const now = Date.now();
  for (const [id, session] of SESSIONS) {
    if (!session || session.expiresAt <= now) SESSIONS.delete(id);
  }
}

function getSession(req) {
  cleanupSessions();
  const id = parseCookies(req).nexus_admin;
  const session = SESSIONS.get(id);
  if (!session) return null;
  session.expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  return { id, session };
}

function sendJson(res, status, payload, extra = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extra
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(String(text));
}

async function readJsonBody(req, maxBytes = 1_000_000) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function publicData() {
  const data = readData();
  return {
    settings: data.settings || {},
    factions: Array.isArray(data.factions) ? data.factions : [],
    factionServers: Array.isArray(data.factionServers) ? data.factionServers : [],
    administration: Array.isArray(data.administration) ? data.administration : []
  };
}

function sanitizeSavePayload(input) {
  return {
    settings: input?.settings && typeof input.settings === "object" ? input.settings : {},
    factions: Array.isArray(input?.factions) ? input.factions.slice(0, 50) : [],
    factionServers: Array.isArray(input?.factionServers) ? input.factionServers.slice(0, 50) : [],
    administration: Array.isArray(input?.administration) ? input.administration.slice(0, 200) : [],
    applications: Array.isArray(input?.applications) ? input.applications.slice(-3000) : []
  };
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
  }[ext] || "application/octet-stream";
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  let decoded;
  try { decoded = decodeURIComponent(requested); }
  catch { return sendText(res, 400, "Bad request"); }

  const target = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (!target.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return sendText(res, 404, "Not found");

  res.writeHead(200, {
    "Content-Type": contentType(target),
    "Cache-Control": target.endsWith(".html") ? "no-cache" : "public, max-age=300"
  });
  fs.createReadStream(target).pipe(res);
}

function adminPassword() {
  return String(process.env.WEBSITE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "");
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/public") {
    return sendJson(res, 200, { ok: true, data: publicData() });
  }

  if (req.method === "POST" && pathname === "/api/applications") {
    let body;
    try { body = await readJsonBody(req); }
    catch { return sendJson(res, 400, { ok: false, error: "Niepoprawne dane." }); }

    const factionId = String(body?.factionId || "").slice(0, 80);
    const discord = String(body?.discord || "").trim().slice(0, 120);
    const roblox = String(body?.roblox || "").trim().slice(0, 120);
    const age = String(body?.age || "").trim().slice(0, 20);
    const experience = String(body?.experience || "").trim().slice(0, 1500);
    const motivation = String(body?.motivation || "").trim().slice(0, 2000);

    if (!factionId || !discord || !roblox || !motivation) {
      return sendJson(res, 400, { ok: false, error: "Uzupełnij wymagane pola." });
    }

    const data = readData();
    const faction = (data.factions || []).find(item => String(item.id) === factionId);
    if (!faction || faction.status !== "open") {
      return sendJson(res, 400, { ok: false, error: "Rekrutacja do tej frakcji jest zamknięta." });
    }

    data.applications ??= [];
    const record = {
      id: `app_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
      factionId,
      factionName: faction.name,
      discord,
      roblox,
      age,
      experience,
      motivation,
      status: "new",
      createdAt: new Date().toISOString()
    };
    data.applications.push(record);
    data.applications = data.applications.slice(-3000);
    writeData(data);

    return sendJson(res, 201, { ok: true, applicationId: record.id });
  }

  if (req.method === "POST" && pathname === "/api/admin/login") {
    const configured = adminPassword();
    if (configured.length < 8) {
      return sendJson(res, 503, { ok: false, error: "Administrator nie skonfigurował hasła WEBSITE_ADMIN_PASSWORD." });
    }

    let body;
    try { body = await readJsonBody(req, 50_000); }
    catch { return sendJson(res, 400, { ok: false, error: "Niepoprawne dane." }); }

    const password = String(body?.password || "");
    const a = Buffer.from(password);
    const b = Buffer.from(configured);
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches) return sendJson(res, 401, { ok: false, error: "Nieprawidłowe hasło." });

    const id = crypto.randomBytes(36).toString("base64url");
    SESSIONS.set(id, { createdAt: Date.now(), expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(id) });
  }

  if (req.method === "POST" && pathname === "/api/admin/logout") {
    const session = getSession(req);
    if (session) SESSIONS.delete(session.id);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!getSession(req)) return sendJson(res, 401, { ok: false, error: "UNAUTHORIZED" });

    if (req.method === "GET" && pathname === "/api/admin/data") {
      return sendJson(res, 200, { ok: true, data: readData() });
    }

    if (req.method === "PUT" && pathname === "/api/admin/data") {
      let body;
      try { body = await readJsonBody(req); }
      catch { return sendJson(res, 400, { ok: false, error: "Niepoprawne dane." }); }

      const clean = sanitizeSavePayload(body?.data);
      writeData(clean);
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { ok: false, error: "NOT_FOUND" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/health") {
      return sendJson(res, 200, {
        ok: true,
        service: "Nexus RP Website",
        adminConfigured: adminPassword().length >= 8,
        dataPath: DATA_FILE
      });
    }

    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (url.pathname === "/admin") return serveStatic(res, "/admin.html");
    if (
      url.pathname === "/polityka-prywatnosci" ||
      url.pathname === "/privacy" ||
      url.pathname === "/polityka-prywatnosci/"
    ) {
      return serveStatic(res, "/privacy.html");
    }
    return serveStatic(res, url.pathname);
  } catch (error) {
    console.error("Website error:", error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "SERVER_ERROR" });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🌐 Nexus RP Website działa na porcie ${PORT}`);
  console.log(`🔐 Panel admina: /admin`);
  console.log(`💾 Dane strony: ${DATA_FILE}`);
  if (adminPassword().length < 8) {
    console.warn("⚠️ Ustaw WEBSITE_ADMIN_PASSWORD (minimum 8 znaków), aby włączyć logowanie administratora.");
  }
});

setInterval(cleanupSessions, 60_000).unref?.();
