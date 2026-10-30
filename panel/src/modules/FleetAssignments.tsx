import { useState } from "react";
import type { Snapshot } from "../model";
import {
  PanelField,
  PanelSection,
  PanelStatus,
  PanelTableFrame,
} from "../components/PanelPrimitives";

/** Reads the existing authorized trips and driver memberships; no inferred vehicle identity or availability. */
export default function FleetAssignments({ state }: { state: Snapshot }) {
  const [query, setQuery] = useState("");
  const trips = state.trips.filter((t) =>
    [t.vehicle_plate, t.route_label, t.driver_user_id || ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">OPERACIÓN / RECURSOS ASIGNADOS</p>
          <h1>Vehículos y conductores</h1>
          <p>
            Placas y conductores registrados en viajes. Consulta las
            asignaciones en Viajes y asignación para modificarlas.
          </p>
        </div>
      </div>
      <PanelField label="Buscar placa, ruta o identificador de conductor">
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </PanelField>
      <PanelSection
        title="Asignaciones registradas"
        description="La placa identifica lo informado en cada viaje; esta vista no certifica disponibilidad, propiedad ni vigencia documental."
      >
        <PanelTableFrame
          label="Vehículos y conductores por viaje"
          className="financial-table"
        >
          <table>
            <thead>
              <tr>
                <th>Placa informada</th>
                <th>Viaje / fecha</th>
                <th>Conductor</th>
                <th>Entregas</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id}>
                  <td data-label="Placa informada">{t.vehicle_plate}</td>
                  <td data-label="Viaje / fecha">
                    {t.route_label}
                    <small>{t.scheduled_date}</small>
                  </td>
                  <td data-label="Conductor">
                    {t.driver_user_id || "Sin asignar"}
                  </td>
                  <td data-label="Entregas">
                    {state.deliveries.filter((d) => d.trip_id === t.id).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PanelTableFrame>
        {!trips.length && <p>No hay viajes que coincidan.</p>}
      </PanelSection>
      <PanelSection
        title="Accesos de conductor existentes"
        description="Identificadores autorizados por el sistema actual. Un acceso no acredita disponibilidad ni habilitación de un vehículo."
      >
        {(state.drivers || []).map((d) => (
          <article className="allocation" key={d.user_id}>
            <p>{d.user_id}</p>
            <PanelStatus>
              {state.trips.filter((t) => t.driver_user_id === d.user_id).length}{" "}
              viajes registrados
            </PanelStatus>
          </article>
        ))}
        {!state.drivers?.length && (
          <p>No hay accesos de conductor en la consulta autorizada.</p>
        )}
      </PanelSection>
    </>
  );
}
