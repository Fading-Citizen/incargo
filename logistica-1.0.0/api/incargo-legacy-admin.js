// Read-only bridge. Deployment, audience and source binding require explicit approval.
// Never forwards an Incargo bearer token to the legacy provider.
const { createHash } = require("node:crypto");
const SOURCE =
  "https://script.google.com/macros/s/AKfycbwTBTO-wMKFs9ogYH3qELSk8rx14WnWWy6mM6qIKu_dr0wsgWq-heR_Q1V9LvCKKoNp/exec";
const MAX_BYTES = 3000000;
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
async function readBounded(response) {
  if (!response.ok) throw Error("upstream");
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Error("size");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
function createHandler({
  fetchImpl = fetch,
  env = process.env,
  now = () => new Date(),
} = {}) {
  return async function handler(request, response) {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Vary", "Authorization");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return response
        .status(405)
        .json({ error: "Este módulo no permite modificar la fuente." });
    }
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== "string" ||
      !/^Bearer [^\s]+$/.test(authorization)
    )
      return response.status(401).json({ error: "Sesión requerida." });
    // No default audience. Configuring these values is a separate access decision.
    const allowed = (env.INCARGO_LEGACY_ADMIN_USER_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (env.INCARGO_LEGACY_READ_ENABLED !== "true" || !allowed.length)
      return response
        .status(503)
        .json({
          error:
            "Inspecciones y vinculaciones pendientes de habilitación de acceso.",
        });
    const url = env.SUPABASE_URL;
    if (
      !url ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url) ||
      !env.SUPABASE_PUBLISHABLE_KEY
    )
      return response
        .status(503)
        .json({ error: "Configuración no disponible." });
    const kind = request.query?.kind;
    if (!["inspections", "affiliations"].includes(kind))
      return response.status(400).json({ error: "Consulta no válida." });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const options = {
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: authorization,
      },
      redirect: "error",
      signal: controller.signal,
      cache: "no-store",
    };
    try {
      const origin = url.replace(/\/$/, "");
      const auth = await fetchImpl(origin + "/auth/v1/user", options);
      if ([401, 403].includes(auth.status))
        return response.status(401).json({ error: "Sesión no válida." });
      const user = JSON.parse(await readBounded(auth));
      if (typeof user.id !== "string" || !allowed.includes(user.id))
        return response
          .status(403)
          .json({ error: "Tu cuenta no tiene acceso a estos expedientes." });
      const membership = await fetchImpl(
        origin +
          "/rest/v1/incargo_memberships?select=role&user_id=eq." +
          encodeURIComponent(user.id),
        options,
      );
      if ([401, 403].includes(membership.status))
        return response
          .status(403)
          .json({ error: "Acceso operativo no confirmado." });
      const roles = JSON.parse(await readBounded(membership));
      if (
        !Array.isArray(roles) ||
        roles.length !== 1 ||
        roles[0].role !== "operations"
      )
        return response
          .status(403)
          .json({ error: "Acceso operativo requerido." });
      let target =
        SOURCE +
        "?action=" +
        (kind === "inspections" ? "list" : "vinculaciones");
      let upstream;
      for (let redirects = 0; redirects < 4; redirects++) {
        const destination = new URL(target);
        if (
          destination.protocol !== "https:" ||
          !["script.google.com", "script.googleusercontent.com"].includes(
            destination.hostname,
          ) ||
          destination.username ||
          destination.password
        )
          throw Error("redirect");
        upstream = await fetchImpl(target, {
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: controller.signal,
          cache: "no-store",
        });
        if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
        const next = upstream.headers.get("location");
        await upstream.body?.cancel();
        if (!next) throw Error("redirect");
        target = new URL(next, target).href;
      }
      const raw = await readBounded(upstream);
      const rows = JSON.parse(raw);
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) => !row || typeof row !== "object" || Array.isArray(row),
        )
      )
        throw Error("shape");
      const snapshot = digest(raw);
      const result = {
        kind,
        capturedAt: now().toISOString(),
        snapshot,
        source: "legacy-apps-script",
        records: rows.map((data, index) => ({
          id: snapshot + ":" + index,
          hash: digest(JSON.stringify(data)),
          data,
        })),
        readOnly: true,
      };
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES)
        throw Error("size");
      return response.status(200).json(result);
    } catch {
      return response
        .status(502)
        .json({
          error:
            "No se pudo verificar la respuesta completa de la fuente. Reintenta; no se ha modificado ningún registro.",
        });
    } finally {
      clearTimeout(timer);
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
