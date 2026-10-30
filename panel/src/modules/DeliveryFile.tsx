import { useEffect, useState } from "react";
import { api, type DeliveryDetail } from "../api";
import type { Delivery, Trip } from "../model";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelSection,
  PanelStatus,
} from "../components/PanelPrimitives";
export default function DeliveryFile({
  delivery,
  trip,
  onClose,
}: {
  delivery: Delivery;
  trip?: Trip;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(""),
    [proof, setProof] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    api()
      .detail(delivery.id)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((e) => {
        if (active) {
          setDetail(null);
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [delivery.id, version]);
  useEffect(
    () => () => {
      if (proof) URL.revokeObjectURL(proof);
    },
    [proof],
  );
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">EXPEDIENTE DEL ENVÍO</p>
          <h1>{delivery.remittance_reference || delivery.customer_name}</h1>
          <p>{delivery.customer_name}</p>
        </div>
        <PanelAction tone="neutral" onClick={onClose}>
          Volver al Kanban
        </PanelAction>
      </div>
      {error && (
        <PanelNotice tone="danger">
          {error}
          <PanelAction
            tone="neutral"
            onClick={() => {
              setError("");
              setVersion((v) => v + 1);
            }}
          >
            Reintentar consulta
          </PanelAction>
        </PanelNotice>
      )}
      <div className="enterprise-columns">
        <PanelSection title="Carga y recorrido">
          <dl className="detail-grid">
            {[
              ["Estado", delivery.status],
              ["Origen", delivery.origin_text],
              ["Destino", delivery.destination_text],
              ["Carga", delivery.cargo_description],
              ["Bultos", delivery.package_count],
              ["Peso (kg)", delivery.gross_weight_kg],
              ["Viaje", trip?.route_label],
              ["Vehículo", trip?.vehicle_plate],
              ["Fecha", trip?.scheduled_date],
              ["Factura referenciada", delivery.invoice_reference],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value ?? "Sin registrar"}</dd>
              </div>
            ))}
          </dl>
        </PanelSection>
        <PanelSection title="Historial de la entrega">
          {!detail && !error ? (
            <p>Cargando historial…</p>
          ) : detail?.events.length ? (
            <ol className="event-timeline">
              {detail.events.map((e) => (
                <li key={e.id}>
                  <PanelStatus>
                    {{
                      created: "Envío registrado",
                      in_transit: "En ruta",
                      exception: "Novedad",
                      delivered: "Entregada",
                    }[e.event_type] || "Evento registrado"}
                  </PanelStatus>
                  <time>{new Date(e.occurred_at).toLocaleString("es-CO")}</time>
                  <p>{e.note}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p>No hay eventos disponibles.</p>
          )}
        </PanelSection>
      </div>
      <div className="enterprise-columns">
        <PanelSection title="Comprobante de entrega">
          {!detail ? (
            <p>
              {error
                ? "No se pudo comprobar el soporte."
                : "Consultando comprobante…"}
            </p>
          ) : detail.proof ? (
            <>
              <p>
                Recibió: <strong>{detail.proof.receiver_name}</strong>
              </p>
              <p>
                {new Date(detail.proof.captured_at).toLocaleString("es-CO")}
              </p>
              <p>{detail.proof.observation}</p>
              <PanelAction
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    setProof(
                      URL.createObjectURL(await api().proof(delivery.id)),
                    ),
                  )
                }
              >
                Consultar comprobante
              </PanelAction>
              {proof && (
                <img
                  src={proof}
                  className="delivery-proof"
                  alt="Comprobante de la entrega"
                />
              )}
            </>
          ) : (
            <p>
              No hay comprobante registrado. La confirmación se realiza desde el
              acceso del conductor asignado.
            </p>
          )}
        </PanelSection>
        <PanelSection title="Enlaces limitados de seguimiento">
          <p>
            El enlace dura 72 horas. No se envían mensajes desde esta acción.
          </p>
          <PanelAction
            disabled={busy}
            onClick={() =>
              void act(async () => setLink(await api().tracking(delivery.id)))
            }
          >
            Crear enlace limitado
          </PanelAction>
          {link && (
            <PanelField label="Enlace creado">
              <input value={link} readOnly onFocus={(e) => e.target.select()} />
            </PanelField>
          )}
          {detail?.links
            .filter((l) => !l.revoked_at)
            .map((l) => (
              <div key={l.id} className="tracking-row">
                <span>
                  Vence {new Date(l.expires_at).toLocaleString("es-CO")}
                </span>
                <PanelAction
                  tone="danger"
                  disabled={busy}
                  onClick={() => void act(() => api().revokeTracking(l.id))}
                >
                  Revocar enlace
                </PanelAction>
              </div>
            ))}
        </PanelSection>
      </div>
    </>
  );
}
