// frontend/common.js

// =========================
//  Config API (Render / Local / Proxy Netlify)
// =========================
const PROD_API = "https://paginawebf1.onrender.com";   // <- tu backend en Render
const isLocalHost =
  ["localhost", "127.0.0.1"].includes(location.hostname) ||
  location.hostname.startsWith("192.168.");

const USE_PROXY = true;
; // <-- cámbialo a true si agregaste el _redirects en Netlify

// Si usás proxy, las llamadas van a "/api/..."; si no, directo a la URL base
const API_BASE = USE_PROXY
  ? "" // Netlify reescribe a Render
  : (isLocalHost ? "http://localhost:10000" : PROD_API);

// =========================
//  Estado global
// =========================
const store = {
  user: null,
  token: null,
  cart: JSON.parse(localStorage.getItem("cart") || "[]"),
  products: [], // cache para la página actual
};

// =========================
/** Helper para peticiones a la API */
async function api(path, options = {}) {
  const url = API_BASE + path; // si USE_PROXY=true, API_BASE=""; ej: "/api/..."
  const headers = {
    "Content-Type": "application/json",
    ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  const isJSON = (res.headers.get("content-type") || "").includes("application/json");
  const payload = isJSON ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const msg = isJSON ? (payload?.error || JSON.stringify(payload)) : String(payload || res.statusText);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload;
}

// =========================
//  AUTH
// =========================
async function login(email, password) {
  const data = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  store.token = data.token;
  store.user = data.user;
  return data.user;
}

async function register(email, password) {
  const data = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  store.token = data.token;
  store.user = data.user;
  return data.user;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  store.token = null;
  store.user = null;
  location.href = "index.html";
}

function loadMe() {
  store.token = localStorage.getItem("token");
  const u = localStorage.getItem("user");
  store.user = u ? JSON.parse(u) : null;

  // Navbar
  const btnLogin = document.getElementById("btnLogin");
  const btnLogout = document.getElementById("btnLogout");
  const userEmail = document.getElementById("userEmail");

  if (store.user) {
    btnLogin?.classList.add("d-none");
    if (btnLogout) {
      btnLogout.classList.remove("d-none");
      btnLogout.onclick = logout;
    }
    if (userEmail) userEmail.textContent = store.user.email + (store.user.is_admin ? " (admin)" : "");
  } else {
    btnLogin?.classList.remove("d-none");
    btnLogout?.classList.add("d-none");
    if (userEmail) userEmail.textContent = "";
  }
  saveCart(); // actualizar badge
}

// =========================
//  Carrito
// =========================
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(store.cart));
  const badge = document.getElementById("cartCount");
  if (!badge) return;
  badge.classList.remove("d-none");
  badge.textContent = store.cart.reduce((s, it) => s + Number(it.quantity), 0);
}

function addToCart(p) {
  let line = store.cart.find((it) => it.productId === p.id);
  if (line) line.quantity += 1;
  else store.cart.push({ productId: p.id, name: p.name, price: p.price, quantity: 1 });
  saveCart();
}

function fmt(n) {
  return Number(n).toFixed(2);
}

// =========================
//  Productos (UI)
// =========================
function productCard(p, section) {
  const adminBtns = store.user?.is_admin
    ? `<div class="mt-2 d-flex gap-2">
         <button class="btn btn-sm btn-outline-warning btn-edit" data-id="${p.id}">Editar</button>
         <button class="btn btn-sm btn-outline-danger btn-del" data-id="${p.id}">Eliminar</button>
       </div>`
    : "";
  return `
  <div class="col">
    <div class="card h-100 shadow-sm">
      <img src="${p.image || "https://via.placeholder.com/600x400?text=F1"}" class="card-img-top" alt="${p.name}">
      <div class="card-body d-flex flex-column">
        <h5 class="card-title">${p.name}</h5>
        <p class="card-text fw-bold">$ ${fmt(p.price)}</p>
        <div class="mt-auto d-grid gap-2">
          <button class="btn btn-primary btn-add" data-id="${p.id}">Agregar al carrito</button>
          ${adminBtns}
        </div>
      </div>
      <div class="card-footer text-muted small">Sección: ${section}</div>
    </div>
  </div>`;
}

async function loadProductsInto(containerId, section) {
  const root = document.getElementById(containerId);
  if (!root) return;
  const query = section ? `?section=${encodeURIComponent(section)}` : "";
  const list = await api("/api/products" + query);
  store.products = list;
  renderGrid(root, list);
  bindCardButtons(root);
}

function renderGrid(root, list) {
  if (!list.length) {
    root.innerHTML = `<div class="text-center text-muted">No hay productos.</div>`;
    return;
  }
  root.innerHTML = `<div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3">
    ${list.map((p) => productCard(p, p.section)).join("")}
  </div>`;
}

