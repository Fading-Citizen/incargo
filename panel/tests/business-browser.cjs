/* Real disposable PostgreSQL + browser. Never contacts production or writes business fixtures remotely. */
const { chromium } = require("playwright");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const actor = "11111111-1111-4111-8111-111111111111";
function sql(query, params = {}) {
  const args = [
    "--host=unix:///var/run/docker.sock",
    "exec",
    "-i",
    "incargo-enterprise-test",
    "psql",
    "-XqAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
  ];
  for (const [key, value] of Object.entries(params))
    args.push("-v", key + "=" + String(value));
  const p = spawnSync("docker", args, {
    input: `begin;set local role authenticated;set local "request.jwt.claim.sub"='${actor}';${query};commit;`,
    encoding: "utf8",
  });
  if (p.status) throw Error(p.stderr);
  return p.stdout.trim() ? JSON.parse(p.stdout.trim()) : null;
}
const signatures = {
  incargo_business_capabilities: [],
  incargo_revise_quote: [
    ["p_request", "uuid"],
    ["p_quote", "uuid"],
    ["p_reason", "text"],
    ["p_data", "jsonb"],
  ],
  incargo_cancel_unassigned_order: [
    ["p_request", "uuid"],
    ["p_order", "uuid"],
    ["p_reason", "text"],
  ],
  incargo_administrative_notes: [
    ["p_type", "text"],
    ["p_id", "uuid"],
  ],
  incargo_add_administrative_note: [
    ["p_request", "uuid"],
    ["p_type", "text"],
    ["p_id", "uuid"],
    ["p_body", "text"],
    ["p_source", "text"],
  ],
  incargo_quote_board: [],
  incargo_order_board: [],
  incargo_finance_board: [],
  incargo_receipt_board: [],
  incargo_invoice_detail: [["p_id", "uuid"]],
  incargo_create_quote: [
    ["p_request", "uuid"],
    ["p_data", "jsonb"],
  ],
  incargo_accept_quote: [
    ["p_request", "uuid"],
    ["p_quote", "uuid"],
    ["p_reference", "text"],
  ],
  incargo_link_order_delivery: [
    ["p_request", "uuid"],
    ["p_order", "uuid"],
    ["p_delivery", "uuid"],
  ],
  incargo_register_admin_invoice: [
    ["p_request", "uuid"],
    ["p_data", "jsonb"],
  ],
  incargo_record_receipt: [
    ["p_request", "uuid"],
    ["p_data", "jsonb"],
  ],
  incargo_apply_receipt: [
    ["p_request", "uuid"],
    ["p_receipt", "uuid"],
    ["p_invoice", "uuid"],
    ["p_amount", "numeric"],
  ],
  incargo_reverse_allocation: [
    ["p_request", "uuid"],
    ["p_allocation", "uuid"],
    ["p_reason", "text"],
  ],
};
(async () => {
  const root = path.resolve(__dirname, "../../logistica-1.0.0");
  const server = http.createServer((req, res) => {
    if (req.url === "/api/incargo-config") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          url: "https://local-db.invalid",
          publishableKey: "local-test-only",
        }),
      );
      return;
    }
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (
      !file.startsWith(root + "/") ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".png")
            ? "image/png"
            : "text/html",
    );
    if (file === path.join(root, "incargo-app.js")) {
      const source = fs.readFileSync(file, "utf8");
      assert(source.includes("const FINANCE_RELEASE_ENABLED = false;"));
      // Test-only HTTP adapter, bound to loopback; never alters the release asset.
      res.end(
        source.replace(
          "const FINANCE_RELEASE_ENABLED = false;",
          "const FINANCE_RELEASE_ENABLED = true;",
        ),
      );
      return;
    }
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      if (url.hostname !== "local-db.invalid")
        throw Error("Unexpected external host");
      let result = [];
      try {
        if (url.pathname === "/auth/v1/token")
          result = {
            access_token: "local-fixture",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: actor, email: "local@example.invalid" },
          };
        else if (url.pathname === "/auth/v1/user")
          result = { id: actor, email: "local@example.invalid" };
        else if (url.pathname.endsWith("/incargo_memberships"))
          result = url.searchParams.has("user_id")
            ? [{ role: "operations" }]
            : [];
        else if (
          url.pathname.endsWith("/incargo_trips") ||
          url.pathname.endsWith("/incargo_deliveries")
        )
          result = [];
        else if (url.pathname.endsWith("/incargo_client_admin_accounts"))
          result = sql(
            "select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.incargo_client_admin_accounts() r",
          );
        else if (
          url.pathname.endsWith("/incargo_pending_client_access_requests")
        )
          result = [];
        else {
          const fn = url.pathname.split("/").pop();
          if (!Object.hasOwn(signatures, fn))
            throw Error("Unsupported local RPC " + fn);
          const body = route.request().postDataJSON(),
            params = {};
          for (const [key] of signatures[fn])
            params[key] =
              typeof body[key] === "object"
                ? JSON.stringify(body[key])
                : body[key];
          result = sql(
            `select to_jsonb(public.${fn}(${signatures[fn].map(([key, type]) => `:'${key}'::${type}`).join(",")}))`,
            params,
          );
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(result),
        });
      } catch (error) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: error.message }),
        });
      }
    });
    const base = "http://127.0.0.1:" + server.address().port,
      tag = "QA-" + Date.now();
    await page.goto(base + "/operaciones.html");
    await page
      .locator("#login-form [name=email]")
      .fill("local@example.invalid");
    await page.locator("#login-form [name=password]").fill("fixture");
    await page.locator("#login-form button").click();
    await page
      .getByRole("button", { name: "Pedidos y cotizaciones", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cotizaciones", exact: true })
      .click();
    const quote = page
      .getByRole("region")
      .filter({ has: page.getByRole("heading", { name: "Crear cotización" }) });
    const quoteForm = page.locator(".enterprise-form").last();
    await quoteForm
      .locator("[name=account]")
      .selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await quoteForm.locator("[name=currency]").fill("COP");
    await quoteForm.locator("[name=origin]").fill("Origen local");
    await quoteForm.locator("[name=destination]").fill("Destino local");
    await quoteForm.locator("[name=description]").fill(tag);
    await quoteForm.getByLabel(/^Concepto/).fill("Servicio de prueba local");
    await quoteForm.getByLabel(/^Cantidad/).fill("1");
    await quoteForm.getByLabel(/^Precio unitario/).fill("123.45");
    await quoteForm.getByLabel(/^Impuesto informado/).fill("0");
    await quoteForm.getByRole("button", { name: "Guardar cotización" }).click();
    let quoteRow = page.locator("tr").filter({ hasText: tag });
    await quoteRow.waitFor();
    await quoteRow
      .getByRole("button", { name: "Revisar cotización", exact: true })
      .click();
    const revisionForm = page.locator(".enterprise-form").filter({
      has: page.getByRole("button", {
        name: "Guardar nueva versión",
        exact: true,
      }),
    });
    await revisionForm
      .locator("[name=reason]")
      .fill("LOCAL requested route revision");
    await revisionForm
      .locator("[name=destination]")
      .fill("Destino revisado local");
    await page.setViewportSize({ width: 390, height: 844 });
    await revisionForm.scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/incargo-lifecycle-revision-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await revisionForm
      .getByRole("button", { name: "Guardar nueva versión", exact: true })
      .click();
    await page
      .getByText("Versión sustituida · historial conservado")
      .last()
      .waitFor();
    quoteRow = page
      .locator("tr")
      .filter({ hasText: tag })
      .filter({
        has: page.getByRole("button", {
          name: "Registrar aceptación y crear pedido",
        }),
      });
    await quoteRow
      .locator("[name=reference]")
      .fill("Aceptación local verificada");
    await quoteRow.getByRole("checkbox").check();
    await quoteRow
      .getByRole("button", { name: "Registrar aceptación y crear pedido" })
      .click();
    await page
      .locator("tr")
      .filter({ hasText: tag })
      .getByText("Aceptada · pedido creado")
      .waitFor();
    await page
      .getByRole("button", { name: "Kanban de pedidos", exact: true })
      .click();
    await page.getByText(tag, { exact: true }).waitFor();
    const orderCard = page.locator(".shipment-card").filter({ hasText: tag });
    await orderCard
      .getByRole("button", { name: "Abrir pedido", exact: true })
      .click();
    const noteForm = page.locator(".enterprise-form").filter({
      has: page.getByRole("button", {
        name: "Guardar nota administrativa",
        exact: true,
      }),
    });
    await noteForm
      .locator("[name=body]")
      .fill("LOCAL review evidence preserved");
    await noteForm
      .locator("[name=source]")
      .fill("LOCAL customer correspondence");
    await noteForm
      .getByRole("button", { name: "Guardar nota administrativa", exact: true })
      .click();
    await page
      .getByText("LOCAL review evidence preserved", { exact: true })
      .waitFor();
    const cancellation = page.locator(".enterprise-form").filter({
      has: page.getByRole("button", {
        name: "Cancelar pedido sin ejecución",
        exact: true,
      }),
    });
    await cancellation
      .locator("[name=reason]")
      .fill("LOCAL customer cancellation before dispatch");
    await cancellation.getByRole("checkbox").check();
    await cancellation
      .getByRole("button", {
        name: "Cancelar pedido sin ejecución",
        exact: true,
      })
      .click();
    await page
      .getByText("LOCAL customer cancellation before dispatch", { exact: true })
      .waitFor();
    await page.reload();
    await page
      .getByRole("button", { name: "Pedidos y cotizaciones", exact: true })
      .click();
    await page
      .getByText("LOCAL customer cancellation before dispatch", { exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".shipment-card").filter({ hasText: tag }).count(),
      0,
    );
    await page.screenshot({
      path: "/tmp/incargo-business-orders-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Facturación y cartera", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Registrar factura externa", exact: true })
      .click();
    const invoiceForm = page.locator(".enterprise-form").first();
    for (const [name, value] of Object.entries({
      issuer: "LOCAL TEST",
      number: tag,
      currency: "COP",
      issued: "2026-10-30",
      due: "2026-11-30",
      source: "LOCAL DOCUMENT " + tag,
      total: "123.45",
    }))
      await invoiceForm.locator(`[name=${name}]`).fill(value);
    await invoiceForm
      .locator("[name=account]")
      .selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await invoiceForm.getByLabel(/^Concepto/).fill("Servicio local");
    await invoiceForm.getByLabel(/^Cantidad/).fill("1");
    await invoiceForm.getByLabel(/^Precio unitario/).fill("123.45");
    await invoiceForm.getByLabel(/^Impuesto informado/).fill("0");
    await invoiceForm.getByRole("checkbox").check();
    await invoiceForm
      .getByRole("button", { name: "Registrar documento", exact: true })
      .click();
    await page.locator("tr").filter({ hasText: tag }).waitFor();
    await page
      .getByRole("button", { name: "Registrar abono", exact: true })
      .click();
    const receiptForm = page.locator(".enterprise-form").first();
    await receiptForm
      .locator("[name=account]")
      .selectOption("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    for (const [name, value] of Object.entries({
      currency: "COP",
      amount: "50",
      reference: tag + "-PAY",
      date: "2026-10-30",
      source: "LOCAL RECEIPT",
    }))
      await receiptForm.locator(`[name=${name}]`).fill(value);
    await receiptForm
      .getByRole("button", { name: "Registrar abono", exact: true })
      .click();
    await page.getByText(/Recibo registrado:/).waitFor();
    await page
      .locator("tr")
      .filter({ hasText: tag })
      .filter({ has: page.getByRole("button", { name: "Abrir documento" }) })
      .getByRole("button", { name: "Abrir documento" })
      .click();
    const allocation = page.locator(".enterprise-form").filter({
      has: page.getByRole("button", {
        name: "Aplicar abono registrado",
        exact: true,
      }),
    });
    await allocation
      .locator("[name=receipt]")
      .selectOption({ label: tag + "-PAY · disponible $ 50,00" })
      .catch(async () => {
        const value = await allocation
          .locator("option")
          .filter({ hasText: tag + "-PAY" })
          .getAttribute("value");
        await allocation.locator("[name=receipt]").selectOption(value);
      });
    await allocation.locator("[name=amount]").fill("50");
    await allocation
      .getByRole("button", { name: "Aplicar abono registrado" })
      .click();
    await page
      .getByRole("button", { name: "Revertir aplicación" })
      .last()
      .waitFor();
    await page.reload();
    await page
      .getByRole("button", { name: "Facturación y cartera", exact: true })
      .click();
    const invoiceRow = page
      .locator("tr")
      .filter({ hasText: tag })
      .filter({ has: page.getByRole("button", { name: "Abrir documento" }) });
    await invoiceRow.waitFor();
    const persisted = sql("select public.incargo_finance_board()").find(
      (i) => i.external_number === tag,
    );
    assert.equal(persisted.outstanding, 73.45);
    assert((await invoiceRow.textContent()).match(/73[,.]45/));
    await page.screenshot({
      path: "/tmp/incargo-business-finance-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert(
      await page
        .locator(".enterprise-workspace")
        .evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
    );
    await page.screenshot({
      path: "/tmp/incargo-business-finance-mobile.png",
      fullPage: true,
    });
    await invoiceRow.getByRole("button", { name: "Abrir documento" }).click();
    const reversal = page
      .locator(".enterprise-form")
      .filter({
        has: page.getByRole("button", { name: "Revertir aplicación" }),
      })
      .first();
    await reversal.locator("[name=reason]").fill("Corrección local de prueba");
    await reversal.getByRole("button", { name: "Revertir aplicación" }).click();
    await page.getByText(/Revertido · Corrección local/).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser → real disposable Postgres quote → revision → accepted order without trip → note → cancellation persisted on reload; invoice registration → receipt → allocation → page reload persistent balance → audited reversal. No production access.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
