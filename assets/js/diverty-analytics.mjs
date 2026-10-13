export const MEASUREMENT_ID = 'G-6FYQV9RK3X';
const RECEIPTS_KEY = 'diverty_analytics_receipts_v1';
const sectionNames = { home: 'Inicio', catalog: 'Catálogo', gallery: 'Galería', booking: 'Reservar', portal: 'Mi reserva' };
const safeId = value => /^[a-zA-Z0-9_-]{1,80}$/.test(String(value || '')) ? String(value) : '';
const label = (value, fallback = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return !text || /@|https?:|[<>]|(?:\d[\s().+-]*){7,}/i.test(text) ? fallback : text.slice(0, 100);
};

// Only public navigation and campaign fields may leave the browser. Never copy
// the current query string, WhatsApp message, form fields or reservation object.
export function safeLandingUrl(href) {
  const input = new URL(href), output = new URL(input.pathname, input.origin);
  // Route IDs are added only after the app resolves them against the public catalog.
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    const value = input.searchParams.get(key) || '';
    if (/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(value) && !/\d{7,}/.test(value)) output.searchParams.set(key, value);
  }
  return output.href;
}

export function safeReferrer(value) {
  try { return new URL(value).origin + '/'; } catch { return ''; }
}

export function analyticsItems(items = []) {
  return items.slice(0, 100).map(item => ({
    item_id: safeId(item.id),
    item_name: label(item.name || item.title || item.nombre, 'Servicio'),
    item_category: safeId(item.categoria || item.category) || 'catalogo',
    price: Number.isFinite(Number(item.price)) ? Math.max(0, Number(item.price)) : 0,
    quantity: Number.isFinite(Number(item.quantity)) ? Math.max(1, Math.min(10000, Number(item.quantity))) : 1,
  })).filter(item => item.item_id);
}

export function createAnalyticsTracker({ send, origin = 'https://divertypanama.netlify.app', referrer = '', landing = origin, storage, enabled = true } = {}) {
  let current = { page_location: origin + '/', page_title: 'Diverty Panamá', page_referrer: safeReferrer(referrer) };
  let lastView = '', lastStep = '', checkoutStarted = false;
  const receipts = new Set();
  try {
    const saved = JSON.parse(storage?.getItem(RECEIPTS_KEY) || '[]');
    if (Array.isArray(saved)) saved.slice(-50).filter(id => typeof id === 'string').forEach(id => receipts.add(id));
  } catch {}
  const emit = (name, parameters = {}) => {
    if (!enabled || typeof send !== 'function') return false;
    try { send('event', name, { ...current, ...parameters, send_to: MEASUREMENT_ID }); return true; } catch { return false; }
  };
  const ecommerce = items => {
    const safeItems = analyticsItems(items);
    return { currency: 'USD', value: Math.round(safeItems.reduce((total, item) => total + item.price * item.quantity, 0) * 100) / 100, items: safeItems };
  };
  const tracker = {
    view(section, publicName = '', item = null) {
      let key, title, url = new URL('/', origin);
      if (item) {
        const id = safeId(item.id);
        if (!id) return;
        key = 'plan:' + id; title = label(item.name || item.title, 'Servicio'); url.searchParams.set('plan', id);
      } else if (section.startsWith('cat_')) {
        const id = safeId(section.slice(4));
        if (!id) return;
        key = 'category:' + id; title = label(publicName, 'Categoría'); url.searchParams.set('categoria', id);
      } else {
        if (!Object.hasOwn(sectionNames, section)) return;
        key = section; title = sectionNames[section]; if (section !== 'home') url.searchParams.set('vista', section);
      }
      if (key === lastView) return; // Sync refreshes and drawer/menu history are not new visits.
      const previous = lastView ? current.page_location : current.page_referrer;
      if (!lastView) {
        const campaign = new URL(safeLandingUrl(landing)).searchParams;
        for (const [name, value] of campaign) url.searchParams.set(name, value);
      }
      current = { page_title: title + ' | Diverty Panamá', page_location: url.href, page_referrer: previous };
      if (emit('page_view')) {
        lastView = key;
        // Keep automatic engagement/scroll events attached to the safe virtual page.
        try { send('set', { ...current }); } catch {}
        if (item) emit('view_item', ecommerce([{ ...item, quantity: 1 }]));
      }
    },
    add(items) { emit('add_to_cart', ecommerce(items)); },
    remove(items) { emit('remove_from_cart', ecommerce(items)); },
    checkout(items, christmas = false) {
      if (!items.length || checkoutStarted) return;
      if (emit('begin_checkout', { ...ecommerce(items), booking_kind: christmas ? 'navidad' : 'evento' })) checkoutStarted = true;
    },
    step(number, christmas = false) {
      const step = Number(number);
      if (![1, 2, 3].includes(step)) return;
      const key = (christmas ? 'navidad:' : 'evento:') + step;
      if (key === lastStep) return;
      const names = christmas ? ['Lugar', 'Horario', 'Contacto'] : ['Contacto', 'Evento', 'Lugar'];
      if (emit('booking_step', { booking_step: step, booking_step_name: names[step - 1], booking_kind: christmas ? 'navidad' : 'evento' })) lastStep = key;
    },
    lead(receiptId, items, christmas = false) {
      if (!receiptId || receipts.has(receiptId)) return;
      if (emit('generate_lead', { ...ecommerce(items), booking_kind: christmas ? 'navidad' : 'evento' })) {
        receipts.add(receiptId);
        while (receipts.size > 50) receipts.delete(receipts.values().next().value);
        try { storage?.setItem(RECEIPTS_KEY, JSON.stringify([...receipts])); } catch {}
      }
    },
    whatsapp(position = 'contenido') {
      const safePosition = ['flotante', 'contacto', 'contenido'].includes(position) ? position : 'contenido';
      emit('whatsapp_click', { contact_location: safePosition });
    },
    resetCheckout() { checkoutStarted = false; lastStep = ''; },
  };
  return tracker;
}