// Búsqueda live en navbar
function bindSearchFor(containerId) {
  const input = document.getElementById("searchInput");
  const root = document.getElementById(containerId);
  if (!input || !root) return;
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      renderGrid(root, store.products);
      bindCardButtons(root);
      return;
    }
    const filtered = store.products.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.price).includes(q)
    );
    renderGrid(root, filtered);
    bindCardButtons(root);
  });
}

// Botones por tarjeta (agregar, editar, borrar)
function bindCardButtons(root) {
  root.querySelectorAll(".btn-add").forEach((btn) => {
    btn.onclick = () => {
      const id = Number(btn.dataset.id);
      const p = store.products.find((x) => x.id === id);
      addToCart(p);
      const t = document.getElementById("toast");
      if (t) {
        t.classList.add("show");
        setTimeout(() => t.classList.remove("show"), 1200);
      }
    };
  });

  if (store.user?.is_admin) {
    root.querySelectorAll(".btn-del").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("¿Eliminar este producto?")) return;
        const id = Number(btn.dataset.id);
        try {
          await api(`/api/products/${id}`, { method: "DELETE" });
          const idx = store.products.findIndex((x) => x.id === id);
          if (idx >= 0) store.products.splice(idx, 1);
          renderGrid(root, store.products);
          bindCardButtons(root);
        } catch (e) {
          alert(e.message);
        }
      };
    });

    root.querySelectorAll(".btn-edit").forEach((btn) => {
      btn.onclick = async () => {
        const id = Number(btn.dataset.id);
        const p = store.products.find((x) => x.id === id);
        if (!p) return;
        const name = prompt("Nombre", p.name);
        if (name === null) return;
        const price = Number(prompt("Precio", p.price));
        if (!price && price !== 0) return;
        const image = prompt("URL de imagen (opcional)", p.image || "") || null;
        const section = prompt("Sección (index/catalog)", p.section || "index");
        if (!["index", "catalog"].includes(section)) {
          alert("Sección inválida");
          return;
        }
        try {
          const upd = await api(`/api/products/${id}`, {
            method: "PUT",
            body: JSON.stringify({ name, price, image, section }),
          });
          const i = store.products.findIndex((x) => x.id === id);
          if (i >= 0) store.products[i] = upd;
          renderGrid(root, store.products);
          bindCardButtons(root);
        } catch (e) {
          alert(e.message);
        }
      };
    });
  }
}

// =========================
//  Admin panel (crear)
// =========================
function mountAdminPanel(targetId, afterCreate) {
  if (!store.user?.is_admin) return;
  const host = document.getElementById(targetId);
  if (!host) return;
  host.innerHTML = `
    <div class="card border-0 shadow-sm mb-3">
      <div class="card-body">
        <h5 class="card-title mb-3">Admin: crear producto</h5>
        <form id="adminCreate" class="row g-2">
          <div class="col-md-3"><input class="form-control" id="pName" placeholder="Nombre" required></div>
          <div class="col-md-2"><input class="form-control" id="pPrice" type="number" step="0.01" placeholder="Precio" required></div>
          <div class="col-md-4"><input class="form-control" id="pImage" placeholder="URL de imagen (opcional)"></div>
          <div class="col-md-2">
            <select id="pSection" class="form-select" required>
              <option value="index">Index</option>
              <option value="catalog">Catálogo</option>
            </select>
          </div>
          <div class="col-md-1 d-grid"><button class="btn btn-success">Agregar</button></div>
        </form>
      </div>
    </div>`;
  const form = document.getElementById("adminCreate");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("pName").value.trim();
    const price = Number(document.getElementById("pPrice").value);
    const image = document.getElementById("pImage").value.trim() || null;
    const section = document.getElementById("pSection").value;
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({ name, price, image, section }),
      });
      document.getElementById("pName").value = "";
      document.getElementById("pPrice").value = "";
      document.getElementById("pImage").value = "";
      if (afterCreate) await afterCreate(section);
    } catch (e) {
      alert(e.message);
    }
  });
}

// =========================
//  Extra: badge del clima
// =========================
async function mountWeatherBadge() {
  const el = document.getElementById("weatherBadge");
  if (!el || !("geolocation" in navigator)) return;

  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true,
        timeout: 8000,
      })
    );
    const { latitude: lat, longitude: lon } = pos.coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`;
    const data = await (await fetch(url)).json();
    const t = Math.round(Number(data?.current?.temperature_2m ?? NaN));
    if (Number.isFinite(t)) {
      el.textContent = `🌤️ ${t}°C`;
      el.classList.remove("d-none");
    }
  } catch {
    el?.classList.add("d-none");
  }
}

// =========================
//  Exponer utilidades
// =========================
window.__APP__ = {
  api,
  login,
  register,
  logout,
  loadMe,
  saveCart,
  addToCart,
  store,
  fmt,
  loadProductsInto,
  bindSearchFor,
  mountAdminPanel,
  mountWeatherBadge,
};
