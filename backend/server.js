// backend/server.js
// Requisitos: npm i express cors sqlite3 bcrypt jsonwebtoken dotenv
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// (opcional) mailer: sólo se usará si MAILER_ENABLED=true
import { verifyMailer, sendWelcomeEmail, sendOrderEmail, sendOrderAdminEmail } from "./mailer.js";

dotenv.config();

// ---------- App ----------
const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());

// ---------- CORS ----------
const rawOrigins = (process.env.CLIENT_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
// si no hay CLIENT_ORIGIN, permitir todo (útil para pruebas)
const corsOptions = rawOrigins.length
  ? {
      origin: (origin, cb) => {
        if (!origin || rawOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS not allowed: " + origin));
      },
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }
  : { origin: true, credentials: true };

app.use(cors(corsOptions));

// ---------- Paths/DB ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(DB_PATH);

// Helpers sqlite3 (promesas)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Cargar schema.sql (idempotente)
try {
  const schemaPath = path.join(__dirname, "schema.sql");
  if (fs.existsSync(schemaPath)) {
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    const stmts = schemaSql
      .split(";")
      .map(s => s.trim())
      .filter(Boolean);
    (async () => {
      for (const s of stmts) {
        await run(s);
      }
      console.log("Schema aplicado.");
    })();
  } else {
    console.log("schema.sql no encontrado (se asume creado).");
  }
} catch (e) {
  console.error("Error aplicando schema:", e);
}

// ---------- Config ----------
const JWT_SECRET = process.env.JWT_SECRET || "supersecreto123";
const MAILER_ENABLED = String(process.env.MAILER_ENABLED || "false") === "true";

// ---------- Semilla admins ----------
async function seedAdmins() {
  const seedPath = path.join(__dirname, "admins.seed.json");
  if (!fs.existsSync(seedPath)) {
    console.log("admins.seed.json no encontrado: omito seed.");
    return;
  }
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(seedPath, "utf8"))
      .map(x => ({
        email: String(x.email || "").toLowerCase().trim(),
        password: String(x.password || ""),
      }))
      .filter(x => x.email && x.password);
  } catch (e) {
    console.error("admins.seed.json inválido:", e);
    return;
  }

  let ok = 0;
  for (const { email, password } of entries) {
    try {
      const hash = await bcrypt.hash(password, 10);
      try {
        await run("INSERT INTO users (email,password_hash,is_admin) VALUES (?,?,1)", [email, hash]);
        ok++;
      } catch (e1) {
        if (String(e1).includes("UNIQUE")) {
          await run("UPDATE users SET password_hash=?, is_admin=1 WHERE email=?", [hash, email]);
          ok++;
        } else {
          console.error("Error semillando admin:", email, e1);
        }
      }
    } catch (e) {
      console.error("Error hash/seed:", email, e);
    }
  }
  console.log(`Admins semillados/actualizados: ${ok}`);
}

// ---------- Auth ----------
function signUser(row) {
  const user = { id: row.id, email: row.email, is_admin: !!row.is_admin };
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
  return { user, token };
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido" });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: "Solo admin" });
  next();
}

