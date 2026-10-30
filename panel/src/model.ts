export type Delivery={id:string;trip_id:string;customer_name:string;destination_text?:string;invoice_reference?:string;remittance_reference?:string;status:string;origin_text?:string;cargo_description?:string;package_count?:number;gross_weight_kg?:number};
export type Trip={id:string;route_label:string;scheduled_date:string;vehicle_plate:string;driver_user_id?:string};
export type Snapshot={status:'loading'|'ready'|'error'|'signed-out';deliveries:Delivery[];trips:Trip[];updatedAt?:string};
export const empty:Snapshot={status:'signed-out',deliveries:[],trips:[]};
export const statuses=[['pending','Pendientes'],['in_transit','En ruta'],['exception','Con novedad'],['delivered','Entregadas']] as const;
export function summarize(s:Snapshot){return {counts:Object.fromEntries(statuses.map(([key])=>[key,s.deliveries.filter(d=>d.status===key).length])),unassigned:s.trips.filter(t=>!t.driver_user_id).length,missingReferences:s.deliveries.filter(d=>!d.invoice_reference?.trim()&&!d.remittance_reference?.trim()).length};}
export function companies(deliveries:Delivery[]){const groups=new Map<string,Delivery[]>();for(const d of deliveries){const name=d.customer_name.trim()||'Sin nombre registrado';groups.set(name,[...(groups.get(name)||[]),d]);}return [...groups].sort(([a],[b])=>a.localeCompare(b,'es'));}
