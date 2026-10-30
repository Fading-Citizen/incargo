import AdministrativeNotes from "./AdministrativeNotes";
import { useEffect, useState } from "react";
import { api, type Account } from "../api";
import type { Delivery } from "../model";
import { money, type Quote, type Order, type ChargeLine } from "../business";
import { ActionForm } from "./OperationsForms";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelSection,
  PanelStatus,
  PanelTableFrame,
} from "../components/PanelPrimitives";
export function ChargeLines({
  lines,
  onChange,
}: {
  lines: ChargeLine[];
  onChange: (lines: ChargeLine[]) => void;
}) {
  return (
    <div className="charge-lines">
      <p>
        Conceptos e importes · introduce los valores del servicio; no se aplican
        tarifas ni impuestos automáticos.
      </p>
      {lines.map((line, index) => (
        <div key={index} className="charge-line">
          <PanelField label="Concepto" required>
            <input
              required
              maxLength={500}
              value={line.description}
              onChange={(e) =>
                onChange(
                  lines.map((l, i) =>
                    i === index ? { ...l, description: e.target.value } : l,
                  ),
                )
              }
            />
          </PanelField>
          {(["quantity", "unit_price", "tax_amount"] as const).map((key, i) => (
            <PanelField
              key={key}
              label={["Cantidad", "Precio unitario", "Impuesto informado"][i]}
              required
            >
              <input
                type="number"
                required
                min={key === "quantity" ? "0.001" : "0"}
                max="999999999"
                step={key === "quantity" ? "0.001" : "0.01"}
                value={Number.isNaN(line[key]) ? "" : line[key]}
                onChange={(e) =>
                  onChange(
                    lines.map((l, j) =>
                      j === index
                        ? {
                            ...l,
                            [key]:
                              e.target.value === ""
                                ? NaN
                                : Number(e.target.value),
                          }
                        : l,
                    ),
                  )
                }
              />
            </PanelField>
          ))}
          {lines.length > 1 && (
            <PanelAction
              tone="danger"
              onClick={() => onChange(lines.filter((_, i) => i !== index))}
            >
              Quitar concepto
            </PanelAction>
          )}
        </div>
      ))}
      <PanelAction
        tone="neutral"
        disabled={lines.length >= 100}
        onClick={() =>
          onChange([
            ...lines,
            {
              description: "",
              quantity: NaN,
              unit_price: NaN,
              tax_amount: NaN,
            },
          ])
        }
      >
        Agregar concepto
      </PanelAction>
    </div>
  );
}
export function AccountField({ accounts }: { accounts: Account[] }) {
  return (
    <PanelField label="Cuenta comercial" required>
      <select required name="account">
        <option value="">Selecciona una cuenta</option>
        {accounts.map((a) => (
          <option value={a.account_id} key={a.account_id}>
            {a.display_name}
          </option>
        ))}
      </select>
    </PanelField>
  );
}
export default function Commercial({
  accounts,
  deliveries,
  lifecycle = false,
}: {
  accounts: Account[];
  deliveries: Delivery[];
  lifecycle?: boolean;
}) {
  const [revision, setRevision] = useState<Quote | null>(null);
  const [revisionLines, setRevisionLines] = useState<ChargeLine[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [view, setView] = useState("orders"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0),
    [lines, setLines] = useState<ChargeLine[]>([
      { description: "", quantity: NaN, unit_price: NaN, tax_amount: NaN },
    ]),
    [selected, setSelected] = useState<Order | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([api().quoteBoard(), api().orderBoard()])
      .then(([q, o]) => {
        if (active) {
          setQuotes(q);
          setOrders(o);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [version]);
  const reload = () => {
    setError("");
    setLoading(true);
    setVersion((v) => v + 1);
  };
  const stages = [
    ["unassigned", "Por asignar a operación"],
    ["pending", "Preparando envío"],
    ["in_transit", "En ruta"],
    ["exception", "Con novedad"],
    ["delivered", "Entregado"],
  ];
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">COMERCIAL / SERVICIOS DE TRANSPORTE</p>
          <h1>{view === "orders" ? "Pedidos activos" : "Cotizaciones"}</h1>
          <p>
            Pedidos independientes del viaje. El avance de ejecución se obtiene
            de las entregas vinculadas.
          </p>
        </div>
        <PanelAction
          onClick={() => setView(view === "orders" ? "quotes" : "orders")}
        >
          {view === "orders" ? "Cotizaciones" : "Kanban de pedidos"}
        </PanelAction>
      </div>
      {error && (
        <PanelNotice tone="danger">
          {error}
          <PanelAction tone="neutral" onClick={reload}>
            Reintentar
          </PanelAction>
        </PanelNotice>
      )}
      {loading ? (
        <PanelNotice>Cargando expediente comercial…</PanelNotice>
      ) : view === "orders" ? (
        <>
          {selected && (
            <PanelSection
              title={"Expediente del pedido · " + selected.customer}
              description="La entrega debe estar vinculada a la misma cuenta comercial. La relación se valida en el servidor."
            >
              {!selected.cancelled_at && (
                <ActionForm
                  submit="Vincular a pedido"
                  onSaved={() => {
                    setSelected(null);
                    reload();
                  }}
                  onSubmit={(v) =>
                    api().linkOrderDelivery(
                      v.request_id,
                      selected.id,
                      v.delivery,
                    )
                  }
                >
                  <PanelField label="Entrega" required>
                    <select name="delivery" required>
                      <option value="">Selecciona entrega verificada</option>
                      {deliveries.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.customer_name} · {d.remittance_reference || d.id}
                        </option>
                      ))}
                    </select>
                  </PanelField>
                </ActionForm>
              )}
              {selected.cancelled_at && (
                <PanelNotice>
                  Cancelado: {selected.cancellation_reason}
                </PanelNotice>
              )}
              {lifecycle &&
                !selected.cancelled_at &&
                selected.deliveries.length === 0 && (
                  <ActionForm
                    submit="Cancelar pedido sin ejecución"
                    onSaved={() => {
                      setSelected(null);
                      reload();
                    }}
                    onSubmit={(v) =>
                      api().cancelOrder(v.request_id, selected.id, v.reason)
                    }
                  >
                    <PanelField
                      label="Motivo documentado de cancelación"
                      required
                    >
                      <input
                        name="reason"
                        required
                        minLength={4}
                        maxLength={500}
                      />
                    </PanelField>
                    <label className="check-field">
                      <input type="checkbox" required />
                      Verifiqué la solicitud de cancelación. El servidor
                      rechazará pedidos con entregas, facturas o costos.
                    </label>
                  </ActionForm>
                )}
              {lifecycle && (
                <AdministrativeNotes
                  key={selected.id}
                  type="order"
                  id={selected.id}
                />
              )}
              <PanelAction tone="neutral" onClick={() => setSelected(null)}>
                Cerrar
              </PanelAction>
            </PanelSection>
          )}
          {orders.some((o) => o.cancelled_at) && (
            <PanelSection title="Pedidos cancelados">
              {orders
                .filter((o) => o.cancelled_at)
                .map((o) => (
                  <article key={o.id} className="allocation">
                    <p>
                      {o.customer} · {o.description}
                    </p>
                    <p>{o.cancellation_reason}</p>
                    <PanelAction tone="neutral" onClick={() => setSelected(o)}>
                      Ver cancelación
                    </PanelAction>
                  </article>
                ))}
            </PanelSection>
          )}
          <div
            className="shipment-board"
            role="region"
            tabIndex={0}
            aria-label="Kanban de pedidos activos"
          >
            {stages.map(([stage, label]) => (
              <section className="shipment-column" key={stage}>
                <header>
                  <h2>{label}</h2>
                  <PanelStatus>
                    {orders.filter((o) => o.execution_stage === stage).length}
                  </PanelStatus>
                </header>
                <div className="shipment-column-body">
                  {orders
                    .filter((o) => o.execution_stage === stage)
                    .map((order) => (
                      <article className="shipment-card" key={order.id}>
                        <small>Pedido {order.id.slice(0, 8)}</small>
                        <h3>{order.customer}</h3>
                        <p>
                          {order.origin_text} → {order.destination_text}
                        </p>
                        <p>{order.description}</p>
                        <p>
                          {money(order.total, order.currency)} ·{" "}
                          {order.currency}
                        </p>
                        <p>{order.deliveries.length} entregas vinculadas</p>
                        <PanelAction
                          tone="neutral"
                          onClick={() => setSelected(order)}
                        >
                          Abrir pedido
                        </PanelAction>
                      </article>
                    ))}
                  {!orders.some((o) => o.execution_stage === stage) && (
                    <p className="shipment-empty">Sin pedidos</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          {!revision && (
            <PanelSection title="Cotizaciones registradas">
              <PanelTableFrame label="Cotizaciones" className="financial-table">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Servicio</th>
                      <th>Total</th>
                      <th>Aceptación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id}>
                        <td data-label="Cliente">
                          {accounts.find((a) => a.account_id === q.account_id)
                            ?.display_name || q.account_id}
                        </td>
                        <td data-label="Servicio">
                          {q.description}
                          {q.supersedes_id && (
                            <small>
                              Revisión de {q.supersedes_id.slice(0, 8)} ·{" "}
                              {q.revision_reason}
                            </small>
                          )}
                          <small>
                            {q.origin_text} → {q.destination_text}
                          </small>
                        </td>
                        <td data-label="Total">
                          {money(q.total, q.currency)} · {q.currency}
                        </td>
                        <td
                          data-label="Aceptación"
                          className="quote-action-cell"
                        >
                          <div>
                            {quotes.some(
                              (next) => next.supersedes_id === q.id,
                            ) ? (
                              <PanelStatus>
                                Versión sustituida · historial conservado
                              </PanelStatus>
                            ) : q.accepted_at ? (
                              <PanelStatus tone="success">
                                Aceptada · pedido creado
                              </PanelStatus>
                            ) : (
                              <>
                                {lifecycle && (
                                  <PanelAction
                                    tone="neutral"
                                    onClick={() => {
                                      setRevision(q);
                                      setRevisionLines(
                                        q.lines.map((l) => ({ ...l })),
                                      );
                                    }}
                                  >
                                    Revisar cotización
                                  </PanelAction>
                                )}
                                <ActionForm
                                  submit="Registrar aceptación y crear pedido"
                                  onSaved={reload}
                                  onSubmit={(v) =>
                                    api().acceptQuote(
                                      v.request_id,
                                      q.id,
                                      v.reference,
                                    )
                                  }
                                >
                                  <PanelField
                                    label="Referencia de aceptación verificada"
                                    required
                                  >
                                    <input
                                      name="reference"
                                      required
                                      minLength={4}
                                      maxLength={500}
                                    />
                                  </PanelField>
                                  <label className="check-field">
                                    <input type="checkbox" required />
                                    Verifiqué la aceptación del cliente.
                                  </label>
                                </ActionForm>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PanelTableFrame>
            </PanelSection>
          )}
          {revision && (
            <PanelSection
              title="Revisar cotización"
              description="Se conserva la versión anterior. La cuenta comercial no cambia y sólo se puede aceptar la nueva versión."
            >
              <ActionForm
                key={revision.id}
                submit="Guardar nueva versión"
                onSaved={() => {
                  setRevision(null);
                  reload();
                }}
                onSubmit={(v) =>
                  api().reviseQuote(v.request_id, revision.id, v.reason, {
                    account_id: revision.account_id,
                    currency: v.currency,
                    origin: v.origin,
                    destination: v.destination,
                    description: v.description,
                    lines: revisionLines,
                  })
                }
              >
                <div className="enterprise-form-grid">
                  <PanelField label="Motivo de revisión" required>
                    <input
                      name="reason"
                      required
                      minLength={4}
                      maxLength={500}
                    />
                  </PanelField>
                  <PanelField label="Moneda ISO" required>
                    <input
                      name="currency"
                      required
                      pattern="[A-Z]{3}"
                      maxLength={3}
                      defaultValue={revision.currency}
                    />
                  </PanelField>
                  <PanelField label="Origen" required>
                    <input
                      name="origin"
                      required
                      maxLength={200}
                      defaultValue={revision.origin_text}
                    />
                  </PanelField>
                  <PanelField label="Destino" required>
                    <input
                      name="destination"
                      required
                      maxLength={200}
                      defaultValue={revision.destination_text}
                    />
                  </PanelField>
                  <PanelField label="Descripción del servicio" required>
                    <textarea
                      name="description"
                      required
                      maxLength={1000}
                      defaultValue={revision.description}
                    />
                  </PanelField>
                </div>
                <ChargeLines
                  lines={revisionLines}
                  onChange={setRevisionLines}
                />
              </ActionForm>
              <PanelAction tone="neutral" onClick={() => setRevision(null)}>
                Cerrar revisión
              </PanelAction>
            </PanelSection>
          )}
          {!revision && (
            <PanelSection title="Crear cotización">
              <ActionForm
                submit="Guardar cotización"
                onSaved={() => {
                  setLines([
                    {
                      description: "",
                      quantity: NaN,
                      unit_price: NaN,
                      tax_amount: NaN,
                    },
                  ]);
                  reload();
                }}
                onSubmit={(v) =>
                  api().createQuote(v.request_id, {
                    account_id: v.account,
                    currency: v.currency,
                    origin: v.origin,
                    destination: v.destination,
                    description: v.description,
                    lines,
                  })
                }
              >
                <div className="enterprise-form-grid">
                  <AccountField accounts={accounts} />
                  <PanelField label="Moneda ISO" required>
                    <input
                      name="currency"
                      required
                      pattern="[A-Z]{3}"
                      maxLength={3}
                      placeholder="Ej. COP"
                    />
                  </PanelField>
                  <PanelField label="Origen" required>
                    <input name="origin" required maxLength={200} />
                  </PanelField>
                  <PanelField label="Destino" required>
                    <input name="destination" required maxLength={200} />
                  </PanelField>
                  <PanelField label="Descripción del servicio" required>
                    <textarea name="description" required maxLength={1000} />
                  </PanelField>
                </div>
                <ChargeLines lines={lines} onChange={setLines} />
              </ActionForm>
            </PanelSection>
          )}
        </>
      )}
    </>
  );
}
