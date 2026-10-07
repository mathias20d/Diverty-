# Consulta de reservas del cliente

El portal anterior consultaba únicamente los comprobantes asociados a la sesión anónima del navegador. Una reserva creada en la app, o consultada desde otro celular, podía aparecer como inexistente.

El portal acepta el nombre registrado o el celular. Normaliza mayúsculas, tildes, espacios, guiones y el prefijo panameño +507/00507. Conserva los estados cancelado y rechazado. Si el mismo nombre corresponde a varios celulares, pide consultar por celular.

## Publicar la consulta en Firebase

GitHub, Netlify y Vercel publican los sitios, pero no despliegan estas funciones de Firebase. Desde la carpeta `firebase`, con una cuenta autorizada en el proyecto `diverty-eventos`:

```sh
npm ci
npm --prefix functions ci
npx firebase login --no-localhost
npx firebase deploy --project diverty-eventos --only functions:booking:lookupCustomerReservations,functions:booking:syncCustomerPortal
```

La publicación se limita a estas dos funciones. No requiere cambiar las reglas de Firestore ni activar `centralBookingValidation`. No publicar las reglas propuestas ni otras funciones como parte de esta corrección.

Después de publicar la app, abrir el panel administrador una vez para completar la actualización de las reservas antiguas. El proceso trabaja en páginas de 50, se ejecuta en segundo plano y marca `configuracion/migracion_portal_v1` como terminado únicamente al completar todas las páginas. Si falla, puede reintentarse al volver a abrir el panel.

## Sincronización y privacidad

- La app guarda un índice privado `portal_busqueda` cuando crea o actualiza cualquier reserva, incluso las que no tienen `ownerUid`, y lo elimina al borrar la reserva.
- `syncCustomerPortal` mantiene ese índice ante cambios hechos desde la web u otros dispositivos. Vuelve a leer el evento actual para evitar restaurar datos antiguos por entregas atrasadas del disparador.
- `lookupCustomerReservations` consulta el índice y vuelve a comprobar los datos actuales de la reserva. También busca formatos antiguos de celular y nombres exactos mientras se actualiza el índice.
- El navegador recibe solamente nombre, fecha, hora, servicio, estado, total y abono. Las direcciones, GPS, correo, notas y datos internos no se devuelven. Las colecciones de eventos y de búsqueda siguen siendo privadas.
- Se permiten hasta 15 consultas por sesión y 60 por IP en un minuto. Los contadores usan identificadores cifrados mediante hash; no guardan el texto buscado.
- La consulta por nombre o celular es un acceso sencillo por datos conocidos, no una verificación de identidad. Para mostrar información más sensible haría falta incorporar un código privado o verificar el correo/celular.

Un error de conexión, permisos, función pendiente de publicación o índice incompleto se presenta como una consulta que no pudo completarse. Solo una respuesta válida del servidor puede confirmar que no encontró reservas. Los comprobantes pertenecientes a la sesión actual siguen funcionando sin esperar la consulta remota.

## Verificación

Pruebas de normalización, consulta entre sesiones, estados, homónimos, errores, privacidad, sincronización y migración paginada; integración con Firestore emulado y reglas; formulario del portal en Chromium móvil y panel administrador con datos ficticios. No se crean reservas ni se envían mensajes a clientes reales durante las pruebas.
