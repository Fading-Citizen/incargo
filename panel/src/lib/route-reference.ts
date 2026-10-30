import { referenceCities } from "./colombia-reference";
import type { Delivery, Trip } from "../model";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/,?\s+colombia$/, "")
    .replace(/,?\s+d\.?\s*c\.?$/, "");
export function referenceCity(value?: string) {
  const name = normalize(value || "");
  const matches = referenceCities.filter(
    (city) => normalize(city.name) === name,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function routeReference(delivery: Delivery, trip?: Trip) {
  const route = trip?.route_label.split(/\s*(?:→|->| – | - )\s*/);
  return {
    origin: referenceCity(
      delivery.origin_text || (route?.length === 2 ? route[0] : ""),
    ),
    destination: referenceCity(
      delivery.destination_text || (route?.length === 2 ? route[1] : ""),
    ),
  };
}
