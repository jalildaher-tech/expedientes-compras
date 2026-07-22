/* ============================================================
   Diagnóstico mecánico del técnico valuador
   Basado en el "Formato de Avalúo" (hoja viajera) de
   DaltonSeminuevos.com. El total de valuación se descuenta
   automáticamente como "diagnóstico mecánico" en la oferta.
   Para terminar el diagnóstico son obligatorias 4 fotos:
   odómetro, número de motor, número de serie y holograma REPUVE.
   ============================================================ */

const DIAG_MECANICA = [
  { grupo: "Motor",        items: ["Baja compresión", "Reparación general", "Fugas de aceite", "Afinación"] },
  { grupo: "Transmisión",  items: ["Caja", "Diferencial", "Embrague", "Fugas de aceite"] },
  { grupo: "Parte baja",   items: ["Escape", "Silenciador", "Bastidor", "Alineación"] },
  { grupo: "Suspensión",   items: ["Rodamientos", "Caja de dirección", "Amortiguadores delanteros", "Rótulas", "Resortes/Barras", "Eje delantero", "Amortiguadores traseros", "Eje trasero", "Muelles y resortes"] },
  { grupo: "Frenos",       items: ["Delantero", "Trasero"] },
  { grupo: "Electricidad", items: ["Batería", "Generador/Alternador", "Marcha", "Limpiadores", "Calefacción", "Luces", "Aire acondicionado", "Diversos"] },
  { grupo: "Interior",     items: ["Encendido de testigos", "Vidrios y quemacocos", "Control de seguros de puertas", "Funcionamiento de radio", "Vestiduras", "Luces internas"] },
  { grupo: "Llantas",      items: ["Delantera izquierda", "Delantera derecha", "Trasera izquierda", "Trasera derecha"] },
];

const DIAG_RECEPCION = [
  { grupo: "Elementos a revisar", items: ["Accesorios", "Maletín de herramientas", "Llanta de refacción", "Gato", "Birlo de seguridad", "Maneral de birlos"] },
  { grupo: "Llaves",              items: ["Llave 1", "Duplicado"] },
  { grupo: "Documentos",          items: ["Tarjeta de circulación", "Talón de verificación", "Placas", "Engomado"] },
  { grupo: "Porta-documentos",    items: ["Manuales del propietario", "Póliza de garantía"] },
];

// Fotografías obligatorias para poder terminar el diagnóstico.
// En motor, serie y REPUVE el técnico además debe indicar si la
// prueba de clonación pasa o no (obligatorio para terminar).
const DIAG_FOTOS = [
  { key: "odometro", nombre: "Odómetro (comprueba el kilometraje)" },
  { key: "motor",    nombre: "Número de motor", clonacion: true },
  { key: "serie",    nombre: "Número de serie", clonacion: true },
  { key: "repuve",   nombre: "Holograma del REPUVE", clonacion: true },
];

let diagFotoEnSubida = null; // key de la foto obligatoria a subir

// Número de avalúo consecutivo e irrepetible: AV-0001, AV-0002, …
// Se asigna automáticamente al iniciar cada diagnóstico.
function siguienteNoAvaluo() {
  const n = (parseInt(localStorage.getItem("expedientes_avaluo_seq")) || 0) + 1;
  localStorage.setItem("expedientes_avaluo_seq", String(n));
  return "AV-" + String(n).padStart(4, "0");
}

function diagClave(g, i) { return g + "|" + i; }

