# Expedientes de Compras — Prototipo Fase 1

Aplicación web para el departamento de compras: los asesores de venta suben con la
cámara de su celular los documentos de cada expediente de cliente, y Administración
Central los revisa y marca si son legibles y completos.

## Checklist por expediente (sube el asesor)

1. Consecutivo de facturas
2. Tarjeta de circulación
3. Consecutivo de refrendos
4. INE del cliente
5. Constancia de situación fiscal
6. Baja de placas
7. Kilometraje en odómetro

## Investigación (la realiza el administrativo de compras)

Se desbloquea cuando están aprobados: consecutivo de facturas, tarjeta de
circulación **o** consecutivo de refrendos, kilometraje en odómetro e INE.
Avanza en paralelo al resto de la documentación. El administrativo sube un PDF
por cada resultado y el check se marca automáticamente:

- REPUVE
- Adeudos vehiculares
- RUG
- Transunion
- RAPI

El asesor ve un solo check "Investigaciones", que se completa cuando las 5
investigaciones están listas. El expediente queda **Completo** cuando los 7
documentos están aprobados y la investigación está terminada.

## Cuentas de demostración

| Usuario    | PIN  | Rol                               |
|------------|------|-----------------------------------|
| `asesor1`  | 1111 | Asesor (Carlos)                   |
| `asesor2`  | 2222 | Asesora (María)                   |
| `compras1` | 3333 | Administrativa de compras (Laura) |
| `admin`    | 9999 | Administración Central            |

## Estatus de cada documento

- **Pendiente** — aún no se sube foto.
- **En revisión** — el asesor subió la foto y espera a Administración Central.
- **Aprobado** — Administración lo marcó como legible y completo.
- **Rechazado** — Administración lo rechazó con un motivo; el asesor debe volver a subirlo.

Un expediente queda **Completo** cuando sus 6 documentos están aprobados.

## Guardado de expedientes completos

Cuando un expediente queda completo (7 documentos aprobados + 5 investigaciones),
Administración Central puede guardarlo con el botón 💾. El número de serie (VIN)
se lee automáticamente por OCR de las fotos de factura / tarjeta de circulación /
refrendos (con corrección manual). La carpeta se nombra con los **últimos 8
caracteres del número de serie + nombre del cliente**.

En ⚙️ Configuración se elige la carpeta destino (Chrome/Edge de computadora);
en otros navegadores se descarga un ZIP con el mismo nombre.

## Importante: alcance del prototipo

Esta es una versión de prueba (Fase 1). Los datos y las fotos se guardan **solo en el
navegador de cada dispositivo** (localStorage): lo que sube un asesor en su teléfono
no lo ve administración en otra computadora. Sirve para validar el flujo de trabajo
con el equipo. La Fase 2 conectará la app a un servidor real (base de datos y
almacenamiento en la nube) para que todos vean la misma información.

**No subas documentos reales de clientes a esta versión de prueba.**

## Cómo se usa

- Es una página estática: basta abrir `index.html` o publicarla en GitHub Pages.
- En el celular, el botón "Subir foto" abre directamente la cámara.
