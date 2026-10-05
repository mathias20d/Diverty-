const FIREBASE_API_KEY = "AIzaSyDxE2E1KMuZU523k8oWHabi1jDrFxPOD-0";
const FIREBASE_PROJECT_ID = "diverty-eventos";
const APP_ID = "diverty-oficial";

const SITE_NAME = "Diverty Panamá";
const GENERIC_TITLE = "Diverty Eventos | Planes de Fiestas en Panamá";
const GENERIC_DESCRIPTION =
  "¡Celebra con Diverty Eventos! Fiestas infantiles en Panamá. Payasitos, animadores, pintacaritas y shows para tus eventos.";

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
  return text.length > 190 ? text.slice(0, 187).trimEnd() + "..." : text;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

function normalizeImage(value = "", origin = "") {
  let image = String(value || "").trim();
  if (!image) return "";
  if (image.startsWith("//")) image = `https:${image}`;
  if (image.startsWith("http://")) image = `https://${image.slice(7)}`;
  if (image.startsWith("/")) image = `${origin}${image}`;

  // Para Cloudinary generamos una portada social 1200x630. Esto evita que
  // WhatsApp descarte imágenes demasiado pequeñas o con proporción extraña.
  if (image.includes("res.cloudinary.com/") && image.includes("/image/upload/")) {
    image = image.replace(
      "/image/upload/",
      "/image/upload/f_auto,q_auto:good,c_fill,g_auto,w_1200,h_630/"
    );
  }
  return image;
}

async function getAnonymousToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    }
  );

  if (!response.ok) throw new Error(`Firebase Auth ${response.status}`);

  const data = await response.json();
  cachedToken = data.idToken;
  tokenExpiresAt = Date.now() + Number(data.expiresIn || 3600) * 1000;
  return cachedToken;
}

async function fetchFirestoreDoc(collectionName, id) {
  const token = await getAnonymousToken();
  const path = `artifacts/${APP_ID}/public/data/${collectionName}/${id}`;
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/${path}`;

  const response = await fetch(endpoint, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (response.status === 404) return null;
  if (response.status === 429) throw new Error("Firestore temporalmente limitado (429)");
  if (!response.ok) throw new Error(`Firestore ${response.status}`);
  return await response.json();
}

async function getFirestoreDoc(collectionName, id, forceFresh = false) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id || "")) return null;

  // Los enlaces copiados desde WebAdmin llevan ?pv=... para pedir una vista
  // previa nueva. En ese caso no usamos la copia anterior de Edge Cache.
  if (forceFresh) return await fetchFirestoreDoc(collectionName, id);

  const cache = await caches.open("diverty-social-preview-v3");
  const cacheKey = `https://diverty-cache.local/${collectionName}/${id}`;
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) return await cachedResponse.json();

  const data = await fetchFirestoreDoc(collectionName, id);
  if (data) {
    const responseToCache = new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=900, s-maxage=900"
      }
    });
    try { await cache.put(cacheKey, responseToCache); } catch (_) {}
  }
  return data;
}

