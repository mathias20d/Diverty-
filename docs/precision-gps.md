# Precisión de la ubicación de reservas

La captura pide al teléfono lecturas nuevas con `enableHighAccuracy` y sin usar la caché. Conserva la lectura con menor margen de error, sin promediarla con puntos menos precisos. Descarta coordenadas inválidas, lecturas de más de cinco segundos y lecturas sin precisión válida.

Busca un margen de 10 metros o menos y espera al menos dos segundos para permitir que el teléfono afine el punto. Tras 12 segundos acepta la mejor lectura disponible, si la hay, indicando su margen aproximado. El usuario puede volver a medir o pegar un enlace con el pin correcto. La precisión física depende del dispositivo y de la señal; no se garantiza un error de cero metros.

Cambiar de método o salir del formulario cancela la captura y sus temporizadores. Las reservas normales siguen guardando las coordenadas en el enlace de Maps de `direccion`; no se añaden campos a su esquema de Firestore. Las reservas navideñas mantienen sus campos numéricos existentes.

Al interpretar enlaces, las coordenadas explícitas del pin (`!3d…!4d…`) tienen prioridad sobre el centro de la pantalla (`@…`). También se admiten las coordenadas de consultas de Maps, Waze y formatos anteriores. `diverty-gps-point.mjs` se mantiene también en `diverty-app/src/lib/gps-point.mjs`.

`npm test` comprueba selección de lecturas, permisos, cancelación, caducidad y lectura de enlaces. `npm run test:browser` simula una lectura inicial de 25 metros seguida de otra de 6 metros en los formularios normal y navideño, comprueba el enlace guardado y verifica que las lecturas posteriores no lo cambian. Estas pruebas no sustituyen una medición con GPS físico.
