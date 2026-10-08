import { URL } from "node:url";
import { connect, isReady, users, limits, moves, toId, mapMove } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }
function money(value) { const amount = Number(value); if (!Number.isFinite(amount) || amount <= 0) return null; return Math.round(amount * 100) / 100; }
function periodOf(value) { return value === "week" ? "week" : "month"; }
function categoryOf(value) { return String(value || "").trim().slice(0, 24) || "General"; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;
  const period = periodOf(searchParams.get("period") || "month");

  if (method === "GET" && pathname === "/api/summary") {
    const limitRows = await limits().find({ userId, period }).toArray();
    const moveRows = await moves().find({ userId, period }).toArray();
    const spentByCategory = {};
    let income = 0;
    let expense = 0;
    for (const move of moveRows) {
      if (move.kind === "ingreso") income += move.amount;
      else { expense += move.amount; spentByCategory[move.category] = (spentByCategory[move.category] || 0) + move.amount; }
    }
    const categories = limitRows.map((row) => ({ category: row.category, limit: row.amount, spent: Math.round((spentByCategory[row.category] || 0) * 100) / 100, left: Math.round((row.amount - (spentByCategory[row.category] || 0)) * 100) / 100 }));
    return sendJson(res, 200, { period, income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100, balance: Math.round((income - expense) * 100) / 100, categories, moves: moveRows.sort((a, b) => new Date(b.spentAt) - new Date(a.spentAt)).map(mapMove) });
  }
  if (method === "POST" && pathname === "/api/limits") {
    const body = await readJson(req);
    const amount = money(body.amount);
    const category = categoryOf(body.category);
    const chosen = periodOf(body.period);
    if (!amount) return sendJson(res, 400, { error: "El limite tiene que ser mayor a 0" });
    await limits().updateOne({ userId, period: chosen, category }, { $set: { amount, updatedAt: new Date() } }, { upsert: true });
    return sendJson(res, 200, { ok: true });
  }
  if (method === "POST" && pathname === "/api/moves") {
    const body = await readJson(req);
    const title = String(body.title || "").trim();
    const amount = money(body.amount);
    if (!title || !amount) return sendJson(res, 400, { error: "Concepto y monto son obligatorios" });
    const result = await moves().insertOne({ userId, title: title.slice(0, 80), amount, kind: body.kind === "ingreso" ? "ingreso" : "egreso", category: categoryOf(body.category), period: periodOf(body.period), spentAt: body.spentAt ? new Date(body.spentAt) : new Date() });
    return sendJson(res, 201, { move: mapMove(await moves().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/moves\/([a-fA-F0-9]{24})$/);
  if (match && method === "DELETE") {
    const result = await moves().deleteOne({ _id: toId(match[1]), userId });
    if (!result.deletedCount) return sendJson(res, 404, { error: "Movimiento no encontrado" });
    return sendEmpty(res, 204);
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Presupuesto en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
