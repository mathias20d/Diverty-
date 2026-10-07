# Paso 4: estructura visual compartida

La web pública usa `assets/css/diverty-layout.css` para la portada, cabecera,
categorías, servicios, personajes y detalle. El tema continúa definiendo los
colores mediante las variables `--s-*` existentes. Los temas normales y de temporada
comparten distribución, radios, tamaños y tipografía; también se respetan los
colores personalizados guardados desde el administrador.

Se sustituyeron 198 reglas superpuestas de portada y catálogo y se unificaron 34
declaraciones de superficie de cabecera. El CSS minificado de estos estilos pasa
de 169.629 a 151.790 bytes, incluyendo el archivo nuevo: 17.839 bytes menos.
Las declaraciones `!important` pasan de 1.875 a 1.451. No se añaden fuentes externas,
imágenes ni bibliotecas. La tipografía pública usa Poppins y Nunito, ya disponibles
localmente. El resto de reglas de interacción, formulario, carrito, calendario,
GPS, rendimiento móvil y movimiento reducido se mantienen.

Las fotos de servicio y detalle se muestran completas con `object-fit: contain`.
La portada conserva su video, poster, texto, estadísticas y acceso a reservar.
El botón de catálogo se llama ahora «Ver catálogo», con la misma acción. Sus
plantillas estática y dinámica usan los mismos estilos para evitar cambios al
volver a Inicio. Precios, ofertas, servicios incluidos, cantidades, horas,
personajes y ambas acciones de compra mantienen su información y comportamiento.

## Validación

- 49 pruebas automáticas de la web.
- `tests/browser/web-premium.cjs`: cinco temporadas y una paleta personalizada,
  a 320, 392 y 1.280 px. Comprueba estructura, ausencia de desbordamiento horizontal,
  contraste del título de servicio (al menos 4,5:1 en estas paletas), cabecera,
  precio, incluidos y añadido al carrito.
- `tests/browser/web-stability.cjs`: navegación, menú, historial, carrito, video
  diferido, colores personalizados, decoraciones y animaciones; formularios, GPS,
  disponibilidad y envíos simulados normales y de Navidad; cantidades y personajes.
- Vista previa real desde el administrador de la app: móvil/escritorio, colores,
  decoraciones, movimiento y conservación de los ajustes al guardar.

Los datos de las pruebas son ficticios y las escrituras usan Firebase simulado.
Las capturas pueden usar las fotos públicas ya configuradas, descargadas solo para
la revisión local mediante `PREMIUM_MEDIA_PATH`; sin ellas se utiliza el logo de
prueba. No se crean reservas ni se cambia el catálogo real. La reducción de CSS
no equivale a una nueva puntuación PageSpeed o a un tiempo medido en un teléfono.

```sh
npm test
npm run build
node tests/browser/web-premium.cjs
node tests/browser/web-stability.cjs
```

`BROWSER_ARTIFACT_DIR` guarda capturas y métricas; `PREMIUM_BASELINE=1` permite
registrar un diseño anterior sin exigir las nuevas comprobaciones visuales.
