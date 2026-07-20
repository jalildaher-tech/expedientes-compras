/* ============================================================
   Expedientes de Compras — Prototipo Fase 1
   Los datos se guardan en localStorage del navegador.
   Roles:
   - asesor: crea expedientes y sube archivos (fotos o PDF).
   - administrativo: revisa solo los expedientes de los asesores
     que tiene asignados en el configurador.
   - admin (Administración Central): ve todo y administra
     usuarios y asignaciones en ⚙️ Configuración.
   ============================================================ */

const CHECKLIST = [
  { key: "facturas",  nombre: "Consecutivo de facturas" },
  { key: "tarjeta",   nombre: "Tarjeta de circulación" },
  { key: "refrendos", nombre: "Consecutivo de refrendos" },
  { key: "ine",       nombre: "INE del cliente" },
  { key: "csf",       nombre: "Constancia de situación fiscal" },
  { key: "baja",      nombre: "Baja de placas" },
];

const USUARIOS_BASE = [
  { id: "asesor1",  nombre: "Carlos Ramírez",         usuario: "asesor1",  pin: "1111", rol: "asesor" },
  { id: "asesor2",  nombre: "María Fernanda Ruiz",    usuario: "asesor2",  pin: "2222", rol: "asesor" },
  { id: "compras1", nombre: "Laura Gómez",            usuario: "compras1", pin: "3333", rol: "administrativo", asignados: ["asesor1"] },
  { id: "admin",    nombre: "Administración Central", usuario: "admin",    pin: "9999", rol: "admin" },
];

const STORE_KEY = "expedientes_compras_v1";
const USERS_KEY = "expedientes_usuarios_v1";
const SESSION_KEY = "expedientes_sesion_v1";
const MAX_PDF_MB = 2.5; // límite por PDF para no llenar localStorage

let expedientes = [];
let usuarios = [];
let sesion = null;
let expedienteAbierto = null;
let docEnSubida = null;     // key del documento al que se agregan archivos
let revisionActual = null;  // {expId, docKey} en revisión
let tabAdmin = "pendientes";

/* ---------------- Persistencia ---------------- */

function cargar() {
  try {
    usuarios = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch (e) { usuarios = []; }
  if (usuarios.length === 0) usuarios = JSON.parse(JSON.stringify(USUARIOS_BASE));
  migrarUsuarios();

  try {
    expedientes = JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch (e) { expedientes = []; }
  migrar();
  if (expedientes.length === 0) sembrarDemo();

  const s = localStorage.getItem(SESSION_KEY);
  if (s) sesion = usuarios.find(u => u.id === s) || null;
}

// Asegura que los usuarios base existan y que los administrativos
// tengan lista de asignados.
function migrarUsuarios() {
  USUARIOS_BASE.forEach(b => {
    if (!usuarios.find(u => u.id === b.id)) usuarios.push(JSON.parse(JSON.stringify(b)));
  });
  usuarios.forEach(u => {
    if (u.rol === "administrativo" && !Array.isArray(u.asignados)) u.asignados = [];
  });
  guardarUsuarios();
}

// Convierte datos de versiones anteriores (una sola imagen por documento)
// al formato nuevo (lista de archivos).
function migrar() {
  let cambio = false;
  expedientes.forEach(exp => {
    CHECKLIST.forEach(c => {
      const d = exp.docs[c.key];
      if (!d) { exp.docs[c.key] = docVacio(); cambio = true; return; }
      if (!Array.isArray(d.archivos)) {
        d.archivos = d.imagen
          ? [{ tipo: "imagen", data: d.imagen, nombre: "Foto", subido: d.subido || null }]
          : [];
        delete d.imagen;
        delete d.subido;
        cambio = true;
      }
    });
  });
  if (cambio) guardar();
}

function guardar() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(expedientes));
    return true;
  } catch (e) {
    toast("⚠️ Memoria del navegador llena. Borra archivos o expedientes de prueba.");
    return false;
  }
}

