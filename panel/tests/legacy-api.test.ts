import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createHandler } = createRequire(import.meta.url)(
  "../../logistica-1.0.0/api/incargo-legacy-admin.js",
);
const env = {
  INCARGO_LEGACY_READ_ENABLED: "true",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "synthetic",
};
async function call({
  method = "GET",
  token = "Bearer synthetic",
  kind = "inspections",
  role = "operations",
  user = "future-operator",
  authStatus = 200,
  rpcCode = "",
  input = undefined,
  settings = env,
  board = undefined,
  fail = false,
}: any = {}) {
  const calls: any[] = [];
  let code = 0,
    body: any;
  const headers: any = {};
  const fetchImpl = async (url: string, options: any) => {
    calls.push({ url, options });
    if (fail) throw Error("network");
    if (url.endsWith("/auth/v1/user"))
      return new Response(JSON.stringify({ id: user }), { status: authStatus });
    if (url.includes("/rpc/")) {
      if (rpcCode)
        return new Response(JSON.stringify({ code: rpcCode }), { status: 400 });
      const p = JSON.parse(options.body);
      if (url.endsWith("incargo_legacy_board"))
        return new Response(
          JSON.stringify(
            board ?? {
              kind,
              capturedAt: "2026-11-04T12:00:00Z",
              snapshot: "a".repeat(64),
              source: "supabase-verified-legacy",
              readOnly: false,
              records: [
                {
                  id: "a".repeat(64),
                  hash: "a".repeat(64),
                  revision: 0,
                  data: { ciudad: "Original", firma: "[TRUNC]" },
                },
              ],
              sync: {
                lastSuccess: "2026-11-04T11:00:00Z",
                error: "SOURCE_TIMEOUT",
                stale: true,
              },
            },
          ),
        );
      if (url.endsWith("incargo_legacy_sync"))
        return new Response(
          JSON.stringify({ ok: false, error: "SOURCE_TIMEOUT", added: 0 }),
        );
      return new Response(
        JSON.stringify({ hash: p.p_hash, revision: 1, request: p.p_request }),
      );
    }
    return new Response(JSON.stringify([{ role }]));
  };
  const res = {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(n: number) {
      code = n;
      return this;
    },
    json(v: any) {
      body = v;
      return this;
    },
  };
  await createHandler({ fetchImpl, env: settings })(
    { method, headers: { authorization: token }, query: { kind }, body: input },
    res,
  );
  return { code, body, calls, headers };
}
test("no session/disabled module fails closed before data access", async () => {
  for (const options of [
    { token: "" },
    { settings: { ...env, INCARGO_LEGACY_READ_ENABLED: "false" } },
  ]) {
    const r = await call(options);
    assert([401, 503].includes(r.code));
    assert.equal(r.calls.length, 0);
  }
});
test("operations membership is live and future users need no UUID allowlist", async () => {
  assert.equal((await call({ user: "new-operator" })).code, 200);
  for (const role of ["driver", "client", ""]) {
    const r = await call({ role });
    assert.equal(r.code, 403);
    assert(!r.calls.some((c) => c.url.includes("/rpc/")));
  }
  assert.equal((await call({ authStatus: 401 })).code, 401);
});
test("source timeout still returns archived records with honest freshness metadata", async () => {
  const r = await call();
  assert.equal(r.code, 200);
  assert.equal(r.body.records.length, 1);
  assert.equal(r.body.records[0].data.firma, "[TRUNC]");
  assert.equal(r.body.sync.error, "SOURCE_TIMEOUT");
  assert.equal(r.body.sync.stale, true);
  assert(r.calls.every((c) => c.url.startsWith(env.SUPABASE_URL)));
  assert(r.calls.some((c) => c.url.endsWith("incargo_legacy_board")));
  assert.equal(r.headers["Cache-Control"], "private, no-store");
  assert.equal(r.headers.Vary, "Authorization");
});
test("database failure and invalid board never become a fake empty list", async () => {
  assert.equal((await call({ fail: true })).code, 502);
  assert.equal(
    (await call({ board: { kind: "inspections", records: null } })).code,
    502,
  );
});
test("sync is authenticated, fixed-kind and returns failure without inventing a successful receipt", async () => {
  const r = await call({
    method: "POST",
    input: { action: "sync", url: "https://attacker.test" },
  });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
  const rpc = r.calls.find((c) => c.url.endsWith("incargo_legacy_sync"));
  assert.deepEqual(JSON.parse(rpc.options.body), { p_kind: "inspections" });
  assert(!r.calls.some((c) => c.url.includes("attacker")));
  assert.equal(
    (await call({ method: "POST", input: { action: "sync" }, role: "driver" }))
      .code,
    403,
  );
});
test("correction uses immutable archived original and forwards only the expected correction contract", async () => {
  const input = {
    hash: "a".repeat(64),
    expected: 0,
    request: "20000000-0000-4000-8000-000000000001",
    patch: { ciudad: "Corrected" },
    reason: "Typo",
    original: "forged",
  };
  const r = await call({ method: "POST", input });
  assert.equal(r.code, 200);
  const p = JSON.parse(
    r.calls.find((c) => c.url.endsWith("incargo_legacy_correct")).options.body,
  );
  assert.equal(p.p_original, null);
  assert.equal(p.p_snapshot, null);
  assert.equal(p.p_request, input.request);
});
test("revocation and revision conflict remain errors, with no records disclosed", async () => {
  for (const [rpcCode, status] of [
    ["42501", 403],
    ["40001", 409],
    ["23505", 409],
  ]) {
    const r = await call({ rpcCode });
    assert.equal(r.code, status);
    assert.equal(r.body.records, undefined);
  }
});
test("unapproved methods, kinds and credential destinations are rejected", async () => {
  for (const method of ["DELETE", "PATCH", "PUT"])
    assert.equal((await call({ method })).code, 405);
  assert.equal((await call({ kind: "users" })).code, 400);
  const r = await call({
    settings: { ...env, SUPABASE_URL: "https://attacker.test" },
  });
  assert.equal(r.code, 503);
  assert.equal(r.calls.length, 0);
});
