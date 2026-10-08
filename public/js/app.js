import { api, setSession, clearSession, getToken } from "./api.js";
const money = (value) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(value) || 0);
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const periodsEl = document.querySelector("#periods");
const categoriesEl = document.querySelector("#categories");
const listEl = document.querySelector("#list");
const formError = document.querySelector("#form-error");
let mode = "login";
let period = "month";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function renderPeriods() {
  periodsEl.innerHTML = "";
  [["week", "Semana"], ["month", "Mes"]].forEach(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab${period === value ? " active" : ""}`;
    button.textContent = label;
    button.addEventListener("click", async () => { period = value; await refresh(); });
    periodsEl.append(button);
  });
}
async function refresh() {
  renderPeriods();
  const data = await api(`/api/summary?period=${period}`);
  document.querySelector("#income").textContent = money(data.income);
  document.querySelector("#expense").textContent = money(data.expense);
  document.querySelector("#balance").textContent = money(data.balance);
  categoriesEl.innerHTML = "";
  data.categories.forEach((item) => {
    const box = document.createElement("article");
    box.className = `bar${item.left < 0 ? " over" : ""}`;
    const title = document.createElement("strong");
    title.textContent = item.category;
    const meta = document.createElement("small");
    meta.textContent = `${money(item.spent)} / ${money(item.limit)} \u00b7 queda ${money(item.left)}`;
    const track = document.createElement("div");
    track.className = `track${item.left < 0 ? " over" : ""}`;
    const fill = document.createElement("span");
    fill.style.width = `${item.limit ? Math.min(100, Math.round((item.spent / item.limit) * 100)) : 0}%`;
    track.append(fill);
    box.append(title, document.createTextNode(" "), meta, track);
    categoriesEl.append(box);
  });
  listEl.innerHTML = "";
  data.moves.forEach((move) => {
    const li = document.createElement("li");
    li.className = "item";
    const text = document.createElement("span");
    text.textContent = `${move.kind === "ingreso" ? "+" : "-"} ${move.title} \u00b7 ${move.category}`;
    const amount = document.createElement("strong");
    amount.textContent = money(move.amount);
    const del = document.createElement("button");
    del.className = "ghost";
    del.type = "button";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/moves/${move.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, amount, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#limit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  await api("/api/limits", { method: "POST", body: JSON.stringify({ category: document.querySelector("#limit-category").value.trim(), amount: document.querySelector("#limit-amount").value, period }) });
  event.target.reset();
  await refresh();
});
document.querySelector("#move-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/moves", { method: "POST", body: JSON.stringify({ title: document.querySelector("#title").value.trim(), amount: document.querySelector("#amount").value, kind: document.querySelector("#kind").value, category: document.querySelector("#category").value.trim(), period }) });
    event.target.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
