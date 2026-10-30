(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    result = $("result"),
    notice = $("notice");
  const endpoint =
    "https://gmjsqboyuvierfwruspv.supabase.co/functions/v1/incargo-tracking";
  const labels = {
    pending: "Pendiente",
    created: "Envío registrado",
    in_transit: "En ruta",
    exception: "Novedad",
    delivered: "Entregada",
  };
  let generation = 0,
    busy = false,
    controller,
    timer,
    closed = false,
    lastSuccess = null;
  const token = () => new URLSearchParams(location.hash.slice(1)).get("token");
  const valid = (value) => /^[0-9a-f]{64}$/.test(value || "");
  const add = (parent, tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    parent.append(node);
    return node;
  };
  function clear() {
    result.replaceChildren();
    result.hidden = true;
  }
  function freshness() {
    $("tracking-freshness").textContent = lastSuccess
      ? "Última consulta correcta: " +
        lastSuccess.toLocaleString("es-CO") +
        (navigator.onLine
          ? ""
          : " · Sin conexión. Los datos no se están actualizando.")
      : !navigator.onLine
        ? "Sin conexión. No se puede comprobar el estado."
        : "";
  }
  function schedule() {
    clearTimeout(timer);
    if (!closed && $("tracking-auto").checked && valid(token()))
      timer = setTimeout(() => {
        if (!document.hidden && navigator.onLine) void load();
        else schedule();
      }, 60000);
  }
  async function load() {
    if (busy) return;
    const value = token();
    if (!valid(value)) {
      notice.textContent = value
        ? "Enlace inválido o incompleto."
        : "Pega el enlace recibido para consultar tu entrega.";
      return;
    }
    if (!navigator.onLine) {
      freshness();
      notice.textContent =
        "Sin conexión. Revisa tu conexión antes de actualizar.";
      schedule();
      return;
    }
    const epoch = generation;
    busy = true;
    const activeController = new AbortController();
    controller = activeController;
    const timeout = setTimeout(() => activeController.abort(), 12000);
    $("tracking-refresh").disabled = true;
    notice.textContent = "Consultando el estado registrado…";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
        cache: "no-store",
        signal: activeController.signal,
      });
      if (epoch !== generation || closed) return;
      if (!response.ok) {
        clear();
        if ([401, 403, 404].includes(response.status)) {
          $("tracking-auto").checked = false;
          notice.textContent = "Enlace vencido, revocado o inválido.";
        } else
          notice.textContent =
            "No pudimos verificar el estado. Puedes volver a consultar; no se confirma una actualización.";
        return;
      }
      const data = await response.json();
      if (epoch !== generation || closed) return;
      if (
        !data ||
        typeof data.status !== "string" ||
        !Array.isArray(data.events)
      )
        throw Error("invalid response");
      clear();
      result.hidden = false;
      add(
        result,
        "span",
        labels[data.status] || "Estado no reconocido",
      ).className = "tracking-status";
      add(result, "h2", data.customer_name || "Tu entrega");
      if (data.invoice_reference)
        add(result, "p", "Referencia de factura: " + data.invoice_reference);
      const events = data.events
        .filter(
          (e) =>
            e &&
            typeof e.type === "string" &&
            Number.isFinite(Date.parse(e.at)),
        )
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const list = add(result, "ol", "");
      list.className = "tracking-events";
      for (const event of events) {
        const item = add(list, "li", labels[event.type] || "Evento registrado");
        const time = add(
          item,
          "time",
          new Date(event.at).toLocaleString("es-CO"),
        );
        time.dateTime = event.at;
      }
      if (!events.length)
        add(result, "p", "No hay hitos disponibles en esta consulta.");
      else
        add(
          result,
          "p",
          "Último hito registrado: " +
            new Date(events.at(-1).at).toLocaleString("es-CO"),
        );
      if (data.support_url) {
        try {
          const url = new URL(data.support_url);
          if (
            url.protocol === "https:" &&
            url.hostname === "gmjsqboyuvierfwruspv.supabase.co" &&
            url.pathname.startsWith("/storage/v1/object/sign/incargo-proofs/")
          ) {
            const link = add(result, "a", "Ver soporte de entrega");
            link.href = url.href;
            link.rel = "noreferrer noopener";
            link.target = "_blank";
          }
        } catch {
          /* Invalid support URL is never navigable. */
        }
      }
      lastSuccess = new Date();
      freshness();
      notice.textContent =
        "Estado consultado. Los hitos sólo cambian cuando la operación registra una novedad.";
    } catch {
      if (epoch === generation && !closed) {
        clear();
        notice.textContent =
          "No pudimos verificar el estado. Reintenta cuando tengas conexión.";
        freshness();
      }
    } finally {
      clearTimeout(timeout);
      if (epoch === generation) {
        busy = false;
        $("tracking-refresh").disabled = false;
        schedule();
      }
    }
  }
  function start() {
    generation++;
    controller?.abort();
    busy = false;
    closed = false;
    clear();
    lastSuccess = null;
    freshness();
    $("tracking-refresh").disabled = false;
    $("tracking-entry").hidden = valid(token());
    $("tracking-controls").hidden = !valid(token());
    void load();
  }
  $("tracking-refresh").onclick = () => void load();
  $("tracking-auto").onchange = schedule;
  $("tracking-link-form").onsubmit = (event) => {
    event.preventDefault();
    try {
      const url = new URL($("tracking-link").value);
      const value = new URLSearchParams(url.hash.slice(1)).get("token");
      if (
        url.protocol !== "https:" ||
        !["incargo.co", "www.incargo.co"].includes(url.hostname) ||
        !/^\/seguimiento(?:\.html)?\/?$/.test(url.pathname) ||
        !valid(value) ||
        url.username ||
        url.password
      )
        throw Error("invalid");
      location.hash = "token=" + value;
    } catch {
      notice.textContent =
        "Usa el enlace de seguimiento completo que recibiste de Incargo.";
    }
  };
  addEventListener("hashchange", start);
  addEventListener("offline", () => {
    freshness();
    notice.textContent = "Sin conexión. La consulta automática está pausada.";
  });
  addEventListener("online", () => {
    freshness();
    notice.textContent = "Conexión recuperada. Puedes actualizar el estado.";
    schedule();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTimeout(timer);
    else schedule();
  });
  addEventListener("pagehide", () => {
    closed = true;
    generation++;
    controller?.abort();
    clearTimeout(timer);
  });
  addEventListener("pageshow", (event) => {
    if (event.persisted) start();
  });
  start();
})();
