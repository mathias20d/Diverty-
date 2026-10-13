# Control de visitas y solicitudes de Diverty

Propiedad: **diverty panama**, `558641923`. Flujo web: **diverty**, `16116694654`.
ID de medición: **G-6FYQV9RK3X**. Web: https://divertypanama.netlify.app/.

## Qué consultar

- **Informes → En tiempo real:** visitantes activos y pantallas consultadas recientemente.
- **Páginas y pantallas:** elegir «Título de página y clase de pantalla» para comparar Inicio, Catálogo, Galería, Reservar, Mi reserva, categorías y nombres de paquetes. Los nombres del menú pueden variar según la colección de informes de la propiedad.
- **Adquisición de tráfico:** elegir «Fuente/medio de la sesión» para comparar Google, Facebook, Instagram y WhatsApp; revisar el evento clave `generate_lead` para ver qué fuente consigue solicitudes.
- **Eventos:** `view_item` mide el detalle de un servicio; `add_to_cart` y `remove_from_cart` miden cambios de servicios; `begin_checkout` mide la apertura de un formulario con servicios; `booking_step` mide cada paso visible; `generate_lead` mide una solicitud que se verificó guardada; `whatsapp_click` mide el clic, no un mensaje enviado.
- **Recorrido de reserva de Diverty:** informe de embudo cerrado ya guardado y publicado; cuenta usuarios que completan los pasos en orden, permitiendo acciones intermedias. No es un conteo de solicitudes ni una tasa por sesión.

## Panel e informes configurados el 12 de octubre de 2026

