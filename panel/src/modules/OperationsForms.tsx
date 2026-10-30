import { useState, useRef, type FormEvent } from "react";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelSection,
  PanelStatus,
  PanelTableFrame,
} from "../components/PanelPrimitives";
import { api } from "../api";
import type { Snapshot } from "../model";
export function ActionForm({
  children,
  onSubmit,
  submit = "Guardar",
  onSaved,
}: {
  children: React.ReactNode;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  submit?: string;
  onSaved?: () => void;
}) {
  const requestId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setMessage("");
    try {
      await onSubmit({
        ...Object.fromEntries(new FormData(form)),
        request_id: requestId.current,
      } as Record<string, string>);
      requestId.current = crypto.randomUUID();
      form.reset();
      setError(false);
      setMessage("Guardado y confirmado por el servidor.");
      onSaved?.();
    } catch (e) {
      setError(true);
      setMessage(
        (e as Error).message +
          " Si se interrumpió la conexión, actualiza los datos antes de volver a crear el registro.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="enterprise-form" onSubmit={save}>
      <fieldset disabled={busy}>
        {children}
        <PanelAction type="submit">{busy ? "Guardando…" : submit}</PanelAction>
      </fieldset>
      {message && (
        <PanelNotice tone={error ? "danger" : "success"}>{message}</PanelNotice>
      )}
    </form>
  );
}
export function TripModule({ state }: { state: Snapshot }) {
  const [selected, setSelected] = useState("");
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">DESPACHO</p>
          <h1>Viajes y asignaciones</h1>
          <p>Ruta, programación, vehículo y conductor de cada operación.</p>
        </div>
      </div>
      <div className="enterprise-columns">
        <PanelSection title="Viajes registrados">
          <PanelTableFrame label="Viajes">
            <table>
              <thead>
                <tr>
                  <th>Ruta / fecha</th>
                  <th>Vehículo</th>
                  <th>Asignación</th>
                  <th>Gestión</th>
                </tr>
              </thead>
              <tbody>
                {state.trips.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.route_label}</strong>
                      <small>{t.scheduled_date}</small>
                    </td>
                    <td>{t.vehicle_plate}</td>
                    <td>
                      <PanelStatus
                        tone={t.driver_user_id ? "success" : "warning"}
                      >
                        {t.driver_user_id ? "Asignado" : "Sin conductor"}
                      </PanelStatus>
                    </td>
                    <td>
                      <PanelAction
                        tone="neutral"
                        onClick={() => setSelected(t.id)}
                      >
                        Asignar conductor
                      </PanelAction>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelTableFrame>
          {!state.trips.length && <p>No hay viajes registrados.</p>}
          {selected && (
            <ActionForm
              key={selected}
              submit="Guardar asignación"
              onSubmit={(v) => api().assignTrip(selected, v.driver)}
            >
              <PanelField label="Conductor">
                <select
                  name="driver"
                  defaultValue={
                    state.trips.find((t) => t.id === selected)
                      ?.driver_user_id || ""
                  }
                >
                  <option value="">Sin asignar</option>
                  {state.drivers?.map((d) => (
                    <option key={d.user_id} value={d.user_id}>
                      {d.user_id}
                    </option>
                  ))}
                </select>
              </PanelField>
            </ActionForm>
          )}
        </PanelSection>
        <PanelSection title="Crear viaje">
          <ActionForm
            submit="Crear viaje"
            onSubmit={(v) =>
              api().createTrip({
                request_id: v.request_id,
                route_label: v.route,
                scheduled_date: v.date,
                vehicle_plate: v.vehicle,
                driver_user_id: v.driver,
              })
            }
          >
            <PanelField label="Ruta" required>
              <input name="route" required maxLength={100} />
            </PanelField>
            <PanelField label="Fecha programada" required>
              <input name="date" type="date" required />
            </PanelField>
            <PanelField label="Placa del vehículo" required>
              <input name="vehicle" required maxLength={20} />
            </PanelField>
            <PanelField label="Conductor">
              <select name="driver">
                <option value="">Sin asignar</option>
                {state.drivers?.map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {d.user_id}
                  </option>
                ))}
              </select>
            </PanelField>
          </ActionForm>
        </PanelSection>
      </div>
    </>
  );
}
export function NewDelivery({
  state,
  onSaved,
}: {
  state: Snapshot;
  onSaved: () => void;
}) {
  return (
    <PanelSection
      title="Nueva entrega"
      description="Registra la ejecución de un envío en un viaje existente."
    >
      <ActionForm
        submit="Crear entrega"
        onSaved={onSaved}
        onSubmit={(v) =>
          api().createDelivery({
            request_id: v.request_id,
            trip_id: v.trip,
            customer_name: v.customer,
            destination_text: v.destination,
            invoice_reference: v.invoice,
            remittance_reference: v.remittance,
            origin_text: v.origin,
            cargo_description: v.cargo,
            package_count: v.packages ? Number(v.packages) : undefined,
            gross_weight_kg: v.weight ? Number(v.weight) : undefined,
          })
        }
      >
        <div className="enterprise-form-grid">
          <PanelField label="Viaje" required>
            <select name="trip" required>
              <option value="">Selecciona un viaje</option>
              {state.trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.route_label} · {t.scheduled_date}
                </option>
              ))}
            </select>
          </PanelField>
          <PanelField
            label="Nombre del cliente"
            required
            hint="La cuenta comercial se vincula por separado tras verificar su identidad."
          >
            <input name="customer" required maxLength={120} />
          </PanelField>
          <PanelField label="Origen">
            <input name="origin" maxLength={200} />
          </PanelField>
          <PanelField label="Destino">
            <input name="destination" maxLength={200} />
          </PanelField>
          <PanelField label="Remesa">
            <input name="remittance" maxLength={80} />
          </PanelField>
          <PanelField label="Referencia de factura">
            <input name="invoice" maxLength={80} />
          </PanelField>
          <PanelField label="Bultos">
            <input
              name="packages"
              type="number"
              min="1"
              max="2147483647"
              step="1"
            />
          </PanelField>
          <PanelField label="Peso bruto (kg)">
            <input
              name="weight"
              type="number"
              min="0.001"
              max="999999999.999"
              step="0.001"
            />
          </PanelField>
          <PanelField label="Descripción de la carga">
            <textarea name="cargo" maxLength={500} />
          </PanelField>
        </div>
      </ActionForm>
    </PanelSection>
  );
}
