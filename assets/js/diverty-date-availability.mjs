export function isClosedBookingDate(data, date) {
  return data?.fechas?.[date] === true;
}
