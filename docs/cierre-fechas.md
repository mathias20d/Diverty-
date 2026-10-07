# Cerrar fechas de reservas

En el CRM: **Agenda → Cerrar fechas de la web → elegir día → Cerrar esta fecha**. El mismo calendario permite **Reabrir esta fecha**. El selector de mes permite ir a cualquier mes futuro. Las fechas usan el día de Panamá.

El cierre es para el día completo y todos los servicios, incluidas las entregas de Santa. No elimina reservas, solicitudes pendientes ni pagos anteriores. La administración puede seguir revisando y editando esas reservas.

Los cierres se guardan en `artifacts/diverty-oficial/public/data/config_web/fechas_cerradas`, con un mapa `fechas` cuyas claves son fechas `AAAA-MM-DD` y cuyo valor es `true`. Reabrir elimina únicamente esa entrada. El guardado transaccional también actualiza `config_web/web_sync`, conservando las versiones de otras colecciones.

La web muestra esos días en rojo como **Sin disponibilidad**. El calendario de la reserva desactiva la selección. La web vuelve a consultar al escoger/continuar con una fecha y lee los cierres dentro de la transacción al enviar una reserva. Un formulario abierto antes de un cierre conserva los datos y pide elegir otra fecha. Un reintento de una reserva ya guardada recupera su comprobante, aunque posteriormente se cierre el día.

Las páginas que ya estaban abiertas refrescan la configuración cada 45 segundos mientras están visibles. Al enviar la solicitud se consulta el cierre vigente, sin depender de ese intervalo. Reabrir vuelve a habilitar la solicitud; la comprobación habitual de personal, horarios y cupos sigue aplicándose.

## Protección en Firebase: publicación pendiente

Publicar Netlify o Vercel no publica reglas ni Cloud Functions. En este entorno el comando administrativo `firebase projects:list` devolvió **Failed to authenticate**. No se modificaron reglas de producción ni se cerraron fechas reales durante las pruebas.

La propuesta [firestore.proposed.rules](../firebase/firestore.proposed.rules) y el servicio [service.mjs](../firebase/functions/service.mjs) incluyen la comprobación. Para conservar las reglas vigentes sin incorporar otros cambios, un administrador puede añadir únicamente lo siguiente en **Firebase Console → Firestore Database → Reglas**:

1. Guardar una copia de las reglas vigentes.
2. Dentro de `match /databases/{database}/documents`, añadir:

```text
function closedDate(date) {
  let path = /databases/$(database)/documents/artifacts/diverty-oficial/public/data/config_web/fechas_cerradas;
  return exists(path) && get(path).data.get('fechas',{}).get(date,false) == true;
}
```

3. En la condición que permite **crear** reservas de clientes en `eventos/{id}`, añadir `&& !closedDate(request.resource.data.fecha)`. Si hay más de una condición que permita crear reservas a clientes, aplicar el guardado a todas. Conservar el permiso administrativo y las lecturas públicas de `config_web`.
4. Validar y publicar en Firebase. No modificar los permisos de actualizar reservas existentes para este cierre.

Esta comprobación de servidor bloquea también navegadores que conservan una versión antigua de la web y escrituras que intenten omitir su validación. Sin publicarla, el bloqueo se aplica al flujo de la web actualizada. Si se activa la validación central, publicar además el servicio actualizado siguiendo [validacion-central-reservas.md](validacion-central-reservas.md).

## Validación

- `npm test` en ambos repositorios.
- `tests/browser/panel-flow.cjs`: cerrar, reabrir, conservar otros cierres, cambiar de mes, persistir al volver a abrir, pantalla de 320 px y fallo de conexión sin falso guardado.
- `tests/browser/web-stability.cjs`: fechas visibles/desactivadas, reapertura sincronizada y formularios normales/Santa abiertos antes del cierre que conservan los datos.
- `npm --prefix firebase test`: reglas y servicio en un emulador local de demostración. Incluye cierre durante una transacción, rechazo de solicitudes que omitan la validación y recuperación de reservas ya guardadas.
