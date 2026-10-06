# Reservas: revisión de transporte y validación central

La web conserva el flujo de reservas normal y Navidad. Una dirección por revisar muestra el transporte pendiente, identifica el importe como servicios y exige aceptar el aviso antes de enviar. El recibo final explica que la solicitud necesita cotización y aprobación. La app conserva todos los controles existentes y añade filtros Todas / Por revisar / Próximas (7 días en Panamá) / Falta abono. El abono no se convierte en un requisito nuevo para aprobar.

## Publicación del servicio Firebase

El código del servicio está en `firebase/functions`. **Subir a GitHub/Netlify no publica Cloud Functions ni las reglas de Firestore.** El nuevo servicio permanece desactivado hasta completar los siguientes pasos, sin interrumpir las reservas actuales.

1. Desde una terminal con acceso de administración al proyecto `diverty-eventos`, en la carpeta `firebase`, ejecutar:

   ```bash
   npm ci
   npm --prefix functions ci
   npx firebase login
   npx firebase deploy --project diverty-eventos --only functions:booking
   npx firebase deploy --project diverty-eventos --only firestore:rules
   ```

   Estas funciones usan Node.js 22 y la región `us-central1`. Firebase puede exigir un plan con facturación para publicar funciones. Revisar la configuración del proyecto antes de habilitar facturación; estos comandos no cambian el plan por sí solos.

2. Comprobar en Firebase que `createWebBooking` y `confirmWebBooking` se publicaron sin errores. Comprobar que la web y la app están usando los nuevos commits. Revisar en `config_web/global` `recursosDisponibles.animadores`, `recursosDisponibles.payasos`, `capacidadSimultanea` y `capacidadSanta`. El cero en personal significa que no hay ese personal disponible; se respeta.

3. En Firestore, documento `artifacts/diverty-oficial/public/data/config_web/global`, **añadir** el campo booleano `centralBookingValidation` con valor `true`. Conservar los demás campos. Hacerlo únicamente después de publicar las funciones, reglas y ambas interfaces. Las nuevas solicitudes se enviarán al servidor; las reglas bloquearán el intento de crearlas directamente desde el navegador.

4. Realizar una solicitud de prueba identificable, revisarla en la app y rechazarla al terminar para liberar capacidad. Probar una dirección manual y otra fuera de cobertura: deben decir transporte pendiente. Probar dos horarios solapados con la última unidad de personal: solo debe guardarse uno. Aprobar una solicitud exige transporte revisado cuando corresponda; Navidad también exige punto exacto y ruta viable. Los reintentos usan el mismo identificador.

Si hay un problema de publicación, poner `centralBookingValidation` en `false` restaura el flujo anterior. No eliminar documentos de eventos para volver atrás. Esta reversión desactiva la nueva validación central; los avisos y filtros continúan disponibles.

## Alcance y compatibilidad

- El servidor valida usuario, datos, fecha, cantidades, precios del catálogo/campaña, cupón, destino, duración, personal y capacidad; escribe evento, recibo y disponibilidad en una transacción.
- Las nuevas reservas usan una instantánea de precios calculada en el servidor. Si cambia un precio o transporte, el navegador muestra el nuevo resumen y pide un nuevo envío; no guarda a escondidas un importe diferente.
- Los eventos con horas distintas también compiten por personal durante el intervalo completo. Los intervalos adyacentes no se solapan. Las reservas pendientes retienen su capacidad; rechazar/cancelar libera ese intervalo.
- Las ediciones de la app actualizan coordinadores por día cuando está habilitado el servicio, para que una aprobación y una edición concurrentes se revaliden. Los documentos `booking_control` son privados para la administración. Ningún nombre, teléfono o dirección se publica en la disponibilidad.
- Las solicitudes anteriores a esta publicación mantienen su revisión y aprobación existentes, incluida la corrección de ubicación/transporte. No se reconstruyen sus precios históricos ni se borran datos. Las nuevas solicitudes llevan `centralBookingVersion: 1` y se aprueban con `confirmWebBooking`.
- La capacidad y el trayecto se revalidan al aprobar. El traslado de Santa mantiene la estimación por distancia y los márgenes del motor existente; no consulta tráfico en tiempo real.

## Verificación local sin reservas reales

```bash
npm test
npm run test:browser
npm --prefix firebase/functions test
FIREBASE_EMULATORS_PATH=/workspace/.cloud-setup/firebase-emulators \
XDG_CONFIG_HOME=/workspace/.cloud-setup/firebase-cli \
XDG_CACHE_HOME=/workspace/.cloud-setup/firebase-cache npm --prefix firebase test
```

La prueba de integración del servidor solo escribe si `FIRESTORE_EMULATOR_HOST` es exactamente `127.0.0.1:8089`, usando un proyecto `demo-`. La prueba comprueba simultaneidad, reintento, propietario, permisos de aprobación, transporte pendiente y sincronización del recibo. La suite de reglas también comprueba que el modo central niega la creación directa del cliente.
