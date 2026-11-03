import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlRows, needsReference, displayReference } from '../src/lib/control-overview';
import { type Snapshot } from '../src/model';
const state: Snapshot = {status:'ready', trips:[{id:'t1',route_label:'Bogotá → Cali',scheduled_date:'2026-11-03',vehicle_plate:'ABC123'}], deliveries:[{id:'d1',trip_id:'t1',customer_name:'Norte',status:'delivered',package_count:0},{id:'d2',trip_id:'t1',customer_name:'Sur',status:'exception',remittance_reference:'REM-20'},{id:'d3',trip_id:'absent',customer_name:'Centro',status:'pending',invoice_reference:'  '}]};
test('prioritizes exceptions without mutating the source',()=>{assert.deepEqual(controlRows(state,'all','').map(d=>d.id),['d2','d3','d1']);assert.equal(state.deliveries[0].id,'d1');});
test('searches references and trip data, combines filters',()=>{assert.equal(controlRows(state,'exception','rem-20').length,1);assert.equal(controlRows(state,'pending','ABC123').length,0);assert.equal(controlRows(state,'all',' bogotá ').length,2);});
test('unknown trips are not claimed to have no driver',()=>{assert.deepEqual(controlRows(state,'unassigned','').map(d=>d.id),['d2','d1']);});
test('blank references and empty snapshots are explicit',()=>{assert.equal(needsReference(state.deliveries[2]),true);assert.equal(controlRows(state,'references','').length,2);assert.deepEqual(controlRows({...state,deliveries:[]},'all',''),[]);});

test('display references trim whitespace and fall back without changing source data', () => {
  const delivery = {...state.deliveries[0], remittance_reference:'  ', invoice_reference:'  INV-25  '};
  assert.equal(displayReference(delivery), 'INV-25');
  assert.equal(displayReference({...delivery, invoice_reference:'  '}), 'Sin referencia');
  assert.equal(displayReference({...delivery, remittance_reference:' REM-1 '}), 'REM-1');
  assert.equal(displayReference(state.deliveries[0]), 'Sin referencia');
  assert.equal(delivery.invoice_reference, '  INV-25  ');
});