function diagDe(exp) {
  if (!exp.diagnostico) {
    exp.diagnostico = {
      estado: "pendiente", // pendiente | proceso | terminado
      noAvaluo: siguienteNoAvaluo(),
      inicio: new Date().toISOString(),
      mecanica: {},   // clave -> {estado: ok|atencion|mal|null, costo}
      recepcion: {},  // clave -> true|false|null
      // hojalatería y pintura por pieza: hojalateria/pintura guardan el
      // costo registrado (tarifa de Configuración) o null si no aplica
      piezas: [],     // [{nombre, foto:{data,fecha}, hojalateria, pintura}]
      observaciones: "",
      fotos: {},      // key -> {data, fecha}
      clonacion: {},  // key -> true (pasa) | false (no pasa) | null
      terminadoFecha: null,
      terminadoPor: null,
    };
  }
  if (!exp.diagnostico.clonacion) exp.diagnostico.clonacion = {};
  // Migración del formato anterior (importes globales de hojalatería/pintura)
  if (!Array.isArray(exp.diagnostico.piezas)) {
    exp.diagnostico.piezas = [];
    ["hojalateria", "pintura"].forEach(k => {
      const viejo = exp.diagnostico[k];
      if (viejo && (Number(viejo.importe) || 0) > 0) {
        exp.diagnostico.piezas.push({
          nombre: (viejo.piezas ? viejo.piezas + " " : "") + `(${k === "hojalateria" ? "hojalatería" : "pintura"}, registro anterior)`,
          foto: null,
          hojalateria: k === "hojalateria" ? Number(viejo.importe) : null,
          pintura: k === "pintura" ? Number(viejo.importe) : null,
        });
      }
      delete exp.diagnostico[k];
    });
  }
  // Migración de piezas con costo manual (versión anterior)
  exp.diagnostico.piezas.forEach(p => {
    if (p.costo !== undefined) {
      if (p.hojalateria === undefined) p.hojalateria = p.costo ?? null;
      if (p.pintura === undefined) p.pintura = null;
      delete p.costo;
    }
    if (p.hojalateria === undefined) p.hojalateria = null;
    if (p.pintura === undefined) p.pintura = null;
  });
  // Diagnósticos creados con la versión anterior: se les asigna su número
  if (!exp.diagnostico.noAvaluo) {
    exp.diagnostico.noAvaluo = (exp.diagnostico.datos && exp.diagnostico.datos.noAvaluo) || siguienteNoAvaluo();
    guardar();
  }
  return exp.diagnostico;
}

// true si alguna prueba de clonación está marcada como NO pasa
function clonacionFalla(exp) {
  const dg = diagDe(exp);
  return DIAG_FOTOS.some(f => f.clonacion && dg.clonacion[f.key] === false);
}

function diagTotalMecanica(exp) {
  const dg = diagDe(exp);
  let t = 0;
  Object.values(dg.mecanica).forEach(m => { t += Number(m.costo) || 0; });
  return t;
}

function diagTotalPiezas(exp) {
  const dg = diagDe(exp);
  return dg.piezas.reduce((s, p) => s + (Number(p.hojalateria) || 0) + (Number(p.pintura) || 0), 0);
}

function diagTotalValuacion(exp) {
  return diagTotalMecanica(exp) + diagTotalPiezas(exp);
}

function diagFotosCompletas(exp) {
  const dg = diagDe(exp);
  return DIAG_FOTOS.filter(f => dg.fotos[f.key]).length;
}

function diagChip(exp) {
  const dg = exp.diagnostico;
  if (dg && dg.estado === "terminado") return `<span class="estado estado-completo">Diagnóstico terminado</span>`;
  if (dg && dg.estado === "proceso") return `<span class="estado estado-revision">Diagnóstico en proceso</span>`;
  return `<span class="estado estado-proceso">Diagnóstico pendiente</span>`;
}

/* ---------------- Vista del diagnóstico ---------------- */

