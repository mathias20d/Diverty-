
const FIREBASE_API_KEY = "AIzaSyDxE2E1KMuZU523k8oWHabi1jDrFxPOD-0";
const FIREBASE_PROJECT_ID = "diverty-eventos";
const APP_ID = "diverty-oficial";

const SITE_NAME = "Diverty Panamá";
const GENERIC_TITLE = "Diverty Eventos | Planes de Fiestas en Panamá";
const GENERIC_DESCRIPTION =
  "¡Celebra con Diverty Eventos! Fiestas infantiles en Panamá. Payasitos, animadores, pintacaritas y shows de burbujas.";

let cachedToken = "";
let tokenExpiresAt = 0;

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function field(fields, name, fallback = "") {
  const v = fields?.[name];

  if (!v) return fallback;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;

  return fallback;
}

function cleanText(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortDescription(value, fallback) {
  const text = cleanText(value || fallback);

  return text.length > 180
    ? text.slice(0, 177).trimEnd() + "..."
    : text;
}

async function getAnonymousToken() {
  if (
    cachedToken &&
    Date.now() < tokenExpiresAt - 60000
  ) {
    return cachedToken;
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        returnSecureToken: true
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Firebase Auth ${response.status}`);
  }

  const data = await response.json();

  cachedToken = data.idToken;
  tokenExpiresAt =
    Date.now() +
    Number(data.expiresIn || 3600) * 1000;

  return cachedToken;
}

async function fetchFirestoreDoc(collectionName, id) {
  const token = await getAnonymousToken();

  const path =
    `artifacts/${APP_ID}/public/data/${collectionName}/${id}`;

  const endpoint =
    `https://firestore.googleapis.com/v1/projects/` +
    `${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;

  const response = await fetch(endpoint, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (response.status === 429) {
    throw new Error("Firestore temporalmente limitado (429)");
  }

  if (!response.ok) {
    throw new Error(`Firestore ${response.status}`);
  }

  return await response.json();
}

async function getFirestoreDoc(collectionName, id) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id || "")) {
    return null;
  }

  const cache = await caches.open("diverty-social-preview-v2");

  const cacheKey =
    `https://diverty-cache.local/${collectionName}/${id}`;

  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return await cachedResponse.json();
  }

  const data = await fetchFirestoreDoc(
    collectionName,
    id
  );

  if (data) {
    const responseToCache = new Response(
      JSON.stringify(data),
      {
        headers: {
          "content-type": "application/json",
          "cache-control":
            "public, max-age=21600, s-maxage=21600"
        }
      }
    );

    try {
      await cache.put(
        cacheKey,
        responseToCache
      );
    } catch (error) {
      console.log(
        "[share-meta] Cache no disponible:",
        error?.message || error
      );
    }
  }

  return data;
}

function removeExistingSocialMeta(html) {
  return html
    .replace(
      /<meta\s+property=["']og:[^>]*>\s*/gi,
      ""
    )
    .replace(
      /<meta\s+name=["']twitter:[^>]*>\s*/gi,
      ""
    )
    .replace(
      /<link\s+rel=["']canonical["'][^>]*>\s*/gi,
      ""
    );
}

function injectMeta(html, meta) {
  html = removeExistingSocialMeta(html);

  const tags = `
    <!-- DIVERTY SOCIAL PREVIEW V2 -->
    <link rel="canonical" href="${esc(meta.url)}">

    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(SITE_NAME)}">
    <meta property="og:locale" content="es_PA">

    <meta property="og:title" content="${esc(meta.title)}">
    <meta property="og:description" content="${esc(meta.description)}">
    <meta property="og:url" content="${esc(meta.url)}">

    ${
      meta.image
        ? `<meta property="og:image" content="${esc(meta.image)}">
    <meta property="og:image:alt" content="${esc(meta.title)}">`
        : ""
    }

    <meta name="twitter:card" content="${
      meta.image
        ? "summary_large_image"
        : "summary"
    }">

    <meta name="twitter:title" content="${esc(meta.title)}">
    <meta name="twitter:description" content="${esc(meta.description)}">

    ${
      meta.image
        ? `<meta name="twitter:image" content="${esc(meta.image)}">`
        : ""
    }
  `;

  return html.replace(
    /<\/head>/i,
    `${tags}\n</head>`
  );
}

export default async function handler(request, context) {
  const url = new URL(request.url);

  const planId =
    (url.searchParams.get("plan") || "").trim();

  const categoryId =
    (url.searchParams.get("categoria") || "").trim();

  if (!planId && !categoryId) {
    return;
  }

  try {
    let title = GENERIC_TITLE;
    let description = GENERIC_DESCRIPTION;
    let image = "";

    if (planId) {
      const doc = await getFirestoreDoc(
        "catalogo_web",
        planId
      );

      if (doc?.fields) {
        const name = cleanText(
          field(
            doc.fields,
            "nombre",
            "Plan Diverty"
          )
        );

        const price = field(
          doc.fields,
          "precio",
          ""
        );

        title = `${name} | ${SITE_NAME}`;

        description = shortDescription(
          field(
            doc.fields,
            "descripcion",
            ""
          ),
          `${name}${
            price !== ""
              ? ` desde $${Number(price).toFixed(2)}`
              : ""
          }. Conoce todos los detalles con Diverty Panamá.`
        );

        image =
          field(
            doc.fields,
            "imagenTarjeta",
            ""
          ) ||
          field(
            doc.fields,
            "imagen",
            ""
          );
      }
    }

    if (!planId && categoryId) {
      const doc = await getFirestoreDoc(
        "categorias_web",
        categoryId
      );

      if (doc?.fields) {
        const name = cleanText(
          field(
            doc.fields,
            "nombre",
            "Catálogo Diverty"
          )
        );

        title = `${name} | ${SITE_NAME}`;

        description = shortDescription(
          field(
            doc.fields,
            "descripcion",
            ""
          ),
          `Explora ${name} y descubre las opciones disponibles con Diverty Panamá.`
        );

        image = field(
          doc.fields,
          "imagen",
          ""
        );
      }
    }

    const response = await context.next();

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return response;
    }

    const html = await response.text();

    const finalUrl =
      new URL(url.pathname, url.origin);

    if (planId) {
      finalUrl.searchParams.set(
        "plan",
        planId
      );
    }

    if (categoryId) {
      finalUrl.searchParams.set(
        "categoria",
        categoryId
      );
    }

    const transformed = injectMeta(
      html,
      {
        title,
        description,
        image,
        url: finalUrl.toString()
      }
    );

    const headers =
      new Headers(response.headers);

    headers.delete("content-length");

    headers.set(
      "content-type",
      "text/html; charset=utf-8"
    );

    headers.set(
      "x-diverty-social-preview",
      planId
        ? "plan-v2"
        : "categoria-v2"
    );

    return new Response(
      transformed,
      {
        status: response.status,
        statusText: response.statusText,
        headers
      }
    );
  } catch (error) {
    console.error(
      "[share-meta] Diverty social preview:",
      error
    );

    return;
  }
}

export const config = {
  path: "/",
  method: "GET",

  header: {
    "netlify-agent-category":
      "(page-preview|crawler;social)"
  },

  onError: "bypass"
};