function guardarUsuarios() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(usuarios));
    return true;
  } catch (e) {
    toast("⚠️ No se pudo guardar la configuración de usuarios.");
    return false;
  }
}

function docVacio() {
  return { estado: "pendiente", archivos: [], revisado: null, motivo: null };
}

function crearDocs() {
  const d = {};
  CHECKLIST.forEach(c => d[c.key] = docVacio());
  return d;
}

function sembrarDemo() {
  const hoy = new Date().toISOString();
  const exp = {
    id: "exp-demo-1",
    asesorId: "asesor1",
    cliente: "Juan Pérez López (demo)",
    unidad: "Nissan Versa 2021",
    creado: hoy,
    docs: crearDocs(),
  };
  exp.docs.ine = { estado: "aprobado", archivos: [{ tipo: "imagen", data: imagenDemo(), nombre: "Foto", subido: hoy }], revisado: hoy, motivo: null };
  exp.docs.tarjeta = { estado: "revision", archivos: [{ tipo: "imagen", data: imagenDemo(), nombre: "Foto", subido: hoy }], revisado: null, motivo: null };
  expedientes = [exp];
  guardar();
}

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
  const user = usuarios.find(x => x.usuario === u && x.pin === p);
  if (!user) {
    document.getElementById("login-error").classList.remove("hidden");
    return;
  }
  entrar(user);
}

function quickLogin(id) {
  entrar(usuarios.find(u => u.id === id));
}

function entrar(user) {
  sesion = user;
  localStorage.setItem(SESSION_KEY, user.id);
  document.getElementById("login-error").classList.add("hidden");
  tabAdmin = "pendientes";
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
  if (sesion.rol === "admin" || sesion.rol === "administrativo") { renderAdmin(); return; }
  if (expedienteAbierto) { renderExpediente(); return; }
  renderAsesor();
}

/* ---------------- Estados derivados ---------------- */

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

function ultimaSubida(d) {
  let max = null;
  d.archivos.forEach(a => { if (a.subido && (!max || a.subido > max)) max = a.subido; });
  return max;
}

function fechaCorta(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function nombreDe(id) {
  const u = usuarios.find(x => x.id === id);
  return u ? u.nombre : "—";
}

// Expedientes que el usuario en sesión tiene derecho a ver
function expedientesVisibles() {
  if (sesion.rol === "admin") return expedientes;
  if (sesion.rol === "administrativo") {
    const ids = sesion.asignados || [];
    return expedientes.filter(e => ids.includes(e.asesorId));
  }
  return expedientes.filter(e => e.asesorId === sesion.id);
}

/* ---------------- Vista: asesor ---------------- */

function renderAsesor() {
  mostrar("view-asesor");
  document.getElementById("asesor-nombre").textContent = sesion.nombre;

  const mios = expedientesVisibles();
  let completos = 0, correcciones = 0;
  mios.forEach(e => {
    const r = resumenExpediente(e);
    if (r.aprobados === CHECKLIST.length) completos++;
    else if (r.rechazados > 0) correcciones++;
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
    const puedeEditar = d.estado !== "aprobado";
    const sub = ultimaSubida(d);

    const chips = d.archivos.map((a, j) => `
      <div class="archivo-chip">
        <button class="archivo-nombre" onclick="verArchivo('${c.key}',${j})">
          ${a.tipo === "pdf" ? "📄" : "🖼️"} ${esc(a.nombre || (a.tipo === "pdf" ? "PDF" : "Foto"))} ${j + 1}
        </button>
        ${puedeEditar ? `<button class="archivo-borrar" title="Quitar archivo" onclick="quitarArchivo('${c.key}',${j})">✕</button>` : ""}
      </div>`).join("");

    return `
    <div class="doc-item">
      <div class="card-row">
        <div class="doc-nombre">${icono} ${i + 1}. ${c.nombre}</div>
        ${chip}
      </div>
      ${d.estado === "rechazado" && d.motivo ? `<div class="doc-motivo">Motivo: ${esc(d.motivo)}</div>` : ""}
      ${d.archivos.length ? `<div class="archivo-lista">${chips}</div>` : ""}
      ${sub ? `<div class="doc-fecha">Última subida: ${fechaCorta(sub)}${d.revisado ? " · Revisado: " + fechaCorta(d.revisado) : ""}</div>` : ""}
      ${puedeEditar ? `
      <div class="doc-actions">
        <button class="btn btn-primary" onclick="tomarFoto('${c.key}')">📷 Tomar foto</button>
        <button class="btn" onclick="subirArchivo('${c.key}')">📎 Subir PDF o imagen</button>
      </div>` : ""}
    </div>`;
  }).join("");
}

/* ---------------- Subida de archivos ---------------- */

function tomarFoto(docKey) {
  docEnSubida = docKey;
  const input = document.getElementById("input-camara");
  input.value = "";
  input.click();
}

function subirArchivo(docKey) {
  docEnSubida = docKey;
  const input = document.getElementById("input-archivo");
  input.value = "";
  input.click();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("input-camara").addEventListener("change", ev => procesarArchivos(ev.target.files));
  document.getElementById("input-archivo").addEventListener("change", ev => procesarArchivos(ev.target.files));
});

