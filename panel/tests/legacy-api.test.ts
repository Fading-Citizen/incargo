import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const {
  createHandler,
} = require("../../logistica-1.0.0/api/incargo-legacy-admin.js");
const env = {
  INCARGO_LEGACY_READ_ENABLED: "true",
  INCARGO_LEGACY_ADMIN_USER_IDS: "operator-1",
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
  })({ method, headers: { authorization: token }, query: { kind } }, res);
  return { code, body, calls, headers };
}
test("default closed and no credential means no source reads", async () => {
  for (const options of [
    { token: "" },
    { settings: { ...env, INCARGO_LEGACY_READ_ENABLED: "false" } },
    { settings: { ...env, INCARGO_LEGACY_ADMIN_USER_IDS: "" } },
  ]) {
    const result = await call(options);
    assert([401, 503].includes(result.code));
    assert.equal(result.calls.length, 0);
  }
});
test("write methods and unknown kinds never reach the provider", async () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const r = await call({ method });
    assert.equal(r.code, 405);
    assert.equal(r.calls.length, 0);
  }
  const r = await call({ kind: "users" });
  assert.equal(r.code, 400);
  assert.equal(r.calls.length, 0);
});
test("identity and current role are checked every time and isolate unapproved operators, clients and drivers", async () => {
  for (const options of [
    { authStatus: 401 },
    { user: "other-operator" },
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
  assert.equal(a.body.readOnly, true);
  assert.equal(a.body.records[0].data.licencia, "0012");
  assert.equal(a.body.records[0].data.firma, "[TRUNC]");
  assert.equal(a.body.snapshot, b.body.snapshot);
  assert.equal(a.body.records[0].hash, b.body.records[0].hash);
  assert.equal(a.calls.length, 3);
  assert.equal(b.calls.length, 3);
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
  assert(b.calls[2].url.endsWith("action=vinculaciones"));
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
