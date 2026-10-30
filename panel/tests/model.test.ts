import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarize,companies,empty,type Snapshot} from '../src/model';
const state:Snapshot={status:'ready',trips:[{id:'t1',route_label:'Test',scheduled_date:'2026-10-30',vehicle_plate:'TEST'}],deliveries:[{id:'d1',trip_id:'t1',customer_name:'Empresa A',status:'pending'},{id:'d2',trip_id:'t1',customer_name:'Empresa A',status:'exception',invoice_reference:'F1'},{id:'d3',trip_id:'t1',customer_name:'Empresa B',status:'delivered',remittance_reference:'R1'}]};
test('summary derives statuses, unassigned trips and reference gaps from authorized records',()=>{const actual=summarize(state);assert.deepEqual(actual.counts,{pending:1,in_transit:0,exception:1,delivered:1});assert.equal(actual.unassigned,1);assert.equal(actual.missingReferences,1);});
test('customer grouping is descriptive, retains all deliveries and does not infer account IDs',()=>{const groups=companies(state.deliveries);assert.equal(groups.length,2);assert.equal(groups[0][1].length,2);assert.deepEqual(groups[1][1],[state.deliveries[2]]);});
test('empty data is zero and unknown status is never classified as delivered',()=>{assert.equal(summarize(empty).counts.delivered,0);assert.equal(summarize({...state,deliveries:[{...state.deliveries[0],status:'unknown'}]}).counts.delivered,0);});