async function procesarArchivos(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length || !docEnSubida) return;
  const exp = expedientes.find(e => e.id === expedienteAbierto);
  if (!exp) return;
  const d = exp.docs[docEnSubida];

  let agregados = 0, rechazadosPorTamano = 0, noSoportados = 0;

  for (const file of files) {
    const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const esImagen = file.type.startsWith("image/");
    if (esPdf) {
      if (file.size > MAX_PDF_MB * 1024 * 1024) { rechazadosPorTamano++; continue; }
      const data = await leerComoDataURL(file);
      d.archivos.push({ tipo: "pdf", data, nombre: file.name, subido: new Date().toISOString() });
      agregados++;
    } else if (esImagen) {
      const data = await comprimirImagen(file);
      if (!data) { noSoportados++; continue; }
      d.archivos.push({ tipo: "imagen", data, nombre: file.name || "Foto", subido: new Date().toISOString() });
      agregados++;
    } else {
      noSoportados++;
    }
  }

  if (agregados > 0) {
    d.estado = "revision";
    d.motivo = null;
    d.revisado = null;
    if (!guardar()) {
      // Si no cupo en la memoria del navegador, se revierte lo agregado
      d.archivos.splice(d.archivos.length - agregados, agregados);
      if (d.archivos.length === 0) d.estado = "pendiente";
      guardar();
      renderExpediente();
      return;
    }
  }

  docEnSubida = null;
  renderExpediente();

  if (agregados > 0) toast(`📤 ${agregados} archivo${agregados > 1 ? "s" : ""} enviado${agregados > 1 ? "s" : ""} a revisión`);
  if (rechazadosPorTamano > 0) toast(`⚠️ ${rechazadosPorTamano} PDF supera ${MAX_PDF_MB} MB y no se subió. Comprime el PDF o súbelo por partes.`);
  if (noSoportados > 0) toast(`⚠️ ${noSoportados} archivo(s) no soportado(s): solo imágenes o PDF.`);
}

