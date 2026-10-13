# Control de visitas y solicitudes de Diverty

Propiedad: **diverty panama**, `558641923`. Flujo web: **diverty**, `16116694654`.
ID de medición: **G-6FYQV9RK3X**. Web: https://divertypanama.netlify.app/.

## Qué consultar

- **Informes → En tiempo real:** visitantes activos y pantallas consultadas recientemente.
- **Páginas y pantallas:** elegir «Título de página y clase de pantalla» para comparar Inicio, Catálogo, Galería, Reservar, Mi reserva, categorías y nombres de paquetes. Los nombres del menú pueden variar según la colección de informes de la propiedad.
- **Adquisición de tráfico:** elegir «Fuente/medio de la sesión» para comparar Google, Facebook, Instagram y WhatsApp; revisar el evento clave `generate_lead` para ver qué fuente consigue solicitudes.
- **Eventos:** `view_item` mide el detalle de un servicio; `add_to_cart` y `remove_from_cart` miden cambios de servicios; `begin_checkout` mide la apertura de un formulario con servicios; `booking_step` mide cada paso visible; `generate_lead` mide una solicitud que se verificó guardada; `whatsapp_click` mide el clic, no un mensaje enviado.
- **Explorar:** para analizar abandono, crear una exploración de embudo abierto con `view_item` → `add_to_cart` → `begin_checkout` → `booking_step` → `generate_lead`. «Reservar ahora» puede omitir pasos del carrito. Comparar por usuarios/sesiones y por tipo de reserva; las cantidades brutas de eventos no representan personas únicas.

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

Referencias: [Vistas manuales](https://developers.google.com/analytics/devguides/collection/ga4/views), [navegación de una sola página](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications), [datos personales](https://support.google.com/analytics/answer/6366371?hl=es-419).