// ---------- Rutas básicas/health ----------
app.get("/", (_req, res) => res.send("Backend funcionando 🚀"));
app.get("/healthz", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------- Productos ----------
const VALID_SECTIONS = new Set(["index", "catalog"]);

app.get("/api/products", async (req, res) => {
  try {
    const { section } = req.query || {};
    if (section && section !== "all" && !VALID_SECTIONS.has(section)) {
      return res.status(400).json({ error: "section inválida" });
    }
    const sql =
      section && section !== "all"
        ? "SELECT * FROM products WHERE section=? ORDER BY id DESC"
        : "SELECT * FROM products ORDER BY id DESC";
    const rows = await all(sql, section && section !== "all" ? [section] : []);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/products", auth, adminOnly, async (req, res) => {
  try {
    let { name, price, image, section } = req.body || {};
    if (!name || price == null || !section)
      return res.status(400).json({ error: "name, price, section requeridos" });
    if (!VALID_SECTIONS.has(section)) return res.status(400).json({ error: "section inválida" });
    price = Number(price);
    const r = await run(
      "INSERT INTO products (name,price,image,section) VALUES (?,?,?,?)",
      [name, price, image || null, section]
    );
    const row = await get("SELECT * FROM products WHERE id=?", [r.lastID]);
    res.json(row);
  } catch (e) {
    if (String(e).includes("UNIQUE"))
      return res.status(409).json({ error: "Producto duplicado (name+section)" });
    res.status(500).json({ error: "DB error" });
  }
});

app.put("/api/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, price, image, section } = req.body || {};
    if (section && !VALID_SECTIONS.has(section)) return res.status(400).json({ error: "section inválida" });

    const fields = [];
    const params = [];
    if (name != null) { fields.push("name=?"); params.push(name); }
    if (price != null) { fields.push("price=?"); params.push(Number(price)); }
    if (image !== undefined) { fields.push("image=?"); params.push(image || null); }
    if (section != null) { fields.push("section=?"); params.push(section); }
    if (!fields.length) return res.status(400).json({ error: "Nada para actualizar" });

    params.push(id);
    await run(`UPDATE products SET ${fields.join(", ")} WHERE id=?`, params);
    const row = await get("SELECT * FROM products WHERE id=?", [id]);
    res.json(row);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.delete("/api/products/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await run("DELETE FROM products WHERE id=?", [id]);
    res.json({ ok: true, deleted: r.changes });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ---------- Auth/usuario ----------
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email y password requeridos" });
  try {
    const hash = await bcrypt.hash(password, 10);
    await run("INSERT INTO users (email,password_hash,is_admin) VALUES (?,?,0)", [email.toLowerCase(), hash]);
    const row = await get("SELECT * FROM users WHERE email=?", [email.toLowerCase()]);
    const { user, token } = signUser(row);
    if (MAILER_ENABLED) {
      sendWelcomeEmail(email).catch(e => console.log("Error mail bienvenida:", e?.message || e));
    }
    res.json({ user, token });
  } catch (err) {
    if (String(err).includes("UNIQUE")) return res.status(409).json({ error: "Email ya registrado" });
    return res.status(500).json({ error: "DB error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email y password requeridos" });
  try {
    const row = await get("SELECT * FROM users WHERE email=?", [email.toLowerCase()]);
    if (!row) return res.status(401).json({ error: "Credenciales inválidas" });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciales inválidas" });
    const { user, token } = signUser(row);
    res.json({ user, token });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

// ---------- Checkout ----------
app.post("/api/checkout", auth, async (req, res) => {
  const { items, cardNumber, phone } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Carrito vacío" });
  if (!/^\d{16}$/.test(String(cardNumber || ""))) return res.status(400).json({ error: "Tarjeta inválida" });

  const phoneStr = String(phone || "").trim();
  const digits = phoneStr.replace(/\D/g, "");
  const phoneSyntaxOk = /^\+?[\d\s\-()]+$/.test(phoneStr) && digits.length >= 8 && digits.length <= 15;
  if (!phoneSyntaxOk) return res.status(400).json({ error: "Teléfono inválido" });

  const ids = items.map(i => Number(i.productId)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: "Items inválidos" });
  const placeholders = ids.map(() => "?").join(",");

  try {
    const rows = await all(`SELECT id, name, price FROM products WHERE id IN (${placeholders})`, ids);
    const priceMap = Object.fromEntries(rows.map(r => [r.id, Number(r.price)]));
    const nameMap  = Object.fromEntries(rows.map(r => [r.id, r.name]));

    let total = 0;
    const safeItems = items
      .map(it => {
        const pid = Number(it.productId);
        const q = Math.max(1, Number(it.quantity || 1));
        const price = priceMap[pid];
        if (price == null) return null;
        total += price * q;
        return { product_id: pid, quantity: q, price };
      })
      .filter(Boolean);

    if (!safeItems.length) return res.status(400).json({ error: "Items inválidos" });

    const ins = await run("INSERT INTO orders (user_id,total) VALUES (?,?)", [req.user.id, total]);
    const orderId = ins.lastID;

    for (const it of safeItems) {
      await run(
        "INSERT INTO order_items (order_id,product_id,quantity,price) VALUES (?,?,?,?)",
        [orderId, it.product_id, it.quantity, it.price]
      );
    }

    const itemsForEmail = safeItems.map(it => ({
      name: nameMap[it.product_id] || `Producto #${it.product_id}`,
      quantity: it.quantity,
      price: it.price,
    }));

    if (MAILER_ENABLED) {
      sendOrderEmail(req.user.email, { orderId, total, items: itemsForEmail })
        .catch(e => console.log("Error mail orden cliente:", e?.message || e));

      if (process.env.ADMIN_NOTIFY) {
        sendOrderAdminEmail(process.env.ADMIN_NOTIFY, {
          orderId,
          total,
          items: itemsForEmail,
          buyerEmail: req.user.email,
          buyerPhone: phoneStr,
        }).catch(e => console.log("Error mail orden admin:", e?.message || e));
      }
    } else {
      console.log("Mailer deshabilitado. Orden:", { orderId, total });
    }

    res.json({ ok: true, orderId, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});

// ---------- Start ----------
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
  await seedAdmins();
  if (MAILER_ENABLED) {
    try {
      await verifyMailer();
    } catch (e) {
      console.log("verifyMailer error:", e?.message || e);
    }
  }
  console.log("DB lista");
});
