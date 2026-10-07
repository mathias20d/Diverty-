# Imágenes de catálogo y enlaces compartidos

Las tarjetas usan encuadre automático de Cloudinary (`g_auto`) para llenar su marco sin deformar la foto. El detalle móvil pide una imagen de 1080 × 540; el escritorio conserva una fuente de mayor altura. Las imágenes ajenas a Cloudinary siguen funcionando con `object-fit: cover`. Las fotos originales guardadas en el catálogo no se modifican.

La función `share-meta` prepara una portada JPEG de 1200 × 630 para los enlaces de planes y categorías. Muestra la imagen original completa centrada sobre una copia desenfocada que llena el fondo. Prioriza `imagen` sobre una miniatura previamente recortada. Cloudinary aplica estos ajustes al entregar la imagen, sin publicar otra foto ni cambiar los documentos de Firebase. Las URLs firmadas o externas se conservan y no se declaran dimensiones desconocidas.

Para compartir una vista previa actualizada, volver a copiar el enlace en el administrador web. Este enlace incluye `pv`, que fuerza la lectura de la foto, el nombre y el precio actuales. WhatsApp controla el tamaño de su tarjeta y puede conservar una imagen en caché: un mensaje o estado ya publicado debe compartirse nuevamente con el nuevo enlace para mostrar el cambio.

La lógica compartida está en `assets/js/diverty-images.mjs`. La compilación versiona también este módulo para evitar una copia anterior en el navegador. La función de vistas previas usa la caché `diverty-social-preview-v4` y elimina los validadores de la página estática al cambiar sus metadatos.

Comprobaciones: pruebas de transformación y metadatos con Firebase simulado; catálogo en seis temas a 320, 392 y 1280 px; descarga de la portada real de Santa como JPEG de 1200 × 630 y del encuadre móvil de 1080 × 540. No se envían mensajes ni se publican estados de WhatsApp durante las pruebas.
