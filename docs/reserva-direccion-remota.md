# Reserva desde otra ubicación

El paso Lugar ahora muestra «Escribir dirección» y «Estoy en el lugar». Una dirección escrita permite continuar sin buscar el PH/barriada, elegir un tipo o repetir la dirección en la referencia. Referencia, búsqueda por tipo y enlaces de Maps/Waze siguen disponibles en el panel opcional. El botón de continuar/enviar está antes de ese panel.

La dirección y el método se conservan al volver atrás. Cambiar la dirección limpia las coordenadas anteriores; las respuestas tardías de GPS/búsqueda no sustituyen una selección posterior. Se corrigió también la llamada a una función de horarios fuera de su ámbito al encontrar una ubicación de Navidad.

El formulario evita que la cabecera tape el paso al volver y mantiene el acceso a WhatsApp al final de la página durante la reserva, sin superponerlo a los campos. El carrito sigue accesible desde la cabecera.

## Solicitud pendiente y reglas de Firebase

Navidad sin coordenadas se guarda con `estado: Pendiente`, `ubicacion: Ubicación por confirmar`, dirección escrita y transporte provisional cero. El precio de transporte se muestra como «Por confirmar». La solicitud consume su cupo transaccional y mantiene el seguimiento del cliente; no se inventa un punto GPS ni se publica la dirección privada en disponibilidad.

La app pide confirmar el punto exacto y revisar el transporte antes de aceptar. El administrador puede pegar un enlace de Maps/Waze con coordenadas o escribir `latitud,longitud`, sin perder la dirección original. La confirmación comprueba de nuevo la ubicación guardada en Firebase, incluso si otro dispositivo muestra datos antiguos. La revisión de cobertura, transporte y ruta corresponde a Diverty antes de aceptar.

**Para habilitar Navidad con dirección escrita sin GPS, publicar las nuevas reglas:**

1. Abrir Firebase Console → proyecto `diverty-eventos` → Firestore Database → Reglas.
2. Copiar el contenido completo de [firestore.proposed.rules](../firebase/firestore.proposed.rules), reemplazar el editor y pulsar **Publicar**.
3. Esperar que los despliegues de la web y app correspondan a estos cambios; recargar la web.

Subir código a GitHub no publica reglas en Firebase. Las reglas anteriores exigían GPS para toda solicitud de Navidad y rechazarán este nuevo caso hasta actualizarse. La web con ubicación GPS conserva su contrato anterior. No se ha confirmado la versión de reglas publicada mediante acceso administrativo.

## Verificación

Las pruebas de navegador usan Chromium y Firebase/servicios externos simulados: dirección remota sin referencia, volver atrás, enlace de Maps, cambio de dirección, GPS normal/Navidad y envío completo normal/Navidad. También se mantienen las comprobaciones de tema, menú, carrito, horarios y cupos.

Las 34 pruebas de Firestore usan solo el emulador `demo-diverty`. Incluyen el manejador real de Navidad sin GPS y rechazo de coordenadas públicas inventadas, dirección vacía, transporte provisional distinto de cero o estado confirmado por el cliente. Las 25 pruebas de la app incluyen la negativa a aceptar una ubicación pendiente desde un dispositivo con datos antiguos.

No se crearon reservas, cuentas ni notificaciones reales. El sitio de Netlify respondió HTTP 200 en esta revisión. La comprobación del despliegue se limita a leer archivos publicados; las pruebas aisladas no certifican las reglas activas en producción.