[Control de Diverty](https://analytics.google.com/analytics/web/?authuser=1&hl=es#/a411725064p558641923/reports/builder/16117023855?params=_u.dateOption%3DthisMonth) está publicado en **Informes → Paneles de control personalizados**. Tiene cinco indicadores: visitantes activos, visitas (sesiones), páginas consultadas (vistas), solicitudes recibidas y clics en WhatsApp. Las tres tablas muestran títulos de páginas, fuente/medio de la sesión y servicios vistos/añadidos al carrito. Los selectores de conceptos están desactivados para mantener el significado de cada tarjeta. Las tablas admiten búsqueda y muestran diez filas.

Las tarjetas de solicitudes y WhatsApp usan «Nombre del evento contiene» `generate_lead` y `whatsapp_click`, respectivamente: el selector de coincidencia exacta no ofrecía esos valores todavía. La implementación emite esos nombres completos. Si se añaden eventos con nombres similares, ajustar los filtros a coincidencia exacta cuando el selector los ofrezca.

Colección **Diverty: visitas y solicitudes**, ID `16117096654`, publicada con autorización expresa del propietario. Tema **Seguimiento de la web**, con Adquisición de tráfico, Páginas y pantallas y [Recorrido de reserva de Diverty](https://analytics.google.com/analytics/web/?authuser=1&hl=es#/a411725064p558641923/reports/explorer?params=_u.dateOption%3DthisMonth&collectionId=16117096654&r=16117021148). Informe de embudo `16117021148`; exploración editable `iRTWHD-WSSCAljTtqRA6gg`.

| Paso | Condición |
| --- | --- |
| Visita a la web | `page_view` |
| Interés en un servicio | `view_item` **o** `add_to_cart` |
| Abre el formulario | `begin_checkout` |
| Solicitud recibida | `generate_lead` |

El segundo paso incluye «Reservar ahora» sin exigir abrir primero el detalle. Desglose por categoría de dispositivo, sin segmentos de comparación ni filtro de país. Embudo cerrado, seguimiento indirecto entre pasos, sin restricción de tiempo adicional. Cuenta usuarios en la secuencia dentro del período seleccionado, que puede abarcar varias sesiones. El informe guardado tiene condiciones inmutables: para cambiarlas editar la exploración y guardar un nuevo informe. La vista previa de Biblioteca puede usar los últimos 28 días; abrir el informe publicado y seleccionar **Este mes** o un intervalo que incluya hoy. Los informes no reconstruyen solicitudes anteriores a la instalación de los eventos.

## Cómo entender las capturas de Tiempo real

| Texto | Significado |
| --- | --- |
| Número de eventos | Acciones registradas, no personas. Las 33 vistas de una captura no significan 33 clientes. |
| `page_view` | Una página o pantalla vista; una persona puede consultar varias. |
| `first_visit` | Primera visita detectada por ese navegador; borrar cookies u otro dispositivo puede contar otra. |
| `session_start` | Inicio de una visita/sesión; no equivale a una persona nueva. |
| `scroll` | Se alcanzó aproximadamente el 90 % de la página, una vez por página. |
| Eventos clave: 0 | No se registró una acción marcada como clave durante ese intervalo; no demuestra un fallo. La acción principal de Diverty es una solicitud guardada. |
| `(sin configurar)` / `(not set)` | Google no tiene un valor para esa dimensión. La atribución de Tiempo real es limitada; consultar Fuente/medio de la sesión en informes procesados antes de diagnosticar. |
| `(other)` | Fila agrupada de valores; no es otro cliente ni se suma como una persona independiente. |

Consultar **Este mes** a diario y **últimos 28 días** para tendencias. Revisar páginas/servicios más vistos, origen de las sesiones y solicitudes. Usar los enlaces UTM de abajo en promociones. Un clic en WhatsApp no confirma que se haya enviado un mensaje; una solicitud no confirma pago. Analytics muestra actividad agregada, no la identidad privada de cada visitante.

Referencias: [eventos automáticos](https://support.google.com/analytics/answer/9234069), [limitaciones de Tiempo real](https://support.google.com/analytics/answer/9271392), [sin configurar](https://support.google.com/analytics/answer/13504892), [fila other](https://support.google.com/analytics/answer/13331684), [informes de embudo](https://support.google.com/analytics/answer/13012015).

Las dimensiones personalizadas de alcance Evento son «Paso de reserva» (`booking_step_name`), «Tipo de reserva» (`booking_kind`) y «Botón de WhatsApp» (`contact_location`). Los nombres de servicios usan los campos estándar de artículos, sin crear otra dimensión de alta cardinalidad.

`generate_lead` está marcado como evento clave, una vez por evento, sin valor monetario predeterminado. Su `value` es el precio de los servicios seleccionados, antes de descuentos/transporte: **no es un ingreso, pago ni confirmación administrativa**. No se envía `purchase` desde esta implementación.

## Enlaces para promociones

Compartir el enlace que corresponda a la publicación:

- Facebook de pago: https://divertypanama.netlify.app/?utm_source=facebook&utm_medium=paid_social&utm_campaign=navidad_2026
- Instagram orgánico: https://divertypanama.netlify.app/?utm_source=instagram&utm_medium=social&utm_campaign=catalogo
- WhatsApp: https://divertypanama.netlify.app/?utm_source=whatsapp&utm_medium=referral&utm_campaign=catalogo

Pueden combinarse con `plan=ID_PUBLICO` para abrir un paquete concreto. Usar nombres de campaña públicos, letras, números, guiones o guiones bajos. Nunca incluir datos personales ni números de clientes en una campaña. Solo los UTM admitidos se conservan para atribución; no se copian parámetros desconocidos ni fragmentos de URL.

## Configuración de la propiedad

La web envía vistas virtuales manuales y usa `send_page_view: false`. En **Administrador → Flujos de datos → diverty → Medición mejorada → Vistas de página → Configuración avanzada**, se desactivó «La página cambia en función de los eventos del historial de navegación». No reactivar esta opción sin cambiar la implementación: duplicaría visitas por navegación y por las entradas temporales del carrito/menú/formulario.

La medición automática de clics de salida, búsquedas, interacciones con formularios y descargas se desactivó para no recoger URLs de WhatsApp, búsquedas del portal ni metadatos de documentos. Permanecen los desplazamientos y vídeos. Las acciones del negocio se registran explícitamente, con una lista de campos permitidos.

## Privacidad, fiabilidad y pruebas

No se envían nombres de clientes, correos, teléfonos, direcciones, GPS, fechas del evento, comentarios, mensajes de WhatsApp, UID, identificadores de reservas ni enlaces privados. Solo títulos públicos, IDs de catálogo, precios/cantidades de servicios, pasos y ubicaciones fijas de botones. Los referentes externos se reducen al origen.

Una actualización del catálogo no cuenta otra visita a la misma pantalla. Atrás hacia una pantalla distinta sí cuenta; abrir/cerrar menús y carrito no. El inicio del formulario se cuenta una vez por intento; los pasos se cuentan al cambiar. Reintentos/recuperación de una solicitud no duplican `generate_lead` en la misma sesión del navegador. Los últimos 50 identificadores se conservan **solo localmente** en `sessionStorage`, nunca se transmiten; con almacenamiento bloqueado, la deduplicación solo dura mientras esa página permanezca abierta.

Analytics no se inicia en localhost ni en la vista previa de temas. Los tests habilitan la cola local explícitamente y bloquean servicios externos; ninguna prueba genera visitas ficticias ni reservas en producción. Un bloqueo de la biblioteca de Google no impide comprar servicios o enviar solicitudes. No se escriben nuevas colecciones ni se cambian reglas de Firebase.

Verificación automatizada: `node --test tests/*.test.mjs`; compilación `npm run build`; `ANALYTICS_ONLY=1 node tests/browser/web-stability.cjs` (en PowerShell, `$env:ANALYTICS_ONLY='1'`), y `node tests/browser/catalog-browse.cjs`. Pueden usarse `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH` para el navegador local.

Los bloqueadores, conexiones interrumpidas y preferencias de privacidad pueden reducir la medición. Los informes no contienen el historial anterior a esta actualización. La entrega a Google no se garantiza por haber puesto un evento en la cola; comprobar recepción en Tiempo real. Los informes y dimensiones detallados necesitan procesamiento antes de mostrar resultados. La deduplicación de visitas/eventos no equivale a identificar a una persona entre dispositivos.

Verificación adicional del 12 de octubre: biblioteca oficial `gtag.js` descargada para una prueba local aislada, servida desde un archivo. Todas las solicitudes externas interceptadas y bloqueadas; cargas y envíos de telemetría respondidos localmente. Se verificó el payload real de `page_view`, inicio de sesión (`_ss=1`), conservación de `utm_source=facebook`, referente reducido al origen y exclusión de un correo ficticio de la URL. No se envió tráfico ni se crearon solicitudes en producción. Esta prueba confirma el comportamiento del SDK local, no garantiza la atribución de cada visita real ni elimina todos los posibles `(not set)`.

Referencias: [Vistas manuales](https://developers.google.com/analytics/devguides/collection/ga4/views), [navegación de una sola página](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications), [datos personales](https://support.google.com/analytics/answer/6366371?hl=es-419).
