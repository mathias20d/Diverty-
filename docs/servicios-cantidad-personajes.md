# Servicios por cantidad y personajes

Desde la app administrativa: **Web → Servicios y personajes → Nuevo servicio / personaje**.

- **Por cantidad:** indica precio por unidad, cantidad mínima, cantidad máxima y el incremento de los botones. Dejar el máximo vacío utiliza 1.000, el mismo límite predeterminado del servidor. Por ejemplo, mínimo 50 hot dogs, precio $2: el cliente puede escribir 200 y verá $400. Se conservan los modos de precio fijo, por hora y por niño.
- **Personaje:** crea una ficha por personaje con nombre, foto, precio y temática opcional. El catálogo Personajes se crea automáticamente si hace falta. **Guardar y agregar otro personaje** conserva categoría y temática, dejando vacíos los datos de la siguiente ficha.

La web muestra personajes con fotografía, precio y botones de carrito y reserva. En los productos por cantidad, el campo y los botones respetan el mínimo y el máximo. La reserva guarda el ID, nombre, cantidad, precio por unidad y total mediante el formato existente. Cada personaje tiene precio fijo e identidad propia; varios personajes pueden compartir el mismo precio.

No se crean personajes ni productos reales como parte de esta actualización: el administrador añade sus fotos y tarifas. Las fichas existentes mantienen su información y pueden editarse. El administrador antiguo de `/admin.html` también conserva estas opciones al guardar.

## Validación

`npm test` y `npm run build` en ambos repositorios. Con Vite activo en `diverty-app`:

```sh
CATALOG_FIXTURE_PATH=/tmp/diverty-created-catalog.json node tests/browser/web-catalog-flow.cjs
```

Luego, en este repositorio:

```sh
CATALOG_FIXTURE_PATH=/tmp/diverty-created-catalog.json node tests/browser/web-stability.cjs
```

Ambos recorridos bloquean los servicios externos y usan datos simulados. El primero crea y edita un producto y dos personajes; el segundo utiliza esos mismos registros, comprueba límites, subtotal, carrito y envío de las reservas. También ejecuta las comprobaciones anteriores de navegación, GPS, conexión y rendimiento de la portada. La prueba de los archivos de producción de la app incluye la carga del módulo WebAdmin.
