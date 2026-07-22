/* ============================================================
   Contratos — plantillas, llenado automático y liberación
   Basado en "Formato de Contrato Prueba.xlsx".
   - Descarga: asesores y representantes de compras.
   - Datos manuales: administrativo de compras (y Adm. Central).
   - Liberación:
     · C-V, Responsiva, Carta instrucción y Pagaré: pasos 1 y 2.
     · CFDI: INE y constancia de situación fiscal aprobados.
   ============================================================ */

const CONTRATOS = [
  { key: "cv",         nombre: "Contrato de compra-venta" },
  { key: "responsiva", nombre: "Carta responsiva" },
  { key: "carta",      nombre: "Carta instrucción para pago" },
  { key: "pagare",     nombre: "Pagaré" },
  { key: "cfdi",       nombre: "Solicitud de expedición de CFDI" },
];

const EMPRESA = {
  nombre: "Dalton Seminuevos.com S.A. DE C.V.",
  rfc: "DAU131211FU7",
  domicilio: "Av. López Mateos Sur 3780, Colonia La Calma, C.P. 45070, Zapopan, Jalisco",
  telefono: "5000-0101",
  apoderado: "AARON DAVID MARTÍNEZ SORIANO",
  representanteRubro: "Jonathan Medina Huerta",
};

let datosExpId = null; // expediente abierto en el modal de datos

function datosVacios() {
  return {
    // Se obtiene de INE
    nombreCliente: "", folioIne: "", vencimientoIne: "",
    // Se obtiene de constancia de situación fiscal
    rfc: "", curp: "", domicilio: "", colonia: "", municipio: "", estado: "", cp: "", telefono: "",
    // Se obtiene de factura de origen
    marca: "", tipo: "", version: "", modeloAnio: "", color: "", motor: "",
    facturaNumero: "", facturaExpedidaPor: "",
    // Se obtiene de refrendo
    placas: "",
    // Manual — pagaré
    pagareMonto: null, pagareVencimiento: "",
    // Manual — carta instrucción
    pagos: [
      { a: "", monto: null, concepto: "por concepto de adeudos" },
      { a: "", monto: null, concepto: "por concepto de compra de auto nuevo" },
      { a: "", monto: null, concepto: "por concepto de liquidación de crédito" },
    ],
    autoPedido: "", autoVin: "", autoNombre: "", autoMarca: "", autoModelo: "", autoAnio: "",
  };
}

function datosDe(exp) {
  if (!exp.datosContrato) exp.datosContrato = datosVacios();
  if (!Array.isArray(exp.datosContrato.pagos)) exp.datosContrato.pagos = datosVacios().pagos;
  return exp.datosContrato;
}

/* ---------------- Liberación ---------------- */

function contratoDisponible(key, exp) {
  if (key === "cfdi") {
    const ok = exp.docs.ine.estado === "aprobado" && exp.docs.csf.estado === "aprobado";
    return { ok, motivo: ok ? "" : "Se libera al aprobarse el INE y la constancia de situación fiscal." };
  }
  const ok = fase1Completa(exp) && fase2Completa(exp);
  return { ok, motivo: ok ? "" : "Se libera al concluir el paso 1 (oferta aceptada) y el paso 2 (expediente completo y auto entregado)." };
}

function hayContratoLiberado(exp) {
  return CONTRATOS.some(c => contratoDisponible(c.key, exp).ok);
}

/* ---------------- Número a letras (pesos M.N.) ---------------- */

function numeroALetras(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  const U = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ",
    "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE"];
  const D = ["", "", "VEINTI", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const C = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  function tresCifras(x) {
    if (x === 0) return "";
    if (x === 100) return "CIEN";
    let s = "";
    const c = Math.floor(x / 100), r = x % 100;
    if (c) s += C[c] + " ";
    if (r <= 20) s += U[r];
    else {
      const d = Math.floor(r / 10), u = r % 10;
      if (d === 2) s += u ? "VEINTI" + U[u] : "VEINTE";
      else s += D[d] + (u ? " Y " + U[u] : "");
    }
    return s.trim();
  }

  const entero = Math.floor(Math.abs(n));
  const centavos = Math.round((Math.abs(n) - entero) * 100);
  let letras = "";
  const millones = Math.floor(entero / 1000000);
  const miles = Math.floor((entero % 1000000) / 1000);
  const resto = entero % 1000;
  if (millones) letras += (millones === 1 ? "UN MILLÓN" : tresCifras(millones) + " MILLONES") + " ";
  if (miles) letras += (miles === 1 ? "MIL" : tresCifras(miles) + " MIL") + " ";
  if (resto) letras += tresCifras(resto);
  if (!letras.trim()) letras = "CERO";
  return `(${letras.trim()} PESOS ${String(centavos).padStart(2, "0")}/100 M.N.)`;
}

/* ---------------- Modal de datos de contratos ---------------- */

function abrirDatosContratos(expId) {
  datosExpId = expId;
  renderDatosContratos();
  document.getElementById("modal-datos").classList.remove("hidden");
}

