# Diverty · Operación Navidad

Aplicación web instalable (PWA) y página pública de entregas del 24 y 25 de diciembre de 2026. No es una APK Android.

Conserva rutas por Santa, capacidad de varios Santas, ubicación, disponibilidad recomendada, transporte, solicitudes, abonos y liberación de cupos.

Cada cuenta registrada utiliza su propio espacio privado. La cuenta original de Diverty conserva sus datos originales. Las empresas nuevas empiezan sin publicar; para compartir requieren verificar el correo, añadir un servicio y configurar su WhatsApp.

No se migraron ni borraron las reservas de otros módulos: se retiraron sus pantallas de esta publicación. Los proyectos completos originales están en el respaldo privado de la entrega.

La temporada está fijada en diciembre de 2026, como el módulo original. Cambiar de año requiere actualizar las fechas en app, web y servidor. No comparte empresas entre varias cuentas: cada dueño gestiona su propio espacio.

Publicación: primero web y API Netlify, luego reglas de Firestore y finalmente PWA. Restaurar las reglas originales sin revisar la web volvería a abrir accesos públicos antiguos.

Credenciales de servidor: variable ya existente DIVERTY_PORTAL_FIREBASE_ACCOUNT en Netlify. No incluirla en el cliente, Git ni archivos de entrega.
