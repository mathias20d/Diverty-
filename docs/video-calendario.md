# Inicio del video, disponibilidad pública y tarjetas

El video de portada ya no espera un temporizador de ocho segundos. La descarga
empieza después de pintar la portada y cerrar la transición inicial. No depende
del catálogo ni del tema remoto; se conservan el poster, reproducción silenciada,
repetición, reproducción en línea, pausa fuera de pantalla y ahorro de datos.

En pantallas de hasta 767 px se solicita una transformación Cloudinary H.264 de
480 px, 24 fps y aproximadamente 700 kbit/s, sin la pista de audio del fondo
silenciado. Conserva el contenido y los 8,83 segundos del video. La descarga
verificada pesa 811.093 bytes frente a 3.355.200 de la versión de 720 px, que sigue
utilizándose en escritorio: un 75,8 % menos. El tiempo real también depende de
la conexión y las restricciones de reproducción del navegador.

El calendario usa la proyección pública existente `disponibilidad_web` y el
indicador `config_web/disponibilidad`. Antes de cargar el SDK, consulta el mes
por REST con `runQuery`, filtrado en el servidor; esta operación solo lee datos.
Así no necesita Firebase Auth para mostrar los cupos. Las reservas conservan el
SDK, la comprobación del personal y las escrituras transaccionales existentes.
No cambian las reglas ni los documentos reales.

Se mantiene el caché de un minuto y se restablece el observador al volver a Inicio
desde otra pantalla. Las fechas son botones con etiquetas de estado; los días
pasados siguen visibles. Un fallo de lectura muestra disponibilidad por confirmar
con Reintentar, sin anunciar cupos disponibles. Cambiar de mes actualiza el título
de inmediato y evita saltar meses cuando el día actual es 29, 30 o 31.

Las tarjetas de catálogo recuperan la composición anterior: fotos cuadradas,
títulos más ligeros, precios junto al nombre y acciones discretas. Se eliminan
los paneles altos y sus espacios vacíos. La miniatura vuelve a llenar su marco;
la foto completa se conserva en el detalle. Ofertas, precios, cantidades,
personajes y acceso al detalle siguen disponibles. No se añaden bibliotecas ni
fuentes externas.

Validación:

- `npm test`: reservas, cantidades, GPS, fechas, recursos y temas.
- `npm run test:browser`: reproducción H.264 real de una muestra local, versión
  móvil/escritorio, pausa/reinicio, ahorro de datos, disponibilidad pública sin
  Auth, ocupación, reintentos y flujos de reserva simulados.
- `node tests/browser/web-premium.cjs`: cinco temporadas y colores personalizados
  a 320, 392 y 1280 px, contraste, detalles y carrito.

`tests/fixtures/hero-playback.mp4` es un patrón de prueba sintético de dos segundos,
generado con FFmpeg; las pruebas no descargan el video real ni crean reservas.
La reproducción del video original y su versión móvil se comprobó adicionalmente
con los archivos reales. Esto no constituye una medición del teléfono del cliente.
