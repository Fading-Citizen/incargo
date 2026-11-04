import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  PanelAction,
  PanelEmpty,
  PanelField,
  PanelNotice,
  PanelSection,
  PanelTableFrame,
} from "../components/PanelPrimitives";
import {
  checklist,
  affiliationFields,
  type LegacyCorrection,
  type LegacyHistory,
  correctionProposal,
  dateKey,
  download,
  evidence,
  filterRecords,
  inspectionCsv,
  inspectionFields,
  inspectionStatus,
  photos,
  text,
  type LegacyKind,
  type LegacyRecord,
  type LegacySnapshot,
} from "../lib/legacy-admin";
import { openPrint } from "../lib/legacy-print";
const statusLabels = {
  bad: "Con ítems MALO",
  "no-bad": "Sin ítems MALO",
  unknown: "Sin clasificación verificable",
};
const evidenceLabels = {
  missing: "No informada",
  truncated: "Truncada en el origen",
  invalid: "Formato no válido o no admitido",
  available: "Imagen registrada; autenticidad no verificada",
};
function Evidence({ value, label }: { value: unknown; label: string }) {
  const parsed = evidence(value);
  const [failed, setFailed] = useState(false);
  return (
    <figure className="legacy-evidence">
      <figcaption>
        {label} ·{" "}
        {failed ? "Imagen no decodificable" : evidenceLabels[parsed.state]}
      </figcaption>
      {parsed.src && !failed && (
        <img
          src={parsed.src}
          alt={label}
          onError={() => setFailed(true)}
          loading="lazy"
        />
      )}
    </figure>
  );
}
async function readImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 1500000
  )
    throw Error(
      "Usa PNG, JPEG o WebP de hasta 1,5 MB. No se comprimen ni truncan evidencias.",
    );
  const value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
  if (evidence(value).state !== "available")
    throw Error("La imagen no tiene un formato válido.");
  return value;
}
function Correction({
  record,
  snapshot,
  onClose,
  onSaved,
}: {
  record: LegacyRecord;
  snapshot: LegacySnapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editableFields =
    snapshot.kind === "inspections" ? inspectionFields : affiliationFields;
  const [fields, setFields] = useState<Record<string, string>>(
    Object.fromEntries(
      editableFields.map(([key]) => [key, text(record.data[key])]),
    ),
  );
  const [reason, setReason] = useState("");
  const [replacementPhotos, setPhotos] = useState<string[] | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const fileBusy = useRef(false);
  const pending = useRef<LegacyCorrection | null>(null);
  const [receipt, setReceipt] = useState<number | null>(null);
  const [attempted, setAttempted] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function save() {
    if (fileBusy.current || receipt !== null) return;
    fileBusy.current = true;
    setBusy(true);
    setError("");
    try {
      if (!pending.current) {
        if (!reason.trim()) throw Error("Indica el motivo de la corrección.");
        const patch = Object.fromEntries(
          Object.entries(fields).filter(
            ([key, value]) => value !== text(record.data[key]),
          ),
        );
        if (replacementPhotos) patch.fotos = replacementPhotos.join("|");
        if (signature) patch.firma = signature;
        if (!Object.keys(patch).length)
          throw Error("No hay cambios para guardar.");
        const input = {
          hash: record.hash,
          expected: record.revision || 0,
          request: crypto.randomUUID(),
          patch,
          reason: reason.trim(),
        };
        if (new TextEncoder().encode(JSON.stringify(input)).length > 2900000)
          throw Error(
            "Las evidencias superan el límite total de 2,9 MB codificados. Selecciona archivos más pequeños; no se comprimen ni truncan.",
          );
        pending.current = input;
        setAttempted(true);
      }
      const result = await api().legacyCorrect(snapshot.kind, pending.current);
      if (mounted.current) setReceipt(result.revision);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      fileBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function loadImages(
    files: FileList | null,
    target: "photos" | "signature",
  ) {
    if (!files?.length || fileBusy.current) return;
    fileBusy.current = true;
    setBusy(true);
    setError("");
    setExported(false);
    try {
      if (
        files.length > 8 ||
        Array.from(files).reduce((sum, file) => sum + file.size, 0) > 6000000
      )
        throw Error(
          "Selecciona hasta 8 imágenes, con un máximo total de 6 MB.",
        );
      const values = await Promise.all(Array.from(files).map(readImage));
      if (target === "photos") setPhotos(values);
      else setSignature(values[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      fileBusy.current = false;
      setBusy(false);
    }
  }
  function exportProposal() {
    try {
      const proposal = correctionProposal(
        record,
        snapshot,
        fields,
        reason,
        replacementPhotos,
        signature,
      );
      download(
        JSON.stringify(proposal, null, 2),
        "propuesta-correccion.json",
        "application/json",
      );
      setExported(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <PanelSection
      title="Preparar corrección"
      description="Cada guardado crea una versión. El origen y las evidencias anteriores se conservan sin cambios."
    >
      <PanelNotice tone="warning">
        La corrección documental no concede consentimiento ni autoriza una
        firma. La aceptación contractual y su versión histórica se conservan sin
        alterar.
      </PanelNotice>
      <div className="enterprise-form-grid">
        {editableFields.map(([key, label]) => (
          <PanelField label={label} key={key}>
            <input
              disabled={busy || attempted}
              maxLength={2000}
              value={fields[key]}
              onChange={(event) => {
                setFields({ ...fields, [key]: event.target.value });
                setExported(false);
              }}
            />
          </PanelField>
        ))}
      </div>
      <PanelField label="Motivo de la corrección" required>
        <textarea
          disabled={busy || attempted}
          maxLength={2000}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setExported(false);
          }}
        />
      </PanelField>
      {snapshot.kind === "inspections" && (
        <>
          <PanelField label="Proponer reemplazo de fotos">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              disabled={busy || attempted}
              onChange={(event) =>
                void loadImages(event.target.files, "photos")
              }
            />
          </PanelField>
          <PanelField label="Proponer reemplazo de firma">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || attempted}
              onChange={(event) =>
                void loadImages(event.target.files, "signature")
              }
            />
          </PanelField>
        </>
      )}
      {replacementPhotos?.map((value, index) => (
        <Evidence
          key={index}
          value={value}
          label={`Foto propuesta ${index + 1}`}
        />
      ))}
      {signature && <Evidence value={signature} label="Firma propuesta" />}
      {error && <PanelNotice tone="danger">{error}</PanelNotice>}
      {exported && (
        <PanelNotice>
          Propuesta descargada. No se guardó ningún cambio en el sistema ni en
          el origen.
        </PanelNotice>
      )}
      {receipt !== null && (
        <PanelNotice>
          Versión {receipt} guardada y confirmada por el servidor. El original
          permanece intacto.
        </PanelNotice>
      )}
      {attempted && receipt === null && (
        <PanelNotice tone="warning">
          Intento {pending.current?.request}. Los datos permanecen fijos para
          reintentar sin duplicar. Si sales, consulta el historial antes de
          realizar otra corrección.
        </PanelNotice>
      )}
      <div className="legacy-actions">
        <PanelAction
          disabled={
            busy ||
            receipt !== null ||
            record.ambiguous ||
            record.unarchived ||
            snapshot.readOnly
          }
          onClick={() => void save()}
        >
          {attempted ? "Reintentar mismo guardado" : "Guardar nueva versión"}
        </PanelAction>
        {receipt !== null && (
          <PanelAction onClick={onSaved}>
            Ver expediente actualizado
          </PanelAction>
        )}
        <PanelAction disabled={busy || attempted} onClick={exportProposal}>
          Descargar propuesta sin guardar
        </PanelAction>
        <PanelAction
          tone="neutral"
          disabled={busy || attempted}
          onClick={() => {
            setPhotos(null);
            setSignature(null);
            setExported(false);
          }}
        >
          Conservar evidencias originales
        </PanelAction>
        <PanelAction tone="neutral" disabled={busy} onClick={onClose}>
          Cancelar borrador
        </PanelAction>
      </div>
    </PanelSection>
  );
}
function History({ kind, record }: { kind: LegacyKind; record: LegacyRecord }) {
  const [history, setHistory] = useState<LegacyHistory | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function exportVersion(revision: number) {
    setBusy(true);
    setError("");
    try {
      const result = await api().legacyHistory(kind, record.hash, revision);
      if (live.current)
        download(
          JSON.stringify(result, null, 2),
          `expediente-version-${revision}.json`,
          "application/json",
        );
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await api().legacyHistory(kind, record.hash);
      if (live.current)
        setHistory(r.versions[0] || { original: record.data, history: [] });
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <div>
      <PanelAction tone="neutral" disabled={busy} onClick={() => void load()}>
        Consultar historial y original
      </PanelAction>
      {error && <PanelNotice tone="danger">{error}</PanelNotice>}
      {history && (
        <>
          <PanelAction
            tone="neutral"
            onClick={() =>
              download(
                JSON.stringify(history, null, 2),
                "historial-expediente.json",
                "application/json",
              )
            }
          >
            Descargar original e índice de versiones
          </PanelAction>
          <p>
            El archivo contiene datos personales y evidencias. Cada versión se
            descarga por separado; no se verifica autenticidad de firmas.
          </p>
          {history.history.length === 0 ? (
            <p>Sin correcciones registradas.</p>
          ) : (
            <ol>
              {history.history.map((v) => (
                <li key={v.revision}>
                  Versión {v.revision} ·{" "}
                  {new Date(v.createdAt).toLocaleString("es-CO")} · {v.reason} ·
                  Usuario {v.actorId}
                  <PanelAction
                    tone="neutral"
                    disabled={busy}
                    onClick={() => void exportVersion(v.revision)}
                  >
                    Descargar versión {v.revision}
                  </PanelAction>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
export default function LegacyAdmin() {
  const [kind, setKind] = useState<LegacyKind>("inspections");
  const [snapshot, setSnapshot] = useState<LegacySnapshot | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [date, setDate] = useState(""),
    [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(20),
    [reload, setReload] = useState(0),
    [printing, setPrinting] = useState(false);
  const [syncing, setSyncing] = useState(false),
    [syncMessage, setSyncMessage] = useState("");
  const syncBusy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function syncSource() {
    if (syncBusy.current) return;
    syncBusy.current = true;
    setSyncing(true);
    setSyncMessage("");
    try {
      const result = await api().legacySync(kind);
      if (active.current) {
        setSyncMessage(
          result.busy
            ? "Hay una sincronización en curso. Se conserva la copia disponible."
            : result.throttled
              ? "Se consultó el origen hace menos de un minuto. Se conserva el estado de ese intento."
              : result.ok
                ? `Sincronización confirmada: ${result.added || 0} originales nuevos.`
                : "El origen no pudo sincronizarse. Se conserva la última copia verificada.",
        );
        setReload((v) => v + 1);
      }
    } catch (e) {
      if (active.current) {
        setSyncMessage((e as Error).message);
        setReload((v) => v + 1);
      }
    } finally {
      syncBusy.current = false;
      if (active.current) setSyncing(false);
    }
  }
  useEffect(() => {
    if (editing || selected || loading || syncing) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setReload((v) => v + 1);
    }, 60000);
    return () => clearInterval(id);
  }, [editing, selected, loading, syncing]);
  const generation = useRef(0);
  const printingRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    setLoading(true);
    setError("");
    setSnapshot(null);
    setSelected(null);
    setEditing(false);
    api()
      .legacyAdmin(kind, controller.signal)
      .then((data) => {
        if (current === generation.current && !controller.signal.aborted)
          setSnapshot(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted && current === generation.current)
          setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted && current === generation.current)
          setLoading(false);
      });
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [kind, reload]);
  const records = snapshot?.records || [];
  const rows = filterRecords(records, kind, query, date, status);
  const chosen = records.find((record) => record.id === selected);
  const today = dateKey(new Date().toISOString());
  function changeKind(next: LegacyKind) {
    if (next === kind) return;
    setSnapshot(null);
    setSelected(null);
    setEditing(false);
    setKind(next);
    setQuery("");
    setDate("");
    setStatus("");
    setLimit(20);
  }
  async function print(recordsToPrint: LegacyRecord[], detail: boolean) {
    if (!snapshot || printingRef.current) return;
    printingRef.current = true;
    setPrinting(true);
    setError("");
    try {
      await openPrint(snapshot, recordsToPrint, detail);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      printingRef.current = false;
      setPrinting(false);
    }
  }
  return (
    <div className="legacy-admin">
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">ADMINISTRACIÓN / EXPEDIENTES LEGACY</p>
          <h1>Inspecciones y vinculaciones</h1>
          <p>
            Consulta independiente de viajes, entregas y accesos de clientes.
          </p>
        </div>
      </div>
      <div className="legacy-actions" aria-label="Tipo de expediente">
        <PanelAction
          aria-pressed={kind === "inspections"}
          disabled={syncing}
          onClick={() => changeKind("inspections")}
        >
          Inspecciones
        </PanelAction>
        <PanelAction
          aria-pressed={kind === "affiliations"}
          disabled={syncing}
          onClick={() => changeKind("affiliations")}
        >
          Vinculaciones temporales
        </PanelAction>
        <PanelAction
          tone="neutral"
          disabled={loading || editing || syncing}
          onClick={() => setReload((value) => value + 1)}
        >
          Actualizar expedientes
        </PanelAction>
        <PanelAction
          tone="neutral"
          disabled={loading || editing || syncing}
          onClick={() => void syncSource()}
        >
          {syncing ? "Sincronizando origen…" : "Sincronizar origen"}
        </PanelAction>
      </div>
      {syncMessage && <PanelNotice>{syncMessage}</PanelNotice>}
      {loading && (
        <PanelNotice>Consultando expedientes autorizados…</PanelNotice>
      )}
      {error && <PanelNotice tone="danger">{error}</PanelNotice>}
      {!loading && !snapshot && !error && (
        <PanelEmpty title="Fuente no disponible" />
      )}
      {snapshot && (
        <>
          <PanelNotice
            tone={
              snapshot.sync?.error || snapshot.sync?.stale
                ? "warning"
                : undefined
            }
          >
            Copia conservada en Supabase · {records.length} expedientes.
            Consulta: {new Date(snapshot.capturedAt).toLocaleString("es-CO")}.
            {snapshot.sync && (
              <>
                <br />
                Última sincronización verificada:{" "}
                {snapshot.sync.lastSuccess
                  ? new Date(snapshot.sync.lastSuccess).toLocaleString("es-CO")
                  : "todavía no disponible"}
                . Automatizada cada {snapshot.sync.intervalMinutes} minutos.
                {snapshot.sync.lastAttempt && (
                  <>
                    {" "}
                    Último intento:{" "}
                    {new Date(snapshot.sync.lastAttempt).toLocaleString(
                      "es-CO",
                    )}
                    .
                  </>
                )}
                {snapshot.sync.error && (
                  <>
                    {" "}
                    El último intento falló ({snapshot.sync.error}); se muestra
                    la última copia verificada, que puede no incluir solicitudes
                    recientes.
                  </>
                )}
                {snapshot.sync.stale && !snapshot.sync.error && (
                  <>
                    {" "}
                    La copia tiene más de diez minutos o aún no se ha
                    verificado; puede haber solicitudes pendientes.
                  </>
                )}
              </>
            )}
            <br />
            Las correcciones conservan originales e historial. La hoja legacy no
            se modifica.
          </PanelNotice>
          {chosen ? (
            <>
              <PanelAction
                tone="neutral"
                onClick={() => {
                  setSelected(null);
                  setEditing(false);
                }}
              >
                Volver a expedientes
              </PanelAction>
              {editing ? (
                <Correction
                  key={chosen.id}
                  record={chosen}
                  snapshot={snapshot}
                  onClose={() => setEditing(false)}
                  onSaved={() => setReload((value) => value + 1)}
                />
              ) : (
                <PanelSection title="Detalle del expediente">
                  <div className="legacy-actions">
                    <PanelAction
                      disabled={printing}
                      onClick={() => void print([chosen], true)}
                    >
                      Imprimir copia / guardar PDF
                    </PanelAction>
                    {
                      <PanelAction
                        tone="neutral"
                        disabled={
                          syncing ||
                          chosen.ambiguous ||
                          chosen.unarchived ||
                          snapshot.readOnly
                        }
                        onClick={() => setEditing(true)}
                      >
                        Preparar corrección
                      </PanelAction>
                    }
                  </div>
                  <PanelNotice>
                    Versión {chosen.revision || 0} ·{" "}
                    {chosen.archived
                      ? "El contenido original ya no coincide con el origen actual; se conserva este expediente histórico por separado."
                      : "Vinculado al contenido original por SHA-256."}
                  </PanelNotice>
                  {chosen.unarchived && (
                    <PanelNotice tone="warning">
                      Este contenido nuevo de la fuente aún no tiene una copia
                      íntegra archivada. La sincronización administrativa debe
                      conservarlo antes de editar.
                    </PanelNotice>
                  )}
                  {chosen.ambiguous && (
                    <PanelNotice tone="warning">
                      Hay duplicados idénticos en el origen. La edición requiere
                      reconciliarlos.
                    </PanelNotice>
                  )}
                  <History key={chosen.id} kind={kind} record={chosen} />
                  <dl className="detail-grid">
                    {Object.entries(chosen.data)
                      .filter(
                        ([key]) =>
                          !["items", "fotos", "firma", "firmaB64"].includes(
                            key,
                          ),
                      )
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt>
                            {inspectionFields.find(
                              ([field]) => field === key,
                            )?.[1] || key}
                          </dt>
                          <dd>{text(value) || "No informado"}</dd>
                        </div>
                      ))}
                  </dl>
                  {kind === "inspections" ? (
                    <>
                      <h3>Checklist original</h3>
                      {checklist(chosen.data.items).valid ? (
                        <PanelTableFrame label="Ítems de inspección">
                          <table>
                            <thead>
                              <tr>
                                <th>Ítem</th>
                                <th>Escala</th>
                                <th>Valor</th>
                                <th>Observación</th>
                              </tr>
                            </thead>
                            <tbody>
                              {checklist(chosen.data.items).items.map(
                                (item, index) => (
                                  <tr key={index}>
                                    <td>{item.label}</td>
                                    <td>{item.scale || "No informada"}</td>
                                    <td>{item.value}</td>
                                    <td>{item.obs || "Sin observación"}</td>
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </PanelTableFrame>
                      ) : (
                        <PanelNotice tone="warning">
                          Checklist ausente o no interpretable. No se clasifica
                          como conforme.
                        </PanelNotice>
                      )}
                      <details>
                        <summary>Texto original del checklist</summary>
                        <pre>{text(chosen.data.items) || "No informado"}</pre>
                      </details>
                      <h3>Evidencias</h3>
                      {photos(chosen).length ? (
                        photos(chosen).map((value, index) => (
                          <Evidence
                            key={chosen.id + index}
                            value={value}
                            label={`Foto ${index + 1}`}
                          />
                        ))
                      ) : (
                        <p>No hay fotos informadas.</p>
                      )}
                      <Evidence
                        key={chosen.id + "signature"}
                        value={chosen.data.firma}
                        label="Firma del conductor"
                      />
                      <PanelNotice tone="warning">
                        La copia no es un certificado de aprobación. La emisión
                        con firma del supervisor está pendiente de autorización.
                      </PanelNotice>
                    </>
                  ) : (
                    <>
                      <Evidence
                        key={chosen.id}
                        value={chosen.data.firmaB64}
                        label="Firma registrada"
                      />
                      <PanelNotice tone="warning">
                        La aceptación y versión son valores del origen. Falta
                        verificar el documento contractual correspondiente; no
                        se reconstruye un contrato histórico con el texto actual
                        ni se otorga acceso operativo.
                      </PanelNotice>
                    </>
                  )}
                  <details>
                    <summary>Procedencia y huellas de consulta</summary>
                    <p>Origen: {snapshot.source}</p>
                    <p>Snapshot: {snapshot.snapshot}</p>
                    <p>Registro: {chosen.hash}</p>
                    <p>
                      La fila solo identifica su posición en esta consulta, no
                      una identidad permanente.
                    </p>
                  </details>
                </PanelSection>
              )}
            </>
          ) : (
            <>
              <div className="inc-metrics">
                <div className="inc-metric">
                  <span>Registros consultados</span>
                  <strong>{records.length}</strong>
                </div>
                <div className="inc-metric">
                  <span>Recibidos hoy · Bogotá</span>
                  <strong>
                    {
                      records.filter(
                        (record) => dateKey(record.data.ts) === today,
                      ).length
                    }
                  </strong>
                </div>
                {kind === "inspections" && (
                  <>
                    <div className="inc-metric">
                      <span>Con ítems MALO</span>
                      <strong>
                        {
                          records.filter(
                            (record) => inspectionStatus(record) === "bad",
                          ).length
                        }
                      </strong>
                    </div>
                    <div className="inc-metric">
                      <span>Placas distintas informadas</span>
                      <strong>
                        {
                          new Set(
                            records
                              .map((record) => text(record.data.placa))
                              .filter(Boolean),
                          ).size
                        }
                      </strong>
                    </div>
                  </>
                )}
              </div>
              <p className="control-muted">
                {records.filter((record) => !dateKey(record.data.ts)).length}{" "}
                fechas de recepción no interpretables; no se incluyen en «hoy».
              </p>
              <PanelSection
                title={
                  kind === "inspections"
                    ? "Inspecciones registradas"
                    : "Solicitudes de vinculación temporal"
                }
              >
                <div className="board-toolbar">
                  <PanelField label="Buscar expedientes">
                    <input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setLimit(20);
                      }}
                      placeholder={
                        kind === "inspections"
                          ? "Placa, conductor o ciudad"
                          : "Nombre, identificación o correo"
                      }
                    />
                  </PanelField>
                  <PanelField
                    label={
                      kind === "inspections"
                        ? "Fecha de inspección"
                        : "Fecha de recepción"
                    }
                  >
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => {
                        setDate(event.target.value);
                        setLimit(20);
                      }}
                    />
                  </PanelField>
                  <PanelField label="Estado de expediente">
                    <select
                      aria-label="Estado de expediente"
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value);
                        setLimit(20);
                      }}
                    >
                      <option value="">Todos</option>
                      {kind === "inspections" ? (
                        Object.entries(statusLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="SI">Aceptación SI registrada</option>
                          <option value="NO">Aceptación NO registrada</option>
                        </>
                      )}
                    </select>
                  </PanelField>
                  <PanelAction
                    tone="neutral"
                    onClick={() => {
                      setQuery("");
                      setDate("");
                      setStatus("");
                      setLimit(20);
                    }}
                  >
                    Limpiar búsqueda
                  </PanelAction>
                </div>
                <p role="status">
                  {rows.length} coincidencias · {Math.min(limit, rows.length)}{" "}
                  visibles
                </p>
                {kind === "inspections" && (
                  <div className="legacy-actions">
                    <PanelAction
                      tone="neutral"
                      disabled={!records.length}
                      onClick={() =>
                        download(
                          inspectionCsv(records),
                          "inspecciones-consultadas.csv",
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      CSV de todo lo consultado
                    </PanelAction>
                    <PanelAction
                      tone="neutral"
                      disabled={!rows.length}
                      onClick={() =>
                        download(
                          inspectionCsv(rows),
                          "inspecciones-filtradas.csv",
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      CSV filtrado
                    </PanelAction>
                    <PanelAction
                      tone="neutral"
                      disabled={!records.length || printing}
                      onClick={() => void print(records, false)}
                    >
                      Imprimir listado completo / PDF
                    </PanelAction>
                  </div>
                )}
                {!rows.length ? (
                  <PanelEmpty
                    title={
                      records.length
                        ? "Sin coincidencias"
                        : "No hay expedientes en la fuente consultada"
                    }
                    description="No se muestran datos de demostración ni se infiere ausencia de registros si falla la consulta."
                  />
                ) : (
                  <PanelTableFrame
                    label="Expedientes legacy"
                    className="financial-table"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>
                            {kind === "inspections"
                              ? "Placa / conductor"
                              : "Identificación / nombre"}
                          </th>
                          <th>
                            {kind === "inspections"
                              ? "Vehículo / ciudad"
                              : "Tipo / correo"}
                          </th>
                          <th>Estado</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, limit).map((record) => (
                          <tr key={record.id}>
                            <td data-label="Fecha">
                              {text(
                                kind === "inspections"
                                  ? record.data.fecha
                                  : record.data.ts,
                              ) || "No informada"}
                            </td>
                            <td data-label="Identificación">
                              {text(
                                kind === "inspections"
                                  ? record.data.placa
                                  : record.data.numeroIdentificacion,
                              ) || "No informada"}
                              <small>
                                {text(
                                  kind === "inspections"
                                    ? record.data.conductor
                                    : record.data.nombreCompleto,
                                )}
                              </small>
                            </td>
                            <td data-label="Contexto">
                              {text(
                                kind === "inspections"
                                  ? record.data.claseVehiculo
                                  : record.data.tipoVinculacion,
                              )}
                              <small>
                                {text(
                                  kind === "inspections"
                                    ? record.data.ciudad
                                    : record.data.correoElectronico,
                                )}
                              </small>
                            </td>
                            <td data-label="Estado">
                              {kind === "inspections" ? (
                                statusLabels[inspectionStatus(record)]
                              ) : (
                                <>
                                  Aceptación:{" "}
                                  {text(record.data.aceptaContrato) ||
                                    "No informada"}
                                  <small>
                                    Firma:{" "}
                                    {
                                      evidenceLabels[
                                        evidence(record.data.firmaB64).state
                                      ]
                                    }
                                  </small>
                                </>
                              )}
                            </td>
                            <td data-label="Acción">
                              <PanelAction
                                tone="neutral"
                                onClick={() => setSelected(record.id)}
                              >
                                Ver expediente
                              </PanelAction>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PanelTableFrame>
                )}
                {rows.length > limit && (
                  <PanelAction
                    tone="neutral"
                    onClick={() => setLimit((value) => value + 20)}
                  >
                    Mostrar 20 más
                  </PanelAction>
                )}
              </PanelSection>
            </>
          )}
        </>
      )}
    </div>
  );
}
