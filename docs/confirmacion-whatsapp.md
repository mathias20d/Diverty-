# Confirmación automática de solicitudes por WhatsApp

**Integración preparada y desactivada. No se han conectado cuentas, enviado mensajes reales, publicado funciones en Firebase, cambiado reglas ni habilitado facturación.** WhatsApp Business del teléfono necesita conectarse a WhatsApp Business Platform para enviar avisos disparados por la web. Los mensajes iniciados por la empresa requieren una plantilla aprobada y autorización del cliente: [política oficial](https://whatsappbusiness.com/policy/).

## Estado comprobado en Meta (12 de octubre de 2026)

La verificación de acceso del administrador se completó. El portfolio `1526363454507968` contiene la cuenta `divertypty` (`3200342153689672`), identificada explícitamente como **App de WhatsApp Business**. El número público `+507 6667-7965` aparece **Sin conexión**, con calidad Alta; el panel muestra el identificador de teléfono `1170217636184418`. No hay apps agregadas al portfolio, ni método de pago en esta cuenta. El negocio figura No verificado y la cuenta Aprobada; esos estados no demuestran una conexión a Cloud API ni habilitan por sí solos el envío desde la web.

La [documentación oficial de coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), consultada directamente en Meta, requiere un socio de soluciones o proveedor de tecnología con registro insertado y webhooks. La conexión conserva la app del teléfono, pero los mensajes de la API están sujetos a sus tarifas. Antes de elegir proveedor, confirmar presupuesto, compatibilidad con la API usada por esta integración y permisos mínimos; no contratar, habilitar pagos, compartir historial ni conceder acceso automáticamente.

No utilizar los identificadores visibles como prueba de activación. Al terminar el alta, verificar con acceso autorizado al número que `is_on_biz_app` sea `true` y `platform_type` sea `CLOUD_API`, y confirmar los identificadores devueltos. La coexistencia omite el registro convencional del número porque ya está registrado: **no eliminar la cuenta del teléfono ni ejecutar una migración estándar**. Las apps complementarias pueden desvincularse durante el alta y existen limitaciones de funciones, detalladas por Meta; revisar esas condiciones con el usuario antes de conectar.

El flujo de registro insertado debe usar la versión vigente: Meta anuncia que las versiones 2 y 3 quedan obsoletas el 15 de octubre de 2026 y pide migrar a v4. El proveedor debe encargarse del alta y sus webhooks; este repositorio no implementa una app de proveedor ni sincronización del historial. El envío de confirmaciones sigue desactivado mientras se elige y conecta una opción compatible.

## Lo que recibirá el cliente

Crear en Meta una plantilla de utilidad llamada `diverty_solicitud_recibida`, idioma español `es`, con seis parámetros de texto en este orden:

```text
Hola {{1}}, recibimos tu solicitud en Diverty.
Servicio: {{2}}
Fecha: {{3}}
Hora: {{4}}
Referencia: {{5}}
Estado: {{6}}
Puedes responder a este mensaje para consultar tu reserva.
```

Para una reserva Pendiente, el sexto parámetro dice “Pendiente de revisión por Diverty”. Recibir la solicitud no significa que ya haya sido aprobada ni pagada. Este bloque envía la recepción inicial, no campañas, recordatorios ni avisos posteriores de aprobación. Meta determina la aprobación y categoría de la plantilla; los mensajes pueden tener costo según su tarifa.

## Flujo y protección de datos

La casilla opcional del formulario aparece únicamente cuando `config_web/global.whatsappBookingEnabled` es `true`, y comienza desmarcada. Solo después de guardar o recuperar la reserva confirmada por el servidor, el navegador registra la autorización mediante `/api/booking-whatsapp`, usando el token de Firebase Auth. El servidor comprueba el propietario de la reserva y lee el teléfono del registro guardado; no acepta teléfonos ni mensajes arbitrarios del navegador.

La función Netlify guarda una solicitud durable en `diverty_whatsapp_bookings/{reservationId}`. Repetir el mismo ID no crea otro envío. La colección contiene UID, referencia, versión/fecha de consentimiento, hash del teléfono y estado; no copia nombres, dirección, precios ni el número completo. Su acceso debe estar restringido a backend/administración; comprobar esa restricción en las reglas vigentes antes de activarla. No se han modificado reglas ni el esquema que ya usa el cliente para crear eventos.

La función Firebase `sendBookingWhatsApp` procesa las solicitudes nuevas, incluso si el cliente cierra la página después del registro. Revalida que la reserva pertenezca al mismo cliente, que el teléfono siga siendo el consentido y que la función esté habilitada. Cancelaciones, números cambiados, falta de autorización y solicitudes de más de 24 horas se descartan. Un fallo al programar WhatsApp no elimina ni duplica la reserva: el cliente conserva su recibo web y ve un aviso. Si cierra la página antes de registrar la autorización o falla ese registro, no se garantiza el aviso por WhatsApp.

Estados internos: `queued`, `dispatching`, `accepted`, `failed`, `unknown`, `skipped`. `accepted` significa que Meta devolvió un ID; no demuestra entrega ni lectura. Un timeout ambiguo o un fallo después de iniciar el envío no se reenvía automáticamente para evitar duplicados. Revisar los estados `unknown` o `dispatching` antiguos con Meta antes de cualquier reintento manual. No se ha implementado el webhook de entrega/lectura ni un botón de reenvío.

## Activación pendiente

1. Conectar la cuenta/número a la plataforma oficial y obtener una plantilla aprobada, Phone Number ID, token de servidor y la versión de Graph API que indique Meta. Para conservar WhatsApp Business en el teléfono, revisar la elegibilidad del número para el flujo oficial de [coexistencia](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) con el proveedor que realice la conexión; no dar de baja ni migrar el número habitual a ciegas.
2. Copiar `firebase/functions/.env.example` a `.env.diverty-eventos` dentro de esa carpeta y completar los campos de configuración con los datos de Meta. Los archivos de entorno se excluyen de Git. Guardar el token en [Firebase Secret Manager](https://firebase.google.com/docs/functions/config-env?gen=2nd), nunca en el código, el navegador, Firestore público ni el chat.
3. Desde `firebase`, con sesión autorizada en el proyecto oficial, guardar el secreto y publicar exclusivamente la función nueva:

   ```powershell
   npx.cmd firebase-tools functions:secrets:set DIVERTY_WHATSAPP_ACCESS_TOKEN --project diverty-eventos
   npx.cmd firebase-tools deploy --project diverty-eventos --only functions:booking:sendBookingWhatsApp
   ```

   Requiere instalar antes las dependencias de `firebase/functions` y comprobar los requisitos de facturación/permisos de Cloud Functions. No se ejecutaron estos comandos, no se activó facturación y no se publicarán todas las funciones o reglas como parte de este bloque.
4. El endpoint reutiliza el backend Firebase ya configurado para el portal mediante `DIVERTY_PORTAL_FIREBASE_ACCOUNT`. Verificar que ese servicio esté configurado en Netlify. Añadir allí `DIVERTY_WHATSAPP_QUEUE_ENABLED=true` y volver a publicar la web.
5. Después de verificar función, cuenta y plantilla, añadir `whatsappBookingEnabled=true` al documento existente `artifacts/diverty-oficial/public/data/config_web/global`, conservando sus demás campos. Este cambio requiere administración y todavía no se realizó.
6. Probar con un teléfono propio que autorice el aviso: comprobar reserva, consentimiento, ID devuelto por Meta y recepción real. Comprobar también casilla desmarcada y un reintento del mismo ID. La prueba de entrega real está pendiente. Poner el indicador de Firestore en `false` oculta la casilla y detiene los avisos aún no iniciados.

## Verificación local

`node --test tests/*.test.mjs` prueba el permiso del propietario, consentimiento, duplicados, concurrencia del envío, números cambiados, cancelación, fallos ambiguos, contenido de plantilla y el guardado de reservas cuando WhatsApp falla. Solo usa datos y respuestas ficticios; nunca llama a Meta. Las pruebas de navegador verifican la casilla en normal/Navidad, PC/móvil, con Firebase y servicios externos sustituidos por fixtures. La función de Firebase aún necesita publicación y validación en su entorno real; la web por sí sola no activa ese proceso.