function renderDiagnostico(exp) {
  mostrar("view-expediente");
  const dg = diagDe(exp);
  const editable = dg.estado !== "terminado";

  document.getElementById("exp-cliente").textContent = exp.cliente;
  document.getElementById("exp-meta").textContent =
    (exp.unidad ? exp.unidad + " · " : "") + "Formato de avalúo · " + nombreDe(sesion.id);
  const nf = diagFotosCompletas(exp);
  document.getElementById("exp-progress").style.width = (nf / DIAG_FOTOS.length * 100) + "%";
  document.getElementById("exp-progress-label").textContent = `${nf}/${DIAG_FOTOS.length} fotos obligatorias`;

  const cont = document.getElementById("lista-documentos");

  /* --- Datos básicos: solo el número de avalúo, automático --- */
  const datos = `
  <div class="doc-item">
    <div class="card-row">
      <div class="doc-nombre">📋 No. de avalúo</div>
      <span class="estado estado-completo" style="font-size:14px"><b>${esc(dg.noAvaluo)}</b></span>
    </div>
    <div class="doc-fecha">Generado automáticamente al iniciar el diagnóstico${dg.inicio ? " · " + fechaCorta(dg.inicio) : ""}.</div>
  </div>`;

  /* --- Mecánica con semáforo y costo --- */
  const mecanica = DIAG_MECANICA.map(g => `
  <div class="doc-item">
    <div class="doc-nombre">🔩 ${g.grupo}</div>
    ${g.items.map((item, i) => {
      const k = diagClave(g.grupo, i);
      const m = dg.mecanica[k] || { estado: null, costo: null };
      const conCosto = m.estado === "atencion" || m.estado === "mal";
      return `
      <div class="diag-item">
        <span class="diag-nombre">${item}</span>
        <span class="diag-semaforo">
          <button class="sem sem-ok ${m.estado === "ok" ? "on" : ""}" ${editable ? "" : "disabled"} onclick="setDiagMecanica('${k}','ok')" title="Bien">●</button>
          <button class="sem sem-atencion ${m.estado === "atencion" ? "on" : ""}" ${editable ? "" : "disabled"} onclick="setDiagMecanica('${k}','atencion')" title="Atención">●</button>
          <button class="sem sem-mal ${m.estado === "mal" ? "on" : ""}" ${editable ? "" : "disabled"} onclick="setDiagMecanica('${k}','mal')" title="Mal">●</button>
        </span>
        ${conCosto ? `<input class="diag-costo" type="number" inputmode="decimal" placeholder="$ costo" value="${m.costo ?? ""}"
          ${editable ? "" : "disabled"} onchange="setDiagCosto('${k}', this.value)">` : `<span class="diag-costo-vacio"></span>`}
      </div>`;
    }).join("")}
  </div>`).join("");

  /* --- Hojalatería y pintura: piezas por reparar con foto --- */
  const piezasHTML = dg.piezas.map((p, i) => {
    const subtotal = (Number(p.hojalateria) || 0) + (Number(p.pintura) || 0);
    return `
    <div class="pieza-card">
      ${p.foto
        ? `<img class="pieza-foto" src="${p.foto.data}" alt="Pieza ${i + 1}" onclick="verFotoPieza(${i})">`
        : `<div class="pieza-foto pieza-sin-foto" ${editable ? `onclick="tomarFotoPieza(${i})"` : ""}>📷<br>Tomar foto</div>`}
      <div class="pieza-datos">
        <label class="dato-campo">Pieza ${i + 1}
          <input type="text" value="${esc(p.nombre || "")}" placeholder="ej. Cofre, puerta izquierda…"
            ${editable ? "" : "disabled"} onchange="setPieza(${i},'nombre',this.value)">
        </label>
        <div class="diag-sino" style="flex-wrap:wrap">
          <button class="btn-sino ${p.hojalateria !== null ? "on-si" : ""}" ${editable ? "" : "disabled"}
            onclick="togglePiezaTrabajo(${i},'hojalateria')">🔨 Hojalatería${p.hojalateria !== null ? " " + dinero(p.hojalateria) : ""}</button>
          <button class="btn-sino ${p.pintura !== null ? "on-si" : ""}" ${editable ? "" : "disabled"}
            onclick="togglePiezaTrabajo(${i},'pintura')">🎨 Pintura${p.pintura !== null ? " " + dinero(p.pintura) : ""}</button>
        </div>
        <div class="doc-fecha">Subtotal de la pieza: <b>${dinero(subtotal)}</b></div>
        ${editable ? `
        <div class="doc-actions" style="margin-top:6px">
          <button class="btn" style="padding:7px 11px;font-size:13px" onclick="tomarFotoPieza(${i})">📷 ${p.foto ? "Reemplazar foto" : "Tomar foto"}</button>
          <button class="btn btn-danger" style="padding:7px 11px;font-size:13px" onclick="quitarPieza(${i})">✕ Quitar</button>
        </div>` : ""}
        ${!p.foto || (p.hojalateria === null && p.pintura === null) ? `<div class="doc-fecha" style="color:var(--ambar)">⚠️ ${!p.foto ? "Falta la foto de la pieza. " : ""}${p.hojalateria === null && p.pintura === null ? "Marca Hojalatería y/o Pintura." : ""}</div>` : ""}
      </div>
    </div>`;
  }).join("");

  const carroceria = `
  <div class="doc-item">
    <div class="card-row">
      <div class="doc-nombre">🚘 Hojalatería y pintura — piezas por reparar</div>
      <span class="estado ${dg.piezas.length ? "estado-revision" : "estado-proceso"}">${dg.piezas.length} pieza${dg.piezas.length !== 1 ? "s" : ""} · ${dinero(diagTotalPiezas(exp))}</span>
    </div>
    <div class="doc-fecha">Costos por pieza configurados por Administración Central: Hojalatería ${tarifas.hojalateria === null ? "sin configurar" : dinero(tarifas.hojalateria)} · Pintura ${tarifas.pintura === null ? "sin configurar" : dinero(tarifas.pintura)}.</div>
    ${dg.piezas.length ? piezasHTML : `<div class="doc-fecha">Sin piezas registradas.</div>`}
    ${editable ? `<div class="doc-actions"><button class="btn btn-primary" onclick="agregarPieza()">＋ Agregar pieza</button></div>` : ""}
  </div>`;

  /* --- Recepción de unidad --- */
  const recepcion = DIAG_RECEPCION.map(g => `
  <div class="doc-item">
    <div class="doc-nombre">📦 ${g.grupo}</div>
    ${g.items.map((item, i) => {
      const k = diagClave(g.grupo, i);
      const val = dg.recepcion[k];
      return `
      <div class="diag-item">
        <span class="diag-nombre">${item}</span>
        <span class="diag-sino">
          <button class="btn-sino ${val === true ? "on-si" : ""}" ${editable ? "" : "disabled"} onclick="setDiagRecepcion('${k}', true)">Sí</button>
          <button class="btn-sino ${val === false ? "on-no" : ""}" ${editable ? "" : "disabled"} onclick="setDiagRecepcion('${k}', false)">No</button>
        </span>
      </div>`;
    }).join("")}
  </div>`).join("");

  /* --- Observaciones --- */
  const obs = `
  <div class="doc-item">
    <div class="doc-nombre">📝 Observaciones</div>
    <textarea class="diag-obs" rows="3" ${editable ? "" : "disabled"} placeholder="Notas del valuador…"
      onchange="setDiagObs(this.value)">${esc(dg.observaciones)}</textarea>
  </div>`;

  /* --- Fotografías obligatorias --- */
  const fotos = `
  <div class="doc-item doc-inv">
    <div class="card-row">
      <div class="doc-nombre">📷 Fotografías obligatorias</div>
      <span class="estado ${nf === DIAG_FOTOS.length ? "estado-completo" : "estado-revision"}">${nf}/${DIAG_FOTOS.length}</span>
    </div>
    <div class="doc-fecha">Las 4 son obligatorias para terminar el diagnóstico.</div>
    ${DIAG_FOTOS.map(f => {
      const foto = dg.fotos[f.key];
      const clon = dg.clonacion[f.key];
      const completo = foto && (!f.clonacion || clon !== null && clon !== undefined);
      return `
      <div class="diag-item" style="flex-wrap:wrap">
        <span class="diag-nombre">${completo ? "✅" : "⬜"} ${f.nombre}</span>
        <span class="doc-actions" style="margin:0">
          ${foto ? `<button class="btn" style="padding:8px 12px" onclick="verFotoDiag('${f.key}')">Ver</button>` : ""}
          ${editable ? `<button class="btn ${foto ? "" : "btn-primary"}" style="padding:8px 12px" onclick="tomarFotoDiag('${f.key}')">📷 ${foto ? "Reemplazar" : "Tomar"}</button>` : ""}
        </span>
        ${f.clonacion ? `
        <span class="diag-clonacion">
          Prueba de clonación:
          <span class="diag-sino">
            <button class="btn-sino ${clon === true ? "on-si" : ""}" ${editable ? "" : "disabled"} onclick="setDiagClonacion('${f.key}', true)">✓ Pasa</button>
            <button class="btn-sino ${clon === false ? "on-no" : ""}" ${editable ? "" : "disabled"} onclick="setDiagClonacion('${f.key}', false)">✕ No pasa</button>
          </span>
        </span>` : ""}
      </div>`;
    }).join("")}
    ${clonacionFalla(exp) ? `<div class="doc-motivo" style="margin-top:10px">⚠️ Atención: hay prueba(s) de clonación marcadas como NO PASA.</div>` : ""}
  </div>`;

  /* --- Total y cierre --- */
  const total = diagTotalValuacion(exp);
  const cierre = `
  <div class="doc-item ${dg.estado === "terminado" ? "inv-guardado" : "doc-inv"}">
    <div class="card-row">
      <div class="doc-nombre">💲 Total de valuación (se descuenta de la oferta)</div>
      <span class="estado ${dg.estado === "terminado" ? "estado-completo" : "estado-proceso"}"><b>${dinero(total)}</b></span>
    </div>
    <div class="doc-fecha">Mecánica: ${dinero(diagTotalMecanica(exp))} · Hojalatería y pintura (${dg.piezas.length} pieza${dg.piezas.length !== 1 ? "s" : ""}): ${dinero(diagTotalPiezas(exp))}</div>
    ${dg.estado === "terminado"
      ? `<div class="doc-fecha">✅ Terminado el ${fechaCorta(dg.terminadoFecha)} por ${esc(nombreDe(dg.terminadoPor))}.</div>
         ${exp.oferta.estado !== "aceptada" ? `<div class="doc-actions"><button class="btn" onclick="reabrirDiagnostico('${exp.id}')">Reabrir diagnóstico</button></div>` : ""}`
      : `<div class="doc-actions"><button class="btn btn-success" onclick="terminarDiagnostico('${exp.id}')">✅ Terminar diagnóstico</button></div>
         ${nf < DIAG_FOTOS.length ? `<div class="doc-fecha">⚠️ Faltan ${DIAG_FOTOS.length - nf} fotografía(s) obligatoria(s).</div>` : ""}`}
  </div>`;

  cont.innerHTML = datos + mecanica + carroceria + recepcion + obs + fotos + cierre;
}

