import { useState } from "react";
import type { Snapshot } from "../model";
import { statuses } from "../model";
import { routeReference } from "../lib/route-reference";
import { colombiaOutline } from "../lib/colombia-reference";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelStatus,
} from "../components/PanelPrimitives";
export default function RouteMap({
  state,
  onOpen,
  autoRefresh,
  onAutoRefresh,
  refreshing,
}: {
  state: Snapshot;
  onOpen: (id: string) => void;
  autoRefresh: boolean;
  onAutoRefresh: (value: boolean) => void;
  refreshing: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const rows = state.deliveries
    .filter((d) => d.status !== "delivered")
    .filter((d) =>
      [d.customer_name, d.remittance_reference, d.destination_text]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  const delivery = rows.find((d) => d.id === selected) || rows[0];
  const trip = state.trips.find((t) => t.id === delivery?.trip_id);
  const route: ReturnType<typeof routeReference> = delivery
    ? routeReference(delivery, trip)
    : { origin: undefined, destination: undefined };
  const mappable = rows.filter((d) => {
    const r = routeReference(
      d,
      state.trips.find((t) => t.id === d.trip_id),
    );
    return r.origin && r.destination;
  }).length;
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">DESPACHO / VISTA GEOGRÁFICA</p>
          <h1>Mapa de recorridos</h1>
          <p>
            Relaciona los envíos activos con las ciudades informadas en su
            recorrido.
          </p>
        </div>
      </div>
      <div className="map-freshness">
        <label className="check-field">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => onAutoRefresh(e.target.checked)}
          />
          Actualizar estados cada minuto
        </label>
        <span>
          {refreshing
            ? "Consultando…"
            : state.updatedAt
              ? "Consulta correcta: " +
                new Date(state.updatedAt).toLocaleString("es-CO")
              : "Sin consulta confirmada"}
        </span>
      </div>
      <PanelNotice>
        Referencia entre ciudades, no posición GPS ni ruta por carretera. Los
        estados provienen de los registros operativos; no hay telemetría
        vehicular conectada.
      </PanelNotice>
      <div className="route-map-layout">
        <section className="route-map-list" aria-label="Envíos del mapa">
          <PanelField label="Buscar en el mapa">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cliente, remesa o destino"
            />
          </PanelField>
          <p>
            {rows.length} envíos activos · {mappable} recorridos identificables
          </p>
          {rows.map((d) => (
            <button
              key={d.id}
              className="route-choice"
              aria-pressed={delivery?.id === d.id}
              onClick={() => setSelected(d.id)}
            >
              <strong>{d.remittance_reference || d.customer_name}</strong>
              <span>{d.customer_name}</span>
              <small>
                {statuses.find(([key]) => key === d.status)?.[1] || d.status}
              </small>
            </button>
          ))}
          {!rows.length && <p>No hay envíos activos para esta consulta.</p>}
        </section>
        <section
          className="route-map-canvas"
          aria-label="Referencia geográfica de Colombia"
        >
          <svg
            viewBox="0 0 600 720"
            role="img"
            aria-label={
              route.origin && route.destination
                ? `Referencia entre ${route.origin.name} y ${route.destination.name}, no ubicación GPS`
                : "Colombia: recorrido sin coordenadas identificables"
            }
          >
            <rect width="600" height="720" fill="#eaf0ee" />
            <path
              d={colombiaOutline}
              fill="#fffdf3"
              stroke="#a2b5a7"
              strokeWidth="2"
            />
            <text x="45" y="48" fill="#526d65" fontSize="15" letterSpacing="3">
              COLOMBIA
            </text>
            {route.origin && route.destination && (
              <path
                d={`M${route.origin.x},${route.origin.y} L${route.destination.x},${route.destination.y}`}
                stroke="#ad8510"
                strokeWidth="3"
                strokeDasharray="8 7"
                fill="none"
              />
            )}
            {[route.origin, route.destination].map(
              (city, i) =>
                city && (
                  <g key={i}>
                    <circle
                      cx={city.x}
                      cy={city.y}
                      r="10"
                      fill={i ? "#d5a817" : "#142927"}
                      stroke="white"
                      strokeWidth="3"
                    />
                    <text
                      x={city.x + 14}
                      y={city.y + (i ? 23 : -13)}
                      fontSize="16"
                      fill="#142927"
                      paintOrder="stroke"
                      stroke="#fffdf3"
                      strokeWidth="4"
                    >
                      {i ? "Destino: " : "Origen: "}
                      {city.name}
                    </text>
                  </g>
                ),
            )}
          </svg>
          <div className="route-map-caption">
            <small>
              Cartografía: Natural Earth · referencia generalizada. Sin
              consultas a proveedores externos.
            </small>
          </div>
        </section>
        {delivery && (
          <section className="route-map-detail">
            <PanelStatus>
              {statuses.find(([key]) => key === delivery.status)?.[1] ||
                delivery.status}
            </PanelStatus>
            <h2>{delivery.customer_name}</h2>
            <p>
              {delivery.origin_text ||
                trip?.route_label ||
                "Origen sin registrar"}{" "}
              → {delivery.destination_text || "Destino sin registrar"}
            </p>
            <p>
              Viaje: {trip?.route_label || "No disponible"} ·{" "}
              {trip?.scheduled_date}
            </p>
            {(!route.origin || !route.destination) && (
              <p>
                No se reconocen ambas ciudades en la referencia local. No se
                estimó la ubicación a partir de una dirección.
              </p>
            )}
            <PanelAction onClick={() => onOpen(delivery.id)}>
              Abrir expediente del envío
            </PanelAction>
          </section>
        )}
      </div>
    </>
  );
}
