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
  { key: "facturas",    nombre: "Consecutivo de facturas" },
  { key: "tarjeta",     nombre: "Tarjeta de circulación" },
  { key: "refrendos",   nombre: "Consecutivo de refrendos" },
  { key: "ine",         nombre: "INE del cliente" },
  { key: "csf",         nombre: "Constancia de situación fiscal" },
  { key: "baja",        nombre: "Baja de placas" },
  { key: "kilometraje", nombre: "Kilometraje en odómetro" },
];

// Investigaciones que realiza el administrativo de compras (un PDF cada una).
// El check se marca automáticamente al subir el PDF.
const INVESTIGACIONES = [
  { key: "repuve",     nombre: "REPUVE" },
  { key: "adeudos",    nombre: "Adeudos vehiculares" },
  { key: "rug",        nombre: "RUG" },
  { key: "transunion", nombre: "Transunion" },
  { key: "rapi",       nombre: "RAPI" },
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
let invExpAbierta = null;   // id del expediente en el modal de investigación
let invEnSubida = null;     // key de la investigación a la que se sube PDF
let vinExpId = null;        // id del expediente en el modal de número de serie
let carpetaHandle = null;   // carpeta destino elegida (File System Access API)
const scriptsCargados = {}; // librerías externas ya cargadas (OCR, ZIP)

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
    if (!exp.investigaciones) { exp.investigaciones = invVacia(); cambio = true; }
    INVESTIGACIONES.forEach(i => {
      if (!exp.investigaciones[i.key]) { exp.investigaciones[i.key] = { archivos: [] }; cambio = true; }
    });
  });
  if (cambio) guardar();
}

function invVacia() {
  const inv = {};
  INVESTIGACIONES.forEach(i => inv[i.key] = { archivos: [] });
  return inv;
}

// La investigación se desbloquea cuando están APROBADOS:
// consecutivo de facturas, (tarjeta de circulación O consecutivo de
// refrendos), kilometraje en odómetro e INE.
function invDisponible(exp) {
  const ap = k => exp.docs[k].estado === "aprobado";
  const faltan = [];
  if (!ap("facturas")) faltan.push("Consecutivo de facturas");
  if (!ap("tarjeta") && !ap("refrendos")) faltan.push("Tarjeta de circulación o Consecutivo de refrendos");
  if (!ap("kilometraje")) faltan.push("Kilometraje en odómetro");
  if (!ap("ine")) faltan.push("INE del cliente");
  return { disponible: faltan.length === 0, faltan };
}

function invResumen(exp) {
  const hechas = INVESTIGACIONES.filter(i => exp.investigaciones[i.key].archivos.length > 0).length;
  return { hechas, total: INVESTIGACIONES.length, completa: hechas === INVESTIGACIONES.length };
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
    investigaciones: invVacia(),
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

/* ---------------- Configuración de carpeta destino ----------------
   La carpeta elegida se guarda en IndexedDB (localStorage no puede
   almacenar "handles" de carpetas). Solo funciona en Chrome/Edge de
   computadora; en otros navegadores se descarga un ZIP. */

function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("expedientes_config", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function idbGet(k) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const t = db.transaction("kv").objectStore("kv").get(k);
    t.onsuccess = () => res(t.result);
    t.onerror = () => rej(t.error);
  });
}

async function idbSet(k, v) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const t = db.transaction("kv", "readwrite").objectStore("kv").put(v, k);
    t.onsuccess = () => res();
    t.onerror = () => rej(t.error);
  });
}

async function cargarCarpeta() {
  try {
    carpetaHandle = await idbGet("carpetaExpedientes") || null;
  } catch (e) { carpetaHandle = null; }
}

async function elegirCarpeta() {
  if (!window.showDirectoryPicker) {
    toast("Este navegador no permite elegir carpeta (usa Chrome o Edge en computadora). Los expedientes se descargarán como ZIP.");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    carpetaHandle = handle;
    await idbSet("carpetaExpedientes", handle);
    toast(`📁 Carpeta configurada: ${handle.name}`);
    renderAdmin();
  } catch (e) {
    if (e && e.name !== "AbortError") toast("No se pudo elegir la carpeta.");
  }
}

