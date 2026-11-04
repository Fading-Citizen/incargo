import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checklist,
  correctionProposal,
  csvCell,
  dateKey,
  evidence,
  filterRecords,
  inspectionCsv,
  inspectionStatus,
  type LegacyRecord,
  type LegacySnapshot,
} from "../src/lib/legacy-admin";
import { printDocument } from "../src/lib/legacy-print";
const record: LegacyRecord = {
  id: "snapshot:0",
  hash: "hash",
  data: {
    _rowNumber: 1,
    fecha: "2026-11-03",
    ts: "2026-11-03T01:00:00Z",
    placa: "ABC",
    conductor: "Persona sintética",
    ciudad: "Bogotá",
    licencia: "0012",
    items: JSON.stringify([
      { label: "Luces", value: "MALO", obs: "Revisar" },
      { label: "Nivel", value: "BAJO" },
    ]),
  },
};
const snapshot: LegacySnapshot = {
  kind: "inspections",
  capturedAt: "2026-11-03T13:00:00Z",
  snapshot: "snapshot",
  source: "synthetic-test",
  records: [record],
  readOnly: true,
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVZkAAAAASUVORK5CYII=";
test("Bogota day boundaries and ambiguous legacy dates remain explicit", () => {
  assert.equal(dateKey(record.data.ts), "2026-11-02");
  assert.equal(dateKey("2026-11-03"), "2026-11-03");
  assert.equal(dateKey("03/11/2026"), "");
  assert.equal(dateKey("2026-02-30"), "");
  assert.equal(dateKey("2026-11-03T12:00:00"), "");
});
test("invalid and empty checklists are unknown, never compliant; low values survive", () => {
  assert.equal(inspectionStatus(record), "bad");
  assert.equal(checklist(record.data.items).items[1].value, "BAJO");
  for (const items of ["bad", "[]", "{}", '[{"label":"X"}]', null])
    assert.equal(inspectionStatus({ ...record, data: { items } }), "unknown");
  assert.equal(
    inspectionStatus({
      ...record,
      data: { items: [{ label: "Nivel", value: "BAJO" }] },
    }),
    "no-bad",
  );
});
test("combined filters preserve source order and isolate the two entity types", () => {
  assert.equal(
    filterRecords([record], "inspections", " bogotá ", "2026-11-03", "bad")
      .length,
    1,
  );
  assert.equal(
    filterRecords([record], "inspections", "missing", "", "").length,
    0,
  );
  assert.equal(
    filterRecords([record], "affiliations", "Persona", "", "").length,
    0,
  );
  assert.equal(record.data.licencia, "0012");
});
test("evidence rejects external URLs, SVG, invalid bytes and truncation without reconstruction", () => {
  assert.equal(evidence(png).state, "available");
  assert.equal(evidence("").state, "missing");
  assert.equal(evidence(png + "[TRUNC]").state, "truncated");
  for (const value of [
    "https://example.com/a.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,YWJjZA==",
    "data:image/png;base64,invalid",
  ])
    assert.equal(evidence(value).state, "invalid");
});
test("CSV preserves strings and neutralizes spreadsheet formulas, quotes and newlines", () => {
  assert.equal(csvCell("=SUM(A1)"), '"\'=SUM(A1)"');
  assert.equal(csvCell("  +cmd"), '"\'  +cmd"');
  assert.equal(csvCell("0012"), '"0012"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert(inspectionCsv([record]).includes('"0012"'));
  assert(inspectionCsv([record]).includes("Luces"));
});
test("correction export preserves full original and is never a persisted mutation", () => {
  const before = JSON.stringify(record);
  const proposal = correctionProposal(
    record,
    snapshot,
    { ciudad: "Cali" },
    "Corrección documentada",
    null,
    null,
  );
  assert.equal(proposal.status, "not_saved");
  assert.equal(proposal.fields.ciudad, "Cali");
  assert.equal(proposal.basePayload.ciudad, "Bogotá");
  assert.equal(proposal.fields.licencia, "0012");
  assert.equal(proposal.replacementPhotos, null);
  assert.equal(JSON.stringify(record), before);
  assert.throws(() => correctionProposal(record, snapshot, {}, "", null, null));
  assert.throws(() =>
    correctionProposal(
      record,
      snapshot,
      {},
      "motivo",
      ["https://evil.test/image"],
      null,
    ),
  );
});
test("print copies escape data, block external resources and never apply a supervisor signature", () => {
  const html = printDocument(
    snapshot,
    [
      {
        ...record,
        data: {
          ...record.data,
          conductor: "<script>alert(1)</script>",
          firma: "https://evil.test/a.png",
        },
      },
    ],
    true,
  );
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("<script>"));
  assert(html.includes("default-src 'none'"));
  assert(!html.includes('src="https:'));
  assert(!html.includes("img/firma.png"));
  assert(html.includes("No certifica aprobación"));
  assert(html.includes("BAJO"));
});

test("printed provenance distinguishes saved versions from the immutable original in both document types", () => {
  for (const kind of ["inspections", "affiliations"] as const) {
    for (const detail of [true, false]) {
      const originals = printDocument({ ...snapshot, kind }, [{ ...record, revision: 0 }], detail);
      assert(originals.includes("Revisión reproducida: 0 (contenido original)"));
      const copies = [1, 2].map((revision) => printDocument({ ...snapshot, kind }, [{ ...record, revision,
        data: { ...record.data, ciudad: `Ciudad versión ${revision}`, nombreCompleto: `Nombre versión ${revision}` },
      }], detail));
      copies.forEach((html, index) => {
        assert(html.includes(`Revisión reproducida: ${index + 1} (corrección guardada)`));
        assert(html.includes(`SHA-256 del contenido original: ${record.hash}`));
        assert(html.includes(`versión ${index + 1}`));
        assert(!html.includes("Huella del registro:"));
        assert(html.includes("No certifica aprobación"));
      });
      assert.notEqual(copies[0], copies[1]);
      const unknown = printDocument({ ...snapshot, kind }, [{ ...record, revision: undefined }], detail);
      assert(unknown.includes("Revisión reproducida: no informada"));
      assert(!unknown.includes("Revisión reproducida: 0"));
    }
  }
});
