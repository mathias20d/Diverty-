# Revisión de Firestore

**Propuesta validada en el emulador local. Publicación en Firebase pendiente.**

`test/received.rules` conserva la lógica de las reglas enviadas por el propietario el 6 de octubre de 2026; se compactaron únicamente comentarios y espacios. No se confirmó mediante acceso administrativo que correspondan a la versión publicada.

`firestore.proposed.rules` refuerza el mismo esquema de cuatro documentos usado por la web. El permiso administrativo y las lecturas públicas se conservan. Las reglas propuestas:

- vinculan los candados a una nueva reserva del usuario y al horario/tipo correspondiente;
- toman la capacidad de `config_web/global`, con los mismos valores predeterminados que la web;
- exigen una reserva, disponibilidad, seguimiento del cliente y cupo en la misma escritura;
- conservan los IDs de otras reservas y rechazan IDs duplicados;
- permiten reparar un único ID público huérfano o movido, comprobándolo contra Firestore;
- mantienen los reintentos que no cambian la reserva y el seguimiento;
- vinculan los metadatos y GPS públicos de Santa a la reserva privada.

No implementan capacidad de personal entre horarios solapados ni calculan precios desde el catálogo. Esa validación requiere un servicio de confianza, preferiblemente una función de servidor con transacciones. Las solicitudes siguen siendo **Pendiente** y deben revisarse en el CRM.

## Comprobaciones preparadas

Se requiere Node 24, Java 21 y acceso HTTPS a `registry.npmjs.org` y `storage.googleapis.com`.

Desde la raíz de `Diverty-`:

```sh
npm ci --prefix firebase --ignore-scripts
npm --prefix firebase test
```

Las herramientas tienen un lockfile independiente y no se incluyen en la web publicada. `npm test` en la raíz sigue ejecutando las pruebas unitarias de la web. `npm --prefix firebase test` inicia únicamente Firestore en `127.0.0.1:8089`, bajo el proyecto ficticio **demo-diverty**, sin Auth real ni escrituras en producción. El archivo de pruebas se niega a ejecutarse fuera de ese emulador.

En este entorno el comando necesita además rutas de caché dentro del espacio autorizado:

```sh
FIREBASE_EMULATORS_PATH=/workspace/.cloud-setup/firebase-emulators \
XDG_CONFIG_HOME=/workspace/.cloud-setup/firebase-cli \
XDG_CACHE_HOME=/workspace/.cloud-setup/firebase-cache \
npm --prefix firebase test
```

La suite contiene 32 comprobaciones: 14 contra las reglas recibidas y 18 contra la propuesta. Incluye el manejador real de reservas normales/Santa, privacidad por propietario, permisos administrativos, confirmación tras una respuesta perdida, siete reproducciones de permisos excesivos, un fallo de reintento y controles de concurrencia con el SDK real de Firestore. Las reproducciones originales esperan el permiso indebido; su aprobación demuestra el fallo, no una regla segura.

**Resultado actual:** instalación reproducible mediante `npm ci`, compilación de ambas reglas y **32 comprobaciones aprobadas**, sin fallos ni pruebas omitidas. La ejecución usó Firestore Emulator 1.22.0, Firebase SDK 10.14.1 y Java 21. Inicialmente el proxy bloqueó la descarga; tras guardar el dominio `storage.googleapis.com` se comprobó HTTP 200 y el descargador oficial obtuvo el archivo manteniendo la verificación de checksum. La ejecución final y su salida se conservaron en `/workspace/.cloud-setup/firebase-rules-results.log`.

Las ocho reproducciones con las reglas originales esperan explícitamente los permisos indebidos o el fallo de reintento. Con la propuesta se comprueba el comportamiento corregido. Las denegaciones esperadas pueden escribir `PERMISSION_DENIED` en el registro del emulador; no son fallos de la suite.

## Condiciones de publicación

1. Las pruebas del emulador ya aprobaron la propuesta. Repetirlas si se edita el archivo antes de publicarlo.
2. Comparar las reglas vigentes de Firebase con `test/received.rules`, conservando una copia para revertir.
3. Revisar candados antiguos. Un candado nuevo desde la web solo puede empezar con una reserva; si hay varias reservas en el mismo horario sin candado, el administrador debe reconstruirlo antes. Más de un ID huérfano requiere reparación administrativa.
4. La publicación de reglas se hace **en Firebase**, de forma explícita y con acceso administrativo. Subir este archivo a GitHub o desplegar Vercel/Netlify no publica reglas.
5. Verificar una reserva normal y otra de Santa en un proyecto de pruebas con la configuración real de catálogo, capacidad y ruta, antes de publicar las reglas de producción.

El archivo `firebase.json` aquí sirve al emulador. No hay alias de producción ni automatización de despliegue de reglas. El acceso administrativo no es necesario para ejecutar estas pruebas locales.
