export function panamaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

const dateKey = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function isNormalBookingDateAllowed(value, minimumDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (dateKey(date.getFullYear(), date.getMonth(), date.getDate()) !== value) return false;
  return value >= minimumDate && value !== '2026-12-24' && value !== '2026-12-25';
}

export function bookingCalendarDays(year, month, minimumDate, closedDates = {}) {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells = Array(offset).fill(null);
  for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
    const value = dateKey(year, month, day);
    cells.push({ day, value, closed: closedDates[value] === true, available: isNormalBookingDateAllowed(value, minimumDate) && closedDates[value] !== true });
  }
  return cells;
}

// Keep the original date field and its change handlers. Pointer users get the
// same calendar on every browser instead of depending on a native date dialog.
export function installBookingDatePicker(input, trigger, { loadClosedDates = async () => ({}), onError = () => {} } = {}) {
  if (!input || !trigger) return () => {};
  let overlay = null, month = null, minimumDate = null, closedDates = {}, loading = false, disposed = false;
  const close = (restoreFocus = true) => {
    overlay?.remove();
    overlay = null;
    document.removeEventListener('keydown', onKeyDown);
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab' && overlay) {
      const buttons = [...overlay.querySelectorAll('button:not([disabled])')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  const render = () => {
    const year = month.getFullYear(), index = month.getMonth();
    const heading = month.toLocaleDateString('es-PA', { month: 'long', year: 'numeric' });
    const previousAllowed = dateKey(year, index, 1).slice(0, 7) > minimumDate.slice(0, 7);
    overlay.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="booking-date-title" class="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--s-glass-border)] bg-[var(--s-bg-color)] p-5 shadow-2xl season-text-title">
      <div class="flex items-center justify-between gap-3 mb-4"><h3 id="booking-date-title" class="text-lg font-extrabold">Elige la fecha de tu evento</h3><button type="button" data-calendar-close aria-label="Cerrar calendario" class="w-10 h-10 rounded-full bg-black/10 font-bold">✕</button></div>
      <div class="flex items-center justify-between gap-3 mb-4"><button type="button" data-calendar-month="-1" aria-label="Mes anterior" ${previousAllowed ? '' : 'disabled'} class="w-10 h-10 rounded-xl bg-black/10 disabled:opacity-30">‹</button><p aria-live="polite" class="font-bold capitalize">${heading}</p><button type="button" data-calendar-month="1" aria-label="Mes siguiente" class="w-10 h-10 rounded-xl bg-black/10">›</button></div>
      <div class="grid grid-cols-7 gap-1 text-center">${['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map(day => `<span class="text-xs font-bold season-text-muted py-2">${day}</span>`).join('')}
      ${bookingCalendarDays(year, index, minimumDate, closedDates).map(cell => {
        if (!cell) return '<span></span>';
        const selected = cell.value === input.value;
        const label = new Date(`${cell.value}T12:00:00`).toLocaleDateString('es-PA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return `<button type="button" data-calendar-date="${cell.value}" aria-label="${label}${cell.closed ? ': Sin disponibilidad' : ''}" aria-pressed="${selected}" ${cell.available ? '' : 'disabled'} class="h-10 rounded-xl text-sm font-bold ${cell.closed ? 'text-rose-600 bg-rose-500/10 line-through' : selected ? 'season-btn' : 'bg-black/5'} disabled:opacity-50 disabled:cursor-not-allowed">${cell.day}</button>`;
      }).join('')}</div>
      <p class="text-xs season-text-muted mt-4">Las fechas en rojo están sin disponibilidad. El personal disponible se comprueba al elegir la hora. El 24 y 25 de diciembre de 2026 son exclusivos para entregas de Santa.</p>
      <button type="button" data-calendar-close class="mt-4 w-full rounded-xl py-3 bg-black/10 font-bold">Cancelar</button>
    </section>`;
    overlay.querySelectorAll('[data-calendar-close]').forEach(button => button.onclick = () => close());
    overlay.querySelectorAll('[data-calendar-month]').forEach(button => button.onclick = () => {
      month = new Date(year, index + Number(button.dataset.calendarMonth), 1);
      render();
      overlay.querySelector(`[data-calendar-month="${button.dataset.calendarMonth}"]`).focus();
    });
    overlay.querySelectorAll('[data-calendar-date]').forEach(button => button.onclick = () => {
      if (button.disabled) return;
      input.value = button.dataset.calendarDate;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    });
  };
  const open = async event => {
    event.preventDefault();
    if (overlay || loading || disposed) return;
    loading = true;
    trigger.setAttribute('aria-busy', 'true');
    try { closedDates = await loadClosedDates(); }
    catch (_) { onError('No se pudo comprobar la disponibilidad. Reintenta con conexión.'); return; }
    finally { loading = false; trigger.removeAttribute('aria-busy'); }
    if (disposed || !input.isConnected) return;
    minimumDate = panamaDateKey();
    input.min = minimumDate;
    const start = isNormalBookingDateAllowed(input.value, minimumDate) ? input.value : minimumDate;
    const [year, index] = start.split('-').map(Number);
    month = new Date(year, index - 1, 1);
    overlay = document.createElement('div');
    overlay.id = 'booking-date-calendar';
    overlay.className = 'fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4';
    overlay.onclick = event => { if (event.target === overlay) close(); };
    document.body.appendChild(overlay);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeyDown);
    render();
    (overlay.querySelector('[aria-pressed="true"]:not([disabled])') || overlay.querySelector('[data-calendar-date]:not([disabled])') || overlay.querySelector('[data-calendar-close]')).focus();
  };
  trigger.addEventListener('click', open);
  input.addEventListener('click', open);
  return () => {
    disposed = true;
    close(false);
    trigger.removeEventListener('click', open);
    input.removeEventListener('click', open);
  };
}
