# Temas y vista previa

En la app administrativa: **Web → Temas → Editar** o **Nuevo tema**.

- Los seis colores, el estilo de botón, la decoración y las animaciones se muestran en la vista previa de la web real.
- **Móvil** usa un ancho de 390 px y **Escritorio** de 1080 px. El panel escala la vista para que quepa en el teléfono.
- Cambiar Botón selecciona Color sólido; se puede volver a Degradado. Vaciar el degradado usa Botón y Secundario.
- Automática conserva el efecto de temporada. Ninguna elimina los adornos; también se pueden elegir nieve, confeti, murciélagos, burbujas u hojas.
- Apagar Animaciones detiene animaciones y transiciones.
- La vista previa no guarda el borrador, no crea reservas ni carga analítica. Permite desplazarse; sus botones y formularios están desactivados.
- **Guardar tema** conserva las fechas, el estado activo y el predeterminado. Si se edita el tema activo, guardar publica sus cambios. Para otro tema, **Activar manual** lo muestra en la web; el modo automático sigue usando las fechas.

Compatibilidad: los temas existentes siguen funcionando sin migrar la base de datos. Navidad conserva azul y plateado al abrir un tema antiguo; después de guardar, respeta los colores elegidos. Los campos actuales prevalecen sobre alias históricos al guardar la versión 2.

`theme-preview.html` se genera durante la compilación a partir de `index.html`: comparte plantillas, estilos, catálogo e imágenes publicados. No contiene una segunda copia mantenida manualmente y tiene `noindex,nofollow`.

## Validación

```sh
npm test
npm run build
node tests/browser/web-stability.cjs
```

El navegador usa Firebase simulado. Incluye cinco temporadas con colores personalizados, decoraciones y movimiento desactivado, recarga, conservación del formulario, carrito, reservas normales/Navidad, cantidades y personajes.
