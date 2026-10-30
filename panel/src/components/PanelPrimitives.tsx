import type {ButtonHTMLAttributes,HTMLAttributes,ReactNode} from 'react';
export type PanelTone='primary'|'success'|'warning'|'danger'|'info'|'technical'|'neutral';
/** Visual variants only. Permissions and transitions belong to each caller. */
export function PanelHeaderBlock({title,description,actions,eyebrow}:{title:string;description?:ReactNode;actions?:ReactNode;eyebrow?:string}){
 return <header className="efo-page-heading efo-neural-hero"><div className="efo-heading-copy">{eyebrow&&<p className="efo-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="efo-description">{description}</p>}</div>{actions&&<div className="efo-heading-actions">{actions}</div>}</header>;
}
export function PanelToolbar({children,...props}:HTMLAttributes<HTMLDivElement>){return <div {...props} className={`efo-toolbar ${props.className??''}`}>{children}</div>;}
export function PanelSection({title,description,children,...props}:HTMLAttributes<HTMLElement>&{title?:string;description?:ReactNode}){return <section {...props} className={`efo-section ${props.className??''}`}>{title&&<div className="efo-section-heading"><h2>{title}</h2>{description&&<p className="efo-description">{description}</p>}</div>}{children}</section>;}
export function PanelAction({tone='primary',className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{tone?:PanelTone}){return <button type="button" {...props} className={`efo-action efo-tone-${tone} ${className}`}/>;}
export function PanelStatus({tone='neutral',children}:{tone?:PanelTone;children:ReactNode}){return <span className={`efo-status efo-tone-${tone}`}>{children}</span>;}
export function PanelField({label,required,hint,error,children}:{label:string;required?:boolean;hint?:string;error?:string;children:ReactNode}){return <label className="efo-field"><span>{label}{required&&<span aria-label="obligatorio"> *</span>}</span>{children}{hint&&<span className="efo-field-hint">{hint}</span>}{error&&<span className="efo-field-error" role="alert">{error}</span>}</label>;}
export function PanelTableFrame({label,children,className=''}:{label:string;children:ReactNode;className?:string}){return <div className={`efo-table-frame ${className}`} role="region" aria-label={label} tabIndex={0}>{children}</div>;}
export function PanelEmpty({title,description,action}:{title:string;description?:string;action?:ReactNode}){return <div className="efo-empty"><p className="efo-empty-title">{title}</p>{description&&<p>{description}</p>}{action&&<div>{action}</div>}</div>;}
export function PanelNotice({tone='info',children}:{tone?:PanelTone;children:ReactNode}){return <div className={`efo-notice efo-tone-${tone}`} role={tone==='danger'?'alert':'status'}>{children}</div>;}
