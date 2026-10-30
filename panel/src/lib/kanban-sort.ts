import type { Delivery } from "../model";
/** Adapted from Xtreme kanban-sort: stable collation, no source mutation, missing values last. */
export const KANBAN_SORT_OPTIONS = [
  { value: "default", label: "Orden de consulta" },
  { value: "client-asc", label: "Cliente · A → Z" },
  { value: "client-desc", label: "Cliente · Z → A" },
  { value: "code-asc", label: "Remesa · menor a mayor" },
  { value: "code-desc", label: "Remesa · mayor a menor" },
  { value: "destination-asc", label: "Destino · A → Z" },
] as const;
export type KanbanSort = (typeof KANBAN_SORT_OPTIONS)[number]["value"];
const collator = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});
export function sortKanbanOrders(orders: Delivery[], sort: KanbanSort) {
  if (sort === "default") return orders;
  const field = sort.startsWith("client")
    ? "customer_name"
    : sort.startsWith("code")
      ? "remittance_reference"
      : "destination_text";
  return [...orders].sort((a, b) => {
    const av = a[field]?.trim(),
      bv = b[field]?.trim();
    if (!av || !bv) return av ? -1 : bv ? 1 : a.id.localeCompare(b.id);
    return (
      collator.compare(av, bv) * (sort.endsWith("-desc") ? -1 : 1) ||
      a.id.localeCompare(b.id)
    );
  });
}