export function initializeBrowserAnalytics(win) {
  if (win.__divertyAnalytics) return win.__divertyAnalytics;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(win.location.hostname);
  const enabled = !win.__DIVERTY_THEME_PREVIEW__ && (!local || win.__DIVERTY_ANALYTICS_TEST__ === true);
  const noop = () => {};
  let storage;
  try { storage = win.sessionStorage; } catch {}
  if (enabled) {
    win.dataLayer = win.dataLayer || [];
    win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
    const context = { page_location: safeLandingUrl(win.location.href), page_title: 'Diverty Panamá', page_referrer: safeReferrer(win.document.referrer) };
    win.gtag('js', new Date());
    win.gtag('set', context);
    // The matching web stream must have enhanced history/page views disabled.
    win.gtag('config', MEASUREMENT_ID, { send_page_view: false });
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      const script = win.document.createElement('script');
      script.async = true;
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
      win.document.head.appendChild(script);
    };
    if (win.requestIdleCallback) win.requestIdleCallback(load, { timeout: 2500 });
    else win.setTimeout(load, 1800);
  }
  const tracker = createAnalyticsTracker({ enabled, send: enabled ? (...args) => win.gtag(...args) : noop, origin: win.location.origin, landing: win.location.href, referrer: win.document.referrer, storage });
  win.__divertyAnalytics = tracker;
  const entry = new URL(win.location.href).searchParams;
  if (!entry.get('plan') && !entry.get('categoria')) {
    const section = entry.get('vista');
    tracker.view(Object.hasOwn(sectionNames, section) ? section : 'home');
  }
  if (enabled) win.document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href, win.location.href);
      if (!['wa.me', 'api.whatsapp.com', 'web.whatsapp.com'].includes(url.hostname)) return;
      const position = link.closest('.whatsapp-btn') ? 'flotante' : link.closest('.modal-backdrop') ? 'contacto' : 'contenido';
      tracker.whatsapp(position);
    } catch {}
  });
  return tracker;
}

export const analytics = typeof window === 'undefined' ? null : initializeBrowserAnalytics(window);
