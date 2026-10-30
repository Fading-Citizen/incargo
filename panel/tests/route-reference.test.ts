import test from "node:test";
import assert from "node:assert/strict";
import { referenceCity, routeReference } from "../src/lib/route-reference";
test("local city reference matches full city names only and never geocodes private addresses", () => {
  assert.equal(referenceCity("Bogotá D.C.")?.name, "Bogota");
  assert.equal(referenceCity("Medellín, Colombia")?.name, "Medellín");
  assert.equal(referenceCity("Calle 5 Bogotá"), undefined);
  assert.equal(referenceCity("No registrada"), undefined);
  const d = { id: "d", trip_id: "t", customer_name: "test", status: "pending" };
  const trip = {
    id: "t",
    route_label: "Bogotá → Medellín",
    vehicle_plate: "TEST",
    scheduled_date: "2026-10-30",
  };
  assert.equal(routeReference(d, trip).destination?.name, "Medellín");
  assert.equal(
    routeReference(
      { ...d, destination_text: "Dirección privada desconocida" },
      trip,
    ).destination,
    undefined,
  );
});
