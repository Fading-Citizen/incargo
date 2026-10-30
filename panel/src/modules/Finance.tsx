import AdministrativeNotes from "./AdministrativeNotes";
import { useEffect, useState } from "react";
import { api, type Account } from "../api";
import {
  money,
  type Invoice,
  type InvoiceDetail,
  type ChargeLine,
  type Receipt,
  type Order,
} from "../business";
import { ActionForm } from "./OperationsForms";
import { AccountField, ChargeLines } from "./Commercial";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelSection,
  PanelStatus,
  PanelTableFrame,
} from "../components/PanelPrimitives";
/** List/detail composition adapted from Xtreme facturacion/page and [id]/Detail; no demo finance or fiscal provider. */
export default function Finance({
  accounts,
  lifecycle = false,
}: {
  accounts: Account[];
  lifecycle?: boolean;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [detail, setDetail] = useState<InvoiceDetail | null>(null),
    [query, setQuery] = useState(""),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [form, setForm] = useState(""),
    [receiptId, setReceiptId] = useState(""),
    [lines, setLines] = useState<ChargeLine[]>([
      { description: "", quantity: NaN, unit_price: NaN, tax_amount: NaN },
    ]);
  useEffect(() => {
    let active = true;
    Promise.all([
      api().financeBoard(),
      api().receiptBoard(),
      api().orderBoard(),
    ])
      .then(([rows, r, o]) => {
        if (active) {
          setInvoices(rows);
          setReceipts(r);
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
    setDetail(null);
    setVersion((v) => v + 1);
  };
  async function open(id: string) {
    setError("");
    try {
      setDetail(await api().invoiceDetail(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const filtered = invoices.filter((i) =>
    [i.external_number, i.customer]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">ADMINISTRACIÓN / FACTURACIÓN Y CARTERA</p>
          <h1>
            {detail
              ? detail.invoice.external_number
              : "Facturación administrativa"}
          </h1>
          <p>
            Documentos emitidos fuera del panel, abonos registrados y saldos por
            moneda.
          </p>
        </div>
        <PanelAction tone="neutral" onClick={reload}>
          Actualizar
        </PanelAction>
      </div>
      <PanelNotice>
        Registrar un documento o abono no emite una factura electrónica ni
        ejecuta un cobro.
      </PanelNotice>
      {error && <PanelNotice tone="danger">{error}</PanelNotice>}
      {loading ? (
        <PanelNotice>Cargando documentos…</PanelNotice>
      ) : detail ? (
        <>
          <PanelAction tone="neutral" onClick={() => setDetail(null)}>
            Volver a facturas
          </PanelAction>
          <PanelSection title="Identificación y valores">
            <dl className="detail-grid">
              {[
                ["Emisor", detail.invoice.issuer_reference],
                [
                  "Cuenta",
                  accounts.find(
                    (a) => a.account_id === detail.invoice.account_id,
                  )?.display_name || detail.invoice.account_id,
                ],
                ["Fecha", detail.invoice.issue_date],
                ["Vencimiento", detail.invoice.due_date],
                ["Moneda", detail.invoice.currency],
                ["Total", money(detail.invoice.total, detail.invoice.currency)],
                ["Referencia del soporte", detail.invoice.source_reference],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </PanelSection>
          <PanelSection title="Conceptos e importes del documento">
            <PanelTableFrame label="Conceptos facturados">
              <table>
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Cantidad</th>
                    <th>Precio</th>
                    <th>Impuesto informado</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoice.lines.map((line, index) => (
                    <tr key={index}>
                      <td>{line.description}</td>
                      <td>{line.quantity}</td>
                      <td>{money(line.unit_price, detail.invoice.currency)}</td>
                      <td>{money(line.tax_amount, detail.invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PanelTableFrame>
          </PanelSection>
          {lifecycle && (
            <AdministrativeNotes
              key={detail.invoice.id}
              type="invoice"
              id={detail.invoice.id}
            />
          )}
          <PanelSection title="Abonos aplicados y reversos">
            {detail.allocations.length ? (
              detail.allocations.map((a) => (
                <article className="allocation" key={a.id}>
                  <p>
                    {money(a.amount, detail.invoice.currency)} · Recibo{" "}
                    {a.receipt_id}
                  </p>
                  {a.reversed_at ? (
                    <PanelStatus tone="warning">
                      Revertido · {a.reversal_reason}
                    </PanelStatus>
                  ) : (
                    <ActionForm
                      submit="Revertir aplicación"
                      onSaved={() => {
                        void open(detail.invoice.id);
                        void api().receiptBoard().then(setReceipts);
                      }}
                      onSubmit={(v) =>
                        api().reverseAllocation(v.request_id, a.id, v.reason)
                      }
                    >
                      <PanelField label="Motivo del reverso" required>
                        <input
                          name="reason"
                          required
                          minLength={4}
                          maxLength={500}
                        />
                      </PanelField>
                    </ActionForm>
                  )}
                </article>
              ))
            ) : (
              <p>No hay abonos aplicados.</p>
            )}
            <ActionForm
              submit="Aplicar abono registrado"
              onSaved={() => {
                void open(detail.invoice.id);
                void api().receiptBoard().then(setReceipts);
              }}
              onSubmit={(v) =>
                api().applyReceipt(
                  v.request_id,
                  v.receipt,
                  detail.invoice.id,
                  Number(v.amount),
                )
              }
            >
              <PanelField
                label="Abono disponible de esta cuenta y moneda"
                required
              >
                <select name="receipt" required defaultValue={receiptId}>
                  <option value="">Selecciona un abono</option>
                  {receipts
                    .filter(
                      (r) =>
                        r.account_id === detail.invoice.account_id &&
                        r.currency === detail.invoice.currency &&
                        r.available > 0,
                    )
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.external_reference} · disponible{" "}
                        {money(r.available, r.currency)}
                      </option>
                    ))}
                </select>
              </PanelField>
              <PanelField
                label={"Importe a aplicar · " + detail.invoice.currency}
                required
              >
                <input
                  name="amount"
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                />
              </PanelField>
            </ActionForm>
          </PanelSection>
        </>
      ) : (
        <>
          <div className="board-toolbar">
            <PanelField label="Número o cliente">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </PanelField>
            <PanelAction
              onClick={() => setForm(form === "invoice" ? "" : "invoice")}
            >
              Registrar factura externa
            </PanelAction>
            <PanelAction
              tone="neutral"
              onClick={() => setForm(form === "receipt" ? "" : "receipt")}
            >
              Registrar abono
            </PanelAction>
          </div>
          {form === "invoice" && (
            <PanelSection title="Registro administrativo de factura">
              <ActionForm
                submit="Registrar documento"
                onSaved={() => {
                  setForm("");
                  reload();
                }}
                onSubmit={(v) =>
                  api().registerInvoice(v.request_id, {
                    account_id: v.account,
                    issuer_reference: v.issuer,
                    external_number: v.number,
                    currency: v.currency,
                    issue_date: v.issued,
                    due_date: v.due,
                    source_reference: v.source,
                    document_total: Number(v.total),
                    lines,
                    order_ids: v.order ? [v.order] : [],
                  })
                }
              >
                <div className="enterprise-form-grid">
                  <AccountField accounts={accounts} />
                  <PanelField label="Identificador del emisor" required>
                    <input name="issuer" required maxLength={120} />
                  </PanelField>
                  <PanelField label="Número del documento emitido" required>
                    <input name="number" required maxLength={120} />
                  </PanelField>
                  <PanelField label="Moneda ISO" required>
                    <input
                      name="currency"
                      required
                      pattern="[A-Z]{3}"
                      maxLength={3}
                    />
                  </PanelField>
                  <PanelField label="Fecha del documento" required>
                    <input name="issued" type="date" required />
                  </PanelField>
                  <PanelField label="Vencimiento informado" required>
                    <input name="due" type="date" required />
                  </PanelField>
                  <PanelField
                    label="Referencia de soporte / sistema de origen"
                    required
                  >
                    <input name="source" required maxLength={500} />
                  </PanelField>
                  <PanelField label="Total del documento original" required>
                    <input
                      name="total"
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                    />
                  </PanelField>
                  <PanelField
                    label="Pedido vinculado"
                    hint="El servidor verifica que corresponda a la misma cuenta comercial."
                  >
                    <select name="order">
                      <option value="">Sin pedido vinculado</option>
                      {orders
                        .filter((o) => !o.cancelled_at)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.customer} · {o.description} · {o.id.slice(0, 8)}
                          </option>
                        ))}
                    </select>
                  </PanelField>
                </div>
                <ChargeLines lines={lines} onChange={setLines} />
                <label className="check-field">
                  <input type="checkbox" required />
                  Verifiqué el documento emitido y sus importes.
                </label>
              </ActionForm>
            </PanelSection>
          )}
          {form === "receipt" && (
            <PanelSection title="Registrar abono recibido">
              <ActionForm
                submit="Registrar abono"
                onSubmit={async (v) => {
                  const id = await api().recordReceipt(v.request_id, {
                    account_id: v.account,
                    currency: v.currency,
                    amount: Number(v.amount),
                    external_reference: v.reference,
                    received_date: v.date,
                    source_reference: v.source,
                  });
                  setReceiptId(id);
                  setReceipts(await api().receiptBoard());
                  return id;
                }}
              >
                <div className="enterprise-form-grid">
                  <AccountField accounts={accounts} />
                  <PanelField label="Moneda ISO" required>
                    <input
                      name="currency"
                      required
                      pattern="[A-Z]{3}"
                      maxLength={3}
                    />
                  </PanelField>
                  <PanelField label="Importe recibido" required>
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </PanelField>
                  <PanelField label="Referencia del abono" required>
                    <input name="reference" required maxLength={120} />
                  </PanelField>
                  <PanelField label="Fecha recibida" required>
                    <input name="date" type="date" required />
                  </PanelField>
                  <PanelField label="Referencia del soporte" required>
                    <input name="source" required maxLength={500} />
                  </PanelField>
                </div>
              </ActionForm>
              {receiptId && (
                <PanelNotice tone="success">
                  Recibo registrado: {receiptId}. Abre la factura para aplicar
                  el importe.
                </PanelNotice>
              )}
            </PanelSection>
          )}
          <PanelSection title="Abonos registrados">
            <PanelTableFrame
              label="Abonos disponibles"
              className="financial-table"
            >
              <table>
                <thead>
                  <tr>
                    <th>Referencia</th>
                    <th>Cliente</th>
                    <th>Moneda</th>
                    <th>Recibido</th>
                    <th>Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Referencia">{r.external_reference}</td>
                      <td data-label="Cliente">{r.customer}</td>
                      <td data-label="Moneda">{r.currency}</td>
                      <td data-label="Recibido">
                        {money(r.amount, r.currency)}
                      </td>
                      <td data-label="Disponible">
                        {money(r.available, r.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PanelTableFrame>
          </PanelSection>
          <PanelSection title="Facturas y saldos">
            <PanelTableFrame
              label="Facturas administrativas"
              className="financial-table"
            >
              <table>
                <thead>
                  <tr>
                    {[
                      "Documento",
                      "Cliente",
                      "Fecha / vencimiento",
                      "Total",
                      "Saldo",
                      "Gestión",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((invoice) => (
                    <tr key={invoice.id}>
                      <td data-label="Documento">{invoice.external_number}</td>
                      <td data-label="Cliente">{invoice.customer}</td>
                      <td data-label="Fecha / vence">
                        {invoice.issue_date}
                        <small>{invoice.due_date}</small>
                      </td>
                      <td data-label="Total">
                        {money(invoice.total, invoice.currency)}
                        <small>{invoice.currency}</small>
                      </td>
                      <td data-label="Saldo">
                        {money(invoice.outstanding, invoice.currency)}
                      </td>
                      <td data-label="Gestión">
                        <PanelAction
                          tone="neutral"
                          onClick={() => void open(invoice.id)}
                        >
                          Abrir documento
                        </PanelAction>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PanelTableFrame>
            {!filtered.length && <p>No hay documentos para estos filtros.</p>}
          </PanelSection>
        </>
      )}
    </>
  );
}
