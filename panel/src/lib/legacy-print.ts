import {
  checklist,
  evidence,
  inspectionFields,
  photos,
  text,
  type LegacyRecord,
  type LegacySnapshot,
} from "./legacy-admin";
export function escape(value: unknown) {
  return text(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
function image(raw: unknown, label: string) {
  const item = evidence(raw);
  return item.src
    ? `<figure><img src="${item.src}" alt="${escape(label)}"><figcaption>${escape(label)} · copia de evidencia, autenticidad no verificada</figcaption></figure>`
    : `<p>${escape(label)}: ${escape(item.state)}</p>`;
}
export function printDocument(
  snapshot: LegacySnapshot,
  records: LegacyRecord[],
  detail: boolean,
) {
  const title =
    snapshot.kind === "inspections"
      ? "Copia de inspecciones"
      : "Copia de expediente de vinculación";
  const content = records
    .map((record) => {
      const d = record.data;
      const revision = record.revision;
      const version =
        typeof revision === "number" && Number.isInteger(revision) && revision >= 0
          ? `${revision} (${revision === 0 ? "contenido original" : "corrección guardada"})`
          : "no informada; no se puede identificar la versión de esta copia";
      const keys =
        snapshot.kind === "inspections"
          ? inspectionFields
          : Object.keys(d)
              .filter((key) => !["firmaB64", "_rowNumber"].includes(key))
              .map((key) => [key, key]);
      const fields = keys
        .map(
          ([key, label]) =>
            `<tr><th>${escape(label)}</th><td>${escape(text(d[key]) || "No informado")}</td></tr>`,
        )
        .join("");
      const parsed = checklist(d.items);
      return `<section><h2>${escape(d.placa || d.nombreCompleto || "Registro")}</h2><table>${fields}</table>${
        detail && snapshot.kind === "inspections"
          ? `<h3>Checklist</h3>${parsed.valid ? `<table><tr><th>Ítem</th><th>Escala</th><th>Valor original</th><th>Observación</th></tr>${parsed.items.map((item) => `<tr><td>${escape(item.label)}</td><td>${escape(item.scale)}</td><td>${escape(item.value)}</td><td>${escape(item.obs)}</td></tr>`).join("")}</table>` : "<p>Checklist ausente o no interpretable. No equivale a conformidad.</p>"}${photos(
              record,
            )
              .map((raw, index) => image(raw, `Foto ${index + 1}`))
              .join("")}${image(d.firma, "Firma del conductor")}`
          : ""
      }${detail && snapshot.kind === "affiliations" ? image(d.firmaB64, "Firma registrada") : ""}<p>Revisión reproducida: ${escape(version)}</p><p>SHA-256 del contenido original: ${escape(record.hash)}</p></section>`;
    })
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>body{font:13px Arial;color:#142927;margin:30px}h1{border-bottom:3px solid #d5a817}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left;overflow-wrap:anywhere}th{width:25%}section{break-after:page}section:last-child{break-after:auto}img{max-width:100%;max-height:280px}figure{break-inside:avoid}p{overflow-wrap:anywhere}</style></head><body><h1>${title}</h1><p>Copia informativa. No certifica aprobación, aptitud del vehículo, consentimiento ni autenticidad de firmas. No es un contrato histórico reconstruido.</p><p>Origen: ${escape(snapshot.source)} · Consulta: ${escape(snapshot.capturedAt)} · Registros: ${records.length}</p><p>Snapshot: ${escape(snapshot.snapshot)}</p>${content}</body></html>`;
}
export async function openPrint(
  snapshot: LegacySnapshot,
  records: LegacyRecord[],
  detail: boolean,
) {
  const popup = window.open("", "_blank");
  if (!popup)
    throw Error(
      "El navegador bloqueó la ventana de impresión. Permite ventanas para este sitio y reintenta.",
    );
  popup.opener = null;
  popup.document.open();
  popup.document.write(printDocument(snapshot, records, detail));
  popup.document.close();
  await Promise.all(
    Array.from(popup.document.images).map((img) =>
      img.decode().catch(() => {
        img.replaceWith(
          popup.document.createTextNode(
            "Imagen no decodificable: evidencia incompleta.",
          ),
        );
      }),
    ),
  );
  if (!popup.closed) {
    popup.focus();
    popup.print();
  }
}
