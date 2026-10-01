const FIREBASE_API_KEY = "AIzaSyDxE2E1KMuZU523k8oWHabi1jDrFxPOD-0";
const FIREBASE_PROJECT_ID = "diverty-eventos";
const APP_ID = "diverty-oficial";
const SITE_NAME = "Diverty Panamá";
const GENERIC_TITLE = "Diverty Eventos | Planes de Fiestas en Panamá";
const GENERIC_DESCRIPTION = "¡Celebra con Diverty Eventos! Fiestas infantiles en Panamá. Payasitos, animadores, pintacaritas y shows de burbujas.";

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
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function shortDescription(value, fallback) {
  const text = cleanText(value || fallback);
  return text.length > 180 ? text.slice(0, 177).trimEnd() + "..." : text;
}

async function getAnonymousToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true })
    }
  );

  if (!res.ok) throw new Error(`Firebase Auth ${res.status}`);

  const data = await res.json();
  cachedToken = data.idToken;
  tokenExpiresAt = Date.now() + Number(data.expiresIn || 3600) * 1000;
  return cachedToken;
}

async function getFirestoreDoc(collectionName, id) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id || "")) return null;

  const token = await getAnonymousToken();
  const path = `artifacts/${APP_ID}/public/data/${collectionName}/${id}`;

  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/${path}`;

  const res = await fetch(endpoint, {
    headers: { authorization: `Bearer ${token}` }
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${res.status}`);

  return await res.json();
}

function removeExistingSocialMeta(html) {
  return html
    .replace(/<meta\s+property=["']og:[^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^>]*>\s*/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, "");
}

function injectMeta(html, meta) {
  html = removeExistingSocialMeta(html);

  const tags = `
    <!-- DIVERTY SOCIAL PREVIEW - NETLIFY EDGE -->
    <link rel="canonical" href="${esc(meta.url)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(SITE_NAME)}">
    <meta property="og:locale" content="es_PA">
    <meta property="og:title" content="${esc(meta.title)}">
    <meta property="og:description" content="${esc(meta.description)}">
    <meta property="og:url" content="${esc(meta.url)}">
    ${meta.image ? `<meta property="og:image" content="${esc(meta.image)}">
    <meta property="og:image:alt" content="${esc(meta.title)}">` : ""}
    <meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}">
    <meta name="twitter:title" content="${esc(meta.title)}">
    <meta name="twitter:description" content="${esc(meta.description)}">
    ${meta.image ? `<meta name="twitter:image" content="${esc(meta.image)}">` : ""}
  `;

  return html.replace(/<\/head>/i, `${tags}\n</head>`);
}

export default async function handler(request, context) {
  const url = new URL(request.url);
  const planId = (url.searchParams.get("plan") || "").trim();
  const categoryId = (url.searchParams.get("categoria") || "").trim();

  if (!planId && !categoryId) return;

  try {
    let title = GENERIC_TITLE;
    let description = GENERIC_DESCRIPTION;
    let image = "";

    if (planId) {
      const doc = await getFirestoreDoc("catalogo_web", planId);

      if (doc?.fields) {
        const name = cleanText(field(doc.fields, "nombre", "Plan Diverty"));
        const price = field(doc.fields, "precio", "");

        title = `${name} | ${SITE_NAME}`;

        description = shortDescription(
          field(doc.fields, "descripcion", ""),
          `${name}${price !== "" ? ` desde $${Number(price).toFixed(2)}` : ""}. Conoce todos los detalles y reserva con Diverty Panamá.`
        );

        image =
          field(doc.fields, "imagenTarjeta", "") ||
          field(doc.fields, "imagen", "");
      }
    } else if (categoryId) {
      const doc = await getFirestoreDoc("categorias_web", categoryId);

      if (doc?.fields) {
        const name = cleanText(
          field(doc.fields, "nombre", "Catálogo Diverty")
        );

        title = `${name} | ${SITE_NAME}`;

        description = shortDescription(
          field(doc.fields, "descripcion", ""),
          `Explora ${name} y descubre las opciones disponibles para tu evento con Diverty Panamá.`
        );

        image = field(doc.fields, "imagen", "");
      }
    }

    const response = await context.next();
    const type = response.headers.get("content-type") || "";

    if (!type.includes("text/html")) return response;

    const html = await response.text();
    const finalUrl = new URL(url.pathname, url.origin);

    if (planId) finalUrl.searchParams.set("plan", planId);
    if (categoryId) finalUrl.searchParams.set("categoria", categoryId);

    const transformed = injectMeta(html, {
      title,
      description,
      image,
      url: finalUrl.toString()
    });

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "text/html; charset=utf-8");
    headers.set(
      "x-diverty-social-preview",
      planId ? "plan" : "categoria"
    );
    headers.set(
      "cache-control",
      "public, max-age=0, must-revalidate"
    );

    return new Response(transformed, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  } catch (error) {
    console.error("Diverty social preview:", error);
    return;
  }
}

export const config = {
  path: "/",
  method: "GET",
  onError: "bypass"
};
