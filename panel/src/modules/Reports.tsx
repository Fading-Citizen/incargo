import type { Dispatch, SetStateAction } from "react";
import { PanelAction, PanelEmpty, PanelField, PanelSection, PanelStatus, PanelTableFrame } from "../components/PanelPrimitives";
import { statuses, summarize, type Snapshot } from "../model";
import { controlRows, displayReference, type ControlFilter } from "../lib/control-overview";
const filters: [ControlFilter, string][] = [["all", "Todas las entregas"], ["exception", "Con novedad"], ["unassigned", "Viaje sin conductor"], ["references", "Sin referencias"], ["pending", "Pendientes"], ["in_transit", "En ruta"], ["delivered", "Entregadas"]];
export type ReportsViewState = { filter: ControlFilter; query: string; limit: number };
export default function Reports({ state, onOpen, onNavigate, viewState, onViewStateChange }: {
  state: Snapshot;
  onOpen: (id: string) => void;
  onNavigate: (id: string) => void;
  viewState: ReportsViewState;
  onViewStateChange: Dispatch<SetStateAction<ReportsViewState>>;
}) {
  const { filter, query, limit } = viewState;
  const summary = summarize(state);
  const rows = controlRows(state, filter, query);
  const trips = new Map(state.trips.map(trip => [trip.id, trip]));
  const knownPackages = state.deliveries.filter(d => d.package_count != null);
  function choose(next: ControlFilter) { onViewStateChange(current => ({ ...current, filter: next, limit: 20 })); }
  return <div className="control-overview">
    <header className="control-hero">
      <div><p className="control-eyebrow">INCARGO / VISIÓN ADMINISTRATIVA</p><h1>Control operativo</h1><p>De la visión general al siguiente paso.</p><small>Resumen de los registros consultados por tu sesión; no representa necesariamente toda la operación.</small></div>
      <div className="control-hero-actions"><PanelAction onClick={() => onNavigate("trips")}>Planificar viajes →</PanelAction><PanelAction tone="neutral" onClick={() => onNavigate("map")}>Abrir seguimiento</PanelAction></div>
    </header>
    <div className="control-scope"><span>{state.deliveries.length} entregas · {state.trips.length} viajes consultados</span><span>Sin estimaciones ni comparaciones históricas</span></div>
    <div className="inc-metrics" aria-label="Entregas por estado">
      {statuses.map(([key,label]) => <button type="button" className={`inc-metric inc-metric-${key}`} key={key} aria-pressed={filter === key} onClick={() => choose(key)}><span>{label}</span><strong>{summary.counts[key]}</strong><span>Ver entregas <span aria-hidden="true">→</span></span></button>)}
    </div>
    <div className="control-priorities">
      <PanelSection title="Prioridades para revisar" description="Cada indicador abre la información necesaria para actuar.">
        <div className="control-priority-list">
          <button type="button" onClick={() => choose("exception")}><span><strong>Novedades de entrega</strong><small>Revisa el historial y los soportes del expediente</small></span><b>{summary.counts.exception} →</b></button>
          <button type="button" onClick={() => onNavigate("trips")}><span><strong>Viajes sin conductor</strong><small>Completa las asignaciones antes del despacho</small></span><b>{summary.unassigned} →</b></button>
          <button type="button" onClick={() => choose("references")}><span><strong>Entregas sin referencias</strong><small>Sin remesa ni factura referenciada; no implica ausencia de soportes</small></span><b>{summary.missingReferences} →</b></button>
        </div>
      </PanelSection>
      <PanelSection title="Carga registrada" description="Solo cantidades informadas en las entregas consultadas.">
        <p className="control-load">{knownPackages.length ? knownPackages.reduce((sum,d) => sum + (d.package_count ?? 0), 0).toLocaleString("es-CO") : "—"}<span>bultos informados</span></p>
        <p>{knownPackages.length} de {state.deliveries.length} entregas con cantidad registrada.</p><p className="control-muted">{state.deliveries.length - knownPackages.length} sin cantidad registrada. Un dato faltante no equivale a cero.</p>
      </PanelSection>
    </div>
    <PanelSection title="Mesa de seguimiento" description="Novedades primero, luego pendientes, en ruta y otros estados. Abre un expediente para revisar sus detalles.">
      <div className="board-toolbar">
        <PanelField label="Buscar en el resumen"><input type="search" value={query} placeholder="Cliente, referencia, ruta o placa" onChange={event => {const query = event.target.value; onViewStateChange(current => ({ ...current, query, limit: 20 }));}} /></PanelField>
        <PanelField label="Prioridad o estado"><select aria-label="Prioridad o estado" value={filter} onChange={event => choose(event.target.value as ControlFilter)}>{filters.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></PanelField>
        <PanelAction tone="neutral" onClick={() => {onViewStateChange({ filter: "all", query: "", limit: 20 });}}>Limpiar filtros</PanelAction>
      </div>
      <p className="control-muted" role="status">{rows.length} entregas coinciden · {Math.min(limit, rows.length)} visibles</p>
      {!rows.length ? <PanelEmpty title={state.deliveries.length ? "Sin coincidencias" : "Sin entregas consultadas"} description={state.deliveries.length ? "Prueba otra búsqueda o limpia los filtros." : "Cuando existan entregas accesibles a tu sesión aparecerán aquí. No se muestran datos de demostración."} /> : <>
        <PanelTableFrame label="Seguimiento de entregas" className="financial-table"><table><thead><tr><th>Cliente / referencia</th><th>Viaje / destino</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.slice(0,limit).map(d => <tr key={d.id}><td data-label="Cliente"><span>{d.customer_name || "Sin cliente informado"}<small>{displayReference(d)}</small></span></td><td data-label="Viaje"><span>{trips.get(d.trip_id)?.route_label || "Viaje no disponible"}<small>{d.destination_text || "Destino no informado"}</small></span></td><td data-label="Estado"><PanelStatus tone={d.status === "exception" ? "warning" : d.status === "delivered" ? "success" : "neutral"}>{statuses.find(([key]) => key === d.status)?.[1] || d.status}</PanelStatus></td><td data-label="Acción"><PanelAction tone="neutral" onClick={() => onOpen(d.id)}>Abrir expediente</PanelAction></td></tr>)}</tbody></table></PanelTableFrame>
        {rows.length > limit && <PanelAction tone="neutral" onClick={() => onViewStateChange(current => ({ ...current, limit: current.limit + 20 }))}>Mostrar 20 más</PanelAction>}
      </>}
    </PanelSection>
  </div>;
}
