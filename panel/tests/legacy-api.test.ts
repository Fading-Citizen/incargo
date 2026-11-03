import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  createHandler,
} = require("../../logistica-1.0.0/api/incargo-legacy-admin.js");
const env = {
  INCARGO_LEGACY_READ_ENABLED: "true",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "synthetic-key",
};
async function call({
  method = "GET",
  token = "Bearer synthetic-token",
  kind = "inspections",
  settings = env,
  user = "operator-1",
  role = "operations",
  source = "[]",
  sourceStatus = 200,
  authStatus = 200,
  redirect = "",
  fail = false,
  input = undefined,
  versions = [],
  rpcCode = "",
}: {
  method?: string;
  token?: string;
  kind?: string;
  settings?: typeof env;
  user?: string;
  role?: string;
  source?: string;
  sourceStatus?: number;
  authStatus?: number;
  redirect?: string;
  fail?: boolean;
  input?: any;
  versions?: any[];
  rpcCode?: string;
} = {}) {
  const calls: { url: string; options: RequestInit }[] = [];
  let code = 0,
    body: any;
  const headers: Record<string, string> = {};
  const fetchImpl = async (url: string, options: RequestInit) => {
    calls.push({ url, options });
    if (fail) throw Error("network");
    if (url.endsWith("/auth/v1/user"))
      return new Response(JSON.stringify({ id: user }), { status: authStatus });
    if (url.includes("/rest/v1/rpc/")) {
      if (rpcCode)
        return new Response(JSON.stringify({ code: rpcCode }), { status: 400 });
      if (url.endsWith("incargo_legacy_versions"))
        return new Response(JSON.stringify(versions));
      const value = JSON.parse(String(options.body));
      return new Response(
        JSON.stringify({
          hash: value.p_hash,
          revision: 1,
          request: value.p_request,
          replayed: !!versions.length,
        }),
      );
    }
    if (url.includes("/rest/v1/"))
      return new Response(JSON.stringify([{ role }]));
    return redirect
      ? new Response(null, { status: 302, headers: { location: redirect } })
      : new Response(source, { status: sourceStatus });
  };
  const res = {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(value: number) {
      code = value;
      return this;
    },
    json(value: any) {
      body = value;
      return this;
    },
  };
  await createHandler({
    env: settings,
    fetchImpl,
    now: () => new Date("2026-11-03T12:00:00Z"),
  })(
    { method, headers: { authorization: token }, query: { kind }, body: input },
    res,
  );
  return { code, body, calls, headers };
}
test("default closed and no credential means no source reads", async () => {
  for (const options of [
    { token: "" },
    { settings: { ...env, INCARGO_LEGACY_READ_ENABLED: "false" } },
  ]) {
    const result = await call(options);
    assert([401, 503].includes(result.code));
    assert.equal(result.calls.length, 0);
  }
});
test("write methods and unknown kinds never reach the provider", async () => {
  for (const method of ["PATCH", "PUT", "DELETE"]) {
    const r = await call({ method });
    assert.equal(r.code, 405);
    assert.equal(r.calls.length, 0);
  }
  const r = await call({ kind: "users" });
  assert.equal(r.code, 400);
  assert.equal(r.calls.length, 0);
});
test("identity and current role are checked every time and isolate clients and drivers", async () => {
  for (const options of [
    { authStatus: 401 },
    { role: "driver" },
    { role: "client" },
    { role: "" },
  ]) {
    const r = await call(options);
    assert([401, 403].includes(r.code));
    assert(!r.calls.some((c) => c.url.includes("google")));
  }
});
test("reads preserve original rows, emit snapshot hashes and do not forward credentials to Google", async () => {
  const source = JSON.stringify([
    { _rowNumber: 1, licencia: "0012", firma: "[TRUNC]", items: "bad" },
  ]);
  const a = await call({ source }),
    b = await call({ source });
  assert.equal(a.code, 200);
  assert.equal(a.body.readOnly, false);
  assert.equal(a.body.records[0].data.licencia, "0012");
  assert.equal(a.body.records[0].data.firma, "[TRUNC]");
  assert.equal(a.body.snapshot, b.body.snapshot);
  assert.equal(a.body.records[0].hash, b.body.records[0].hash);
  assert.equal(a.calls.length, 5);
  assert.equal(b.calls.length, 5);
  const google = a.calls.find((c) => c.url.includes("script.google.com"))!;
  assert.deepEqual(google.options.headers, { Accept: "application/json" });
  assert.equal(google.options.redirect, "manual");
  assert.equal(a.headers["Cache-Control"], "private, no-store");
  assert.equal(a.headers.Vary, "Authorization");
});
test("affiliations use their own endpoint and no record data is cached across requests", async () => {
  const a = await call({ source: '[{"placa":"TEST"}]' }),
    b = await call({ kind: "affiliations", source: "[]" });
  assert.equal(a.body.records.length, 1);
  assert.deepEqual(b.body.records, []);
  assert(b.calls[3].url.endsWith("action=vinculaciones"));
});
test("source failure, unexpected response, oversize and redirects fail closed without partial results", async () => {
  for (const options of [
    { sourceStatus: 500 },
    { source: "not json" },
    { source: '{"error":"upstream"}' },
    { source: "[null]" },
    { source: "x".repeat(3000001) },
    { redirect: "https://attacker.test/" },
    { fail: true },
  ]) {
    const r = await call(options);
    assert.equal(r.code, 502);
    assert.equal(r.body.records, undefined);
    assert(!r.calls.some((c) => c.url.includes("attacker")));
  }
});
test("configuration cannot send bearer credentials to an arbitrary host", async () => {
  const r = await call({
    settings: { ...env, SUPABASE_URL: "https://attacker.test" },
  });
  assert.equal(r.code, 503);
  assert.equal(r.calls.length, 0);
});