/* ---------------- Captura de valores ---------------- */

function expDiag() { return expedientes.find(e => e.id === expedienteAbierto); }

function tocaDiag(exp) {
  const dg = diagDe(exp);
  if (dg.estado === "pendiente") dg.estado = "proceso";
}

function setDiagMecanica(k, estado) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  tocaDiag(exp);
  const m = dg.mecanica[k] || { estado: null, costo: null };
  m.estado = m.estado === estado ? null : estado; // volver a tocar apaga
  if (m.estado === "ok" || m.estado === null) m.costo = null;
  dg.mecanica[k] = m;
  guardar();
  renderDiagnostico(exp);
}

function setDiagCosto(k, valor) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  tocaDiag(exp);
  if (!dg.mecanica[k]) dg.mecanica[k] = { estado: "atencion", costo: null };
  dg.mecanica[k].costo = valor === "" ? null : parseFloat(valor);
  guardar();
  renderDiagnostico(exp);
}

function setDiagRecepcion(k, valor) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  tocaDiag(exp);
  dg.recepcion[k] = dg.recepcion[k] === valor ? null : valor;
  guardar();
  renderDiagnostico(exp);
}

/* --- Piezas de hojalatería y pintura --- */

let piezaEnFoto = null; // índice de la pieza a fotografiar

