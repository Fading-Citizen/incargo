import { useEffect, useState } from "react";
import { api } from "../api";
import type { AdministrativeNote } from "../business";
import {
  PanelAction,
  PanelField,
  PanelNotice,
  PanelSection,
} from "../components/PanelPrimitives";
import { ActionForm } from "./OperationsForms";

export default function AdministrativeNotes({
  type,
  id,
}: {
  type: "order" | "quote" | "invoice" | "receipt";
  id: string;
}) {
  const [notes, setNotes] = useState<AdministrativeNote[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api()
      .administrativeNotes(type, id)
      .then((rows) => {
        if (active) {
          setNotes(rows);
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
  }, [type, id, version]);
  return (
    <PanelSection
      title="Notas administrativas"
      description="Observaciones con soporte. No modifican importes ni sustituyen una nota crédito o débito."
    >
      {loading ? (
        <PanelNotice>Cargando notas…</PanelNotice>
      ) : error ? (
        <PanelNotice tone="danger">
          {error}
          <PanelAction tone="neutral" onClick={() => setVersion((v) => v + 1)}>
            Reintentar notas
          </PanelAction>
        </PanelNotice>
      ) : (
        <>
          {notes.length ? (
            notes.map((n) => (
              <article className="allocation" key={n.id}>
                <p>{n.body}</p>
                <p>Soporte: {n.source_reference}</p>
                <small>
                  {new Date(n.created_at).toLocaleString("es-CO")} · Autor{" "}
                  {n.created_by}
                </small>
              </article>
            ))
          ) : (
            <p>Sin notas registradas.</p>
          )}
          <ActionForm
            submit="Guardar nota administrativa"
            onSaved={() => setVersion((v) => v + 1)}
            onSubmit={(v) =>
              api().addAdministrativeNote(
                v.request_id,
                type,
                id,
                v.body,
                v.source,
              )
            }
          >
            <PanelField label="Observación" required>
              <textarea name="body" required minLength={4} maxLength={2000} />
            </PanelField>
            <PanelField label="Soporte de la observación" required>
              <input name="source" required minLength={4} maxLength={500} />
            </PanelField>
          </ActionForm>
        </>
      )}
    </PanelSection>
  );
}
