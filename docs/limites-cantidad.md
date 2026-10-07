# Límites de cantidad del catálogo web

En **Web → Servicios y personajes**, las cantidades mínima y máxima se aplican al catálogo, al carrito y a la reserva pública.

- El máximo vacío utiliza **1.000**, igual que la validación ya existente del servidor. El administrador muestra 1.000 al abrir productos antiguos con máximo ausente o nulo; los nuevos guardan el valor explícito.
- Puedes configurar otro máximo, incluso mayor que 1.000. Para un mínimo de 1.200, por ejemplo, indica un máximo como 2.000. No se permite guardar un mínimo mayor que el máximo efectivo.
- Los botones aumentan o disminuyen según **Aumentar de**. El cliente también puede escribir cualquier cantidad entera entre los límites; no se exige que sea múltiplo del incremento.
- Escribir un valor fuera de los límites lo ajusta al mínimo o máximo antes de calcular el total y añadirlo al carrito. Los botones tampoco pueden superarlos.
- Los personajes y los paquetes mantienen cantidad fija de uno. Las reglas de duración, personal, disponibilidad y transporte siguen vigentes en el servidor.

No se modifica ni migra el catálogo de producción al publicar: se usan los límites efectivos de los registros existentes. La misma función de opciones se conserva en la app y el administrador antiguo de `/admin.html`.

## Validación

App: `npm test`, `npm run build` y, con Vite activo en 5173, `CATALOG_FIXTURE_PATH=/tmp/diverty-step2-catalog.json node tests/browser/web-catalog-flow.cjs`.

Web: `npm test`, `npm run build` y `CATALOG_FIXTURE_PATH=/tmp/diverty-step2-catalog.json node tests/browser/web-stability.cjs`.

Servidor: `npm test` en `firebase/functions`. Se comprueba que el límite de la interfaz coincide con `quoteBooking` para máximos vacíos, nulos, antiguos y explícitos, y que el servidor sigue rechazando cantidades fuera del límite. No hay cambios de código del servidor ni reglas de Firestore; no se necesita una publicación adicional en Firebase.

Las pruebas usan datos ficticios y no crean reservas de producción. El recorrido del administrador guarda los productos usados por la prueba de la web; esta confirma también su aceptación con la política real del servidor. La integración de transacciones con Firestore requiere el emulador y se distingue de las comprobaciones de cantidades.
