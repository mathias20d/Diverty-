# Consulta de reservas del cliente

El portal anterior consultaba únicamente los comprobantes asociados a la sesión anónima del navegador. Una reserva creada en la app, o consultada desde otro celular, podía aparecer como inexistente.

El portal acepta el nombre registrado o el celular. Normaliza mayúsculas, tildes, espacios, guiones y el prefijo panameño +507/00507. Conserva los estados cancelado y rechazado. Si el mismo nombre corresponde a varios celulares, pide consultar por celular.

## Consulta en Netlify con Firebase Spark

El portal utiliza `POST /api/customer-portal`, una función de Netlify. No necesita activar Blaze ni desplegar Cloud Functions. Firebase puede permanecer en Spark y Netlify en Free, dentro de las cuotas de ambos proveedores. La cuota gratuita no equivale a disponibilidad ilimitada; revisar el consumo y mantener desactivadas las recargas o ampliaciones de pago.

El código de la función se publica con el repositorio y `netlify.toml`. `firebase-admin` es una dependencia del servidor y no se descarga en el navegador. La carpeta `netlify/functions` queda fuera de `dist`.

El único acceso privado necesario para la función es la variable **`DIVERTY_PORTAL_FIREBASE_ACCOUNT`** de Netlify: JSON de una cuenta de servicio del proyecto `diverty-eventos` con el rol **Cloud Datastore User** para leer reservas y mantener índices/contadores. Preferir una cuenta dedicada al portal, sin roles Owner/Editor ni permisos para administrar usuarios o facturación. Guardarla como secreto del contexto de producción; no en el repositorio, HTML, variables públicas ni conversaciones. Elegir únicamente el alcance Functions si el plan permite seleccionar alcances. En Legacy Free esa selección no está disponible: usar los alcances de compilación, funciones y ejecución, excluyendo postprocesamiento. El código de compilación no debe copiar este secreto a los archivos públicos.

Si se configura manualmente:

1. Crear una cuenta de servicio dedicada en Google Cloud IAM del proyecto `diverty-eventos` y asignarle Cloud Datastore User. Crear su clave JSON.
2. En Netlify, abrir el proyecto `divertypanama`, **Project configuration → Environment variables → Add a variable**. Añadir `DIVERTY_PORTAL_FIREBASE_ACCOUNT` con el JSON completo, marcarla como secreto y limitarla al contexto de producción. Seleccionar Functions si el plan lo permite; en Legacy Free aplicar los alcances descritos arriba.
3. Publicar de nuevo el sitio para que la función reciba la variable. Guardar la clave de manera privada y revocarla en IAM cuando deje de utilizarse.

No modificar las reglas de Firestore ni `centralBookingValidation` para esta alternativa. Las funciones de Firebase que estaban preparadas quedan como una opción futura, sin publicarlas en Spark.

Para comprobar el código localmente:

```sh
npm ci
npm test
npm run build
netlify functions:build
PORTAL_ONLY=1 node tests/browser/web-stability.cjs
```

Después de publicar la app, abrir el panel administrador una vez para completar la actualización de las reservas antiguas. El proceso trabaja en páginas de 50, se ejecuta en segundo plano y marca `configuracion/migracion_portal_v1` como terminado únicamente al completar todas las páginas. Si falla, puede reintentarse al volver a abrir el panel.

El 7 de octubre de 2026 quedó configurada la cuenta dedicada `diverty-portal-netlify@diverty-eventos.iam.gserviceaccount.com` en producción, conservando Firebase Spark y Netlify Legacy Free. Se completó el índice privado de 217 reservas en cinco páginas, sin modificar las reservas originales.

## Sincronización y privacidad

- La app guarda un índice privado `portal_busqueda` cuando crea o actualiza cualquier reserva, incluso las que no tienen `ownerUid`, y lo elimina al borrar la reserva.
- La web solicita la sincronización privada a Netlify después de guardar una reserva. No demora la confirmación del formulario. El servidor verifica en una transacción que la reserva siga perteneciendo al UID del cliente. Otro cliente no puede sincronizarla ni leerla por su ID. Si falla esta actualización, el panel administrador puede completar el índice y la búsqueda conserva su compatibilidad con celulares/nombres exactos antiguos.
- La consulta de Netlify verifica el token de Firebase, consulta el índice y vuelve a comprobar los datos actuales de la reserva. También busca formatos antiguos de celular y nombres exactos mientras se actualiza el índice. La variante gratuita no utiliza disparadores de Firebase; las ediciones directas desde la consola de Firebase requieren actualizar el índice si cambia el nombre o celular.
- El navegador recibe solamente nombre, fecha, hora, servicio, estado, total y abono. Las direcciones, GPS, correo, notas y datos internos no se devuelven. Las colecciones de eventos y de búsqueda siguen siendo privadas.
- Netlify limita el endpoint a 30 peticiones por IP/dominio en un minuto. La consulta mantiene además hasta 15 búsquedas por sesión y 60 por IP en un minuto en Firestore, compartidas entre instancias. Los contadores usan hashes; no guardan el texto buscado.
- La consulta por nombre o celular es un acceso sencillo por datos conocidos, no una verificación de identidad. Para mostrar información más sensible haría falta incorporar un código privado o verificar el correo/celular.

Un error de conexión, permisos, función pendiente de publicación o índice incompleto se presenta como una consulta que no pudo completarse. Solo una respuesta válida del servidor puede confirmar que no encontró reservas. Los comprobantes pertenecientes a la sesión actual siguen funcionando sin esperar la consulta remota.

## Verificación

Pruebas de normalización, consulta entre sesiones, estados, homónimos, errores, privacidad, sincronización y migración paginada; autenticación HTTP, origen, entradas inválidas, límites de Netlify y fallo de configuración; integración con Firestore emulado y reglas; formulario del portal en Chromium móvil y panel administrador con datos ficticios. No se crean reservas ni se envían mensajes a clientes reales durante las pruebas.
