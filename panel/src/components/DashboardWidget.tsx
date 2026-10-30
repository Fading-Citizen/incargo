"use client";



export type DashboardWidgetItem = { id: string; label: string; value?: string | number; detail?: string; href?: string; tone?: "normal" | "attention" | "urgent" | "success" };

const tones = { normal: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900", attention: "border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/20", urgent: "border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20", success: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" };

export function DashboardWidget({ title, subtitle, items, href }: { title: string; subtitle?: string; items: DashboardWidgetItem[]; href?: string }) {
  const content = <section className={`rounded-2xl border p-5 shadow-sm ${tones[items.some((item) => item.tone === "urgent") ? "urgent" : items.some((item) => item.tone === "attention") ? "attention" : "normal"]}`}><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div>{href && <span className="text-xs font-medium text-teal-700">Ver todos →</span>}</div><div className="mt-4 space-y-2">{items.length === 0 ? <p className="text-sm text-slate-500">Sin pendientes.</p> : items.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/60 px-3 py-2 dark:bg-slate-950/30"><div className="min-w-0"><p className="truncate text-sm text-slate-800 dark:text-slate-200">{item.label}</p>{item.detail && <p className="truncate text-xs text-slate-500">{item.detail}</p>}</div>{item.value !== undefined && <span className="shrink-0 text-sm font-semibold text-slate-900 dark:text-white">{item.value}</span>}</div>)}</div></section>;
  return href ? <a href={href}>{content}</a> : content;
}