// Agrega un renglón de pieza vacío; la foto se toma desde el renglón
function agregarPieza() {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  tocaDiag(exp);
  dg.piezas.push({ nombre: "", foto: null, hojalateria: null, pintura: null });
  guardar();
  renderDiagnostico(exp);
  toast("Pieza agregada: toma su foto y marca Hojalatería y/o Pintura.");
}

function tomarFotoPieza(i) {
  piezaEnFoto = i;
  const input = document.getElementById("input-diag");
  input.value = "";
  input.click();
}

function setPieza(i, campo, valor) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  if (!dg.piezas[i]) return;
  tocaDiag(exp);
  dg.piezas[i][campo] = valor.trim();
  guardar();
  renderDiagnostico(exp);
}

// Marca o desmarca Hojalatería/Pintura en la pieza; al marcar registra
// el costo configurado por Administración Central.
function togglePiezaTrabajo(i, tipo) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  const p = dg.piezas[i];
  if (!p) return;
  tocaDiag(exp);
  if (p[tipo] !== null) {
    p[tipo] = null;
  } else {
    if (tarifas[tipo] === null || tarifas[tipo] === undefined) {
      toast(`⚠️ El costo de ${tipo === "hojalateria" ? "hojalatería" : "pintura"} no está configurado. Pídelo a Administración Central (⚙️ Configuración).`);
      return;
    }
    p[tipo] = Number(tarifas[tipo]);
  }
  guardar();
  renderDiagnostico(exp);
}