function cargarScript(url) {
  if (scriptsCargados[url]) return scriptsCargados[url];
  scriptsCargados[url] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => res();
    s.onerror = () => { delete scriptsCargados[url]; rej(new Error("No se pudo cargar " + url)); };
    document.head.appendChild(s);
  });
  return scriptsCargados[url];
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
  const inv = invResumen(exp);
  let etiqueta, clase;
  if (aprobados === CHECKLIST.length && inv.completa) { etiqueta = "✓ Completo"; clase = "estado-completo"; }
  else if (aprobados === CHECKLIST.length) { etiqueta = "Falta investigación"; clase = "estado-revision"; }
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
    investigaciones: invVacia(),
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
  }).join("") + investigacionAsesorHTML(exp);
}

// Para el asesor, la investigación es un solo check de solo lectura:
// se completa cuando el administrativo termina sus 5 investigaciones.
function investigacionAsesorHTML(exp) {
  const inv = invResumen(exp);
  let icono, chip, nota;
  if (inv.completa) {
    icono = "✅";
    chip = `<span class="estado estado-completo">Completo</span>`;
    nota = "El administrativo de compras terminó las investigaciones.";
  } else if (inv.hechas > 0) {
    icono = "🕒";
    chip = `<span class="estado estado-revision">En proceso</span>`;
    nota = "El administrativo de compras está realizando las investigaciones.";
  } else {
    icono = "⬜";
    chip = `<span class="estado estado-proceso">Pendiente</span>`;
    nota = "Las realiza el administrativo de compras; no necesitas subir nada aquí.";
  }
  return `
  <div class="doc-item doc-inv">
    <div class="card-row">
      <div class="doc-nombre">${icono} 🔎 Investigaciones</div>
      ${chip}
    </div>
    <div class="doc-fecha">${nota}</div>
  </div>`;
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
  document.getElementById("input-inv").addEventListener("change", ev => procesarInvArchivos(ev.target.files));
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

    const disp = invDisponible(exp);
    const inv = invResumen(exp);
    const filasInv = INVESTIGACIONES.map(i => {
      const hecho = exp.investigaciones[i.key].archivos.length > 0;
      return `${hecho ? "✅" : "⬜"} ${i.nombre}`;
    }).join("<br>");
    const invBloque = disp.disponible
      ? `<div class="inv-titulo">🔎 Investigación ${inv.completa ? `<span class="estado estado-completo">Completa</span>` : `<span class="estado estado-revision">${inv.hechas}/${inv.total}</span>`}</div>
         <div class="doc-fecha" style="line-height:1.9">${filasInv}</div>
         <div class="doc-actions"><button class="btn btn-primary" onclick="abrirInvestigacion('${exp.id}')">🔎 Abrir investigación</button></div>`
      : `<div class="inv-titulo">🔒 Investigación no disponible</div>
         <div class="doc-fecha">Se desbloquea al aprobar: ${disp.faltan.join(", ")}.</div>`;

    const completo = expCompleto(exp);
    const guardadoBloque = !completo ? "" : `
      <div class="inv-bloque inv-guardado">
        <div class="inv-titulo">💾 Expediente completo ${exp.guardado ? `<span class="estado estado-completo">Guardado</span>` : `<span class="estado estado-revision">Sin guardar</span>`}</div>
        <div class="doc-fecha">Número de serie: ${exp.vin ? `<b>${esc(exp.vin)}</b> · Carpeta: <b>${esc(nombreCarpetaExp(exp))}</b>` : "sin capturar — se necesita para nombrar la carpeta"}</div>
        ${exp.guardado ? `<div class="doc-fecha">Guardado ${fechaCorta(exp.guardado.fecha)} en ${esc(exp.guardado.destino)}</div>` : ""}
        <div class="doc-actions">
          <button class="btn" onclick="abrirVin('${exp.id}')">🔢 Número de serie</button>
          <button class="btn btn-success" onclick="guardarExpedienteCompleto('${exp.id}')">💾 Guardar ${exp.guardado ? "de nuevo" : "en carpeta"}</button>
        </div>
      </div>`;

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
      <div class="inv-bloque">${invBloque}</div>
      ${guardadoBloque}
    </div>`;
  }).join("");
}

/* ---------------- Investigación (administrativo) ---------------- */

function abrirInvestigacion(expId) {
  invExpAbierta = expId;
  renderInvestigacion();
  document.getElementById("modal-inv").classList.remove("hidden");
}

function renderInvestigacion() {
  const exp = expedientes.find(e => e.id === invExpAbierta);
  if (!exp) return;
  const inv = invResumen(exp);

  document.getElementById("inv-sub").textContent =
    `Cliente: ${exp.cliente} · Asesor: ${nombreDe(exp.asesorId)} · ${inv.hechas}/${inv.total} investigaciones`;

  document.getElementById("inv-lista").innerHTML = INVESTIGACIONES.map(i => {
    const archivos = exp.investigaciones[i.key].archivos;
    const hecho = archivos.length > 0;
    const chips = archivos.map((a, j) => `
      <div class="archivo-chip">
        <button class="archivo-nombre" onclick="verInvArchivo('${i.key}',${j})">📄 ${esc(a.nombre || "PDF")}</button>
        <button class="archivo-borrar" title="Quitar PDF" onclick="quitarInvArchivo('${i.key}',${j})">✕</button>
      </div>`).join("");
    return `
    <div class="doc-item" style="box-shadow:none;border:1px solid var(--borde);margin-bottom:10px">
      <div class="card-row">
        <div class="doc-nombre">${hecho ? "✅" : "⬜"} ${i.nombre}</div>
        ${hecho ? `<span class="estado estado-completo">Listo</span>` : `<span class="estado estado-proceso">Pendiente</span>`}
      </div>
      ${chips ? `<div class="archivo-lista">${chips}</div>` : ""}
      <div class="doc-actions">
        <button class="btn ${hecho ? "" : "btn-primary"}" onclick="subirInvPdf('${i.key}')">📄 Subir PDF</button>
      </div>
    </div>`;
  }).join("");
}

function subirInvPdf(invKey) {
  invEnSubida = invKey;
  const input = document.getElementById("input-inv");
  input.value = "";
  input.click();
}

async function procesarInvArchivos(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length || !invEnSubida || !invExpAbierta) return;
  const exp = expedientes.find(e => e.id === invExpAbierta);
  if (!exp) return;
  const inv = exp.investigaciones[invEnSubida];

  let agregados = 0, grandes = 0, noPdf = 0;
  for (const file of files) {
    const esPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!esPdf) { noPdf++; continue; }
    if (file.size > MAX_PDF_MB * 1024 * 1024) { grandes++; continue; }
    const data = await leerComoDataURL(file);
    inv.archivos.push({ tipo: "pdf", data, nombre: file.name, subido: new Date().toISOString() });
    agregados++;
  }

  if (agregados > 0 && !guardar()) {
    inv.archivos.splice(inv.archivos.length - agregados, agregados);
    guardar();
  } else if (agregados > 0) {
    const r = invResumen(exp);
    toast(r.completa ? "✅ Investigación completa: las 5 quedaron listas" : `📄 PDF guardado (${r.hechas}/${r.total} investigaciones)`);
    avisarSiCompleto(exp);
  }
  if (grandes > 0) toast(`⚠️ ${grandes} PDF supera ${MAX_PDF_MB} MB y no se subió.`);
  if (noPdf > 0) toast("⚠️ Solo se aceptan archivos PDF en la investigación.");

  invEnSubida = null;
  renderInvestigacion();
  renderAdmin();
  document.getElementById("modal-inv").classList.remove("hidden");
}

function verInvArchivo(invKey, idx) {
  const exp = expedientes.find(e => e.id === invExpAbierta);
  if (!exp) return;
  const a = exp.investigaciones[invKey].archivos[idx];
  if (a) abrirPdf(a.data);
}

function quitarInvArchivo(invKey, idx) {
  const exp = expedientes.find(e => e.id === invExpAbierta);
  if (!exp) return;
  exp.investigaciones[invKey].archivos.splice(idx, 1);
  guardar();
  renderInvestigacion();
  renderAdmin();
  document.getElementById("modal-inv").classList.remove("hidden");
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

  const soportaCarpeta = !!window.showDirectoryPicker;
  cont.innerHTML = `
    <div class="card" style="cursor:default">
      <div class="card-row">
        <div class="card-title">👥 Usuarios</div>
        <button class="btn btn-primary" onclick="abrirNuevoUsuario()">＋ Dar de alta</button>
      </div>
      <div class="config-usuarios">${listaUsuarios || `<p class="card-sub">Sin usuarios.</p>`}</div>
    </div>

    <div class="card" style="cursor:default">
      <div class="card-row">
        <div class="card-title">📁 Carpeta de expedientes completos</div>
        <button class="btn btn-primary" onclick="elegirCarpeta()">Elegir carpeta…</button>
      </div>
      <div class="card-sub" style="margin-top:8px">
        ${carpetaHandle
          ? `Carpeta configurada: <b>${esc(carpetaHandle.name)}</b>. Cada expediente completo se guardará ahí en una subcarpeta con los últimos 8 caracteres del número de serie y el nombre del cliente.`
          : "Sin configurar. Al guardar un expediente completo se descargará un ZIP con el mismo nombre de carpeta."}
      </div>
      ${soportaCarpeta ? "" : `<div class="doc-fecha" style="margin-top:6px">⚠️ Este navegador no permite elegir carpeta (funciona en Chrome o Edge de computadora); mientras tanto se usará la descarga en ZIP.</div>`}
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

/* ---------------- Número de serie (VIN) ---------------- */

function expCompleto(exp) {
  const r = resumenExpediente(exp);
  return r.aprobados === CHECKLIST.length && invResumen(exp).completa;
}

function nombreCarpetaExp(exp) {
  const vin8 = (exp.vin || "").slice(-8).toUpperCase();
  return `${vin8} ${exp.cliente}`.replace(/[\\/:*?"<>|]/g, "-").trim();
}

function abrirVin(expId) {
  vinExpId = expId;
  const exp = expedientes.find(e => e.id === expId);
  if (!exp) return;
  document.getElementById("vin-sub").textContent =
    `Cliente: ${exp.cliente}. La carpeta usará los últimos 8 caracteres del número de serie.`;
  document.getElementById("vin-input").value = exp.vin || "";
  document.getElementById("vin-estado").textContent = exp.vin
    ? "Número capturado. Puedes corregirlo o volver a leerlo."
    : "Pulsa «Leer de los documentos» para detectarlo automáticamente, o escríbelo.";
  document.getElementById("modal-vin").classList.remove("hidden");
}

/* Lectura de PDF (pdf.js): texto digital y render de páginas a imagen */

async function cargarPdfJs() {
  await cargarScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
}

function dataUrlABytes(dataUrl) {
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const MAX_PAGINAS_PDF = 3; // páginas por PDF que se revisan buscando el VIN

async function abrirDocPdf(dataUrl) {
  await cargarPdfJs();
  return pdfjsLib.getDocument({ data: dataUrlABytes(dataUrl) }).promise;
}

async function textoDePdf(pdf) {
  let texto = "";
  const n = Math.min(pdf.numPages, MAX_PAGINAS_PDF);
  for (let p = 1; p <= n; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    texto += tc.items.map(i => i.str).join(" ") + "\n";
  }
  return texto;
}

async function imagenDePaginaPdf(pdf, p) {
  const page = await pdf.getPage(p);
  const vp = page.getViewport({ scale: 2 });
  const c = document.createElement("canvas");
  c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return c.toDataURL("image/png");
}

// Lee el VIN de los documentos de factura, tarjeta de circulación y
// refrendos (fotos y PDFs). Orden: 1) texto digital de los PDF (exacto,
// típico de facturas electrónicas), 2) OCR de las fotos, 3) OCR de las
// páginas de PDFs escaneados.
async function leerVinAuto() {
  const exp = expedientes.find(e => e.id === vinExpId);
  if (!exp) return;
  const estado = document.getElementById("vin-estado");
  const boton = document.getElementById("vin-btn-leer");

  const archivos = [];
  ["facturas", "tarjeta", "refrendos"].forEach(k => {
    exp.docs[k].archivos.forEach(a => archivos.push(a));
  });
  const imagenes = archivos.filter(a => a.tipo === "imagen");
  const pdfs = archivos.filter(a => a.tipo === "pdf");
  if (archivos.length === 0) {
    estado.textContent = "⚠️ No hay archivos de factura, tarjeta de circulación o refrendos en el expediente. Escríbelo manualmente.";
    return;
  }

  boton.disabled = true;
  let vin = null;
  const escaneados = []; // PDFs sin texto digital, para OCR al final

  // 1) Texto digital de los PDF
  for (let i = 0; i < pdfs.length && !vin; i++) {
    estado.textContent = `📄 Leyendo texto del PDF ${i + 1} de ${pdfs.length}…`;
    try {
      const pdf = await abrirDocPdf(pdfs[i].data);
      const texto = await textoDePdf(pdf);
      vin = buscarVin(texto);
      if (!vin) escaneados.push(pdf);
    } catch (e) { /* PDF ilegible: se intenta con los demás */ }
  }

  // 2) OCR de fotos
  if (!vin && imagenes.length > 0) {
    try {
      estado.textContent = "Descargando lector de texto (solo la primera vez)…";
      await cargarScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
      for (let i = 0; i < imagenes.length && !vin; i++) {
        estado.textContent = `🔍 Leyendo foto ${i + 1} de ${imagenes.length}…`;
        const res = await Tesseract.recognize(imagenes[i].data, "eng");
        vin = buscarVin(res.data.text);
      }
    } catch (e) { /* sin internet para el lector; continúa */ }
  }

  // 3) OCR de páginas de PDFs escaneados
  if (!vin && escaneados.length > 0) {
    try {
      await cargarScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
      for (let i = 0; i < escaneados.length && !vin; i++) {
        const pdf = escaneados[i];
        const n = Math.min(pdf.numPages, MAX_PAGINAS_PDF);
        for (let p = 1; p <= n && !vin; p++) {
          estado.textContent = `🔍 Leyendo PDF escaneado ${i + 1} de ${escaneados.length}, página ${p}…`;
          const img = await imagenDePaginaPdf(pdf, p);
          const res = await Tesseract.recognize(img, "eng");
          vin = buscarVin(res.data.text);
        }
      }
    } catch (e) { /* continúa al mensaje final */ }
  }

  if (vin) {
    document.getElementById("vin-input").value = vin;
    estado.textContent = "✅ Número de serie detectado. Verifícalo y pulsa Guardar.";
  } else {
    estado.textContent = "No se encontró un número de serie legible en los documentos. Escríbelo manualmente.";
  }
  boton.disabled = false;
}

// Un VIN tiene 17 caracteres y no usa I, O ni Q. En el texto leído puede
// venir pegado a la etiqueta ("SERIE3N1CK..."), así que dentro de cada
// tira válida se evalúan todas las ventanas de 17 y se elige la que tenga
// más dígitos (los VIN son muy numéricos; las palabras pegadas no).
function buscarVin(texto) {
  const fuentes = (texto || "").toUpperCase().split("\n");
  fuentes.push((texto || "").toUpperCase().replace(/\s+/g, ""));
  let mejor = null, mejorPuntos = -1;
  for (const fuente of fuentes) {
    const tiras = fuente.replace(/[^A-Z0-9]/g, " ").replace(/[IOQ]/g, " ").split(/\s+/);
    for (const tira of tiras) {
      if (tira.length < 17) continue;
      for (let i = 0; i + 17 <= tira.length; i++) {
        const cand = tira.substr(i, 17);
        const digitos = (cand.match(/\d/g) || []).length;
        if (digitos === 0) continue;
        // se prefiere más dígitos; en empate, la ventana más a la derecha
        // (la etiqueta pegada suele estar a la izquierda)
        if (digitos > mejorPuntos || (digitos === mejorPuntos && mejor && tira.includes(mejor))) {
          mejor = cand; mejorPuntos = digitos;
        }
      }
    }
    if (mejor) return mejor; // primero por líneas; el texto plano es respaldo
  }
  return mejor;
}

function guardarVin() {
  const exp = expedientes.find(e => e.id === vinExpId);
  if (!exp) return;
  const v = document.getElementById("vin-input").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.length < 8) {
    document.getElementById("vin-estado").textContent = "⚠️ El número debe tener al menos 8 caracteres.";
    return;
  }
  exp.vin = v;
  guardar();
  cerrarModal("modal-vin");
  toast(`🔢 Número de serie guardado. Carpeta: ${nombreCarpetaExp(exp)}`);
  renderAdmin();
}

/* ---------------- Guardado del expediente completo ---------------- */

function extensionDe(dataUrl) {
  const mime = (dataUrl || "").substring(5, (dataUrl || "").indexOf(";"));
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/png") return ".png";
  return ".jpg";
}

function dataUrlABlob(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const mime = dataUrl.substring(5, dataUrl.indexOf(";"));
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Lista { nombre, blob } con todos los archivos del expediente
function archivosDeExpediente(exp) {
  const archivos = [];
  CHECKLIST.forEach((c, i) => {
    exp.docs[c.key].archivos.forEach((a, j) => {
      archivos.push({
        nombre: `${String(i + 1).padStart(2, "0")}-${c.key}-${j + 1}${extensionDe(a.data)}`,
        blob: dataUrlABlob(a.data),
      });
    });
  });
  INVESTIGACIONES.forEach(inv => {
    exp.investigaciones[inv.key].archivos.forEach((a, j) => {
      archivos.push({
        nombre: `investigacion-${inv.key}-${j + 1}${extensionDe(a.data)}`,
        blob: dataUrlABlob(a.data),
      });
    });
  });
  const resumen = [
    `Expediente: ${exp.cliente}`,
    `Unidad: ${exp.unidad || "—"}`,
    `Asesor: ${nombreDe(exp.asesorId)}`,
    `Número de serie: ${exp.vin || "—"}`,
    `Creado: ${fechaCorta(exp.creado)}`,
    `Guardado: ${fechaCorta(new Date().toISOString())}`,
    "",
    "Documentos:",
    ...CHECKLIST.map((c, i) => `  ${i + 1}. ${c.nombre}: ${exp.docs[c.key].estado} (${exp.docs[c.key].archivos.length} archivo(s))`),
    "",
    "Investigaciones:",
    ...INVESTIGACIONES.map(inv => `  - ${inv.nombre}: ${exp.investigaciones[inv.key].archivos.length > 0 ? "lista" : "pendiente"}`),
  ].join("\n");
  archivos.push({ nombre: "expediente.txt", blob: new Blob([resumen], { type: "text/plain" }) });
  return archivos;
}

async function guardarExpedienteCompleto(expId) {
  const exp = expedientes.find(e => e.id === expId);
  if (!exp) return;
  if (!expCompleto(exp)) {
    toast("El expediente aún no está completo (documentos aprobados + investigación).");
    return;
  }
  if (!exp.vin) {
    toast("Primero captura el número de serie.");
    abrirVin(expId);
    return;
  }

  const carpeta = nombreCarpetaExp(exp);
  const archivos = archivosDeExpediente(exp);

  // Opción 1: escribir directo en la carpeta configurada (Chrome/Edge)
  if (carpetaHandle) {
    try {
      let perm = await carpetaHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") perm = await carpetaHandle.requestPermission({ mode: "readwrite" });
      if (perm === "granted") {
        const dir = await carpetaHandle.getDirectoryHandle(carpeta, { create: true });
        for (const f of archivos) {
          const fh = await dir.getFileHandle(f.nombre, { create: true });
          const w = await fh.createWritable();
          await w.write(f.blob);
          await w.close();
        }
        exp.guardado = { fecha: new Date().toISOString(), destino: `${carpetaHandle.name}/${carpeta}` };
        guardar();
        toast(`💾 Expediente guardado en ${carpetaHandle.name}/${carpeta} (${archivos.length} archivos)`);
        renderAdmin();
        return;
      }
      toast("Permiso a la carpeta denegado; se descargará como ZIP.");
    } catch (e) {
      toast("No se pudo escribir en la carpeta configurada; se descargará como ZIP.");
    }
  }

  // Opción 2: descargar un ZIP con el nombre de la carpeta
  try {
    await cargarScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
    const zip = new JSZip();
    const dir = zip.folder(carpeta);
    archivos.forEach(f => dir.file(f.nombre, f.blob));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${carpeta}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    exp.guardado = { fecha: new Date().toISOString(), destino: `ZIP: ${carpeta}.zip` };
    guardar();
    toast(`💾 ZIP descargado: ${carpeta}.zip (${archivos.length} archivos)`);
    renderAdmin();
  } catch (e) {
    toast("⚠️ No se pudo generar el ZIP (¿sin internet?).");
  }
}

// Aviso cuando un expediente llega a completo
function avisarSiCompleto(exp) {
  if (!expCompleto(exp)) return;
  if (exp.guardado) return;
  toast(exp.vin
    ? `🎉 Expediente de ${exp.cliente} completo. Guárdalo con 💾 en la pestaña Expedientes.`
    : `🎉 Expediente de ${exp.cliente} completo. Captura el número de serie y guárdalo con 💾.`);
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
  avisarSiCompleto(exp);
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
cargarCarpeta();
document.addEventListener("DOMContentLoaded", render);