function leerComoDataURL(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

// Reduce la foto a máx. 1100 px y JPEG 60 % para caber en localStorage
function comprimirImagen(file) {
  return new Promise(resolve => {
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
      resolve(c.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function quitarArchivo(docKey, idx) {
  const exp = expedientes.find(e => e.id === expedienteAbierto);
  if (!exp) return;
  const d = exp.docs[docKey];
  if (d.estado === "aprobado") return;
  d.archivos.splice(idx, 1);
  if (d.archivos.length === 0 && d.estado === "revision") d.estado = "pendiente";
  guardar();
  renderExpediente();
}

/* ---------------- Ver archivos ---------------- */

function verArchivo(docKey, idx, expIdOpcional) {
  const exp = expedientes.find(e => e.id === (expIdOpcional || expedienteAbierto));
  if (!exp) return;
  const a = exp.docs[docKey].archivos[idx];
  if (!a) return;
  if (a.tipo === "pdf") {
    abrirPdf(a.data);
    return;
  }
  const c = CHECKLIST.find(x => x.key === docKey);
  document.getElementById("foto-titulo").textContent = c.nombre;
  document.getElementById("foto-img").src = a.data;
  document.getElementById("foto-nombre").textContent = a.nombre || "";
  document.getElementById("modal-foto").classList.remove("hidden");
}

// Los navegadores bloquean abrir data: directamente; se convierte a blob
function abrirPdf(dataUrl) {
  try {
    const base64 = dataUrl.split(",")[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast("No se pudo abrir el PDF.");
  }
}

/* ---------------- Vista: administración ---------------- */

function adminTab(t) {
  tabAdmin = t;
  renderAdmin();
}

function renderAdmin() {
  mostrar("view-admin");

  const esCentral = sesion.rol === "admin";
  document.getElementById("admin-titulo").textContent = esCentral ? "Administración Central" : sesion.nombre;
  document.getElementById("admin-sub").textContent = esCentral
    ? "Revisión de documentos y configuración"
    : `Administrativo de compras · ${(sesion.asignados || []).length} asesor(es) asignado(s)`;
  document.getElementById("tab-config").classList.toggle("hidden", !esCentral);
  if (!esCentral && tabAdmin === "config") tabAdmin = "pendientes";

  document.getElementById("tab-pendientes").classList.toggle("active", tabAdmin === "pendientes");
  document.getElementById("tab-todos").classList.toggle("active", tabAdmin === "todos");
  document.getElementById("tab-config").classList.toggle("active", tabAdmin === "config");

  const visibles = expedientesVisibles();

  const cola = [];
  visibles.forEach(exp => {
    CHECKLIST.forEach(c => {
      if (exp.docs[c.key].estado === "revision") {
        cola.push({ exp, doc: c, data: exp.docs[c.key] });
      }
    });
  });
  document.getElementById("badge-pendientes").textContent = cola.length;

  const cont = document.getElementById("admin-lista");

  if (tabAdmin === "config") { renderConfig(cont); return; }

  if (tabAdmin === "pendientes") {
    if (cola.length === 0) {
      cont.innerHTML = `<div class="empty"><span class="big">🎉</span>No hay documentos pendientes de revisar${esCentral ? "" : " de tus asesores asignados"}.</div>`;
      return;
    }
    cont.innerHTML = cola.map(item => {
      const n = item.data.archivos.length;
      return `
      <div class="card" onclick="abrirRevision('${item.exp.id}','${item.doc.key}')">
        <div class="card-row">
          <div>
            <div class="card-title">${item.doc.nombre}</div>
            <div class="card-sub">Cliente: ${esc(item.exp.cliente)} · Asesor: ${esc(nombreDe(item.exp.asesorId))}</div>
            <div class="card-sub">${n} archivo${n !== 1 ? "s" : ""} · Subido ${fechaCorta(ultimaSubida(item.data))}</div>
          </div>
          <span class="estado estado-revision">Revisar →</span>
        </div>
      </div>`;
    }).join("");
    return;
  }

  // Tab: expedientes
  if (visibles.length === 0) {
    cont.innerHTML = `<div class="empty"><span class="big">📂</span>${esCentral ? "No hay expedientes registrados." : "Tus asesores asignados aún no tienen expedientes, o no tienes asesores asignados. Pide a Administración Central que revise tu asignación en ⚙️ Configuración."}</div>`;
    return;
  }
  cont.innerHTML = visibles.map(exp => {
    const r = resumenExpediente(exp);
    const pct = Math.round(r.aprobados / CHECKLIST.length * 100);
    const filas = CHECKLIST.map(c => {
      const d = exp.docs[c.key];
      const ic = d.estado === "aprobado" ? "✅" : d.estado === "revision" ? "🕒" : d.estado === "rechazado" ? "❌" : "⬜";
      const n = d.archivos.length;
      return `${ic} ${c.nombre}${n ? ` <span class="doc-conteo">(${n} archivo${n !== 1 ? "s" : ""})</span>` : ""}`;
    }).join("<br>");
    return `
    <div class="card" style="cursor:default">
      <div class="card-row">
        <div>
          <div class="card-title">${esc(exp.cliente)}</div>
          <div class="card-sub">Asesor: ${esc(nombreDe(exp.asesorId))} · ${esc(exp.unidad || "")}</div>
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

/* ---------------- Configuración (solo Administración Central) ---------------- */

function renderConfig(cont) {
  const asesores = usuarios.filter(u => u.rol === "asesor");
  const administrativos = usuarios.filter(u => u.rol === "administrativo");

  const listaUsuarios = usuarios
    .filter(u => u.rol !== "admin")
    .map(u => {
      const rolTxt = u.rol === "asesor" ? "Asesor de ventas" : "Administrativo de compras";
      const tieneExp = expedientes.some(e => e.asesorId === u.id);
      return `
      <div class="config-usuario">
        <div>
          <b>${esc(u.nombre)}</b>
          <div class="card-sub">${rolTxt} · usuario: <code>${esc(u.usuario)}</code> · PIN: <code>${esc(u.pin)}</code></div>
        </div>
        ${tieneExp
          ? `<span class="doc-conteo">con expedientes</span>`
          : `<button class="archivo-borrar" title="Dar de baja" onclick="eliminarUsuario('${u.id}')">✕</button>`}
      </div>`;
    }).join("");

  const asignaciones = administrativos.length === 0
    ? `<p class="card-sub">Aún no hay administrativos de compras dados de alta.</p>`
    : administrativos.map(adm => {
      const checks = asesores.length === 0
        ? `<p class="card-sub">No hay asesores dados de alta.</p>`
        : asesores.map(a => `
          <label class="config-check">
            <input type="checkbox" ${(adm.asignados || []).includes(a.id) ? "checked" : ""}
              onchange="toggleAsignacion('${adm.id}','${a.id}', this.checked)">
            <span>${esc(a.nombre)}</span>
          </label>`).join("");
      const n = (adm.asignados || []).length;
      return `
      <div class="card" style="cursor:default">
        <div class="card-title">🗂️ ${esc(adm.nombre)}</div>
        <div class="card-sub">Ve los expedientes de ${n} asesor${n !== 1 ? "es" : ""}. Marca o desmarca para cambiar la asignación — el cambio aplica de inmediato.</div>
        <div class="config-checks">${checks}</div>
      </div>`;
    }).join("");

  cont.innerHTML = `
    <div class="card" style="cursor:default">
      <div class="card-row">
        <div class="card-title">👥 Usuarios</div>
        <button class="btn btn-primary" onclick="abrirNuevoUsuario()">＋ Dar de alta</button>
      </div>
      <div class="config-usuarios">${listaUsuarios || `<p class="card-sub">Sin usuarios.</p>`}</div>
    </div>

    <h3 class="config-seccion">Asignación de asesores por administrativo</h3>
    ${asignaciones}`;
}

function abrirNuevoUsuario() {
  document.getElementById("user-nombre").value = "";
  document.getElementById("user-usuario").value = "";
  document.getElementById("user-pin").value = "";
  document.getElementById("user-rol").value = "asesor";
  document.getElementById("user-error").classList.add("hidden");
  document.getElementById("modal-usuario").classList.remove("hidden");
}

function crearUsuario() {
  const nombre = document.getElementById("user-nombre").value.trim();
  const usuario = document.getElementById("user-usuario").value.trim().toLowerCase().replace(/\s+/g, "");
  const pin = document.getElementById("user-pin").value.trim();
  const rol = document.getElementById("user-rol").value;
  const err = document.getElementById("user-error");

  let msg = null;
  if (!nombre || !usuario || !pin) msg = "Llena todos los campos.";
  else if (!/^\d{4}$/.test(pin)) msg = "El PIN debe ser exactamente 4 dígitos.";
  else if (usuarios.find(u => u.usuario === usuario)) msg = `El usuario "${usuario}" ya existe, elige otro.`;

  if (msg) {
    err.textContent = msg;
    err.classList.remove("hidden");
    return;
  }

  const nuevo = { id: "u-" + Date.now(), nombre, usuario, pin, rol };
  if (rol === "administrativo") nuevo.asignados = [];
  usuarios.push(nuevo);
  guardarUsuarios();
  cerrarModal("modal-usuario");
  toast(`✅ ${nombre} dado de alta como ${rol === "asesor" ? "asesor" : "administrativo de compras"}`);
  renderAdmin();
}

function eliminarUsuario(id) {
  const u = usuarios.find(x => x.id === id);
  if (!u) return;
  if (expedientes.some(e => e.asesorId === id)) {
    toast("No se puede dar de baja: tiene expedientes registrados.");
    return;
  }
  if (!confirm(`¿Dar de baja a ${u.nombre}?`)) return;
  usuarios = usuarios.filter(x => x.id !== id);
  // También se quita de las asignaciones de los administrativos
  usuarios.forEach(x => {
    if (x.rol === "administrativo" && Array.isArray(x.asignados)) {
      x.asignados = x.asignados.filter(a => a !== id);
    }
  });
  guardarUsuarios();
  toast(`Usuario ${u.nombre} dado de baja.`);
  renderAdmin();
}

function toggleAsignacion(admId, asesorId, checked) {
  const adm = usuarios.find(u => u.id === admId);
  if (!adm) return;
  adm.asignados = adm.asignados || [];
  if (checked && !adm.asignados.includes(asesorId)) adm.asignados.push(asesorId);
  if (!checked) adm.asignados = adm.asignados.filter(a => a !== asesorId);
  guardarUsuarios();
  toast(`Asignación de ${adm.nombre} actualizada: ${adm.asignados.length} asesor(es).`);
  renderAdmin();
}

/* ---------------- Revisión de documento ---------------- */

function abrirRevision(expId, docKey) {
  revisionActual = { expId, docKey };
  const exp = expedientes.find(e => e.id === expId);
  const c = CHECKLIST.find(x => x.key === docKey);
  const d = exp.docs[docKey];

  document.getElementById("rev-titulo").textContent = c.nombre;
  document.getElementById("rev-sub").textContent =
    `Cliente: ${exp.cliente} · Asesor: ${nombreDe(exp.asesorId)} · ${d.archivos.length} archivo${d.archivos.length !== 1 ? "s" : ""}`;

  document.getElementById("rev-archivos").innerHTML = d.archivos.map((a, j) => {
    if (a.tipo === "pdf") {
      return `
      <div class="pdf-card">
        <span>📄 ${esc(a.nombre || "PDF")}</span>
        <button class="btn" onclick="verArchivo('${docKey}',${j},'${expId}')">Abrir PDF</button>
      </div>`;
    }
    return `<div class="rev-img-wrap"><img src="${a.data}" alt="Archivo ${j + 1}"></div>`;
  }).join("") || `<p class="rev-sub">Sin archivos.</p>`;

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
  t._timer = setTimeout(() => t.classList.add("hidden"), 3800);
}

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ---------------- Arranque ---------------- */
cargar();
document.addEventListener("DOMContentLoaded", render);