function quitarPieza(i) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  if (!dg.piezas[i]) return;
  if (!confirm(`¿Quitar la pieza ${i + 1}${dg.piezas[i].nombre ? " (" + dg.piezas[i].nombre + ")" : ""}?`)) return;
  tocaDiag(exp);
  dg.piezas.splice(i, 1);
  guardar();
  renderDiagnostico(exp);
}

function verFotoPieza(i) {
  const exp = expDiag(); if (!exp) return;
  const p = diagDe(exp).piezas[i];
  if (!p || !p.foto) return;
  document.getElementById("foto-titulo").textContent = p.nombre || `Pieza ${i + 1}`;
  document.getElementById("foto-img").src = p.foto.data;
  document.getElementById("foto-nombre").textContent = "Tomada el " + fechaCorta(p.foto.fecha);
  document.getElementById("modal-foto").classList.remove("hidden");
}

function setDiagObs(valor) {
  const exp = expDiag(); if (!exp) return;
  tocaDiag(exp);
  diagDe(exp).observaciones = valor;
  guardar();
}

/* ---------------- Fotografías obligatorias ---------------- */

function tomarFotoDiag(key) {
  diagFotoEnSubida = key;
  const input = document.getElementById("input-diag");
  input.value = "";
  input.click();
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("input-diag");
  if (input) input.addEventListener("change", async ev => {
    const file = ev.target.files[0];
    if (!file || (!diagFotoEnSubida && piezaEnFoto === null)) return;
    const exp = expDiag(); if (!exp) return;
    const data = await comprimirImagen(file);
    if (!data) { toast("No se pudo leer la foto."); return; }
    const dg = diagDe(exp);
    tocaDiag(exp);

    if (piezaEnFoto !== null) {
      // Foto de una pieza de hojalatería/pintura
      const idx = piezaEnFoto;
      piezaEnFoto = null;
      if (dg.piezas[idx]) {
        const anterior = dg.piezas[idx].foto;
        dg.piezas[idx].foto = { data, fecha: new Date().toISOString() };
        if (!guardar()) { dg.piezas[idx].foto = anterior; guardar(); }
      }
      renderDiagnostico(exp);
      toast("📷 Foto de la pieza guardada.");
      return;
    }

    // Fotografía obligatoria
    dg.fotos[diagFotoEnSubida] = { data, fecha: new Date().toISOString() };
    diagFotoEnSubida = null;
    if (!guardar()) { delete dg.fotos[diagFotoEnSubida]; guardar(); }
    renderDiagnostico(exp);
    toast("📷 Fotografía guardada.");
  });
});

