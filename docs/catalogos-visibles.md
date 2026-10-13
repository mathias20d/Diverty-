# Catálogos nuevos en el explorador

Antes, el menú mostraba las categorías visibles, pero el explorador descartaba aquellas con cero servicios. Ahora ambos respetan la misma política de visibilidad, sin exigir servicios para mostrar una categoría.

Una categoría vacía muestra su portada o icono, nombre y «Próximamente». Al abrirla se explica que sus servicios están en preparación y se permite volver al explorador. No se inventan servicios, precios ni botones de reserva. Las categorías ocultas, desactivadas o de temporada fuera de sus fechas siguen excluidas.

El aviso existente de `web_sync` vuelve a dibujar el explorador cuando se publica una categoría. No se añaden lecturas, colecciones o escrituras ni se cambian reglas de Firebase. Al haber servicios, se mantiene su cantidad y el catálogo conserva búsqueda/filtros/orden/carrito.

`tests/browser/catalog-browse.cjs` comprueba entradas vacías, categorías ocultas/futuras, navegación de ida/vuelta y una creación simulada mientras el explorador está abierto, sin recargar ni volver a descargar los servicios. También verifica filtros, detalle, carrito y actualización del catálogo con Firebase ficticio en 320, 392 y 1366 px, con temas normal y Navidad. La compilación y las 103 pruebas de la web pasaron.