function removeExistingSocialMeta(html) {
  return html
    .replace(/<meta\s+property=["']og:[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "");
}

function injectMeta(html, meta) {
  html = removeExistingSocialMeta(html);

  const imageTags = meta.image ? `
    <meta property="og:image" content="${esc(meta.image)}">
    <meta property="og:image:secure_url" content="${esc(meta.image)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="${esc(meta.title)}">
    <meta name="twitter:image" content="${esc(meta.image)}">` : "";

  const tags = `
    <!-- DIVERTY SOCIAL PREVIEW V3 -->
    <link rel="canonical" href="${esc(meta.url)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(SITE_NAME)}">
    <meta property="og:locale" content="es_PA">
    <meta property="og:title" content="${esc(meta.title)}">
    <meta property="og:description" content="${esc(meta.description)}">
    <meta property="og:url" content="${esc(meta.url)}">${imageTags}
    <meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">
    <meta name="twitter:title" content="${esc(meta.title)}">
    <meta name="twitter:description" content="${esc(meta.description)}">
  `;

  return html.replace(/<\/head>/i, `${tags}\n</head>`);
}

export default async function handler(request, context) {
  const url = new URL(request.url);
  const planId = (url.searchParams.get("plan") || "").trim();
  const categoryId = (url.searchParams.get("categoria") || "").trim();
  const previewVersion = (url.searchParams.get("pv") || "").trim();
  const forceFresh = /^[A-Za-z0-9_-]{1,40}$/.test(previewVersion);

  if (!planId && !categoryId) return;

  try {
    let title = GENERIC_TITLE;
    let description = GENERIC_DESCRIPTION;
    let image = "";

    if (planId) {
      const doc = await getFirestoreDoc("catalogo_web", planId, forceFresh);

      if (doc?.fields) {
        const name = cleanText(field(doc.fields, "nombre", "Plan Diverty"));
        const rawPrice = field(doc.fields, "precio", "");
        const formattedPrice = money(rawPrice);
        const type = String(field(doc.fields, "tipoCobro", "paquete") || "paquete");
        const priceSuffix = type === "hora" ? " por hora" : type === "nino" ? " por niño" : "";
        const priceText = formattedPrice ? `$${formattedPrice}${priceSuffix}` : "";
        const detail = cleanText(field(doc.fields, "descripcion", ""));

        // El precio va también en el título y siempre al principio de la
        // descripción para que WhatsApp lo muestre aunque el paquete tenga
        // una descripción propia.
        title = `${name}${priceText ? ` · ${priceText}` : ""} | ${SITE_NAME}`;
        description = shortDescription(
          `${priceText ? `${priceText}. ` : ""}${detail || `Conoce todos los detalles de ${name} con Diverty Panamá.`}`,
          GENERIC_DESCRIPTION
        );

        image =
          field(doc.fields, "imagenTarjeta", "") ||
          field(doc.fields, "imagen", "") ||
          field(doc.fields, "imagenUrl", "") ||
          field(doc.fields, "imageUrl", "") ||
          field(doc.fields, "foto", "");

        // Si un paquete antiguo no tiene imagen propia, usamos la portada
        // de su categoría antes de caer al logo general de Diverty.
        if (!image) {
          const catId = String(field(doc.fields, "categoria", "") || "").trim();
          if (catId) {
            const cat = await getFirestoreDoc("categorias_web", catId, forceFresh);
            if (cat?.fields) {
              image =
                field(cat.fields, "imagen", "") ||
                field(cat.fields, "imagenTarjeta", "") ||
                field(cat.fields, "imageUrl", "");
            }
          }
        }
      }
    }

    if (!planId && categoryId) {
      const doc = await getFirestoreDoc("categorias_web", categoryId, forceFresh);
      if (doc?.fields) {
        const name = cleanText(field(doc.fields, "nombre", "Catálogo Diverty"));
        title = `${name} | ${SITE_NAME}`;
        description = shortDescription(
          field(doc.fields, "descripcion", ""),
          `Explora ${name} y descubre las opciones disponibles con Diverty Panamá.`
        );
        image =
          field(doc.fields, "imagen", "") ||
          field(doc.fields, "imagenTarjeta", "") ||
          field(doc.fields, "imageUrl", "");
      }
    }

    const response = await context.next();
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const html = await response.text();

    // Siempre dejamos alguna imagen de vista previa. Si el plan no tiene una
    // foto guardada, se usa el icono de Diverty como respaldo.
    image = normalizeImage(image, url.origin) || `${url.origin}/android-chrome-512x512.png`;

    const finalUrl = new URL(url.pathname, url.origin);
    if (planId) finalUrl.searchParams.set("plan", planId);
    if (categoryId) finalUrl.searchParams.set("categoria", categoryId);
    if (forceFresh) finalUrl.searchParams.set("pv", previewVersion);

    const transformed = injectMeta(html, {
      title,
      description,
      image,
      url: finalUrl.toString()
    });

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set("x-diverty-social-preview", planId ? "plan-v3" : "categoria-v3");
    headers.set("cache-control", "public, max-age=0, must-revalidate");

    return new Response(transformed, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    console.error("[share-meta] Diverty social preview:", error);
    return;
  }
}

export const config = {
  path: "/",
  method: "GET",
  header: {
    "netlify-agent-category": "(page-preview|crawler;social)"
  },
  onError: "bypass"
};
