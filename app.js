/* ============================================================
   Expedientes de Compras — Prototipo Fase 1
   Los datos se guardan en localStorage del navegador.
   ============================================================ */

const CHECKLIST = [
  { key: "facturas",  nombre: "Consecutivo de facturas" },
  { key: "tarjeta",   nombre: "Tarjeta de circulación" },
  { key: "refrendos", nombre: "Consecutivo de refrendos" },
  { key: "ine",       nombre: "INE del cliente" },
  { key: "csf",       nombre: "Constancia de situación fiscal" },
  { key: "baja",      nombre: "Baja de placas" },
];

const USUARIOS = [
  { id: "asesor1", nombre: "Carlos Ramírez", usuario: "asesor1", pin: "1111", rol: "asesor" },
  { id: "asesor2", nombre: "María Fernanda Ruiz", usuario: "asesor2", pin: "2222", rol: "asesor" },
  { id: "admin",   nombre: "Administración Central", usuario: "admin", pin: "9999", rol: "admin" },
];

const STORE_KEY = "expedientes_compras_v1";
const SESSION_KEY = "expedientes_sesion_v1";

let expedientes = [];
let sesion = null;          // usuario logueado
let expedienteAbierto = null;
let docEnCamara = null;     // key del documento al que se le tomará foto
let revisionActual = null;  // {expId, docKey} en revisión por admin
let tabAdmin = "pendientes";

/* ---------------- Persistencia ---------------- */

function cargar() {
  try {
    expedientes = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch (e) { expedientes = []; }
  if (expedientes.length === 0) sembrarDemo();
  const s = localStorage.getItem(SESSION_KEY);
  if (s) sesion = USUARIOS.find(u => u.id === s) || null;
}

function guardar() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(expedientes));
  } catch (e) {
    toast("⚠️ Memoria del navegador llena. Borra expedientes de prueba viejos.");
  }
}

function sembrarDemo() {
  const hoy = new Date().toISOString();
  expedientes = [
    {
      id: "exp-demo-1",
      asesorId: "asesor1",
      cliente: "Juan Pérez López (demo)",
      unidad: "Nissan Versa 2021",
      creado: hoy,
      docs: crearDocs(),
    },
  ];
  // Documento de ejemplo ya aprobado y uno en revisión
  expedientes[0].docs.ine = { estado: "aprobado", imagen: null, subido: hoy, revisado: hoy, motivo: null };
  expedientes[0].docs.tarjeta = { estado: "revision", imagen: imagenDemo(), subido: hoy, revisado: null, motivo: null };
  guardar();
}

function crearDocs() {
  const d = {};
  CHECKLIST.forEach(c => d[c.key] = { estado: "pendiente", imagen: null, subido: null, revisado: null, motivo: null });
  return d;
}

// Imagen gris de relleno para el expediente demo
function imagenDemo() {
  const c = document.createElement("canvas");
  c.width = 400; c.height = 520;
  const x = c.getContext("2d");
  x.fillStyle = "#e5e7eb"; x.fillRect(0, 0, 400, 520);
  x.fillStyle = "#6b7280"; x.font = "bold 26px sans-serif"; x.textAlign = "center";
  x.fillText("DOCUMENTO", 200, 240);
  x.fillText("DE PRUEBA", 200, 280);
  return c.toDataURL("image/jpeg", 0.7);
}

/* ---------------- Sesión ---------------- */

function doLogin() {
  const u = document.getElementById("login-user").value.trim().toLowerCase();
  const p = document.getElementById("login-pin").value.trim();
  const user = USUARIOS.find(x => x.usuario === u && x.pin === p);
  if (!user) {
    document.getElementById("login-error").classList.remove("hidden");
    return;
  }
  entrar(user);
}

function quickLogin(id) {
  entrar(USUARIOS.find(u => u.id === id));
}

function entrar(user) {
  sesion = user;
  localStorage.setItem(SESSION_KEY, user.id);
  document.getElementById("login-error").classList.add("hidden");
  render();
}

function logout() {
  sesion = null;
  expedienteAbierto = null;
  localStorage.removeItem(SESSION_KEY);
  render();
}

/* ---------------- Navegación / render ---------------- */

function mostrar(idVista) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(idVista).classList.remove("hidden");
  window.scrollTo(0, 0);
}

