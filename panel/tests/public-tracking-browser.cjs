const { chromium } = require("playwright");
const assert = require("node:assert/strict"),
  http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, "../../logistica-1.0.0");
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      root,
      "." +
        (new URL(req.url, "http://localhost").pathname === "/"
          ? "/index.html"
          : new URL(req.url, "http://localhost").pathname),
    );
    if (!file.startsWith(root + "/") || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "application/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : file.endsWith(".png")
              ? "image/png"
              : file.endsWith(".jpg")
                ? "image/jpeg"
                : "text/html",
    );
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    let requests = 0,
      status = "pending",
      revoked = false;
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install();
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      assert.equal(
        url.href,
        "https://gmjsqboyuvierfwruspv.supabase.co/functions/v1/incargo-tracking",
      );
      requests++;
      assert.equal(route.request().method(), "POST");
      assert.deepEqual(Object.keys(route.request().postDataJSON()), ["token"]);
      assert.equal(url.search, "");
      await route.fulfill({
        status: revoked ? 404 : 200,
        contentType: "application/json",
        body: JSON.stringify({
          customer_name: "Cliente local de prueba",
          status,
          events: [
            {
              type: status === "pending" ? "created" : status,
              at: "2026-10-30T16:00:00Z",
            },
          ],
          support_url:
            status === "pending"
              ? "https://unapproved.invalid/private-location"
              : "https://gmjsqboyuvierfwruspv.supabase.co/storage/v1/object/sign/incargo-proofs/local/proof.png?token=local-only",
        }),
      });
    });
    await page.goto(base + "/seguimiento.html");
    await page.locator("#tracking-entry").waitFor();
    assert.equal(requests, 0);
    await page
      .locator("#tracking-link")
      .fill("https://unapproved.invalid/seguimiento#token=" + "a".repeat(64));
    await page
      .getByRole("button", { name: "Consultar entrega", exact: true })
      .click();
    await page
      .getByText(
        "Usa el enlace de seguimiento completo que recibiste de Incargo.",
      )
      .waitFor();
    assert.equal(requests, 0);
    await page
      .locator("#tracking-link")
      .fill("https://www.incargo.co/seguimiento.html#token=" + "a".repeat(64));
    await page
      .getByRole("button", { name: "Consultar entrega", exact: true })
      .click();
    await page.getByText("Cliente local de prueba", { exact: true }).waitFor();
    assert.equal(requests, 1);
    assert.equal(
      await page.getByRole("link", { name: "Ver soporte de entrega" }).count(),
      0,
    );
    status = "in_transit";
    await page.clock.fastForward(60000);
    await page
      .locator(".tracking-status")
      .filter({ hasText: "En ruta" })
      .waitFor();
    assert.equal(requests, 2);
    assert.equal(
      await page
        .getByRole("link", { name: "Ver soporte de entrega", exact: true })
        .count(),
      1,
    );
    await page.screenshot({
      path: "/tmp/incargo-tracking-desktop.png",
      fullPage: true,
    });
    await page.getByLabel("Consultar cada minuto").uncheck();
    await page.clock.fastForward(120000);
    assert.equal(requests, 2);
    await page.getByLabel("Consultar cada minuto").check();
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.fastForward(120000);
    assert.equal(requests, 2);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.context().setOffline(true);
    await page
      .getByRole("button", { name: "Actualizar estado", exact: true })
      .click();
    assert.equal(requests, 2);
    assert.match(
      await page.locator("#tracking-freshness").textContent(),
      /Sin conexión/,
    );
    await page.context().setOffline(false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "/tmp/incargo-tracking-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    revoked = true;
    await page
      .getByRole("button", { name: "Actualizar estado", exact: true })
      .click();
    await page.getByText("Enlace vencido, revocado o inválido.").waitFor();
    assert.equal(await page.locator("#result").textContent(), "");
    assert.equal(
      await page.getByLabel("Consultar cada minuto").isChecked(),
      false,
    );
    const afterRevoke = requests;
    await page.clock.fastForward(120000);
    assert.equal(requests, afterRevoke);
    assert.deepEqual(errors, []);
    const race = await browser.newPage();
    let releaseOld, resolveStarted, resolveFinished;
    const started = new Promise((r) => (resolveStarted = r)),
      finished = new Promise((r) => (resolveFinished = r));
    await race.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      assert.equal(
        url.href,
        "https://gmjsqboyuvierfwruspv.supabase.co/functions/v1/incargo-tracking",
      );
      const old = route.request().postDataJSON().token === "c".repeat(64);
      if (old) {
        resolveStarted();
        await new Promise((r) => (releaseOld = r));
      }
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            customer_name: old ? "OLD PRIVATE" : "NEW AUTHORIZED",
            status: "pending",
            events: [],
            support_url: null,
          }),
        });
      } catch {
        /* Previous request was aborted when the token changed. */
      } finally {
        if (old) resolveFinished();
      }
    });
    await race.goto(base + "/seguimiento.html#token=" + "c".repeat(64));
    await started;
    await race.evaluate(() => (location.hash = "token=" + "d".repeat(64)));
    await race.getByText("NEW AUTHORIZED", { exact: true }).waitFor();
    releaseOld();
    await finished;
    assert.equal(
      await race.getByText("OLD PRIVATE", { exact: true }).count(),
      0,
    );
    assert.equal(
      await race.getByText("NEW AUTHORIZED", { exact: true }).count(),
      1,
    );
    await race.close();
    const home = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await home.route("**/*", (route) =>
      new URL(route.request().url()).hostname === "127.0.0.1"
        ? route.continue()
        : route.abort(),
    );
    await home.goto(base + "/");
    await home
      .getByRole("heading", { name: "¿Qué necesitas hoy?", exact: true })
      .waitFor();
    assert.equal(await home.locator('a[href="seguimiento.html"]').count(), 3);
    assert.equal(
      await home.locator("#quoteForm").getAttribute("action"),
      "https://formspree.io/f/xanyarre",
    );
    await home.screenshot({
      path: "/tmp/incargo-home-desktop.png",
      fullPage: true,
    });
    await home.setViewportSize({ width: 390, height: 844 });
    await home.screenshot({
      path: "/tmp/incargo-home-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await home.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await home.getByRole("button", { name: "Abrir menú", exact: true }).click();
    assert.equal(
      await home
        .getByRole("link", { name: "Mis envíos", exact: false })
        .first()
        .isVisible(),
      true,
    );
    console.log(
      "PASS: tracking token validation, one-minute refresh, opt-out, hidden/offline pause, revocation clearing, unapproved support URL rejected; homepage navigation, form destination and responsive views. No real tracking tokens or production writes.",
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
