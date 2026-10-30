import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  PanelAction,
  PanelNotice,
  PanelSection,
  PanelStatus,
  PanelTableFrame,
} from "./components/PanelPrimitives";
import PanelNavigationIcon from "./components/PanelNavigationIcon";
import { useOperations, panelStore } from "./store";
import { api } from "./api";
import { statuses, summarize, type Snapshot } from "./model";
import ShipmentKanban from "./modules/ShipmentKanban";
import { NewDelivery, TripModule } from "./modules/OperationsForms";
import DeliveryFile from "./modules/DeliveryFile";
import Accounts from "./modules/Accounts";
import FleetAssignments from "./modules/FleetAssignments";
import Commercial from "./modules/Commercial";
import Finance from "./modules/Finance";
const sections = [
  ["shipments", "Envíos activos", "movements"],
  ["trips", "Viajes y asignaciones", "servicio-movil"],
  ["customers", "Clientes y accesos", "users"],
  ["documents", "Documentos", "contracts"],
  ["reports", "Control operativo", "gerencial"],
] as const;
function Reports({ state }: { state: Snapshot }) {
  const summary = summarize(state);
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">GERENCIA / OPERACIÓN</p>
          <h1>Control operativo</h1>
          <p>Indicadores derivados de las entregas y viajes consultados.</p>
        </div>
      </div>
      <div className="inc-metrics">
        {statuses.map(([key, label]) => (
          <div className={"inc-metric inc-metric-" + key} key={key}>
            <span>{label}</span>
            <strong>{summary.counts[key]}</strong>
          </div>
        ))}
      </div>
      <div className="enterprise-columns">
        <PanelSection title="Preparación del despacho">
          <p>
            Viajes sin conductor: <strong>{summary.unassigned}</strong>
          </p>
          <p>
            Entregas sin remesa ni factura referenciada:{" "}
            <strong>{summary.missingReferences}</strong>
          </p>
        </PanelSection>
        <PanelSection title="Carga registrada">
          <p>
            Bultos informados:{" "}
            <strong>
              {state.deliveries.reduce(
                (sum, d) => sum + (d.package_count || 0),
                0,
              )}
            </strong>
          </p>
          <p>
            Entregas sin cantidad registrada:{" "}
            <strong>
              {state.deliveries.filter((d) => d.package_count == null).length}
            </strong>
          </p>
          <p>Se distinguen datos faltantes de una carga igual a cero.</p>
        </PanelSection>
      </div>
    </>
  );
}
function EnterprisePanel() {
  const state = useOperations(),
    [view, setView] = useState("shipments"),
    [selected, setSelected] = useState<string | null>(null),
    [newDelivery, setNewDelivery] = useState(false),
    [refreshError, setRefreshError] = useState(""),
    [capabilities, setCapabilities] = useState({
      commercial: false,
      finance: false,
      lifecycle: false,
    });
  useEffect(() => {
    let active = true;
    api()
      .businessCapabilities()
      .then((c) => {
        if (active)
          setCapabilities({
            commercial: c.commercial === true,
            finance: c.finance === true,
            lifecycle: c.lifecycle === true,
          });
      })
      .catch((e) => {
        if (active) setRefreshError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    document.body.classList.add("enterprise-ready");
    return () => document.body.classList.remove("enterprise-ready");
  }, []);
  const navigation = [
    ["commercial", "Pedidos y cotizaciones", "comercial"],
    ...sections,
    ["fleet", "Vehículos y conductores", "operaciones"],
    ["finance", "Facturación y cartera", "payments"],
  ];
  const chosen = state.deliveries.find((d) => d.id === selected);
  function navigate(id: string) {
    setView(id);
    setSelected(null);
    setNewDelivery(false);
  }
  async function refresh() {
    try {
      setRefreshError("");
      await api().refresh();
    } catch (e) {
      setRefreshError((e as Error).message);
    }
  }
  return (
    <div className="efo-app enterprise-shell">
      <aside className="enterprise-sidebar">
        <div className="enterprise-sidebar-title">
          INCARGO<span>Gestión de transporte</span>
        </div>
        <nav aria-label="Módulos del panel">
          {navigation.map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <PanelNavigationIcon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <p>
          Acceso operativo
          <br />
          Datos de tu sesión autorizada
        </p>
      </aside>
      <div className="enterprise-workspace">
        <div className="enterprise-context">
          <span>{navigation.find(([id]) => id === view)?.[1]}</span>
          <small>
            {state.updatedAt
              ? "Consulta " +
                new Date(state.updatedAt).toLocaleTimeString("es-CO")
              : "Cargando datos…"}
          </small>
        </div>
        {refreshError && (
          <PanelNotice tone="danger">{refreshError}</PanelNotice>
        )}
        {state.status === "loading" ? (
          <PanelNotice>Cargando datos autorizados…</PanelNotice>
        ) : state.status === "error" ? (
          <PanelNotice tone="danger">
            No pudimos actualizar la operación.{" "}
            <PanelAction tone="neutral" onClick={() => void refresh()}>
              Reintentar consulta
            </PanelAction>
          </PanelNotice>
        ) : (
          <>
            {chosen ? (
              <DeliveryFile
                key={chosen.id}
                delivery={chosen}
                trip={state.trips.find((t) => t.id === chosen.trip_id)}
                onClose={() => setSelected(null)}
              />
            ) : view === "shipments" ? (
              newDelivery ? (
                <>
                  <PanelAction
                    tone="neutral"
                    onClick={() => setNewDelivery(false)}
                  >
                    Volver al Kanban
                  </PanelAction>
                  <NewDelivery
                    state={state}
                    onSaved={() => setNewDelivery(false)}
                  />
                </>
              ) : (
                <ShipmentKanban
                  deliveries={state.deliveries}
                  trips={state.trips}
                  onOpen={setSelected}
                  onNew={() => setNewDelivery(true)}
                />
              )
            ) : view === "trips" ? (
              <TripModule state={state} />
            ) : view === "customers" ? (
              <Accounts deliveries={state.deliveries} />
            ) : view === "commercial" ? (
              capabilities.commercial ? (
                <Commercial
                  accounts={state.accounts || []}
                  deliveries={state.deliveries}
                  lifecycle={capabilities.lifecycle}
                />
              ) : (
                <PanelSection
                  title="Pedidos y cotizaciones"
                  description="Preparado · pendiente de habilitación"
                >
                  <PanelNotice>
                    El módulo está integrado. Su activación requiere revisar los
                    permisos comerciales y la relación de pedidos con viajes y
                    entregas. Los envíos actuales continúan disponibles en
                    Envíos activos.
                  </PanelNotice>
                </PanelSection>
              )
            ) : view === "finance" ? (
              capabilities.finance ? (
                <Finance
                  accounts={state.accounts || []}
                  lifecycle={capabilities.lifecycle}
                />
              ) : (
                <PanelSection
                  title="Facturación y cartera"
                  description="Pendiente de configuración · no activado"
                >
                  <PanelNotice>
                    Incargo debe proporcionar los datos de facturación. La
                    activación requiere una nueva indicación expresa; completar
                    datos no habilitará el módulo automáticamente.
                  </PanelNotice>
                  <p>
                    La emisión, el registro de facturas y abonos, las
                    aplicaciones y los cobros permanecen deshabilitados.
                  </p>
                </PanelSection>
              )
            ) : view === "fleet" ? (
              <FleetAssignments state={state} />
            ) : view === "reports" ? (
              <Reports state={state} />
            ) : (
              <>
                <div className="module-heading">
                  <div>
                    <p className="efo-eyebrow">EXPEDIENTES</p>
                    <h1>Documentos y comprobantes</h1>
                    <p>
                      Consulta el historial y el soporte de cada entrega desde
                      su expediente.
                    </p>
                  </div>
                </div>
                <PanelSection title="Entregas documentadas">
                  <PanelTableFrame label="Referencias y expedientes">
                    <table>
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Remesa</th>
                          <th>Referencia de factura</th>
                          <th>Estado</th>
                          <th>Expediente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.deliveries.map((d) => (
                          <tr key={d.id}>
                            <td>{d.customer_name}</td>
                            <td>
                              {d.remittance_reference || "Sin referencia"}
                            </td>
                            <td>{d.invoice_reference || "Sin referencia"}</td>
                            <td>
                              <PanelStatus>
                                {statuses.find(
                                  ([key]) => key === d.status,
                                )?.[1] || d.status}
                              </PanelStatus>
                            </td>
                            <td>
                              <PanelAction
                                tone="neutral"
                                onClick={() => setSelected(d.id)}
                              >
                                Abrir expediente
                              </PanelAction>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </PanelTableFrame>
                </PanelSection>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function App() {
  const state = useOperations();
  return state.status === "signed-out" ? null : <EnterprisePanel />;
}
window.IncargoPanel = panelStore;
const root = document.getElementById("incargo-panel-root");
if (root)
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
