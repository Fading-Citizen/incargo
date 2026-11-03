export type LegacyKind = "inspections" | "affiliations";
export type LegacyRecord = {
  id: string;
  hash: string;
  data: Record<string, unknown>;
};
export type LegacySnapshot = {
  kind: LegacyKind;
  capturedAt: string;
  snapshot: string;
  source: string;
  records: LegacyRecord[];
  readOnly: true;
};
export const inspectionFields = [
  ["fecha", "Fecha"],
  ["ciudad", "Ciudad"],
  ["empresa", "Empresa"],
  ["conductor", "Conductor"],
  ["licencia", "Licencia"],
  ["placa", "Placa"],
  ["claseVehiculo", "Clase de vehículo"],
  ["tipoCarroceria", "Carrocería"],
  ["placasemirremolque", "Placa semirremolque"],
  ["modelo", "Modelo"],
  ["gps", "GPS documental"],
  ["tarjetaProp", "Tarjeta de propiedad"],
  ["fechaSoat", "SOAT"],
  ["fechaTecno", "Tecnomecánica"],
  ["tipoTransporte", "Tipo de transporte"],
] as const;
export function text(value: unknown): string {
  return value == null
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
export function dateKey(value: unknown): string {
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(raw + "T12:00:00Z");
    return Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === raw
      ? raw
      : "";
  }
  // Do not guess timezone or reinterpret ambiguous historical dates.
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export type LegacyItem = {
  label: string;
  scale: string;
  value: string;
  obs: string;
};
export function checklist(raw: unknown): {
  items: LegacyItem[];
  valid: boolean;
} {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !Array.isArray(data) ||
      !data.length ||
      data.some(
        (item) =>
          !item ||
          typeof item !== "object" ||
          typeof item.label !== "string" ||
          typeof item.value !== "string",
      )
    )
      return { items: [], valid: false };
    return {
      items: data.map((item) => ({
        label: item.label,
        value: item.value,
        scale: text(item.scale),
        obs: text(item.obs),
      })),
      valid: true,
    };
  } catch {
    return { items: [], valid: false };
  }
}
export function inspectionStatus(record: LegacyRecord) {
  const parsed = checklist(record.data.items);
  if (!parsed.valid) return "unknown";
  if (parsed.items.some((item) => item.value === "MALO")) return "bad";
  if (
    parsed.items.some(
      (item) =>
        !["BUENO", "NO APLICA", "ALTO", "MEDIO", "BAJO"].includes(item.value),
    )
  )
    return "unknown";
  return "no-bad";
}
export function filterRecords(
  records: LegacyRecord[],
  kind: LegacyKind,
  query: string,
  date: string,
  state: string,
) {
  const needle = query.trim().toLocaleLowerCase("es-CO");
  return records
    .filter((record) => {
      const data = record.data;
      const keys =
        kind === "inspections"
          ? ["placa", "conductor", "ciudad"]
          : [
              "nombreCompleto",
              "numeroIdentificacion",
              "correoElectronico",
              "correoRegistro",
            ];
      return (
        (!needle ||
          keys.some((key) =>
            text(data[key]).toLocaleLowerCase("es-CO").includes(needle),
          )) &&
        (!date ||
          dateKey(kind === "inspections" ? data.fecha : data.ts) === date) &&
        (!state ||
          (kind === "inspections"
            ? inspectionStatus(record) === state
            : text(data.aceptaContrato) === state))
      );
    })
    .slice()
    .reverse();
}
export function evidence(raw: unknown): {
  state: "missing" | "truncated" | "invalid" | "available";
  src?: string;
} {
  const value = text(raw);
  if (!value) return { state: "missing" };
  if (value.includes("[TRUNC]")) return { state: "truncated" };
  const match =
    /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);
  if (!match || value.length > 3000000 || match[2].length % 4 !== 0)
    return { state: "invalid" };
  try {
    const decoded = atob(match[2]);
    const valid =
      match[1] === "png"
        ? decoded.startsWith("\x89PNG\r\n\x1a\n")
        : match[1] === "jpeg"
          ? decoded.startsWith("\xff\xd8\xff")
          : decoded.startsWith("RIFF") && decoded.slice(8, 12) === "WEBP";
    return valid ? { state: "available", src: value } : { state: "invalid" };
  } catch {
    return { state: "invalid" };
  }
}
export function photos(record: LegacyRecord) {
  return text(record.data.fotos).split("|").filter(Boolean);
}
export function csvCell(value: unknown) {
  const raw = text(value);
  const safe =
    /^[\s]*[=+\-@\t\r\n]/.test(raw) || /^[\t\r\n]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function inspectionCsv(records: LegacyRecord[]) {
  const header = [
    ...inspectionFields.map(([, label]) => label),
    "Recepción original",
    "Ítems MALO",
    "Estado de lectura",
  ];
  const rows = records.map((record) => [
    ...inspectionFields.map(([key]) => record.data[key]),
    record.data.ts,
    checklist(record.data.items)
      .items.filter((item) => item.value === "MALO")
      .map((item) => item.label)
      .join(" | "),
    inspectionStatus(record),
  ]);
  return (
    "\ufeff" +
    [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}
export function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function correctionProposal(
  record: LegacyRecord,
  snapshot: LegacySnapshot,
  fields: Record<string, string>,
  reason: string,
  replacementPhotos: string[] | null,
  signature: string | null,
) {
  if (!reason.trim()) throw Error("Explica el motivo de la corrección.");
  if (
    replacementPhotos?.some((photo) => evidence(photo).state !== "available") ||
    (signature !== null && evidence(signature).state !== "available")
  )
    throw Error("Hay imágenes no válidas.");
  return {
    schema: "incargo-correction-proposal-v1",
    status: "not_saved",
    snapshot: snapshot.snapshot,
    source: snapshot.source,
    sourceRecord: record.id,
    sourceHash: record.hash,
    sourceRow: record.data._rowNumber,
    reason: reason.trim(),
    fields: Object.fromEntries(
      inspectionFields.map(([key]) => [
        key,
        fields[key] ?? text(record.data[key]),
      ]),
    ),
    replacementPhotos,
    replacementSignature: signature,
    original: record.data,
  };
}