test("future operations members are authorized without UUID allowlists", async () => {
  const result = await call({ user: "future-operator" });
  assert.equal(result.code, 200);
});

test("only archived originals can be edited; browser cannot invent source provenance", async () => {
  const input = {
    hash: "a".repeat(64),
    expected: 0,
    request: "20000000-0000-4000-8000-000000000001",
    patch: { ciudad: "Corrected" },
    reason: "Typo",
    original: "forged",
  };
  const absent = await call({ method: "POST", input });
  assert.equal(absent.code, 409);
  assert(!absent.calls.some((c) => c.url.endsWith("incargo_legacy_correct")));
  const retry = await call({
    method: "POST",
    input,
    versions: [{ hash: input.hash, revision: 1 }],
    sourceStatus: 500,
  });
  assert.equal(retry.code, 200);
  assert(!retry.calls.some((c) => c.url.includes("google")));
  const rpc = retry.calls.find((c) =>
    c.url.endsWith("incargo_legacy_correct"),
  )!;
  const payload = JSON.parse(String(rpc.options.body));
  assert.equal(payload.p_original, null);
  assert.equal(payload.p_snapshot, null);
  assert.equal(payload.p_request, input.request);
});
test("versions overlay matching hashes; changed source keeps historical originals separately", async () => {
  const source = '[{"ciudad":"Original"}]';
  const read = await call({ source });
  const hash = read.body.records[0].hash;
  const versions = [{ hash, revision: 2, data: { ciudad: "Corrected" } }];
  const merged = await call({ source, versions });
  assert.equal(merged.body.records[0].data.ciudad, "Corrected");
  assert.equal(merged.body.records[0].revision, 2);
  const drift = await call({
    source: '[{"ciudad":"Changed source"}]',
    versions,
  });
  assert.equal(drift.body.records.length, 2);
  assert.equal(drift.body.records[1].archived, true);
});
test("RPC revocation/conflict errors do not disclose records or claim success", async () => {
  for (const [rpcCode, status] of [
    ["42501", 403],
    ["40001", 409],
    ["23505", 409],
  ] as const) {
    const r = await call({ rpcCode });
    assert.equal(r.code, status);
    assert.equal(r.body.records, undefined);
  }
});
