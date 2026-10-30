import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, empty, type Snapshot } from "../src/model";
const state: Snapshot = {
  status: "ready",
  trips: [
    {
      id: "t1",
      route_label: "Test",
      scheduled_date: "2026-10-30",
      vehicle_plate: "TEST",
    },
  ],
  deliveries: [
    { id: "d1", trip_id: "t1", customer_name: "Empresa A", status: "pending" },
    {
      id: "d2",
      trip_id: "t1",
      customer_name: "Empresa A",
      status: "exception",
      invoice_reference: "F1",
    },
    {
      id: "d3",
      trip_id: "t1",
      customer_name: "Empresa B",
      status: "delivered",
      remittance_reference: "R1",
    },
  ],
};
test("summary derives statuses, unassigned trips and reference gaps from authorized records", () => {
  const actual = summarize(state);
  assert.deepEqual(actual.counts, {
    pending: 1,
    in_transit: 0,
    exception: 1,
    delivered: 1,
  });
  assert.equal(actual.unassigned, 1);
  assert.equal(actual.missingReferences, 1);
});
test("empty data is zero and unknown status is never classified as delivered", () => {
  assert.equal(summarize(empty).counts.delivered, 0);
  assert.equal(
    summarize({
      ...state,
      deliveries: [{ ...state.deliveries[0], status: "unknown" }],
    }).counts.delivered,
    0,
  );
});

import { allowedShipmentMove } from "../src/modules/ShipmentKanban";
import { sortKanbanOrders } from "../src/lib/kanban-sort";
import { money } from "../src/business";
test("shipment Kanban only requests the existing departure transition", () => {
  assert.equal(allowedShipmentMove("pending", "in_transit"), true);
  for (const from of ["pending", "in_transit", "exception", "delivered"])
    assert.equal(allowedShipmentMove(from, "delivered"), false);
  assert.equal(allowedShipmentMove("exception", "in_transit"), false);
});
test("Kanban sorting is stable, places missing references last and leaves response order intact", () => {
  const rows = state.deliveries;
  assert.deepEqual(
    sortKanbanOrders(rows, "code-desc").map((d) => d.id),
    ["d3", "d1", "d2"],
  );
  assert.deepEqual(
    rows.map((d) => d.id),
    ["d1", "d2", "d3"],
  );
});
test("money retains entered cents even when the locale default currency display rounds them", () => {
  assert.match(money(73.45, "COP"), /73[,.]45/);
});
