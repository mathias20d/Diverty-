# Diagnóstico de carga y navegación

Revisión del 6 de octubre de 2026. Se reprodujeron los fallos con el código publicado en GitHub y se corrigieron en este repositorio. Las pruebas del navegador usan Firebase simulado y bloquean los servicios externos: no crean reservas, cuentas ni notificaciones reales.

El video recibido (`Screenrecorder-2026-10-06-08-02-31-972.mp4`, 61 segundos) muestra una pantalla negra con un indicador de carga y las barras del teléfono. No permite observar los colores, el menú o el formulario. El diagnóstico se basa en la descripción del propietario y en las reproducciones independientes del navegador.

## Fallos reproducidos y correcciones

| Problema | Causa | Resultado |
|---|---|---|
| Colores predeterminados antes del tema | La presentación desaparecía tras 850–900 ms, antes de recibir el tema. La caché guardaba su nombre, pero no sus colores. | Se restauran los colores conocidos antes de pintar; en la primera visita se espera el tema, con salida de emergencia a los cuatro segundos. |
| Menú móvil recortado o desorganizado | Los botones tenían ancho completo más márgenes y ampliación al seleccionarlos. El panel comenzaba a una altura fija, sin contar el anuncio. | Opciones contenidas dentro del panel, iconos sin compresión, texto largo ajustable y posición calculada debajo de la cabecera. |
| Cerrar menú/carrito retrocede la reserva | El manejador de Atrás del formulario interceptaba también el `popstate` generado al cerrar un panel. | Se atienden primero los cierres de paneles; los pasos usan el estado de navegación correspondiente. |
| La reserva vuelve al paquete o a Reservar | `Reservar ahora` conservaba `?plan=...`; el refresco volvía a abrir ese detalle. Algunas cargas también reconstruían el formulario. | La reserva abre `?vista=booking`; las actualizaciones del tema, menú, catálogo y disponibilidad conservan formulario, paso, foco y campos. |
| Continuar desde el carrito pierde la ruta | El cierre pedía `history.back()` mientras el botón abría una nueva ruta. | El cierre para navegar actualiza el estado sin disparar un retroceso simultáneo. |
| Siguiente puede saltar pasos al tocar dos veces | Las comprobaciones asíncronas permitían volver a ejecutar el avance antes de terminar. | Solo se admite un avance pendiente; los botones vuelven a habilitarse al finalizar, incluso si una validación falla. |
| Atrás/Adelante deja vacías las horas de Navidad | Al restaurar el formulario no se reconstruían las tarjetas de horas. | Se recalculan al restaurar el paso Horario y se mantienen fecha y datos. |
| El menú tapa el logo en escritorio | El logo absoluto compartía el espacio con todas las categorías. | Logo centrado y navegación en una fila inferior que puede ajustarse al espacio disponible. |

Los iconos Lucide se sirven localmente con versión fija `1.52.0`, licencia y versión de caché. El contenido público de Firebase ya no depende de crear una cuenta anónima por REST para mostrar la web. La sesión del SDK sigue siendo necesaria para enviar y consultar reservas.

## Verificación

- `npm test`: **28 pruebas aprobadas** de reserva, reintentos, recibos, cupos, almacenamiento, fechas y recursos.
- `npm run test:browser`: compilación y suite de Chromium aprobadas. Incluye arranque lento y con caché, iconos locales, menú en 320/392/768 píxeles, cabecera de escritorio en 1280 píxeles, carrito a reserva, Atrás/Adelante, cambios de tema y catálogo sin reemplazar el formulario, doble toque, confirmación navideña, cupo ocupado mientras se continúa, almacenamiento denegado y fallo de red.
- Lecturas reales **sin sesión ni API key** a las diez colecciones públicas de configuración, tema, categorías, catálogo, campañas, transporte, galería, reseñas, cupones y disponibilidad: HTTP 200. Se consultó una página limitada y se descartó el contenido sin guardar datos de clientes.
- Compilación estática en `dist`, referencias con versión de caché y comprobación de sintaxis y cambios sin errores.

Para repetir: `npm ci`, `npm test` y `npm run test:browser`. La suite usa `/usr/bin/chromium` si está disponible; admite `CHROMIUM_PATH`. En otro entorno puede instalarse Chromium con `npx playwright install chromium`. No necesita credenciales de Firebase.

## Límites de la revisión

El enlace confirmado por el propietario es https://divertypanama.netlify.app/. Su lectura desde este entorno recibió `Tunnel connection failed: 403 Forbidden` del proxy, antes de contactar con Netlify. Eso no demuestra que la web esté caída. Se guardó el dominio en el borrador de red conservando los destinos existentes; revisar y guardar la configuración y publicar el entorno permite retomar esa comprobación. El guardado del borrador no acredita acceso activo ni un despliegue exitoso.

Se probó Chromium con tamaños de pantalla móviles, no el teléfono original, el navegador interno de WhatsApp o Safari. La salida de emergencia permite mostrar la portada si la conexión tarda más de cuatro segundos; si un tema nuevo llega después, puede aparecer entonces su actualización. No se modificaron ni desplegaron las reglas de Firebase en esta tarea. La validación de precios y recursos solapados en un servidor continúa pendiente según el diagnóstico anterior.
