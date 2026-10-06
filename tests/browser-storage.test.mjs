import test from 'node:test';
import assert from 'node:assert/strict';
import { readBrowserStorage, writeBrowserStorage } from '../assets/js/diverty-booking-state.mjs';

const denied = () => { throw new DOMException('Storage access denied', 'SecurityError'); };
const withWindow = (t, value) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  });
};

test('denied storage getters do not interrupt booking navigation', t => {
  const windowMock = {};
  for (const type of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(windowMock, type, { get: denied });
  }
  withWindow(t, windowMock);
  for (const type of ['localStorage', 'sessionStorage']) {
    assert.equal(readBrowserStorage(type, 'bookingNoticeShown'), null);
    assert.equal(writeBrowserStorage(type, 'bookingNoticeShown', 'true'), false);
  }
});

test('denied storage reads and writes remain optional', t => {
  withWindow(t, { localStorage: { getItem: denied, setItem: denied } });
  assert.equal(readBrowserStorage('localStorage', 'datosClienteDiverty'), null);
  assert.equal(writeBrowserStorage('localStorage', 'datosClienteDiverty', '{}'), false);
});

test('available storage preserves remembered contact details and session flags', t => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  withWindow(t, { localStorage: storage, sessionStorage: storage });
  const contact = JSON.stringify({ nombre: 'Cliente de prueba', telefono: '60000000' });
  assert.equal(readBrowserStorage('localStorage', 'datosClienteDiverty'), null);
  assert.equal(writeBrowserStorage('localStorage', 'datosClienteDiverty', contact), true);
  assert.equal(readBrowserStorage('localStorage', 'datosClienteDiverty'), contact);
  assert.equal(writeBrowserStorage('sessionStorage', 'bookingNoticeShown', 'true'), true);
  assert.equal(readBrowserStorage('sessionStorage', 'bookingNoticeShown'), 'true');
});
