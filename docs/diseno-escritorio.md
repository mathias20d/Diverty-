# Vista de PC: navegación y catálogo compactos

La cabecera anterior colocaba el logo en una fila y todas las categorías en otra
que podía volver a partirse. En laptops ocupaba una parte importante de la pantalla
y dificultaba ver el calendario y los catálogos.

Desde 1024 px, la cabecera usa una sola fila: logo a la izquierda, Inicio,
Catálogo, Mi reserva, Galería, Reservar y carrito. Catálogo abre todas las
categorías publicadas y respeta su visibilidad/temporada. El menú tiene altura
limitada con desplazamiento interno; se cierra al seleccionar, al tocar fuera o
con Escape, que devuelve el foco a su botón. Los nombres largos pueden ocupar
varias líneas dentro del menú, sin agrandar la cabecera.

Categorías y paquetes usan cuatro columnas desde 1024 px. Las tarjetas de una
fila se alinean, reservan dos líneas para el nombre y conservan nombres completos,
precios, ofertas y acceso al servicio. El detalle tiene un ancho máximo de 980 px
y deja de estirar la foto hasta la altura de todos los incluidos. Se conserva el
encuadre, los incluidos, cantidades, horas, personajes y acciones de reserva/carrito.

`sizes` coincide con las cuatro columnas: el navegador no necesita descargar
una imagen pensada para una tarjeta de tres columnas. La vista móvil y sus
controles conservan su distribución.

## Verificación

- 77 pruebas unitarias de la web.
- Catálogos en seis temas y pantallas de 392, 1024, 1366 y 1920 px: contraste,
  tamaño de fotos, nombres, precios, incluidos y carrito.
- Navegación de escritorio en cuatro tamaños: cabecera hasta 112 px con anuncio,
  títulos visibles debajo, logo separado del menú, categorías seleccionables,
  cierre exterior y navegación por teclado.
- Suite de estabilidad: calendario, reservas normales/Navidad, GPS, portal,
  cantidades, historial y conservación del formulario con Firebase simulado.

La compilación cloud se prepara mediante `/workspace/.cloud-setup/build-website.py`
para evitar reescribir las fuentes. Netlify ejecuta la compilación normal al
publicar. Las pruebas no crean reservas reales ni cambian datos en Firebase.