function render() {
  if (!sesion) { mostrar("view-login"); return; }
  if (sesion.rol === "admin") { renderAdmin(); return; }
  if (expedienteAbierto) { renderExpediente(); return; }
  renderAsesor();
}

/* ---------------- Estados derivados ---------------- */

function estadoDoc(d) { return d.estado; } // pendiente | revision | aprobado | rechazado

function resumenExpediente(exp) {
  let aprobados = 0, enRevision = 0, rechazados = 0;
  CHECKLIST.forEach(c => {
    const e = exp.docs[c.key].estado;
    if (e === "aprobado") aprobados++;
    else if (e === "revision") enRevision++;
    else if (e === "rechazado") rechazados++;
  });
  let etiqueta, clase;
  if (aprobados === CHECKLIST.length) { etiqueta = "✓ Completo"; clase = "estado-completo"; }
  else if (rechazados > 0) { etiqueta = "Requiere corrección"; clase = "estado-rechazado"; }
  else if (enRevision > 0) { etiqueta = "En revisión"; clase = "estado-revision"; }
  else { etiqueta = "En proceso"; clase = "estado-proceso"; }
  return { aprobados, enRevision, rechazados, etiqueta, clase };
}

function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/* ---------------- Vista: asesor ---------------- */

function renderAsesor() {
  mostrar("view-asesor");
  document.getElementById("asesor-nombre").textContent = sesion.nombre;

  const mios = expedientes.filter(e => e.asesorId === sesion.id);
  let completos = 0, pendientes = 0, correcciones = 0;
  mios.forEach(e => {
    const r = resumenExpediente(e);
    if (r.aprobados === CHECKLIST.length) completos++;
    else if (r.rechazados > 0) correcciones++;
    else pendientes++;
  });

  document.getElementById("asesor-stats").innerHTML = `
    <div class="stat"><b>${mios.length}</b><span>Expedientes</span></div>
    <div class="stat"><b style="color:var(--verde)">${completos}</b><span>Completos</span></div>
    <div class="stat"><b style="color:var(--rojo)">${correcciones}</b><span>Con correcciones</span></div>`;

  const cont = document.getElementById("lista-expedientes");
  if (mios.length === 0) {
    cont.innerHTML = `<div class="empty"><span class="big">📂</span>Aún no tienes expedientes.<br>Toca el botón ＋ para crear el primero.</div>`;
    return;
  }
  cont.innerHTML = mios.map(e => {
    const r = resumenExpediente(e);
    const pct = Math.round(r.aprobados / CHECKLIST.length * 100);
    return `
    <div class="card" onclick="abrirExpediente('${e.id}')">
      <div class="card-row">
        <div>
          <div class="card-title">${esc(e.cliente)}</div>
          <div class="card-sub">${esc(e.unidad || "")}${e.unidad ? " · " : ""}Creado ${fechaCorta(e.creado)}</div>
        </div>
        <span class="estado ${r.clase}">${r.etiqueta}</span>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-label">${r.aprobados}/${CHECKLIST.length} aprobados</span>
      </div>
    </div>`;
  }).join("");
}

/* ---------------- Nuevo expediente ---------------- */

function abrirNuevoExpediente() {
  document.getElementById("nuevo-cliente").value = "";
  document.getElementById("nuevo-unidad").value = "";
  document.getElementById("nuevo-error").classList.add("hidden");
  document.getElementById("modal-nuevo").classList.remove("hidden");
}

function crearExpediente() {
  const cliente = document.getElementById("nuevo-cliente").value.trim();
  if (!cliente) {
    document.getElementById("nuevo-error").classList.remove("hidden");
    return;
  }
  const exp = {
    id: "exp-" + Date.now(),
    asesorId: sesion.id,
    cliente,
    unidad: document.getElementById("nuevo-unidad").value.trim(),
    creado: new Date().toISOString(),
    docs: crearDocs(),
  };
  expedientes.unshift(exp);
  guardar();
  cerrarModal("modal-nuevo");
  abrirExpediente(exp.id);
}

/* ---------------- Vista: detalle expediente ---------------- */

function abrirExpediente(id) {
  expedienteAbierto = id;
  renderExpediente();
}

function volverDeExpediente() {
  expedienteAbierto = null;
  render();
}

