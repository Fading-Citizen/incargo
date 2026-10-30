const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
(async () => {
  const root = path.resolve(__dirname, "../../logistica-1.0.0");
  const server = http.createServer((req, res) => {
    if (req.url === "/api/incargo-config") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          url: "https://mock.supabase.co",
          publishableKey: "test-only",
        }),
      );
      return;
    }
    const filename = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (
      !filename.startsWith(root + "/") ||
      !fs.existsSync(filename) ||
      fs.statSync(filename).isDirectory()
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      filename.endsWith(".css")
        ? "text/css"
        : filename.endsWith(".js")
          ? "application/javascript"
          : filename.endsWith(".png")
            ? "image/png"
            : "text/html",
    );
    fs.createReadStream(filename).pipe(res);
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
      errors = [],
      writes = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let role = "operations",
      fail = false;
    let deliveryReads = 0;
    const trips = [
      {
        id: "t1",
        route_label: "Bogotá → Medellín",
        scheduled_date: "2026-10-30",
        vehicle_plate: "TEST01",
        driver_user_id: "driver-test",
      },
      {
        id: "t2",
        route_label: "Cali → Bogotá",
        scheduled_date: "2026-10-31",
        vehicle_plate: "TEST02",
        driver_user_id: null,
      },
    ];
    const deliveries = [
      {
        id: "d1",
        trip_id: "t1",
        customer_name: "Empresa de prueba Norte",
        status: "pending",
        destination_text: "Medellín",
        origin_text: "Bogotá",
        remittance_reference: "TEST-001",
        cargo_description: "Carga de prueba",
      },
      {
        id: "d2",
        trip_id: "t2",
        customer_name: "Empresa de prueba Sur",
        status: "exception",
        destination_text: "Bogotá",
        invoice_reference: "FAC-TEST",
      },
      {
        id: "d3",
        trip_id: "t1",
        customer_name: "Empresa de prueba Norte",
        status: "delivered",
        destination_text: "Medellín",
      },
    ];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      if (url.hostname !== "mock.supabase.co")
        throw Error("Unexpected external request " + url.hostname);
      let result = [];
      const method = route.request().method();
      if (method !== "GET") writes.push(url.pathname);
      if (url.pathname === "/auth/v1/token")
        result = {
          access_token: "test-only",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: "test-user", email: "test@example.invalid" },
        };
      else if (url.pathname === "/auth/v1/user")
        result = { id: "test-user", email: "test@example.invalid" };
      else if (url.pathname.endsWith("incargo_business_capabilities"))
        result = { commercial: false, finance: true, lifecycle: true }; // Server claim cannot override release hold.
      else if (url.pathname.endsWith("incargo_memberships"))
        result = url.searchParams.has("user_id")
          ? [{ role }]
          : [{ user_id: "driver-test" }];
      else if (url.pathname.endsWith("incargo_trips")) {
        if (fail)
          return route.fulfill({
            status: 503,
            body: "{}",
            contentType: "application/json",
          });
        result = trips;
      } else if (url.pathname.endsWith("incargo_deliveries")) {
        deliveryReads++;
        result = deliveries;
      } else if (url.pathname.endsWith("incargo_start_delivery")) {
        deliveries.find(
          (d) => d.id === route.request().postDataJSON().p_delivery,
        ).status = "in_transit";
        result = { status: "in_transit", outcome: "started" };
      } else if (url.pathname.endsWith("incargo_client_admin_accounts"))
        result = [
          { account_id: "account-test", display_name: "Cuenta de prueba" },
        ];
      else if (url.pathname.endsWith("incargo_pending_client_access_requests"))
        result = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    const base = "http://127.0.0.1:" + server.address().port;
    async function navigate(name) {
      const toggle = page.getByRole("button", {
        name: "Cambiar módulo",
        exact: true,
      });
      if (
        (await toggle.isVisible()) &&
        (await toggle.getAttribute("aria-expanded")) === "false"
      )
        await toggle.click();
      await page.getByRole("button", { name, exact: true }).click();
    }
    await page.goto(base + "/operaciones.html");
    assert(await page.locator("#workspace").isHidden());
    async function login() {
      await page
        .locator("#login-form [name=email]")
        .fill("test@example.invalid");
      await page.locator("#login-form [name=password]").fill("fixture");
      await page.locator("#login-form button").click();
      await page
        .getByText("Sesión activa en esta pestaña.", { exact: true })
        .waitFor();
    }
    await login();
    await page
      .getByRole("heading", { name: "Envíos activos", exact: true })
      .waitFor();
    assert.equal(await page.locator(".shipment-card").count(), 2);
    assert.equal(await page.locator(".enterprise-sidebar").isVisible(), true);
    assert.equal(await page.locator(".workspace-nav").isVisible(), false);
    await page.screenshot({
      path: "/tmp/incargo-enterprise-desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Registrar salida", exact: true })
      .click();
    assert.equal(
      writes.filter((p) => p.endsWith("incargo_start_delivery")).length,
      0,
    );
    await page
      .getByRole("button", { name: "Confirmar salida", exact: true })
      .click();
    await page.locator(".status-column-in_transit .shipment-card").waitFor();
    assert.equal(
      await page.locator(".status-column-pending .shipment-card").count(),
      0,
    );
    assert.equal(
      writes.filter((p) => p.endsWith("incargo_start_delivery")).length,
      1,
    );
    await page
      .getByRole("button", { name: "Abrir expediente", exact: true })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Historial de la entrega" })
      .waitFor();
    await page.getByRole("button", { name: "Volver al Kanban" }).click();
    await navigate("Clientes y accesos");
    await page
      .getByRole("heading", { name: "Cuenta de prueba", exact: true })
      .waitFor();
    assert.equal(
      await page.locator(".enterprise-account-list article").count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Aprobar vinculación", exact: true })
        .count(),
      0,
    );
    await navigate("Viajes y asignaciones");
    await page
      .getByRole("heading", { name: "Crear viaje", exact: true })
      .waitFor();
    assert(
      await page.locator(".enterprise-workspace form").first().isVisible(),
    );
    await navigate("Documentos");
    await page
      .getByRole("button", { name: "Abrir expediente", exact: true })
      .first()
      .click();
    await page.getByRole("heading", { name: "Carga y recorrido" }).waitFor();
    await navigate("Envíos activos");
    fail = true;
    await page.locator("#ops-refresh").click();
    await page.getByText(/No pudimos actualizar la operación/).waitFor();
    assert.equal(await page.locator(".shipment-card").count(), 0);
    fail = false;
    await page
      .getByRole("button", { name: "Reintentar consulta", exact: true })
      .click();
    await page.locator(".shipment-card").first().waitFor();
    assert.equal(await page.getByText("Error 503", { exact: true }).count(), 0);
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(
      await page
        .locator(".shipment-card")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
      "rgb(255, 255, 255)",
    );
    await navigate("Mapa y seguimiento");
    await page
      .getByRole("heading", { name: "Mapa de recorridos", exact: true })
      .waitFor();
    assert(
      await page
        .getByRole("img", { name: /Referencia entre Bogota y Medellín/ })
        .isVisible(),
    );
    await page.screenshot({
      path: "/tmp/incargo-route-map-desktop.png",
      fullPage: true,
    });
    await page.clock.install();
    await page.getByLabel("Actualizar estados cada minuto").check();
    const readsBefore = deliveryReads;
    deliveries[0].status = "exception";
    await page.clock.fastForward(60000);
    await page.waitForFunction(
      () =>
        document.querySelector(".route-choice[aria-pressed=true] small")
          ?.textContent === "Con novedad",
    );
    assert(deliveryReads > readsBefore);
    const stableReads = deliveryReads;
    await page.evaluate(() =>
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      }),
    );
    await page.clock.fastForward(60000);
    assert.equal(deliveryReads, stableReads);
    await page.evaluate(() =>
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      }),
    );
    await page.getByLabel("Actualizar estados cada minuto").uncheck();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/incargo-route-map-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Cambiar módulo", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: "Facturación y cartera", exact: true })
        .isVisible(),
      true,
    );
    await page.screenshot({
      path: "/tmp/incargo-navigation-mobile.png",
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByRole("button", { name: "Cambiar módulo", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    await navigate("Envíos activos");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/incargo-enterprise-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "+ Nueva entrega", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Nueva entrega", exact: true })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: "/tmp/incargo-enterprise-form-mobile.png",
      fullPage: true,
    });
    await navigate("Vehículos y conductores");
    await page
      .getByRole("heading", { name: "Vehículos y conductores", exact: true })
      .waitFor();
    const fleetTable = page.getByRole("table").first();
    assert((await fleetTable.textContent()).includes("TEST01"));
    await page
      .getByLabel("Buscar placa, ruta o identificador de conductor")
      .fill("TEST02");
    assert(!(await fleetTable.textContent()).includes("TEST01"));
    assert((await fleetTable.textContent()).includes("Sin asignar"));
    await page.screenshot({
      path: "/tmp/incargo-fleet-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await navigate("Facturación y cartera");
    await page
      .getByText("Pendiente de configuración · no activado", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Registrar factura externa", exact: true })
        .count(),
      0,
    );
    const beforeBlocked = writes.length;
    const blocked = await page.evaluate(async () => {
      const api = window.IncargoOperations;
      const actions = [
        () => api.financeBoard(),
        () => api.receiptBoard(),
        () => api.invoiceDetail("test"),
        () => api.registerInvoice("test", {}),
        () => api.recordReceipt("test", {}),
        () => api.applyReceipt("test", "test", "test", 1),
        () => api.reverseAllocation("test", "test", "test"),
        () => api.administrativeNotes("invoice", "test"),
        () =>
          api.addAdministrativeNote("test", "receipt", "test", "test", "test"),
      ];
      return Promise.all(
        actions.map(async (action) => {
          try {
            await action();
            return "UNBLOCKED";
          } catch (e) {
            return e.message;
          }
        }),
      );
    });
    assert(
      blocked.every((message) =>
        message.includes("autorización de activación"),
      ),
    );
    assert.equal(
      writes.length,
      beforeBlocked,
      "release hold must block network dispatch, not just hide controls",
    );
    await page.screenshot({
      path: "/tmp/incargo-finance-held-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "/tmp/incargo-finance-held-desktop.png",
      fullPage: true,
    });
    await navigate("Pedidos y cotizaciones");
    await page
      .getByText("Preparado · pendiente de habilitación", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Guardar cotización", exact: true })
        .count(),
      0,
    );
    await page.locator("#logout").click();
    assert.equal(await page.locator("#incargo-panel-root").textContent(), "");
    role = "driver";
    await login();
    assert(await page.locator("#ops").isHidden());
    assert(await page.locator("#driver").isVisible());
    assert.equal(await page.locator("#incargo-panel-root").textContent(), "");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: enterprise module integration, restricted Kanban transition with confirmation, canonical accounts, direct forms, delivery dossier, refresh failure/recovery, OS dark-mode contrast, mobile layout, logout and driver isolation. No production writes.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
