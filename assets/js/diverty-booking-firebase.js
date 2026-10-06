let runtimePromise = null;

export async function getDivertyFirebaseRuntime(firebaseConfig, appName = 'DivertyWeb', initialAuthToken = '') {
  if (runtimePromise) return runtimePromise;

  runtimePromise = (async () => {
    const [appMod, firestoreMod, authMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js')
    ]);

    const app = appMod.getApps().some(a => a.name === appName)
      ? appMod.getApp(appName)
      : appMod.initializeApp(firebaseConfig, appName);
    const db = firestoreMod.getFirestore(app);
    const auth = authMod.getAuth(app);

    if (!auth.currentUser) {
      try {
        if (initialAuthToken) {
          try { await authMod.signInWithCustomToken(auth, initialAuthToken); }
          catch (_) { await authMod.signInAnonymously(auth); }
        } else {
          await authMod.signInAnonymously(auth);
        }
      } catch (e) {
        console.warn('Firebase Auth bajo demanda no disponible:', e);
        throw e;
      }
    }

    return {
      db, auth,
      doc: firestoreMod.doc,
      collection: firestoreMod.collection,
      getDocs: firestoreMod.getDocs,
      setDoc: firestoreMod.setDoc,
      getDoc: firestoreMod.getDoc,
      query: firestoreMod.query,
      where: firestoreMod.where,
      onSnapshot: firestoreMod.onSnapshot,
      writeBatch: firestoreMod.writeBatch,
      runTransaction: firestoreMod.runTransaction
    };
  })().catch(err => {
    runtimePromise = null;
    throw err;
  });

  return runtimePromise;
}
