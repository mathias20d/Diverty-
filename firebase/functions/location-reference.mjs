// A map pin/link identifies coordinates, not the venue entrance or name.
export function hasPlaceDescription(value) {
  const text=String(value ?? '').replace(/https?:\/\/\S+/gi,'').trim();
  return text.length >= 3 && /\p{L}/u.test(text);
}
export function needsPlaceReference(event) {
  return !hasPlaceDescription(event?.referenciaLugar) && !hasPlaceDescription(event?.direccion);
}