function renderDatosContratos() {
  const exp = expedientes.find(e => e.id === datosExpId);
  if (!exp) return;
  const d = datosDe(exp);
  const precio = ofertaFinalDe(exp);
  const totalPagos = d.pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const remanente = precio === null ? null : precio - totalPagos;

  const campo = (etiqueta, key, placeholder = "", tipo = "text") => `
    <label class="dato-campo">${etiqueta}
      <input type="${tipo}" value="${esc(d[key] ?? "")}" placeholder="${esc(placeholder)}"
        onchange="setDatoContrato('${key}', this.value)">
    </label>`;

  document.getElementById("modal-datos-inner").innerHTML = `
    <h3>📝 Datos de contratos</h3>
    <p class="rev-sub">Cliente: ${esc(exp.cliente)} · Precio (oferta final aceptada): <b>${dinero(precio)}</b> ${numeroALetras(precio)}</p>
    <div class="doc-actions" style="margin-bottom:12px">
      <button class="btn btn-primary" id="btn-autoleer" onclick="autoLeerDatosContratos()">🪄 Llenar automáticamente desde los documentos</button>
    </div>
    <p class="rev-sub" id="datos-estado"></p>

    <h4 class="dato-seccion">👤 Del INE</h4>
    <div class="dato-grid">
      ${campo("Nombre completo del cliente", "nombreCliente", "como aparece en el INE")}
      ${campo("Folio de identificación", "folioIne")}
      ${campo("Vencimiento del INE", "vencimientoIne", "ej. 2031")}
    </div>

    <h4 class="dato-seccion">🧾 De la constancia de situación fiscal</h4>
    <div class="dato-grid">
      ${campo("RFC", "rfc")}
      ${campo("CURP", "curp")}
      ${campo("Domicilio (calle y número)", "domicilio")}
      ${campo("Colonia", "colonia")}
      ${campo("Municipio", "municipio")}
      ${campo("Estado", "estado")}
      ${campo("C.P.", "cp")}
      ${campo("Teléfono", "telefono")}
    </div>

    <h4 class="dato-seccion">🚗 De la factura de origen y refrendo</h4>
    <div class="dato-grid">
      ${campo("Marca", "marca")}
      ${campo("Tipo", "tipo")}
      ${campo("Versión / submarca", "version")}
      ${campo("Modelo (año)", "modeloAnio")}
      ${campo("Color exterior", "color")}
      ${campo("Número de motor", "motor")}
      ${campo("Número de factura", "facturaNumero")}
      ${campo("Factura expedida por", "facturaExpedidaPor")}
      ${campo("Placas (del refrendo)", "placas")}
      <label class="dato-campo">No. de serie (VIN)
        <input type="text" value="${esc(exp.vin || "")}" disabled title="Se captura con el botón Número de serie del expediente">
      </label>
    </div>

    <h4 class="dato-seccion">💵 Pagaré (manual)</h4>
    <div class="dato-grid">
      <label class="dato-campo">Monto del pagaré
        <input type="number" value="${d.pagareMonto ?? ""}" placeholder="ej. ${precio ?? 0}"
          onchange="setDatoContrato('pagareMonto', this.value)">
      </label>
      ${campo("Vencimiento del pagaré", "pagareVencimiento", "ej. 15 de agosto de 2026")}
    </div>

    <h4 class="dato-seccion">📄 Carta instrucción — pagos por cuenta del cliente (manual)</h4>
    ${d.pagos.map((p, i) => `
      <div class="dato-grid" style="margin-bottom:6px">
        <label class="dato-campo">Pago ${i + 1} — beneficiario
          <input type="text" value="${esc(p.a || "")}" placeholder="a quién se paga" onchange="setPagoContrato(${i},'a',this.value)">
        </label>
        <label class="dato-campo">Monto
          <input type="number" value="${p.monto ?? ""}" onchange="setPagoContrato(${i},'monto',this.value)">
        </label>
        <label class="dato-campo">Concepto
          <input type="text" value="${esc(p.concepto || "")}" onchange="setPagoContrato(${i},'concepto',this.value)">
        </label>
      </div>`).join("")}
    <p class="rev-sub">Remanente a entregar al cliente: <b>${dinero(remanente)}</b> ${numeroALetras(remanente)}</p>

    <h4 class="dato-seccion">🚙 Datos del auto que compra el cliente (si aplica, manual)</h4>
    <div class="dato-grid">
      ${campo("Pedido", "autoPedido")}
      ${campo("VIN del auto nuevo", "autoVin")}
      ${campo("A nombre de", "autoNombre")}
      ${campo("Marca", "autoMarca")}
      ${campo("Modelo", "autoModelo")}
      ${campo("Año", "autoAnio")}
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary btn-block" onclick="cerrarModal('modal-datos')">Listo</button>
    </div>`;
}

function setDatoContrato(key, valor) {
  const exp = expedientes.find(e => e.id === datosExpId);
  if (!exp) return;
  const d = datosDe(exp);
  d[key] = key === "pagareMonto" ? (valor === "" ? null : parseFloat(valor)) : valor.trim();
  guardar();
  renderDatosContratos();
}

function setPagoContrato(i, key, valor) {
  const exp = expedientes.find(e => e.id === datosExpId);
  if (!exp) return;
  const d = datosDe(exp);
  d.pagos[i][key] = key === "monto" ? (valor === "" ? null : parseFloat(valor)) : valor.trim();
  guardar();
  renderDatosContratos();
}

/* ---------------- Llenado automático desde documentos ---------------- */

function buscarEtiqueta(texto, regex) {
  const m = texto.match(regex);
  return m ? m[1].trim().replace(/\s{2,}/g, " ") : "";
}

