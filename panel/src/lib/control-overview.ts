import { type Delivery, type Snapshot } from "../model";
export type ControlFilter = "all" | "exception" | "unassigned" | "references" | "pending" | "in_transit" | "delivered";
export function displayReference(delivery: Delivery) {
  return delivery.remittance_reference?.trim() || delivery.invoice_reference?.trim() || "Sin referencia";
}
export function needsReference(delivery: Delivery) {
  return !delivery.remittance_reference?.trim() && !delivery.invoice_reference?.trim();
}
export function controlRows(state: Snapshot, filter: ControlFilter, query: string) {
  const trips = new Map(state.trips.map(trip => [trip.id, trip]));
  const needle = query.trim().toLocaleLowerCase("es-CO");
  const priority = (d: Delivery) => d.status === "exception" ? 0 : d.status === "pending" ? 1 : d.status === "in_transit" ? 2 : 3;
  return state.deliveries.filter(delivery => {
    const trip = trips.get(delivery.trip_id);
    const matches = filter === "all" || (filter === "references" ? needsReference(delivery) : filter === "unassigned" ? !!trip && !trip.driver_user_id : delivery.status === filter);
    return matches && [delivery.customer_name, delivery.remittance_reference, delivery.invoice_reference, delivery.destination_text, delivery.origin_text, trip?.route_label, trip?.vehicle_plate].some(value => value?.toLocaleLowerCase("es-CO").includes(needle));
  }).sort((a,b) => priority(a) - priority(b) || a.customer_name.localeCompare(b.customer_name, "es") || a.id.localeCompare(b.id));
}
