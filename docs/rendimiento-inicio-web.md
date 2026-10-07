# Carga inicial móvil y SEO

El informe enviado por el propietario mostraba 47/100 en móvil, LCP de 7,1 segundos y CLS de 0,298. Son valores de ese informe; no se presentan como una medición nueva.

La portada está en el HTML. La transición del logo ahora tiene un límite de 250 ms, independiente de las lecturas de Firestore. Las lecturas iniciales de tema, categorías, catálogo, campañas y anuncio se ejecutan juntas después de conocer la versión de sincronización. Los filtros de visibilidad se aplican antes de presentar el catálogo, y la sincronización conserva los campos y el foco de una reserva abierta.

El video permanece disponible, con la misma portada y reproducción automática, pero espera ocho segundos antes de conectar su fuente. Se pausa fuera de pantalla, con la pestaña oculta o al abrir menús/carrito, y respeta el ahorro de datos. Los controladores del HTML, del inicio y del runtime comparten esa programación para evitar que uno adelante la descarga.

La compilación conserva los fuentes editables y publica JavaScript y CSS minificados. Los hashes del HTML y de las importaciones se calculan sobre los archivos finales; el preload de la fuente usa exactamente la URL del CSS para evitar una descarga duplicada. Lucide incluye inicialmente los iconos de las plantillas y los iconos predeterminados de las categorías. Un icono personalizado fuera de ese grupo carga la biblioteca completa bajo demanda.

Nunito, Poppins y Quicksand se sirven desde `assets/fonts`, con sus licencias OFL. Se conserva el subconjunto latino, que incluye español, y el navegador usa su fuente de respaldo para otros caracteres. `font-display: optional` evita una sustitución tardía que cambie los renglones cuando la conexión es lenta. El logo visible usa una copia WebP de 256 px; el icono original sigue disponible para los marcadores y vistas previas sociales.

El espacio mínimo de la primera oferta evita mostrar el calendario en un hueco que desaparecería al llegar las tarjetas. Las medidas del logo están declaradas en el HTML y la entrada animada del título inicial no retrasa su pintura.

| Archivo inicial | Antes, bytes | Después, bytes |
| --- | ---: | ---: |
| JavaScript principal | 342908 | 200298 |
| CSS propio | 217130 | 167708 |
| Iconos iniciales | 446378 | 25587 |
| Logo visible | 74731 | 24306 |

Estos tamaños son sin compresión HTTP. No equivalen a tiempos de red ni a una puntuación de PageSpeed. En una comparación local con Chromium, CPU reducida 4× y una respuesta de tema retenida dos segundos, el título de la portada pasó de alrededor de 3,2 segundos a menos de 1,2 segundos. La fuente de datos y las condiciones eran simuladas; la puntuación del sitio requiere volver a ejecutar la auditoría publicada.

La página principal tiene un único H1, un enlace canónico al dominio confirmado, metadatos Open Graph, `robots.txt` y un sitemap. Netlify redirige `/index.html` a `/` con HTTP 301. La vista previa especial de planes/categorías sigue reemplazando esos metadatos en la función existente; no se cambió su lógica. Los avisos sobre `www` en un subdominio gratuito de Netlify no se corrigen creando un dominio distinto desde el código.

Validación: `npm test`, `npm run build` y `node tests/browser/web-stability.cjs`. El recorrido de navegador comprueba portada visible con tema pendiente, colores guardados, carga de un icono personalizado, video diferido, menús, carrito, sincronización, reservas normales/Navidad, GPS, envío simulado, almacenamiento bloqueado y errores de red. Las pruebas bloquean los servicios externos y no crean reservas reales.