async function autoLeerDatosContratos() {
  const exp = expedientes.find(e => e.id === datosExpId);
  if (!exp) return;
  const d = datosDe(exp);
  const estado = document.getElementById("datos-estado");
  const boton = document.getElementById("btn-autoleer");
  boton.disabled = true;

  // Junta el texto de los documentos por fuente
  const fuentes = { csf: "", facturas: "", ine: "", refrendos: "", tarjeta: "" };
  let usoOcr = false;
  try {
    for (const k of Object.keys(fuentes)) {
      const doc = exp.docs[k];
      if (!doc) continue;
      for (const a of doc.archivos) {
        if (a.tipo === "pdf") {
          estado.textContent = `📄 Leyendo PDF de ${k}…`;
          try {
            const pdf = await abrirDocPdf(a.data);
            let t = await textoDePdf(pdf);
            if (t.replace(/\s/g, "").length < 40) { // PDF escaneado: OCR de la primera página
              if (!usoOcr) { estado.textContent = "Descargando lector de texto…"; await cargarScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"); usoOcr = true; }
              estado.textContent = `🔍 Leyendo (OCR) PDF de ${k}…`;
              const img = await imagenDePaginaPdf(pdf, 1);
              t = (await Tesseract.recognize(img, "spa+eng").catch(() => Tesseract.recognize(img, "eng"))).data.text;
            }
            fuentes[k] += "\n" + t;
          } catch (e) { /* siguiente archivo */ }
        } else if (a.tipo === "imagen") {
          if (!usoOcr) { estado.textContent = "Descargando lector de texto…"; await cargarScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"); usoOcr = true; }
          estado.textContent = `🔍 Leyendo (OCR) foto de ${k}…`;
          try {
            const res = await Tesseract.recognize(a.data, "spa+eng").catch(() => Tesseract.recognize(a.data, "eng"));
            fuentes[k] += "\n" + res.data.text;
          } catch (e) { /* siguiente archivo */ }
        }
      }
    }
  } catch (e) { /* continúa con lo que se haya leído */ }

  let llenados = 0;
  const pon = (key, valor) => {
    if (valor && !d[key]) { d[key] = valor; llenados++; }
  };

  // Constancia de situación fiscal (etiquetas estándar del SAT)
  const csf = fuentes.csf.toUpperCase();
  pon("rfc", buscarEtiqueta(csf, /RFC\s*[:\s]\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/) ||
             buscarEtiqueta(csf, /\b([A-ZÑ&]{4}\d{6}[A-Z0-9]{3})\b/));
  pon("curp", buscarEtiqueta(csf, /CURP\s*[:\s]\s*([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)/) ||
              buscarEtiqueta(csf, /\b([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)\b/));
  pon("cp", buscarEtiqueta(csf, /C[OÓ]DIGO POSTAL\s*[:\s]\s*(\d{5})/));
  pon("colonia", buscarEtiqueta(csf, /COLONIA\s*[:\s]\s*([^\n:]{2,60})/));
  pon("municipio", buscarEtiqueta(csf, /MUNICIPIO O DEMARCACI[OÓ]N TERRITORIAL\s*[:\s]\s*([^\n:]{2,60})/));
  pon("estado", buscarEtiqueta(csf, /ENTIDAD FEDERATIVA\s*[:\s]\s*([^\n:]{2,60})/));
  const vialidad = buscarEtiqueta(csf, /NOMBRE DE (?:LA )?VIALIDAD\s*[:\s]\s*([^\n:]{2,60})/);
  const numExt = buscarEtiqueta(csf, /N[UÚ]MERO EXTERIOR\s*[:\s]\s*([^\n:]{1,15})/);
  if (vialidad) pon("domicilio", (vialidad + " " + numExt).trim());
  const nom = buscarEtiqueta(csf, /NOMBRE\s*\(S\)\s*[:\s]\s*([^\n:]{2,50})/);
  const ap1 = buscarEtiqueta(csf, /PRIMER APELLIDO\s*[:\s]\s*([^\n:]{2,40})/);
  const ap2 = buscarEtiqueta(csf, /SEGUNDO APELLIDO\s*[:\s]\s*([^\n:]{2,40})/);
  if (nom) pon("nombreCliente", [nom, ap1, ap2].filter(Boolean).join(" "));

  // INE (nombre y vigencia, por OCR)
  const ine = fuentes.ine.toUpperCase();
  pon("nombreCliente", buscarEtiqueta(ine, /NOMBRE\s*[:\s]\s*\n?([A-ZÁÉÍÓÚÑ ]{5,60})/));
  pon("vencimientoIne", buscarEtiqueta(ine, /VIGENCIA\s*[:\s-]*\s*(\d{4})/));
  pon("folioIne", buscarEtiqueta(ine, /IDMEX(\d{9,13})/) || buscarEtiqueta(ine, /FOLIO\s*[:\s]\s*(\d{6,15})/));
  pon("curp", buscarEtiqueta(ine, /CURP\s*[:\s]\s*([A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d)/));

  // Factura de origen
  const fac = fuentes.facturas.toUpperCase();
  pon("marca", buscarEtiqueta(fac, /MARCA\s*[:\s]\s*([A-Z0-9ÁÉÍÓÚÑ ]{2,25})/));
  pon("modeloAnio", buscarEtiqueta(fac, /MODELO\s*[:\s]\s*((?:19|20)\d{2})/) || buscarEtiqueta(fac, /A[NÑ]O\s*[:\s]\s*((?:19|20)\d{2})/));
  pon("color", buscarEtiqueta(fac, /COLOR(?:\s+EXTERIOR)?\s*[:\s]\s*([A-ZÁÉÍÓÚÑ ]{3,20})/));
  pon("motor", buscarEtiqueta(fac, /(?:NO\.?\s*(?:DE)?\s*MOTOR|MOTOR)\s*[:\s]\s*([A-Z0-9-]{5,20})/));
  pon("version", buscarEtiqueta(fac, /VERSI[OÓ]N\s*[:\s]\s*([A-Z0-9ÁÉÍÓÚÑ ]{2,30})/));
  pon("facturaNumero", buscarEtiqueta(fac, /FACTURA(?:\s+NO\.?|\s+N[UÚ]MERO)?\s*[:\s#]\s*([A-Z0-9-]{2,20})/) || buscarEtiqueta(fac, /FOLIO\s*[:\s]\s*([A-Z0-9-]{2,20})/));

  // Placas (refrendo o tarjeta de circulación)
  const refr = (fuentes.refrendos + "\n" + fuentes.tarjeta).toUpperCase();
  pon("placas", buscarEtiqueta(refr, /PLACAS?\s*[:\s]\s*([A-Z0-9-]{5,10})/));

  guardar();
  boton.disabled = false;
  renderDatosContratos();
  document.getElementById("datos-estado").textContent = llenados > 0
    ? `✅ Se llenaron ${llenados} campo(s) automáticamente. Verifícalos y completa los que falten.`
    : "No se pudieron detectar datos automáticamente (revisa que las fotos/PDFs sean legibles). Captura los campos manualmente.";
}

/* ---------------- Bloques de interfaz ---------------- */

// Sección de contratos en el detalle del expediente (asesor / representante)
function contratosAsesorHTML(exp) {
  const items = CONTRATOS.map(c => {
    const disp = contratoDisponible(c.key, exp);
    return `
    <div class="doc-item">
      <div class="card-row">
        <div class="doc-nombre">${disp.ok ? "📄" : "🔒"} ${c.nombre}</div>
        ${disp.ok ? `<span class="estado estado-completo">Liberado</span>` : `<span class="estado estado-proceso">Bloqueado</span>`}
      </div>
      ${disp.ok
        ? `<div class="doc-actions">
             <button class="btn btn-primary" onclick="descargarContrato('${c.key}','${exp.id}')">⬇️ Descargar PDF</button>
             <button class="btn" onclick="enviarContratoCorreo('${c.key}','${exp.id}')">📧 Enviar por correo</button>
           </div>`
        : `<div class="doc-fecha">${disp.motivo}</div>`}
    </div>`;
  }).join("");
  return `<h3 class="config-seccion">📑 Contratos</h3>${items}`;
}

// Bloque de contratos en la tarjeta de administración
function contratosAdminHTML(exp) {
  const filas = CONTRATOS.map(c => {
    const disp = contratoDisponible(c.key, exp);
    return `${disp.ok ? "✅" : "🔒"} ${c.nombre}`;
  }).join("<br>");
  const puedeDatos = hayContratoLiberado(exp);
  return `
  <div class="inv-bloque">
    <div class="inv-titulo">📑 Contratos</div>
    <div class="doc-fecha" style="line-height:1.9">${filas}</div>
    ${puedeDatos
      ? `<div class="doc-actions"><button class="btn btn-primary" onclick="abrirDatosContratos('${exp.id}')">📝 Datos de contratos</button></div>`
      : `<div class="doc-fecha">🔒 La captura de datos se habilita al liberarse algún contrato.</div>`}
  </div>`;
}

/* ---------------- Generación de PDF ---------------- */

/* El ancho del lienzo corresponde exactamente al área útil de una hoja
   tamaño carta (215.9 mm − 2 × 12 mm de margen ≈ 725 px a 96 dpi), para
   que el contrato ocupe toda la hoja al imprimirse. */
const ESTILO_CONTRATO = `
  font-family: "Times New Roman", serif; font-size: 14px; color: #000; line-height: 1.55; width: 725px;`;

const CSS_CONTRATO = `
  h1 { font-size: 19px; text-align: center; text-transform: uppercase; margin: 0 0 18px; page-break-inside: avoid; }
  h2 { font-size: 15.5px; text-align: center; margin: 16px 0 8px; page-break-inside: avoid; }
  p { text-align: justify; margin: 9px 0; page-break-inside: avoid; }
  table.datos { border-collapse: collapse; margin: 10px 0; page-break-inside: avoid; }
  table.datos td { padding: 3px 12px 3px 0; vertical-align: top; }
  .dato { font-weight: bold; text-decoration: underline; }
  .falta { color: #b00; font-weight: bold; }
  .firmas { display: flex; justify-content: space-around; margin-top: 60px; text-align: center; gap: 40px; page-break-inside: avoid; }
  .firmas div { flex: 1; }
  .linea { border-top: 1px solid #000; padding-top: 6px; margin-top: 50px; }`;

function nombreArchivoContrato(key, exp) {
  const c = CONTRATOS.find(x => x.key === key);
  return `${c.nombre} - ${exp.cliente}`.replace(/[\\/:*?"<>|]/g, "-") + ".pdf";
}

// Genera el PDF del contrato y regresa su Blob
async function generarPdfContrato(key, exp) {
  await cargarScript("https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js");
  const cont = document.createElement("div");
  cont.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
  cont.innerHTML = `<style>${CSS_CONTRATO}</style><div style='${ESTILO_CONTRATO}'>${PLANTILLAS[key](exp, datosDe(exp))}</div>`;
  document.body.appendChild(cont);
  try {
    const blob = await html2pdf().set({
      margin: [15, 12, 15, 12],
      filename: nombreArchivoContrato(key, exp),
      image: { type: "jpeg", quality: 0.8 },
      html2canvas: { scale: 1.7, useCORS: true },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
      // "avoid-all": ningún párrafo, tabla o bloque de firmas se corta
      // entre páginas; el elemento completo pasa a la página siguiente.
      pagebreak: { mode: ["avoid-all", "css", "legacy"] },
    }).from(cont.firstElementChild.nextElementSibling).outputPdf("blob");
    return blob;
  } finally {
    cont.remove();
  }
}

async function descargarContrato(key, expId) {
  const exp = expedientes.find(e => e.id === expId);
  if (!exp) return;
  const disp = contratoDisponible(key, exp);
  if (!disp.ok) { toast(disp.motivo); return; }
  toast("⏳ Generando PDF…");
  try {
    const blob = await generarPdfContrato(key, exp);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoContrato(key, exp);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast(`⬇️ PDF descargado: ${nombreArchivoContrato(key, exp)}`);
  } catch (e) {
    toast("⚠️ No se pudo generar el PDF (¿sin internet?). Intenta de nuevo.");
  }
}

// Enviar por correo: en celular abre el menú de compartir con el PDF
// adjunto (Mail, WhatsApp, etc.); en computadora descarga el PDF y abre
// el correo con el mensaje listo para adjuntarlo.
async function enviarContratoCorreo(key, expId) {
  const exp = expedientes.find(e => e.id === expId);
  if (!exp) return;
  const disp = contratoDisponible(key, exp);
  if (!disp.ok) { toast(disp.motivo); return; }
  const c = CONTRATOS.find(x => x.key === key);

  const correo = prompt("¿A qué correo se envía el contrato?", exp.oferta.correoCliente || "");
  if (correo === null) return;

  toast("⏳ Generando PDF…");
  try {
    const blob = await generarPdfContrato(key, exp);
    const archivo = new File([blob], nombreArchivoContrato(key, exp), { type: "application/pdf" });

    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({
        files: [archivo],
        title: c.nombre,
        text: `${c.nombre} — ${exp.cliente}${correo ? ` (enviar a ${correo})` : ""}`,
      });
      toast("📧 Compartido. Elige tu app de correo para enviarlo.");
      return;
    }

    // Computadora: descarga + correo listo para adjuntar
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivoContrato(key, exp);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const asunto = encodeURIComponent(`${c.nombre} — ${exp.cliente}`);
    const cuerpo = encodeURIComponent(
`Se adjunta el documento "${c.nombre}" del expediente de ${exp.cliente}.

(El PDF se acaba de descargar en tu computadora: adjúntalo a este correo antes de enviarlo.)

Atentamente,
${sesion ? sesion.nombre : ""}
Departamento de Compras`);
    if (correo) window.location.href = `mailto:${correo}?subject=${asunto}&body=${cuerpo}`;
    toast("⬇️ PDF descargado y correo abierto: adjunta el archivo descargado y envíalo.");
  } catch (e) {
    if (e && e.name === "AbortError") return; // el usuario canceló el compartir
    toast("⚠️ No se pudo generar o compartir el PDF.");
  }
}

// Valor con marca visual cuando falta
function v(x, etiqueta) {
  const s = (x === null || x === undefined) ? "" : String(x).trim();
  return s ? `<span class="dato">${esc(s)}</span>` : `<span class="falta">[FALTA: ${esc(etiqueta)}]</span>`;
}

function fechaLarga(d) {
  return (d || new Date()).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

const PLANTILLAS = {

  /* ---------- Contrato de compra-venta ---------- */
  cv(exp, d) {
    const precio = ofertaFinalDe(exp);
    return `
<h1>Contrato de compra-venta</h1>
<p>Contrato de compra-venta, que ante los testigos que al final suscriben, celebran por una parte <b>“Dalton Seminuevos.com” S.A. DE C.V.</b>, representada en este acto por ${esc(EMPRESA.representanteRubro)} a quien en lo sucesivo se le denominará como <b>EL COMPRADOR</b> y por otra parte ${v(d.nombreCliente, "nombre del cliente (INE)")} a quién en lo sucesivo se le denominará <b>EL VENDEDOR</b> al tenor de las siguientes declaraciones y cláusulas:</p>
<h2>D E C L A R A C I O N E S</h2>
<p><b>DECLARA EL COMPRADOR POR CONDUCTO DE SU REPRESENTANTE LEGAL:</b></p>
<p>I.- Ser una sociedad anónima de capital variable, de nacionalidad mexicana y encontrarse debidamente constituida de acuerdo a las leyes del país, según consta en la escritura pública número No. 11,424 de fecha 5 de Diciembre del 2013 ante el Licenciado Jose Horacio De La Salud Ramos Ramos, Notario Público No. 100 de Guadalajara, Jalisco.</p>
<p>II.- Continúa declarando EL COMPRADOR, encontrarse debidamente representada por el Sr. ${esc(EMPRESA.apoderado)}, quien manifiesta que cuenta con facultades bastantes para obligar y comprometer a su representada en los términos de este contrato, sin que a la fecha le hayan sido revocadas, modificadas o restringidas de manera alguna tales facultades.</p>
<p>III.- Que no tiene impedimento para celebrar el presente contrato, pues sus estatutos sociales le permiten celebrar este tipo de contratos.</p>
<p>IV.- Tener su domicilio en Av. Lopez Mateos Sur 3780 Colonia La Calma C.P. 45070 en Zapopan, Jalisco y su registro Federal de Contribuyentes es ${esc(EMPRESA.rfc)}.</p>
<p><b>DECLARA “EL VENDEDOR” POR SU PROPIO DERECHO Y BAJO PROTESTA DE CONDUCIRSE CON VERDAD QUE:</b></p>
<p>I.- Llamarse como ha quedado expresado en el rubro de este contrato, tener su domicilio en ${v(d.domicilio, "domicilio (constancia fiscal)")}, Colonia ${v(d.colonia, "colonia")} en ${v(d.municipio, "municipio")}, ${v(d.estado, "estado")}.</p>
<p>II.- Que tiene capacidad jurídica y económica para obligarse en los términos del presente contrato.</p>
<p>III.- Que es el legítimo propietario del vehículo materia de este contrato y que puede disponer del mismo, pues no tiene conocimiento de limitación alguna sobre el mismo.</p>
<p>IV.- Que toda la documentación que acompaña a efecto de acreditar la propiedad del Vehículo es fidedigna y que el mismo se encuentra al corriente del pago de contribuciones e impuestos estatales y/o federales y que no tiene adeudo por concepto de multas, en cuyo caso se obliga a pagar las mismas, así como a responder ante el COMPRADOR por cualquier problema o carga de cualquier tipo que obre sobre el Vehículo y que se hayan generado con anterioridad a la fecha de firma del presente contrato.</p>
<p>Declaran y reconocen todas las partes la capacidad y personalidad con que comparecen a la celebración del presente contrato y manifiestan que es su voluntad obligarse al tenor de las siguientes:</p>
<h2>C L Á U S U L A S</h2>
<p><b>PRIMERA.-</b> EL VENDEDOR vende y EL COMPRADOR compra el vehículo automotor, que tiene las siguientes características generales:</p>
<table class="datos">
<tr><td>1) Marca:</td><td>${v(d.marca, "marca (factura)")}</td></tr>
<tr><td>2) Tipo:</td><td>${v(d.tipo, "tipo (factura)")}</td></tr>
<tr><td>3) Sub-marca:</td><td>${v(d.version, "versión (factura)")}</td></tr>
<tr><td>4) Modelo o año:</td><td>${v(d.modeloAnio, "modelo (factura)")}</td></tr>
<tr><td>5) Color Exterior:</td><td>${v(d.color, "color (factura)")}</td></tr>
<tr><td>6) Motor:</td><td>${v(d.motor, "motor (factura)")}</td></tr>
<tr><td>7) No. de Serie:</td><td>${v(exp.vin, "número de serie")}</td></tr>
<tr><td>8) Placas:</td><td>${v(d.placas, "placas (refrendo)")}</td></tr>
</table>
<p>Las partes acuerdan que el bien mueble antes descrito para efectos del presente contrato se denominará como El vehículo.</p>
<p><b>SEGUNDA.-</b> El VENDEDOR en este acto entrega al COMPRADOR la documentación en original que ampara la propiedad del vehículo descrito en la cláusula anterior, cerciorándose de que dicha documentación corresponde fielmente a sus originales, y se encuentra en regla. Factura número: ${v(d.facturaNumero, "número de factura")}, expedida por ${v(d.facturaExpedidaPor, "expedida por")}.</p>
<p><b>TERCERA.-</b> El precio de la compra-venta por el vehículo lo han determinado de común acuerdo EL VENDEDOR y EL COMPRADOR, siendo este el de ${v(precio === null ? "" : dinero(precio), "precio (oferta final)")} ${esc(numeroALetras(precio))}, EL CUAL SE CUBRE A LOS 30 DÍAS HÁBILES DESPUÉS LA FIRMA DEL PRESENTE, POR LO QUE ÉSTE INSTRUMENTO SIRVE COMO EL MÁS AMPLIO RECIBO QUE CONFORME A DERECHO CORRESPONDA.</p>
<p><b>CUARTA.-</b> EL VENDEDOR entrega en este acto al COMPRADOR, quien recibe el vehículo. EL COMPRADOR a la firma del presente contrato asume la responsabilidad sobre el buen uso del vehículo y en consecuencia se obliga también a pagar las tenencias y refrendos de el vehículo o los impuestos o derechos que en lo futuro y durante la vigencia del presente contrato llegasen a existir. Por ello EL VENDEDOR se obliga subsidiaria y solidariamente al pago de las cuotas, multas y cualquier pago de otra índole ya sea federales, estatales o municipales que se eroguen por el uso y tenencia del vehículo con anterioridad a la firma del presente contrato y pretendan ser cobradas a EL COMPRADOR, quién podrá pagarlas por cuenta del VENDEDOR en cuyo caso se adicionarán al precio total del vehículo.</p>
<p>Así mismo EL VENDEDOR se obliga a responder a todas las obligaciones y consecuencias penales, civiles, fiscales, administrativas y aquellas que se deriven del uso y tenencia del vehículo, dejando a EL COMPRADOR a salvo de cualquier responsabilidad y obligación que llegase a surgir por el uso del VEHICULO materia del presente contrato con anterioridad a la firma del mismo y para el caso de que surgiera cualquier contingencia y EL COMPRADOR requiera de la intervención de abogados o gestores, EL VENDEDOR, deberá pagar los honorarios de los mismos o si se requiere de mandato notarial para efectos de llevar a cabo un trámite administrativo, el costo de éste.</p>
<p><b>QUINTA.-</b> Los documentos que amparan la propiedad descrita en la cláusula primera se entregan a EL COMPRADOR, a la firma del presente contrato.</p>
<p><b>SEXTA.-</b> A partir de la firma del presente contrato EL COMPRADOR será el beneficiario de cualquier póliza de seguro vigente relacionada con EL VEHÍCULO.</p>
<p><b>SÉPTIMA.-</b> El COMPRADOR acepta el vehículo objeto del presente contrato en el estado en el que se encuentra, el cual le fue facilitado para su revisión general. Para el caso de que El vehículo cuente aún con garantía de Planta, la cual EL COMPRADOR será el beneficiario de la misma, pues EL VENDEDOR le cede los derechos de la misma en este acto para que EL COMPRADOR dando cumplimiento a la misma, la haga valer ante cualquier concesionario de la marca del Vehículo.</p>
<p><b>OCTAVA.-</b> El COMPRADOR a partir de la firma del presente contrato puede disponer del VEHÍCULO pudiendo en consecuencia disponer del mismo y ceder o trasmitir los derechos del presente contrato y la propiedad del vehículo en favor de quién estime pertinente.</p>
<p><b>NOVENA.-</b> Ante cualquier incumplimiento del VENDEDOR, EL COMPRADOR podrá rescindir el presente contrato, sin necesidad de requerimiento judicial, en cuyo caso se le devolverá la totalidad de las cantidades entregadas en pago por el Vehículo y EL COMPRADOR. Los contratantes convienen que por el incumplimiento de cualquiera de las obligaciones contenidas en el presente contrato, se aplicará al responsable, una pena convencional equivalente al 15% del precio del vehículo materia del presente contrato.</p>
<p><b>DÉCIMA.-</b> Todas las cantidades que reciba en pago el VENDEDOR de conformidad con lo establecido en el presente contrato, serán aplicadas por el COMPRADOR en el siguiente orden: a) al pago de todos los impuestos, tenencias y refrendo del vehículo; b) al pago de los costos y gastos en que hubiere incurrido el COMPRADOR.</p>
<p><b>DÉCIMA PRIMERA.-</b> EL COMPRADOR podrá demandar la rescisión del presente contrato y en consecuencia exigir la devolución de las cantidades pagadas y el pago de la pena convencional, cuando ocurra cualquiera de las siguientes causas: a) Cuando el vehículo objeto de la compra-venta se vea implicado en cualquier tipo de delito o averiguación previa, derivada por el uso y tenencia del VEHÍCULO, con anterioridad a la firma del presente contrato. b) Por cualquier causa, mencionando en forma enunciativa más no limitativa, embargo, aseguramiento, cambio de depositario, o cualquier otra derivada del uso o tenencia del vehículo con anterioridad a la firma del presente contrato. c) Por cualquier notificación de autoridad competente que tienda a asegurar el vehículo o no permitir la venta del mismo por parte de EL COMPRADOR, derivado de cualquier obligación adquirida por el VENDEDOR con anterioridad a la firma del presente contrato. d) Por cualquier incumplimiento a las obligaciones pactadas en el presente contrato.</p>
<p><b>DÉCIMA SEGUNDA.-</b> El VENDEDOR libera al COMPRADOR de cualquier responsabilidad que hubiere surgido o pudiese surgir con relación al origen, propiedad, posesión o cualquier otro derecho inherente al VEHICULO o partes o componentes del mismo, obligándose asimismo a responder por el saneamiento para el caso de evicción en los términos de Ley.</p>
<p><b>DÉCIMA TERCERA.-</b> El presente contrato, no podrá ser modificado sino por acuerdo escrito y firmado por las partes, en el que se estipulen las modificaciones propuestas conviniéndose en que lo aquí especificado, constituye el único acuerdo entre los contratantes, por lo que el COMPRADOR, no queda obligado por cualquier otra estipulación, declaración, promesa verbal o de cualquier otra índole que no conste en este contrato. Así mismo, en el caso de cualquier incumplimiento o violación en lo pactado a cargo del VENDEDOR, el COMPRADOR tendrá la facultad de dar por rescindido el presente contrato, obligándose el VENDEDOR a devolver en forma inmediata las cantidades recibidas en pago por el vehículo materia del presente contrato.</p>
<p><b>DÉCIMA CUARTA.-</b> Salvo que se prevea otra cosa en el presente contrato, todas las notificaciones deberán hacerse por escrito y se considerarán debidamente efectuadas si se entregan personalmente en las direcciones señaladas en este contrato, o si son transmitidas a través de telefax o correo electrónico en las direcciones y teléfonos que para tal efecto señalen las partes, y en todo caso surtirán efectos al ser recibida la confirmación de que dicha notificación fue recibida por la parte a la que fue dirigida. Las notificaciones efectuadas a través de telefax o de correo electrónico se tendrán por efectuadas siempre y cuando dichos medios puedan ser atribuibles a la parte que la envía y que estos sean accesibles de ser consultados en forma ulterior. No se tendrán por efectuadas las notificaciones que se envíen a través de medios electrónicos distintos a los autorizados por las partes. Mientras cada parte no notifique a las demás el cambio de su domicilio, los emplazamientos, notificaciones y demás diligencias judiciales y extrajudiciales se practicarán y surtirán todos sus efectos legales en el domicilio señalado en este contrato.</p>
<p><b>DÉCIMA QUINTA.-</b> Para la resolución de cualquier controversia relacionada con este contrato, las partes se someten expresamente a la jurisdicción de los tribunales del Primer partido Judicial con sede en Guadalajara, Jalisco, México, renunciando expresamente a cualquier otro fuero a que pudieran tener derecho por cualquier causa.</p>
<p>Las partes en este contrato se reconocen mutuamente la personalidad con que comparecen al otorgamiento del mismo y lo firman, por duplicado el día ${v(fechaLarga(), "fecha")} en la Ciudad de Guadalajara, Jalisco, recibiendo cada una de las partes un ejemplar del presente contrato, y en su caso, sus respectivos anexos.</p>
<div class="firmas">
  <div><div class="linea"><b>EL COMPRADOR</b><br>${esc(EMPRESA.nombre)}<br>Representado en este acto por su apoderado<br>C. ${esc(EMPRESA.apoderado)}</div></div>
  <div><div class="linea"><b>EL VENDEDOR</b><br>${v(d.nombreCliente, "nombre del cliente")}<br>Por su propio derecho</div></div>
</div>`;
  },

  /* ---------- Carta responsiva ---------- */
  responsiva(exp, d) {
    const precio = ofertaFinalDe(exp);
    const ahora = new Date();
    return `
<h1>Carta responsiva</h1>
<p>EN GUADALAJARA JALISCO SIENDO LAS ${esc(ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }))} DEL DÍA ${v(fechaLarga(ahora), "fecha")}.</p>
<p>REUNIDOS POR UNA PARTE EL COMPRADOR <b>DALTON AUTO SA DE CV</b> CON DOMICILIO EN AV LOPEZ MATEOS SUR 3780, COL. LA CALMA, ZAPOPAN, JAL, C.P. 45070, CON TELÉFONO 50000101, Y QUE SE IDENTIFICÓ CON R.F.C. ${esc(EMPRESA.rfc)}.</p>
<p>Y POR OTRA PARTE EL VENDEDOR ${v(d.nombreCliente, "nombre del cliente (INE)")} CON DOMICILIO EN ${v(d.domicilio, "domicilio (constancia fiscal)")}, COLONIA ${v(d.colonia, "colonia")}, MUNICIPIO ${v(d.municipio, "municipio")}, ESTADO ${v(d.estado, "estado")}, C.P. ${v(d.cp, "C.P.")}, TELÉFONO ${v(d.telefono, "teléfono")}.</p>
<p><b>1ª.</b> EL VENDEDOR ENTREGA EN ESTE ACTO AL COMPRADOR LOS DOCUMENTOS CORRESPONDIENTES AL AUTOMÓVIL USADO QUE A CONTINUACIÓN SE DETALLA:</p>
<table class="datos">
<tr><td>MARCA</td><td>${v(d.marca, "marca")}</td><td style="padding-left:40px">No. SERIE</td><td>${v(exp.vin, "número de serie")}</td></tr>
<tr><td>TIPO</td><td>${v(d.tipo, "tipo")}</td><td style="padding-left:40px">No. MOTOR</td><td>${v(d.motor, "motor")}</td></tr>
<tr><td>AÑO</td><td>${v(d.modeloAnio, "año")}</td><td style="padding-left:40px">No. PLACAS</td><td>${v(d.placas, "placas (refrendo)")}</td></tr>
<tr><td>COLOR</td><td>${v(d.color, "color")}</td><td style="padding-left:40px">NO. FACTURA</td><td>${v(d.facturaNumero, "número de factura")}</td></tr>
<tr><td>EXPEDIDA POR</td><td colspan="3">${v(d.facturaExpedidaPor, "expedida por")}</td></tr>
</table>
<p>QUIEN MANIFIESTA QUE ESTE AUTO ES DE SU PROPIEDAD Y LO VENDE EN LA CANTIDAD DE: ${v(precio === null ? "" : dinero(precio), "precio (oferta final)")} ${esc(numeroALetras(precio))}</p>
<p><b>2ª.</b> EL COMPRADOR DESPUÉS DE HABER REVISADO POR CUENTA PROPIA EL AUTOMÓVIL DETALLADO EN LA CLÁUSULA ANTERIOR, LO RECIBE EN LAS CONDICIONES EN LAS QUE SE ENCUENTRA.</p>
<p><b>3ª.</b> EL VENDEDOR ${v(d.nombreCliente, "nombre del cliente")} ACEPTA TODA RESPONSABILIDAD CIVIL, PENAL Y DE TRÁNSITO EN QUE SE HAYA VISTO INVOLUCRADO EL AUTOMÓVIL HASTA ANTES DE LA HORA Y FECHAS INDICADAS EN ESTA CARTA RESPONSIVA Y MANIFIESTA HABER CUBIERTO LOS PAGOS DE TENENCIAS CORRESPONDIENTES CON ESTRICTO APEGO A LA LEY. EN CASO DE CUALQUIER ANOMALÍA SE COMPROMETE A LIQUIDAR LOS GASTOS QUE DE ELLO SE ORIGINEN.</p>
<p><b>4ª.</b> EL COMPRADOR ASUME LA RESPONSABILIDAD CIVIL, PENAL Y DE TRÁNSITO EN QUE SE VIERA INVOLUCRADO DICHO AUTOMÓVIL A PARTIR DE LA HORA Y FECHAS INDICADAS EN ESTA CARTA RESPONSIVA.</p>
<p><b>5ª.</b> LAS PARTES MANIFIESTAN SU ABSOLUTA CONFORMIDAD CON LAS CLÁUSULAS QUE ANTECEDEN, FIRMANDO AL CALCE PARA CONSTANCIA.</p>
<div class="firmas">
  <div><div class="linea"><b>ACEPTO: COMPRADOR</b><br>DALTON SEMINUEVOS.COM SA DE CV<br>AV LOPEZ MATEOS SUR 3780, COL. LA CALMA<br>TEL. ${esc(EMPRESA.telefono)}</div></div>
  <div><div class="linea"><b>ACEPTO: VENDEDOR</b><br>${v(d.nombreCliente, "nombre del cliente")}<br>${v(d.domicilio, "dirección")}<br>TEL. ${v(d.telefono, "teléfono")}</div></div>
</div>`;
  },

  /* ---------- Carta instrucción para pago ---------- */
  carta(exp, d) {
    const precio = ofertaFinalDe(exp);
    const pagos = d.pagos.filter(p => p.a && p.monto);
    const totalPagos = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
    const remanente = precio === null ? null : precio - totalPagos;
    return `
<h1>Carta instrucción para pago</h1>
<p><b>DALTON SEMINUEVOS.COM, S.A. DE C.V.<br>PRESENTE</b></p>
<p>El suscrito Sr(a). ${v(d.nombreCliente, "nombre del cliente (INE)")} por medio de la presente declaro bajo protesta de conducirme con verdad que soy propietario del siguiente vehículo automotor:</p>
<table class="datos">
<tr><td>Factura:</td><td>${v(d.facturaNumero, "factura")}</td><td style="padding-left:40px">No. De Serie:</td><td>${v(exp.vin, "número de serie")}</td></tr>
<tr><td>Marca:</td><td>${v(d.marca, "marca")}</td><td style="padding-left:40px">No. De Motor:</td><td>${v(d.motor, "motor")}</td></tr>
<tr><td>Versión:</td><td>${v(d.version, "versión")}</td><td style="padding-left:40px">Color:</td><td>${v(d.color, "color")}</td></tr>
<tr><td>Modelo (año):</td><td>${v(d.modeloAnio, "modelo")}</td><td style="padding-left:40px">Placas:</td><td>${v(d.placas, "placas (refrendo)")}</td></tr>
</table>
<p>Vehículo que en este momento enajeno a la sociedad mencionada al rubro de la presente a un precio total de ${v(precio === null ? "" : dinero(precio), "precio (oferta final)")} ${esc(numeroALetras(precio))}.</p>
<p>De conformidad con los artículos 2062, 2065, 2066, 2069 y 2074 del Código Civil Federal y en virtud de que tengo diversos adeudos con varias sociedades por este medio instruyo a DALTON SEMINUEVOS.COM para que por mi cuenta realice los siguientes pagos:</p>
${pagos.length === 0 ? `<p><i>(Sin pagos por cuenta del cliente)</i></p>` : pagos.map(p => `
<p>A <span class="dato">${esc(p.a)}</span> el pago de <span class="dato">${dinero(Number(p.monto))}</span> ${esc(numeroALetras(Number(p.monto)))} ${esc(p.concepto || "")}.</p>`).join("")}
<p>Otorgando mi plena conformidad para que las cantidades arriba mencionadas sean descontadas del precio total y solo me sea entregado el importe remanente por ${v(remanente === null ? "" : dinero(remanente), "remanente")} ${esc(numeroALetras(remanente))}, sirviendo la presente como el finiquito más amplio y que en derecho corresponda respecto a la enajenación del vehículo antes descrito, deslindando a DALTON SEMINUEVOS.COM, SA DE CV de cualquier responsabilidad.</p>
${(d.autoPedido || d.autoVin || d.autoMarca) ? `
<p><b>Datos del auto que compro:</b></p>
<table class="datos">
<tr><td>Pedido:</td><td>${v(d.autoPedido, "pedido")}</td><td style="padding-left:40px">VIN:</td><td>${v(d.autoVin, "VIN")}</td></tr>
<tr><td>A nombre de:</td><td colspan="3">${v(d.autoNombre, "a nombre de")}</td></tr>
<tr><td>Marca:</td><td>${v(d.autoMarca, "marca")}</td><td style="padding-left:40px">Modelo:</td><td>${v(d.autoModelo, "modelo")} &nbsp; Año: ${v(d.autoAnio, "año")}</td></tr>
</table>` : ""}
<p>Así mismo, asumo la responsabilidad de entregar a la sociedad mencionada al rubro de la presente la factura original que acredite la propiedad del vehículo ahora enajenado.</p>
<p>Se extiende la presente para todos y cada uno de los fines legales a que haya lugar.</p>
<p style="text-align:center">Guadalajara, Jalisco, a ${v(fechaLarga(), "fecha")}</p>
<div class="firmas">
  <div><div class="linea">${v(d.nombreCliente, "nombre del cliente")}<br>Nombre y Firma del cliente</div></div>
</div>
<table class="datos" style="margin-top:30px">
<tr><td>Tipo de identificación:</td><td>INE</td></tr>
<tr><td>Folio de identificación:</td><td>${v(d.folioIne, "folio del INE")}</td></tr>
<tr><td>Fecha de vencimiento:</td><td>${v(d.vencimientoIne, "vencimiento del INE")}</td></tr>
</table>`;
  },

  /* ---------- Solicitud de expedición de CFDI ---------- */
  cfdi(exp, d) {
    return `
<h1>Solicitud de expedición de CFDI</h1>
<p style="text-align:right">Fecha: ${v(fechaLarga(), "fecha")}</p>
<p>Por este medio quien suscribe ${v(d.nombreCliente, "nombre del cliente (INE)")} con actividad preponderante consistente en <b>SIN OBLIGACIONES FISCALES</b> y domicilio fiscal ubicado en: ${v([d.domicilio, d.colonia, d.municipio, d.estado, d.cp && ("C.P. " + d.cp)].filter(Boolean).join(", "), "domicilio fiscal (constancia)")} manifiesto expresamente mi conformidad para que: <b>DALTON SEMINUEVOS.COM SA DE CV</b> con clave de RFC: ${esc(EMPRESA.rfc)} quien será adquirente de la unidad usada de la que soy propietario, emita los CFDI por las operaciones de la venta de bienes (unidad usada) que celebremos.</p>
<table class="datos">
<tr><td>Nombre completo</td><td>${v(d.nombreCliente, "nombre (INE)")}</td></tr>
<tr><td>Clave CURP</td><td>${v(d.curp, "CURP (constancia fiscal)")}</td></tr>
<tr><td>Datos de identificación oficial vigente</td><td>INE ${v(d.folioIne, "folio")}</td></tr>
<tr><td>RFC</td><td>${v(d.rfc, "RFC (constancia fiscal)")}</td></tr>
</table>
<div class="firmas"><div><div class="linea">Firma</div></div></div>
<p style="margin-top:30px"><b>Notas:</b></p>
<p style="font-size:11.5px">“La Persona Física que emitirá la factura de la venta de la unidad usada, realiza la operación como un acto accidental de comercio y no le genera obligaciones fiscales adicionales (no está sujeta a lo dispuesto en las secciones I y II del Capítulo II del Título IV de la Ley del ISR)”.</p>
<p style="font-size:11.5px">"El comprobante fiscal se expedirá para cumplir con las disposiciones fiscales establecidas en el artículo 29 del Código Fiscal de la Federación y sus reglas respectivas”.</p>
<p style="font-size:11.5px">*En el caso de la fracción IV de la regla 2.4.3. de la RMF (Enajenantes de vehículos usados), se deberá señalar como actividad preponderante “Sin actividad económica”.</p>`;
  },

  /* ---------- Pagaré ---------- */
  pagare(exp, d) {
    const monto = d.pagareMonto !== null && d.pagareMonto !== undefined ? Number(d.pagareMonto) : ofertaFinalDe(exp);
    return `
<h1>P A G A R É</h1>
<p style="text-align:right">Vencimiento al ${v(d.pagareVencimiento, "vencimiento (manual)")}<br>
Valioso por: ${v(monto === null ? "" : dinero(monto), "monto (manual)")} ${esc(numeroALetras(monto))}</p>
<p>El suscrito ${v(d.nombreCliente, "nombre del cliente (INE)")} por este pagaré reconozco deber y prometo incondicionalmente pagar a la orden de <b>DALTON SEMINUEVOS.COM SA DE CV</b> la cantidad de: ${v(monto === null ? "" : dinero(monto), "monto")} ${esc(numeroALetras(monto))}.</p>
<p>La cantidad amparada por este pagaré deberá ser pagada precisamente a su vencimiento al ${v(d.pagareVencimiento, "vencimiento")}. Este pagaré forma parte de una serie numerada de 1/1 y a partir de su vencimiento y en caso de no pago del mismo causará intereses moratorios a una tasa mensual del 5% (cinco por ciento); Los intereses moratorios serán calculados sobre la base de días efectivamente transcurridos y un año de 360 días.</p>
<p>El pago del presente Pagaré deberá ser efectuado en el domicilio de DALTONSEMINUEVOS.COM SA DE CV en Av. López Mateos sur 3780 col la Calma, en la ciudad de Zapopan, Jalisco, en la fecha de su vencimiento o en cualquier otro en el que se me requiera.</p>
<p>En el supuesto de que cualquier fecha de pago del principal o de intereses bajo el presente pagaré no sea un día hábil según lo establezca la ley aplicable, el Suscrito se obliga a efectuar el pago correspondiente el día hábil anterior.</p>
<p style="text-align:center">Guadalajara, Jalisco, a ${v(fechaLarga(), "fecha")}</p>
<div class="firmas">
  <div><div class="linea">Nombre y firma del suscriptor<br>${v(d.nombreCliente, "nombre del cliente")}<br>
  Domicilio: ${v(d.domicilio, "domicilio")} &nbsp; COL: ${v(d.colonia, "colonia")} &nbsp; CP: ${v(d.cp, "C.P.")}<br>
  Municipio: ${v(d.municipio, "municipio")}, MÉXICO</div></div>
</div>`;
  },
};
