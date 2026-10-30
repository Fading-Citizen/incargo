import {useSyncExternalStore} from 'react';
import {empty,type Snapshot} from './model';
let snapshot:Snapshot=empty;
const listeners=new Set<()=>void>();
export const panelStore={update(next:Snapshot){snapshot=structuredClone(next);listeners.forEach(fn=>fn());}};
export function useOperations(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>snapshot,()=>empty);}
declare global {interface Window {IncargoPanel:typeof panelStore}}