function renderExpediente() {
  const exp = expedientes.find(e => e.id === expedienteAbierto);
  if (!exp) { expedienteAbierto = null; render(); return; }
  mostrar("view-expediente");

  document.getElementById("exp-cliente").textContent = exp.cliente;
  document.getElementById("exp-meta").textContent =
    (exp.unidad ? exp.unidad + " · " : "") + "Creado " + fechaCorta(exp.creado);

  const r = resumenExpediente(exp);
  const pct = Math.round(r.aprobados / CHECKLIST.length * 100);
  document.getElementById("exp-progress").style.width = pct + "%";
  document.getElementById("exp-progress-label").textContent = `${r.aprobados}/${CHECKLIST.length} aprobados`;

  const cont = document.getElementById("lista-documentos");
  cont.innerHTML = CHECKLIST.map((c, i) => {
    const d = exp.docs[c.key];
    let icono, chip;
    switch (d.estado) {
      case "aprobado":  icono = "✅"; chip = `<span class="estado estado-completo">Aprobado</span>`; break;
      case "revision":  icono = "🕒"; chip = `<span class="estado estado-revision">En revisión</span>`; break;
      case "rechazado": icono = "❌"; chip = `<span class="estado estado-rechazado">Rechazado</span>`; break;
      default:          icono = "⬜"; chip = `<span class="estado estado-proceso">Pendiente</span>`;
    }
    const puedeSubir = d.estado === "pendiente" || d.estado === "rechazado";
    return `
    <div class="doc-item">
      <div class="card-row">
        <div class="doc-nombre">${icono} ${i + 1}. ${c.nombre}</div>
        ${chip}
      </div>
      ${d.estado === "rechazado" && d.motivo ? `<div class="doc-motivo">Motivo: ${esc(d.motivo)}</div>` : ""}
      ${d.subido ? `<div class="doc-fecha">Subido: ${fechaCorta(d.subido)}${d.revisado ? " · Revisado: " + fechaCorta(d.revisado) : ""}</div>` : ""}
      <div class="doc-actions">
        ${puedeSubir ? `<button class="btn btn-primary" onclick="tomarFoto('${c.key}')">📷 ${d.estado === "rechazado" ? "Volver a subir" : "Subir foto"}</button>` : ""}
        ${d.imagen ? `<button class="btn" onclick="verFoto('${c.key}')">Ver foto</button>` : ""}
      </div>
    </div>`;
  }).join("");
}

/* ---------------- Cámara / subida ---------------- */

function tomarFoto(docKey) {
  docEnCamara = docKey;
  const input = document.getElementById("input-camara");
  input.value = "";
  input.click();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("input-camara").addEventListener("change", ev => {
    const file = ev.target.files[0];
    if (!file || !docEnCamara) return;
    comprimirImagen(file, dataUrl => {
      const exp = expedientes.find(e => e.id === expedienteAbierto);
      if (!exp) return;
      exp.docs[docEnCamara] = {
        estado: "revision",
        imagen: dataUrl,
        subido: new Date().toISOString(),
        revisado: null,
        motivo: null,
      };
      docEnCamara = null;
      guardar();
      renderExpediente();
      toast("📤 Foto enviada a revisión de Administración Central");
    });
  });
});

// Reduce la foto a máx. 1100 px y JPEG 60 % para caber en localStorage
function comprimirImagen(file, cb) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const MAX = 1100;
    let { width: w, height: h } = img;
    if (w > MAX || h > MAX) {
      const f = MAX / Math.max(w, h);
      w = Math.round(w * f); h = Math.round(h * f);
    }
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    cb(c.toDataURL("image/jpeg", 0.6));
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast("No se pudo leer la imagen."); };
  img.src = url;
}

function verFoto(docKey) {
  const exp = expedientes.find(e => e.id === expedienteAbierto);
  const c = CHECKLIST.find(x => x.key === docKey);
  document.getElementById("foto-titulo").textContent = c.nombre;
  document.getElementById("foto-img").src = exp.docs[docKey].imagen;
  document.getElementById("modal-foto").classList.remove("hidden");
}

/* ---------------- Vista: administración ---------------- */

function adminTab(t) {
  tabAdmin = t;
  document.getElementById("tab-pendientes").classList.toggle("active", t === "pendientes");
  document.getElementById("tab-todos").classList.toggle("active", t === "todos");
  renderAdmin();
}

