// Role-authorized legacy reads and append-only corrections. Source is never modified.
// Never forwards an Incargo bearer token to the legacy provider.
const MAX_BYTES = 3000000;
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
function createHandler({ fetchImpl = fetch, env = process.env } = {}) {
  return async function handler(request, response) {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Vary", "Authorization");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "POST"].includes(request.method)) {
      response.setHeader("Allow", "GET, POST");
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
    if (env.INCARGO_LEGACY_READ_ENABLED !== "true")
      return response.status(503).json({
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
      if (typeof user.id !== "string" || !user.id)
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
      async function rpc(name, body) {
        const result = await fetchImpl(origin + "/rest/v1/rpc/" + name, {
          ...options,
          method: "POST",
          headers: { ...options.headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!result.ok) {
          const detail = await result.json().catch(() => ({}));
          const error = Error(
            detail.code === "22001"
              ? "Las evidencias exceden el límite de consulta. Selecciona archivos más pequeños; no se ha guardado esta corrección."
              : detail.code === "40001"
                ? "Otro usuario guardó una versión nueva. Actualiza antes de corregir."
                : detail.code === "23505"
                  ? "Este intento ya tiene otros datos. Consulta el expediente."
                  : detail.code === "42501"
                    ? "Acceso operativo revocado."
                    : "No se pudo confirmar el guardado. Reintenta el mismo intento o consulta el historial.",
          );
          error.status =
            detail.code === "42501"
              ? 403
              : ["40001", "23505"].includes(detail.code)
                ? 409
                : 422;
          throw error;
        }
        return JSON.parse(await readBounded(result));
      }
      const hash = request.query?.hash;
      if (hash && !/^[a-f0-9]{64}$/.test(hash))
        return response.status(400).json({ error: "Expediente no válido." });
      if (
        hash &&
        request.method === "GET" &&
        request.query?.revision !== undefined
      ) {
        const revision = Number(request.query.revision);
        if (!Number.isInteger(revision) || revision < 0)
          return response.status(400).json({ error: "Versión no válida." });
        return response.status(200).json(
          await rpc("incargo_legacy_revision", {
            p_kind: kind,
            p_hash: hash,
            p_revision: revision,
          }),
        );
      }
      if (hash && request.method === "GET")
        return response
          .status(200)
          .json({
            versions: await rpc("incargo_legacy_versions", {
              p_kind: kind,
              p_hash: hash,
            }),
          });
      if (request.method === "GET") {
        const board = await rpc("incargo_legacy_board", { p_kind: kind });
        if (
          !board ||
          board.kind !== kind ||
          !Array.isArray(board.records) ||
          !board.sync
        )
          throw Error("shape");
        return response.status(200).json(board);
      }
      if (request.body?.action === "sync")
        return response
          .status(200)
          .json(await rpc("incargo_legacy_sync", { p_kind: kind }));
      const input = request.body;
      if (
        request.method === "POST" &&
        (!input ||
          typeof input !== "object" ||
          !/^[a-f0-9]{64}$/.test(input.hash || "") ||
          !Number.isInteger(input.expected) ||
          input.expected < 0 ||
          !/^[a-f0-9-]{36}$/i.test(input.request || "") ||
          !input.patch ||
          typeof input.patch !== "object" ||
          Array.isArray(input.patch) ||
          typeof input.reason !== "string" ||
          Buffer.byteLength(JSON.stringify(input)) > 3100000)
      )
        return response.status(400).json({ error: "Corrección no válida." });
      async function save(original, snapshot) {
        const receipt = await rpc("incargo_legacy_correct", {
          p_kind: kind,
          p_hash: input.hash,
          p_original: original,
          p_snapshot: snapshot,
          p_expected: input.expected,
          p_request: input.request,
          p_patch: input.patch,
          p_reason: input.reason,
        });
        return response.status(200).json(receipt);
      }
      return await save(null, null);
    } catch (error) {
      if (error.status)
        return response.status(error.status).json({ error: error.message });
      return response.status(502).json({
        error:
          "No se pudo confirmar la operación completa. Si estabas guardando, reintenta el mismo intento o consulta el historial; no asumas que falló el guardado.",
      });
    } finally {
      clearTimeout(timer);
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
