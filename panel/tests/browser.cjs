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
    let legacyMode = "disabled", legacyReads = 0, legacySyncFail=false, releaseLegacySync=null;
    const legacySaves=[];
    const legacyRows = [
      {id:"synthetic:0",hash:"a".repeat(64),data:{_rowNumber:1,fecha:"2026-11-03",ts:"2026-11-03T01:00:00Z",placa:"TEST-01",conductor:"Persona sintética",ciudad:"Bogotá",licencia:"00123",items:JSON.stringify([{label:"Luces",scale:"BUENO/MALO",value:"MALO",obs:"Revisar"},{label:"Nivel",value:"BAJO"}]),firma:"data:image/png;base64,broken[TRUNC]",fotos:"https://invalid.test/private-image.png"}},
      {id:"synthetic:1",hash:"b".repeat(64),data:{_rowNumber:2,fecha:"2026-11-02",placa:"TEST-02",conductor:"<script>alert(1)</script>",ciudad:"Cali",items:"not-json"}},
    ];
    await page.context().addInitScript(() => { window.print = () => {}; });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" && url.pathname === "/api/incargo-legacy-admin") {
        legacyReads++;
        if(route.request().method()==="POST"){
          const input=route.request().postDataJSON();
          if(input.action==='sync'){if(releaseLegacySync)await new Promise(resolve=>{releaseLegacySync=resolve;});return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:!legacySyncFail,error:legacySyncFail?'SOURCE_TIMEOUT':null,added:0})});}
          legacySaves.push(input);
          if(legacySaves.length===1)return route.fulfill({status:502,contentType:"application/json",body:JSON.stringify({error:"Resultado no confirmado. Reintenta el mismo intento."})});
          assert.deepEqual(input,legacySaves[0]);
          return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({hash:input.hash,request:input.request,revision:1,replayed:true})});
        }
        if(url.searchParams.has("revision"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({hash:legacyRows[0].hash,revision:1,data:{...legacyRows[0].data,ciudad:"Medellín"}})});
        if(url.searchParams.has("hash"))return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({versions:[{original:legacyRows[0].data,history:[{revision:1,reason:"Rectificación sintética para prueba",createdAt:"2026-11-03T12:00:00Z",actorId:"synthetic-operator",data:{...legacyRows[0].data,ciudad:"Medellín"}}]}]})});
        assert.equal(route.request().headers().authorization,"Bearer test-only");
        if (legacyMode === "disabled") return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Inspecciones y vinculaciones pendientes de habilitación de acceso."})});
        if (legacyMode === "denied") return route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:"Tu cuenta no tiene acceso a estos expedientes."})});
        if (legacyMode === "error") return route.fulfill({status:502,contentType:"application/json",body:JSON.stringify({error:"Fuente no disponible; reintenta."})});
        const kind = url.searchParams.get("kind");
        const records = legacyMode === "empty" ? [] : kind === "inspections" ? legacyRows : [{id:"affiliation:0",hash:"c".repeat(64),data:{_rowNumber:2,ts:"2026-11-03T12:00:00Z",nombreCompleto:"Vinculado sintético",numeroIdentificacion:"0007",aceptaContrato:"SI",versionContrato:"histórica-no-verificada",firmaB64:""}}];
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({kind,records,source:"synthetic-test",snapshot:"test-snapshot",capturedAt:"2026-11-03T12:00:00Z",readOnly:false,sync:{lastAttempt:"2026-11-04T12:00:00Z",lastSuccess:"2026-11-04T11:55:00Z",error:legacySyncFail?"SOURCE_TIMEOUT":null,stale:legacySyncFail,sourceRecords:records.length,added:0,intervalMinutes:5}})});
      }
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
    await navigate("Inspecciones y vinculaciones");
    await page.getByText("Inspecciones y vinculaciones pendientes de habilitación de acceso.",{exact:true}).waitFor();
    assert.equal(await page.locator(".legacy-admin tbody tr").count(),0);
    legacyMode="ready";
    await page.getByRole("button",{name:"Actualizar expedientes",exact:true}).click();
    await page.locator(".legacy-admin tbody tr").first().waitFor();
    assert.equal(await page.locator(".legacy-admin tbody tr").count(),2);
    legacySyncFail=true;
    await page.getByRole('button',{name:'Sincronizar origen',exact:true}).click();
    await page.getByText(/El último intento falló \(SOURCE_TIMEOUT\)/).waitFor();
    assert.equal(await page.locator('.legacy-admin tbody tr').count(),2);
    legacySyncFail=false;
    await page.getByRole('button',{name:'Sincronizar origen',exact:true}).click();
    await page.getByText('Sincronización confirmada: 0 originales nuevos.',{exact:true}).waitFor();
    await page.locator('.legacy-admin tbody tr').first().waitFor();

    await page.getByLabel("Buscar expedientes",{exact:true}).fill("TEST-01");
    await page.getByLabel("Estado de expediente",{exact:true}).selectOption("bad");
    await page.getByRole("button",{name:"Ver expediente",exact:true}).click();
    await page.getByRole("heading",{name:"Checklist original",exact:true}).waitFor();
    await page.getByRole("cell",{name:"BAJO",exact:true}).waitFor();
    await page.getByText("Firma del conductor · Truncada en el origen",{exact:true}).waitFor();
    assert.equal(await page.locator('.legacy-evidence img').count(),0);
    releaseLegacySync=()=>{};
    await page.getByRole("button",{name:"Sincronizar origen",exact:true}).click();
    await page.getByRole("button",{name:"Sincronizando origen…",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Preparar corrección",exact:true}).isDisabled(),true);
    await page.waitForTimeout(100);
    releaseLegacySync();releaseLegacySync=null;
    await page.locator('.legacy-admin tbody tr').first().waitFor();
    await page.getByRole("button",{name:"Ver expediente",exact:true}).click();
    await page.getByRole("button",{name:"Preparar corrección",exact:true}).click();
    await page.getByLabel("Ciudad",{exact:true}).fill("Medellín");
    await page.getByRole("button",{name:"Descargar propuesta sin guardar",exact:true}).click();
    await page.getByText("Explica el motivo de la corrección.",{exact:true}).waitFor();
    await page.getByLabel("Motivo de la corrección").fill("Rectificación sintética para prueba");
    const proposalDownload = page.waitForEvent("download");
    await page.getByRole("button",{name:"Descargar propuesta sin guardar",exact:true}).click();
    const proposal=JSON.parse(fs.readFileSync(await (await proposalDownload).path(),"utf8"));
    assert.equal(proposal.status,"not_saved");assert.equal(proposal.fields.ciudad,"Medellín");assert.equal(proposal.basePayload.ciudad,"Bogotá");assert.equal(proposal.basePayload.licencia,"00123");
    assert.equal(legacyRows[0].data.ciudad,"Bogotá");
    await page.getByRole("button",{name:"Guardar nueva versión",exact:true}).click();
    await page.getByText("Resultado no confirmado. Reintenta el mismo intento.",{exact:true}).waitFor();
    assert(await page.getByLabel("Ciudad",{exact:true}).isDisabled());
    await page.getByRole("button",{name:"Reintentar mismo guardado",exact:true}).click();
    await page.getByText("Versión 1 guardada y confirmada por el servidor. El original permanece intacto.",{exact:true}).waitFor();
    assert.equal(legacySaves.length,2);assert.equal(legacySaves[0].expected,0);
    await page.getByRole("button",{name:"Cancelar borrador",exact:true}).click();
    await page.getByRole("button",{name:"Consultar historial y original",exact:true}).click();
    await page.getByRole("button",{name:"Descargar original e índice de versiones",exact:true}).waitFor();
    const versionDownload=page.waitForEvent("download");
    await page.getByRole("button",{name:"Descargar versión 1",exact:true}).click();
    const version=JSON.parse(fs.readFileSync(await (await versionDownload).path(),"utf8"));assert.equal(version.revision,1);assert.equal(version.data.ciudad,"Medellín");
    await page.getByRole("button",{name:"Volver a expedientes",exact:true}).click();
    assert.equal(await page.getByLabel("Buscar expedientes",{exact:true}).inputValue(),"TEST-01");
    assert.equal(await page.getByLabel("Estado de expediente",{exact:true}).inputValue(),"bad");
    const csvDownload=page.waitForEvent("download");
    await page.getByRole("button",{name:"CSV filtrado",exact:true}).click();
    const csv=fs.readFileSync(await (await csvDownload).path(),"utf8");assert(csv.includes("00123"));assert(!csv.includes("TEST-02"));
    await page.getByRole("button",{name:"Limpiar búsqueda",exact:true}).click();
    await page.screenshot({path:"/tmp/incargo-legacy-inspections-desktop.png",fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.screenshot({path:"/tmp/incargo-legacy-inspections-mobile.png",fullPage:true});
    await page.getByRole("button",{name:"Vinculaciones temporales",exact:true}).click();
    await page.getByText("Vinculado sintético",{exact:true}).waitFor();
    assert.equal(await page.locator(".legacy-admin tbody tr").count(),1);
    await page.getByRole("button",{name:"Ver expediente",exact:true}).click();
    await page.getByText("histórica-no-verificada",{exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Preparar corrección",exact:true}).count(),1);
    const printPopup=page.waitForEvent("popup");
    await page.getByRole("button",{name:"Imprimir copia / guardar PDF",exact:true}).click();
    const copy=await printPopup;await copy.waitForLoadState();
    assert((await copy.locator("body").textContent()).includes("No es un contrato histórico reconstruido"));
    await copy.close();
    await page.getByRole("button",{name:"Volver a expedientes",exact:true}).click();
    legacyMode="error";
    await page.getByRole("button",{name:"Actualizar expedientes",exact:true}).click();
    await page.getByText("Fuente no disponible; reintenta.",{exact:true}).waitFor();
    assert.equal(await page.locator(".legacy-admin tbody tr").count(),0);
    legacyMode="empty";
    await page.getByRole("button",{name:"Actualizar expedientes",exact:true}).click();
    await page.getByText("No hay expedientes en la fuente consultada",{exact:true}).waitFor();
    legacyMode="denied";
    await page.getByRole("button",{name:"Actualizar expedientes",exact:true}).click();
    await page.getByText("Tu cuenta no tiene acceso a estos expedientes.",{exact:true}).waitFor();
    assert.equal(await page.locator(".legacy-admin tbody tr").count(),0);
    legacyMode="ready";
    assert(legacyReads>4);
    await page.setViewportSize({width:1440,height:1000});
    await navigate("Control operativo");
    await page.getByRole("heading", {name:"Mesa de seguimiento"}).waitFor();
    assert.equal(await page.locator(".control-overview tbody tr").count(), 3);
    assert((await page.locator(".control-overview tbody tr").first().textContent()).includes("Empresa de prueba Sur"));
    await page.getByLabel("Buscar en el resumen", {exact:true}).fill("TEST-001");
    assert.equal(await page.locator(".control-overview tbody tr").count(), 1);
    await page.getByRole("button", {name:"Limpiar filtros",exact:true}).click();
    await page.getByLabel("Prioridad o estado",{exact:true}).selectOption("references");
    assert.equal(await page.locator(".control-overview tbody tr").count(), 1);
    await page.getByRole("button", {name:"Limpiar filtros",exact:true}).click();
    assert.equal(await page.locator(".control-load").textContent(), "—bultos informados");
    await page.screenshot({path:"/tmp/incargo-control-desktop.png",fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({path:"/tmp/incargo-control-mobile.png",fullPage:true});
    await page.getByLabel("Buscar en el resumen",{exact:true}).fill("no-match");
    await page.getByText("Sin coincidencias",{exact:true}).waitFor();
    await page.getByRole("button",{name:"Limpiar filtros",exact:true}).click();
    await page.getByRole("button",{name:"Abrir expediente",exact:true}).first().click();
    await page.getByRole("heading",{name:"Historial de la entrega"}).waitFor();
    await page.getByRole("button",{name:"Volver al control operativo"}).click();
    await page.getByRole("heading",{name:"Mesa de seguimiento"}).waitFor();
    // Isolated fixtures exercise all three controls across a detail round-trip.
    await page.evaluate(() => window.IncargoPanel.update({
      status:"ready", trips:[], deliveries:Array.from({length:25},(_,index)=>({
        id:`regression-${String(index).padStart(2,"0")}`, trip_id:"missing-trip",
        customer_name:`Regression ${String(index).padStart(2,"0")}`, status:"pending",
        remittance_reference:"   ", invoice_reference:index === 24 ? "  INV-25  " : "   "
      }))
    }));
    await page.getByLabel("Buscar en el resumen",{exact:true}).fill("Regression");
    await page.getByLabel("Prioridad o estado",{exact:true}).selectOption("pending");
    await page.getByRole("button",{name:"Mostrar 20 más",exact:true}).click();
    assert.equal(await page.locator(".control-overview tbody tr").count(),25);
    await page.locator(".control-overview tbody tr").last().getByRole("button",{name:"Abrir expediente",exact:true}).click();
    await page.getByRole("heading",{name:"Historial de la entrega"}).waitFor();
    await page.getByRole("button",{name:"Volver al control operativo",exact:true}).click();
    assert.equal(await page.getByLabel("Buscar en el resumen",{exact:true}).inputValue(),"Regression");
    assert.equal(await page.getByLabel("Prioridad o estado",{exact:true}).inputValue(),"pending");
    assert.equal(await page.locator(".control-overview tbody tr").count(),25);
    assert.equal(await page.locator(".control-overview tbody tr").last().locator("td").first().locator("small").textContent(),"INV-25");
    assert.equal(await page.locator(".control-overview tbody tr").first().locator("td").first().locator("small").textContent(),"Sin referencia");
    await page.getByLabel("Prioridad o estado",{exact:true}).selectOption("references");
    assert.equal(await page.locator(".control-overview tbody tr").count(),20);
    await page.getByRole("button",{name:"Mostrar 20 más",exact:true}).click();
    assert.equal(await page.locator(".control-overview tbody tr").count(),24);
    await page.getByRole("button",{name:"Limpiar filtros",exact:true}).click();
    await page.evaluate(() => window.IncargoPanel.update({status:"ready",deliveries:[],trips:[]}));
    await page.getByText("Sin entregas consultadas",{exact:true}).waitFor();
    assert.equal(await page.locator(".control-load").textContent(), "—bultos informados");
    await page.locator("#refresh").count().then(async count => {
      if (count) await page.locator("#refresh").click();
      else await page.getByRole("button",{name:"Actualizar datos",exact:true}).click();
    });
    await page.locator(".control-overview tbody tr").first().waitFor();
    await page.setViewportSize({width:1440,height:1000});
    await navigate("Envíos activos");
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
    const beforeDriverLegacy=legacyReads;
    const driverLegacy=await page.evaluate(async()=>{try{await window.IncargoOperations.legacyAdmin("inspections");return "UNBLOCKED";}catch(e){return e.message;}});
    assert.equal(driverLegacy,"Acceso operativo requerido.");assert.equal(legacyReads,beforeDriverLegacy);
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
