import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  PanelAction,
  PanelField,
  PanelStatus,
  PanelNotice,
} from "../components/PanelPrimitives";
import KanbanSortControl from "../components/KanbanSortControl";
import { sortKanbanOrders, type KanbanSort } from "../lib/kanban-sort";
import { statuses, type Delivery, type Trip } from "../model";
import { api } from "../api";
// Column composition, per-column sort/soft cap and DnD pattern adapted from Xtreme KanbanBoard.
export function allowedShipmentMove(from: string, to: string) {
  return from === "pending" && to === "in_transit";
}
function Card({
  item,
  trip,
  busy,
  onOpen,
  onStart,
}: {
  item: Delivery;
  trip?: Trip;
  busy: boolean;
  onOpen: () => void;
  onStart: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: item.id, disabled: busy || item.status !== "pending" });
  return (
    <article
      ref={setNodeRef}
      className="shipment-card"
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div className="shipment-card-top">
        <span>{item.remittance_reference || "Sin remesa"}</span>
        {item.status === "pending" && (
          <button
            {...attributes}
            {...listeners}
            className="drag-handle"
            aria-label={
              "Mover envío " + (item.remittance_reference || item.customer_name)
            }
            title="Mover a En ruta"
          >
            ⠿
          </button>
        )}
      </div>
      <button className="shipment-title" onClick={onOpen}>
        {item.customer_name}
      </button>
      <p>
        {item.origin_text || "Origen sin registrar"}{" "}
        <span aria-hidden="true">→</span>{" "}
        {item.destination_text || "Destino sin registrar"}
      </p>
      <p className="shipment-cargo">
        {item.cargo_description || "Sin descripción de carga"}
      </p>
      <div className="shipment-trip">
        <span>{trip?.route_label || "Viaje no disponible"}</span>
        <small>
          {trip?.scheduled_date} · {trip?.vehicle_plate}
        </small>
        <small>
          {trip?.driver_user_id
            ? "Conductor asignado"
            : "Sin conductor asignado"}
        </small>
      </div>
      <div className="shipment-actions">
        <PanelAction tone="neutral" onClick={onOpen}>
          Abrir expediente
        </PanelAction>
        {item.status === "pending" && (
          <PanelAction disabled={busy} onClick={onStart}>
            Registrar salida
          </PanelAction>
        )}
      </div>
    </article>
  );
}
function Column({
  status,
  label,
  items,
  trips,
  busy,
  onOpen,
  onStart,
}: {
  status: string;
  label: string;
  items: Delivery[];
  trips: Trip[];
  busy: boolean;
  onOpen: (id: string) => void;
  onStart: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    disabled: status !== "in_transit" || busy,
  });
  const [expanded, setExpanded] = useState(false),
    [sort, setSort] = useState<KanbanSort>("default");
  const sorted = useMemo(() => sortKanbanOrders(items, sort), [items, sort]);
  return (
    <section className={"shipment-column status-column-" + status}>
      <header>
        <h2>{label}</h2>
        <div>
          <PanelStatus>{items.length}</PanelStatus>
          <KanbanSortControl label={label} value={sort} onChange={setSort} />
        </div>
      </header>
      <div
        ref={setNodeRef}
        className={"shipment-column-body" + (isOver ? " is-over" : "")}
      >
        {(expanded ? sorted : sorted.slice(0, 50)).map((item) => (
          <Card
            key={item.id}
            item={item}
            trip={trips.find((t) => t.id === item.trip_id)}
            busy={busy}
            onOpen={() => onOpen(item.id)}
            onStart={() => onStart(item.id)}
          />
        ))}
        {!items.length && (
          <p className="shipment-empty">Sin envíos en esta columna</p>
        )}
        {items.length > 50 && (
          <PanelAction tone="neutral" onClick={() => setExpanded(!expanded)}>
            {expanded ? "Colapsar" : `Ver ${items.length - 50} más`}
          </PanelAction>
        )}
      </div>
    </section>
  );
}
export default function ShipmentKanban({
  deliveries,
  trips,
  onOpen,
  onNew,
}: {
  deliveries: Delivery[];
  trips: Trip[];
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [listView, setListView] = useState(
    () => window.matchMedia("(max-width:750px)").matches,
  );
  const [query, setQuery] = useState(""),
    [trip, setTrip] = useState(""),
    [includeDelivered, setIncludeDelivered] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const filtered = deliveries.filter(
    (d) =>
      (!trip || d.trip_id === trip) &&
      [
        d.customer_name,
        d.destination_text,
        d.remittance_reference,
        d.invoice_reference,
      ]
        .join(" ")
        .toLocaleLowerCase("es")
        .includes(query.toLocaleLowerCase("es")),
  );
  function move(event: DragEndEvent) {
    const item = deliveries.find((d) => d.id === event.active.id);
    if (!item || !event.over || event.over.id === item.status) return;
    if (allowedShipmentMove(item.status, String(event.over.id)))
      setPending(item.id);
    else
      setError(
        "Ese cambio requiere su proceso operativo. La entrega se confirma desde el acceso del conductor con comprobante.",
      );
  }
  async function confirm() {
    if (!pending || busy) return;
    setBusy(true);
    setError("");
    try {
      await api().startDelivery(pending);
      setPending(null);
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
          <p className="efo-eyebrow">OPERACIÓN / KANBAN</p>
          <h1>Envíos activos</h1>
          <p>Estado real de las entregas asignadas a un viaje.</p>
        </div>
        <PanelAction onClick={onNew}>+ Nueva entrega</PanelAction>
      </div>
      <div className="board-toolbar">
        <PanelAction tone="neutral" onClick={() => setListView((v) => !v)}>
          {listView ? "Vista de tablero" : "Vista de lista"}
        </PanelAction>
        <PanelField label="Buscar envío">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cliente, remesa, factura o destino"
            type="search"
          />
        </PanelField>
        <PanelField label="Viaje">
          <select value={trip} onChange={(e) => setTrip(e.target.value)}>
            <option value="">Todos los viajes</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.route_label} · {t.scheduled_date}
              </option>
            ))}
          </select>
        </PanelField>
        <label className="check-field">
          <input
            type="checkbox"
            checked={includeDelivered}
            onChange={(e) => setIncludeDelivered(e.target.checked)}
          />
          Incluir entregadas
        </label>
      </div>
      {error && <PanelNotice tone="danger">{error}</PanelNotice>}
      {pending && (
        <section className="movement-confirm" aria-label="Confirmar salida">
          <h2>Registrar salida a ruta</h2>
          <p>
            Se guardará el evento de salida de{" "}
            {deliveries.find((d) => d.id === pending)?.customer_name}. El
            tablero cambiará cuando el servidor confirme.
          </p>
          <PanelAction disabled={busy} onClick={() => void confirm()}>
            {busy ? "Registrando…" : "Confirmar salida"}
          </PanelAction>
          <PanelAction
            disabled={busy}
            tone="neutral"
            onClick={() => setPending(null)}
          >
            Cancelar
          </PanelAction>
        </section>
      )}
      <DndContext sensors={sensors} onDragEnd={move}>
        <div
          className={"shipment-board" + (listView ? " shipment-list" : "")}
          tabIndex={0}
          role="region"
          aria-label="Kanban de envíos"
        >
          {statuses
            .filter(([key]) => includeDelivered || key !== "delivered")
            .map(([key, label]) => (
              <Column
                key={key}
                status={key}
                label={label}
                items={filtered.filter((d) => d.status === key)}
                trips={trips}
                busy={busy}
                onOpen={onOpen}
                onStart={setPending}
              />
            ))}
        </div>
      </DndContext>
    </>
  );
}
