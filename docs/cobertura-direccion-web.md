# Cobertura al escribir la dirección

Las reservas normales evalúan la zona también al escribir una dirección. PH Allure, Calle Colombia, queda en Ciudad de Panamá con transporte incluido ($0). Se mantienen las tarifas de las demás zonas, los límites GPS y el bloqueo de sectores restringidos.

Los enlaces cortos de Google Maps se consultan mediante `POST /api/map-location`, una función de Netlify sin API de pago. Solo admite los dominios de enlaces cortos de Google y lee su primera redirección; no visita destinos arbitrarios. El nombre del lugar puede identificar la zona y completar `referenciaLugar` sin exigir repetirlo. La dirección original se conserva y no se inventan coordenadas cuando Google solo devuelve un nombre.

El aviso de transporte pendiente aparece para ubicaciones identificadas fuera de cobertura. Una dirección aún sin identificar muestra «Ubicación recibida», sin afirmar que tiene un recargo ni prometer transporte gratuito; conserva «Ubicación por revisar» en la solicitud administrativa. Si falla la consulta de Maps, se puede escribir el nombre del lugar y continuar. Editar la dirección invalida las respuestas anteriores y el envío espera la consulta vigente.

Una solicitud guardada muestra «¡Gracias por elegir Diverty!» y explica que Diverty contactará por WhatsApp para coordinar el abono y confirmar la reserva. El estado sigue siendo **Pendiente**. El icono tiene una animación breve, desactivada al reducir movimiento. La web no envía un WhatsApp automáticamente.

Verificación: pruebas de enlaces, fallos de red, destinos permitidos, cobertura sin GPS, tarifas, restricciones y envíos en Chromium con Firebase simulado. No se crean reservas reales. Navidad conserva su cálculo de transporte y su revisión de rutas.