function renderAdmin() {
  mostrar("view-admin");

  // Cola de documentos por revisar
  const cola = [];
  expedientes.forEach(exp => {
    CHECKLIST.forEach(c => {
      if (exp.docs[c.key].estado === "revision") {
        cola.push({ exp, doc: c, data: exp.docs[c.key] });
      }
    });
  });
  document.getElementById("badge-pendientes").textContent = cola.length;

  const cont = document.getElementById("admin-lista");

  if (tabAdmin === "pendientes") {
    if (cola.length === 0) {
      cont.innerHTML = `<div class="empty"><span class="big">🎉</span>No hay documentos pendientes de revisar.</div>`;
      return;
    }
    cont.innerHTML = cola.map(item => {
      const asesor = USUARIOS.find(u => u.id === item.exp.asesorId);
      return `
      <div class="card" onclick="abrirRevision('${item.exp.id}','${item.doc.key}')">
        <div class="card-row">
          <div>
            <div class="card-title">${item.doc.nombre}</div>
            <div class="card-sub">Cliente: ${esc(item.exp.cliente)} · Asesor: ${asesor ? esc(asesor.nombre) : "—"}</div>
            <div class="card-sub">Subido ${fechaCorta(item.data.subido)}</div>
          </div>
          <span class="estado estado-revision">Revisar →</span>
        </div>
      </div>`;
    }).join("");
    return;
  }

  // Tab: todos los expedientes
  if (expedientes.length === 0) {
    cont.innerHTML = `<div class="empty"><span class="big">📂</span>No hay expedientes registrados.</div>`;
    return;
  }
  cont.innerHTML = expedientes.map(exp => {
    const r = resumenExpediente(exp);
    const asesor = USUARIOS.find(u => u.id === exp.asesorId);
    const pct = Math.round(r.aprobados / CHECKLIST.length * 100);
    const filas = CHECKLIST.map(c => {
      const e = exp.docs[c.key].estado;
      const ic = e === "aprobado" ? "✅" : e === "revision" ? "🕒" : e === "rechazado" ? "❌" : "⬜";
      return `${ic} ${c.nombre}`;
    }).join("<br>");
    return `
    <div class="card" style="cursor:default">
      <div class="card-row">
        <div>
          <div class="card-title">${esc(exp.cliente)}</div>
          <div class="card-sub">Asesor: ${asesor ? esc(asesor.nombre) : "—"} · ${esc(exp.unidad || "")}</div>
        </div>
        <span class="estado ${r.clase}">${r.etiqueta}</span>
      </div>
      <div class="progress-wrap">
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <span class="progress-label">${r.aprobados}/${CHECKLIST.length}</span>
      </div>
      <div class="doc-fecha" style="margin-top:10px;line-height:1.9">${filas}</div>
    </div>`;
  }).join("");
}

/* ---------------- Revisión de documento ---------------- */

function abrirRevision(expId, docKey) {
  revisionActual = { expId, docKey };
  const exp = expedientes.find(e => e.id === expId);
  const c = CHECKLIST.find(x => x.key === docKey);
  const asesor = USUARIOS.find(u => u.id === exp.asesorId);
  document.getElementById("rev-titulo").textContent = c.nombre;
  document.getElementById("rev-sub").textContent =
    `Cliente: ${exp.cliente} · Asesor: ${asesor ? asesor.nombre : "—"}`;
  document.getElementById("rev-img").src = exp.docs[docKey].imagen || "";
  document.getElementById("rev-motivo").value = "";
  document.getElementById("modal-revision").classList.remove("hidden");
}

function resolverRevision(resultado) {
  if (!revisionActual) return;
  const exp = expedientes.find(e => e.id === revisionActual.expId);
  const d = exp.docs[revisionActual.docKey];
  const motivo = document.getElementById("rev-motivo").value.trim();

  if (resultado === "rechazado" && !motivo) {
    toast("Escribe el motivo del rechazo para que el asesor sepa qué corregir.");
    return;
  }

  d.estado = resultado;
  d.revisado = new Date().toISOString();
  d.motivo = resultado === "rechazado" ? motivo : null;
  if (resultado === "aprobado") d.imagen = d.imagen; // se conserva como evidencia

  guardar();
  revisionActual = null;
  cerrarModal("modal-revision");
  toast(resultado === "aprobado" ? "✅ Documento aprobado" : "❌ Documento rechazado, se notificó al asesor");
  renderAdmin();
}

/* ---------------- Utilerías ---------------- */

function cerrarModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add("hidden"), 3200);
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ---------------- Arranque ---------------- */
cargar();
document.addEventListener("DOMContentLoaded", render);
