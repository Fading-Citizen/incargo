import { useEffect, useState } from "react";
import { api, type AccessRequest, type Account } from "../api";
import type { Delivery } from "../model";
import { ActionForm } from "./OperationsForms";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelSection,
} from "../components/PanelPrimitives";
function AccountSelect({ accounts }: { accounts: Account[] }) {
  return (
    <PanelField label="Cuenta comercial verificada" required>
      <select name="account" required>
        <option value="">Selecciona una cuenta</option>
        {accounts.map((a) => (
          <option key={a.account_id} value={a.account_id}>
            {a.display_name}
          </option>
        ))}
      </select>
    </PanelField>
  );
}
export default function Accounts({ deliveries }: { deliveries: Delivery[] }) {
  const [accounts, setAccounts] = useState<Account[]>([]),
    [requests, setRequests] = useState<AccessRequest[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([api().accounts(), api().requests()])
      .then(([a, r]) => {
        if (active) {
          setAccounts(a);
          setRequests(r);
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
  return (
    <>
      <div className="module-heading">
        <div>
          <p className="efo-eyebrow">COMERCIAL / CLIENTES</p>
          <h1>Cuentas y accesos</h1>
          <p>
            Cuentas comerciales identificadas por su registro, sin inferir
            vínculos por nombre.
          </p>
        </div>
        <PanelAction tone="neutral" onClick={reload}>
          Actualizar cuentas
        </PanelAction>
      </div>
      {error ? (
        <PanelNotice tone="danger">
          No pudimos cargar cuentas y solicitudes. Reintenta antes de vincular.
        </PanelNotice>
      ) : loading ? (
        <PanelNotice>Cargando cuentas…</PanelNotice>
      ) : (
        <>
          <div className="enterprise-account-list">
            {accounts.map((a) => (
              <article key={a.account_id}>
                <h2>{a.display_name}</h2>
                <small>{a.account_id}</small>
              </article>
            ))}
          </div>
          <div className="enterprise-columns">
            <PanelSection title="Crear cuenta comercial">
              <ActionForm
                submit="Crear cuenta"
                onSaved={reload}
                onSubmit={(v) => api().createAccount(v.name)}
              >
                <PanelField label="Nombre interno" required>
                  <input name="name" required maxLength={120} />
                </PanelField>
              </ActionForm>
            </PanelSection>
            <PanelSection title="Vincular usuario">
              <ActionForm
                submit="Vincular usuario"
                onSubmit={(v) => api().linkUser(v.account, v.user)}
              >
                <AccountSelect accounts={accounts} />
                <PanelField label="UUID exacto del usuario verificado" required>
                  <input name="user" required pattern="[0-9a-fA-F-]{36}" />
                </PanelField>
                <label className="check-field">
                  <input type="checkbox" required />
                  Verifiqué la identidad y la cuenta por un canal independiente.
                </label>
              </ActionForm>
            </PanelSection>
            <PanelSection title="Asignar entrega a cliente">
              <ActionForm
                submit="Asignar entrega"
                onSubmit={(v) =>
                  api().assignClientDelivery(v.account, v.delivery)
                }
              >
                <AccountSelect accounts={accounts} />
                <PanelField label="Entrega" required>
                  <select name="delivery" required>
                    <option value="">Selecciona una entrega</option>
                    {deliveries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.remittance_reference || "Sin remesa"} ·{" "}
                        {d.customer_name}
                      </option>
                    ))}
                  </select>
                </PanelField>
              </ActionForm>
            </PanelSection>
            <PanelSection title="Revocar vínculos">
              <ActionForm
                submit="Desvincular usuario"
                onSubmit={(v) => api().unlinkUser(v.user)}
              >
                <PanelField label="UUID exacto del usuario" required>
                  <input name="user" required pattern="[0-9a-fA-F-]{36}" />
                </PanelField>
              </ActionForm>
              <ActionForm
                submit="Desasignar entrega"
                onSubmit={(v) => api().unassignClientDelivery(v.delivery)}
              >
                <PanelField label="Entrega" required>
                  <select name="delivery" required>
                    <option value="">Selecciona una entrega</option>
                    {deliveries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.remittance_reference || "Sin remesa"} ·{" "}
                        {d.customer_name}
                      </option>
                    ))}
                  </select>
                </PanelField>
              </ActionForm>
            </PanelSection>
          </div>
          <PanelSection title="Solicitudes de acceso">
            {!requests.length ? (
              <p>No hay solicitudes pendientes.</p>
            ) : (
              <div className="enterprise-columns">
                {requests.map((r) => (
                  <article key={r.user_id}>
                    <h3>{r.email}</h3>
                    <p>Empresa indicada: {r.company_claim}</p>
                    <ActionForm
                      submit="Aprobar vinculación"
                      onSaved={reload}
                      onSubmit={(v) =>
                        api().approveRequest(r.user_id, v.account, r.updated_at)
                      }
                    >
                      <AccountSelect accounts={accounts} />
                      <label className="check-field">
                        <input type="checkbox" required />
                        Verifiqué identidad y empresa. El nombre indicado no
                        acredita pertenencia.
                      </label>
                    </ActionForm>
                  </article>
                ))}
              </div>
            )}
          </PanelSection>
        </>
      )}
    </>
  );
}