function setDiagClonacion(key, valor) {
  const exp = expDiag(); if (!exp) return;
  const dg = diagDe(exp);
  tocaDiag(exp);
  dg.clonacion[key] = dg.clonacion[key] === valor ? null : valor;
  guardar();
  renderDiagnostico(exp);
}

function verFotoDiag(key) {
  const exp = expDiag(); if (!exp) return;
  const foto = diagDe(exp).fotos[key];
  if (!foto) return;
  const f = DIAG_FOTOS.find(x => x.key === key);
  document.getElementById("foto-titulo").textContent = f.nombre;
  document.getElementById("foto-img").src = foto.data;
  document.getElementById("foto-nombre").textContent = "Tomada el " + fechaCorta(foto.fecha);
  document.getElementById("modal-foto").classList.remove("hidden");
}

/* ---------------- Terminar / reabrir ---------------- */

function terminarDiagnostico(expId) {
  const exp = expedientes.find(e => e.id === expId);
  if (!exp) return;
  const dg = diagDe(exp);
  const faltan = DIAG_FOTOS.filter(f => !dg.fotos[f.key]).map(f => f.nombre);
  if (faltan.length > 0) {
    toast(`⚠️ Para terminar faltan las fotografías: ${faltan.join(", ")}.`);
    return;
  }
  const sinClonacion = DIAG_FOTOS.filter(f => f.clonacion && (dg.clonacion[f.key] === null || dg.clonacion[f.key] === undefined)).map(f => f.nombre);
  if (sinClonacion.length > 0) {
    toast(`⚠️ Indica si la prueba de clonación pasa o no en: ${sinClonacion.join(", ")}.`);
    return;
  }
  const total = diagTotalValuacion(exp);
  const avisoClon = clonacionFalla(exp) ? "\n\n⚠️ OJO: hay pruebas de clonación marcadas como NO PASA." : "";
  if (!confirm(`¿Terminar el diagnóstico con un total de valuación de ${dinero(total)}? Este monto se descontará en la oferta como diagnóstico mecánico.${avisoClon}`)) return;
  dg.estado = "terminado";
  dg.terminadoFecha = new Date().toISOString();
  dg.terminadoPor = sesion.id;
  if (exp.oferta.estado !== "aceptada") {
    exp.oferta.diagnostico = total;
  }
  guardar();
  renderDiagnostico(exp);
  toast(`✅ Diagnóstico terminado. Se descontarán ${dinero(total)} en la oferta.`);
}

function reabrirDiagnostico(expId) {
  const exp = expedientes.find(e => e.id === expId);
  if (!exp) return;
  if (exp.oferta.estado === "aceptada") { toast("La oferta ya fue aceptada; el diagnóstico no puede reabrirse."); return; }
  const dg = diagDe(exp);
  dg.estado = "proceso";
  exp.oferta.diagnostico = null;
  guardar();
  renderDiagnostico(exp);
  toast("El diagnóstico se reabrió para edición; el descuento se quitó de la oferta hasta que lo termines de nuevo.");
}
