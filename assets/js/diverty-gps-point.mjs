// Keep in sync with diverty-app/src/lib/gps-point.mjs.
export function validGpsPoint(latitude, longitude) {
    if (latitude == null || longitude == null || String(latitude).trim() === '' || String(longitude).trim() === '') return null;
    const lat = Number(latitude), lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;
}

export function gpsPointFromText(value) {
    let raw = String(value || '').trim();
    try { raw = decodeURIComponent(raw); } catch { /* Preserve malformed URLs for validation. */ }
    // A Maps place URL's !3d/!4d pair is its pin; @ is the camera's center.
    const patterns = [
        /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
        /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i,
        /(?:ll\.|ll=)(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i,
        /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)(?:\s|$)/,
        /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
        /[?&]center=(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/i,
        /(?:^|[^\d.-])(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})(?![\d.])/
    ];
    for (const pattern of patterns) {
        const match = raw.match(pattern);
        if (match) { const point = validGpsPoint(match[1], match[2]); if (point) return point; }
    }
    return null;
}

export function reservationGpsPoint(event) {
    return validGpsPoint(event?.lat, event?.lng) || gpsPointFromText(event?.direccion);
}
