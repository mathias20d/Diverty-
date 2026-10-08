// Take the best fresh device reading; never average it with less accurate positions.
export function capturePreciseGps({ geolocation = globalThis.navigator?.geolocation, onProgress = () => {}, isCurrent = () => true, targetAccuracy = 30, settleMs = 600, usableAccuracy = 50, usableMs = 2500, deadlineMs = 10000, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    let best = null, finished = false, watchId = null, settleTimer = null, usableTimer = null, deadlineTimer = null;
    let resolve, reject, lastError;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const started = now();
    const error = (code, message) => Object.assign(new Error(message), { code });
    const cleanup = () => {
        if (watchId !== null) { geolocation.clearWatch(watchId); watchId = null; }
        clearTimer(settleTimer); clearTimer(usableTimer); clearTimer(deadlineTimer);
    };
    const finish = failure => {
        if (finished) return;
        finished = true; cleanup();
        if (!isCurrent()) failure = error('GPS_CANCELLED', 'La búsqueda de ubicación se canceló.');
        if (failure) reject(failure);
        else if (best) resolve(best);
        else reject(lastError || error(2, 'No pudimos obtener una ubicación válida.'));
    };
    const cancel = () => finish(error('GPS_CANCELLED', 'La búsqueda de ubicación se canceló.'));
    // A useful fresh fix should not wait for an ideal 10m reading that may never arrive.
    const ready = () => best && ((best.accuracy <= targetAccuracy && now() - started >= settleMs) || (best.accuracy <= usableAccuracy && now() - started >= usableMs));
    if (!geolocation?.watchPosition) {
        finish(error(2, 'Este dispositivo no permite obtener la ubicación.'));
        return { promise, cancel };
    }
    settleTimer = setTimer(() => { if (ready()) finish(); }, settleMs);
    usableTimer = setTimer(() => { if (ready()) finish(); }, usableMs);
    deadlineTimer = setTimer(() => finish(), deadlineMs);
    try {
        watchId = geolocation.watchPosition(position => {
            if (finished) return;
            if (!isCurrent()) return cancel();
            const { latitude, longitude, accuracy } = position.coords || {};
            const timestamp = Number(position.timestamp);
            if (latitude == null || longitude == null || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || !Number.isFinite(accuracy) || accuracy <= 0 || !Number.isFinite(timestamp) || timestamp < now() - 5000 || timestamp > now() + 1000) return;
            if (!best || accuracy < best.accuracy || (accuracy === best.accuracy && timestamp > best.timestamp)) {
                best = { lat: latitude, lng: longitude, accuracy, timestamp };
                onProgress(best);
            }
            if (ready()) finish();
        }, failure => {
            if (finished) return;
            lastError = failure;
            if (failure?.code === 1) finish(failure);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: deadlineMs });
        // Native callbacks are async, but also clean up a synchronous test/polyfill callback.
        if (finished) cleanup();
    } catch (failure) { finish(failure); }
    return { promise, cancel };
}

export function gpsAccuracyMessage(accuracy) {
    const metres = Math.ceil(accuracy);
    const received = `Ubicación recibida · precisión aproximada ±${metres} m.`;
    return accuracy > 50 ? received + ' El margen es amplio: añade una dirección detallada o vuelve a medir al aire libre.' : received;
}
