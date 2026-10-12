# Catálogo: búsqueda, filtros y orden

El explorador conserva sus categorías y tarjetas. Ahora permite buscar en todos
los servicios por nombre, descripción, actividad incluida, temática o categoría.
La búsqueda ignora mayúsculas y tildes y combina varias palabras. Dentro de cada
categoría están disponibles los mismos controles.

Mostrar permite elegir todas las opciones, ofertas o personajes. Ordenar usa el
orden original, precio ascendente/descendente o nombre. Los precios son los que
figuran en cada ficha: las tarifas por unidad u hora conservan su etiqueta y no
se convierten en un total de paquete. Las categorías ocultas y las restricciones
de temporada se filtran antes de buscar; no se muestran con una búsqueda global.

Los filtros se conservan al entrar en un detalle y volver. Las búsquedas y el
orden se calculan con el catálogo ya cargado, sin nuevas lecturas ni escrituras
en Firebase. Al llegar una actualización del catálogo se conservan la búsqueda,
el foco y la selección del texto. Limpiar filtros restablece el explorador.

Los controles usan los colores del tema, una fila en PC y dos filas de campos en
móvil, con objetivos táctiles de 44 px. Las fotos, precios, temporadas, cantidades,
carrito y reserva mantienen sus acciones. La app de administración usa las mismas
reglas de búsqueda y orden, conservando creación, edición y orden manual.

Verificación local con datos ficticios: 81 pruebas de la web y 65 de la app;
`tests/browser/catalog-browse.cjs` cubre búsqueda global y por categoría, ofertas,
personajes, precios, categorías ocultas, vuelta al detalle, sincronización y
carrito de 75 unidades × $2 en 320, 392 y 1366 px, con temas normal y Navidad.
`BROWSER_ARTIFACT_DIR` guarda capturas. `PLAYWRIGHT_MODULE` y `CHROMIUM_PATH`
permiten usar el navegador disponible en Windows. No se modifican datos reales.
