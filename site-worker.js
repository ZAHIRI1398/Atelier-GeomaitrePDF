/* ============================================================
   Worker du site ateliergeomaitrepdf.org (GéomaitrePDF Atelier)
   Sert les fichiers statiques (env.ASSETS) uniquement aux
   utilisateurs connectés de classesnumeriques.app
   (enseignants ET élèves).

   Entrée : URL signée par le serveur Flask
       https://ateliergeomaitrepdf.org/?exp=<ts>&sig=<hmac>
   avec sig = HMAC-SHA256(ATELIER_SECRET, "ag" + exp).

   Après vérification, un cookie HttpOnly est posé pour la session.
   Les sous-ressources (css, js, images…) chargées par la page sont
   aussi admises via l'en-tête Referer du même site — utile dans les
   navigateurs qui bloquent les cookies tiers en iframe (Safari).
   L'app étant une SPA React (react-router), les chemins internes
   retombent sur index.html via not_found_handling dans wrangler.toml.

   ⚙️  ATELIER_SECRET se règle dans Cloudflare > Workers >
       atelier-pdf-geomaitre > Settings > Variables and Secrets
       (la même valeur que ATELIER_GEOMAITRE_SECRET côté Flask).
   ============================================================ */

const COOKIE = "atelier_auth";
const ASSET = /\.(css|js|mjs|map|json|txt|png|jpe?g|gif|svg|webp|ico|woff2?|webmanifest|mp3|wav|pdf)$/i;

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* vérifie exp (timestamp unix futur) + sig (comparaison en temps constant) */
async function validAuth(secret, exp, sig) {
  if (!/^\d{9,13}$/.test(exp || "") || !/^[0-9a-f]{64}$/.test(sig || "")) return false;
  if (Number(exp) <= Math.floor(Date.now() / 1000)) return false;
  const want = await hmacHex(secret, "ag" + exp);
  let d = 0;
  for (let i = 0; i < 64; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

function denied() {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accès réservé — GéomaitrePDF Atelier</title>
<style>
body{font-family:"Segoe UI",Arial,sans-serif;background:#2f3b4c;color:#e8edf2;
margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#3c4b60;border-radius:14px;padding:36px 44px;max-width:520px;
text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.4)}
h1{font-size:22px;margin:0 0 14px}
p{line-height:1.55;color:#c7d2de;margin:0}
a{color:#ffd76a}
</style></head><body><div class="card">
<h1>🔒 GéomaitrePDF Atelier</h1>
<p>Cet outil s'ouvre depuis votre compte sur
<b>classesnumeriques.app</b> (menu « Outils »).</p>
</div></body></html>`;
  return new Response(html, {
    status: 403,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = env.ATELIER_SECRET;

    // Secret non configuré : on refuse tout (message explicite pour l'admin)
    if (!secret) {
      return new Response(
        "GéomaitrePDF Atelier : ATELIER_SECRET n'est pas configuré " +
        "(Worker atelier-pdf-geomaitre > Settings > Variables and Secrets).",
        { status: 503 });
    }

    // 1) Porte d'entrée : URL signée ?exp=…&sig=…
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (exp || sig) {
      if (!(await validAuth(secret, exp, sig))) return denied();
      const resp = await env.ASSETS.fetch(request);
      const res = new Response(resp.body, resp);
      const maxAge = Math.max(60, Number(exp) - Math.floor(Date.now() / 1000));
      // SameSite=None + Secure : cookie utilisable dans l'iframe cross-site
      res.headers.append("Set-Cookie",
        `${COOKIE}=${exp}.${sig}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    // 2) Session déjà authentifiée par cookie
    const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)atelier_auth=([^;]+)/);
    if (m) {
      const [e, s] = m[1].split(".");
      if (await validAuth(secret, e, s)) return env.ASSETS.fetch(request);
    }

    // 3) Sous-ressources appelées par la page autorisée (Referer même site).
    //    Jamais pour les documents HTML : il faut l'URL signée ou le cookie.
    const ref = request.headers.get("Referer") || "";
    if (ASSET.test(url.pathname) && ref.startsWith(url.origin + "/"))
      return env.ASSETS.fetch(request);

    // 4) Sinon : refusé
    return denied();
  },
};
