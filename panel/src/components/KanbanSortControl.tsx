'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { KANBAN_SORT_OPTIONS, type KanbanSort } from '../lib/kanban-sort';

export default function KanbanSortControl({ label, value, onChange }: {
  label: string;
  value: KanbanSort;
  onChange: (value: KanbanSort) => void;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = KANBAN_SORT_OPTIONS.find(option => option.value === value)!;
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    };
    const reposition = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || rect.right < 0 || rect.left > window.innerWidth) { setPosition(null); return; }
      const top = rect.bottom + 4;
      const left = Math.max(8, Math.min(rect.right - 264, window.innerWidth - 272));
      setPosition(current => current?.top === top && current.left === left ? current : { top, left });
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  function close() { setPosition(null); trigger.current?.focus(); }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }

  return <>
    <button ref={trigger} type="button" aria-label={`Ordenar ${label}: ${selected.label}`} title={`Ordenar tarjetas · ${selected.label}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${value !== 'default' ? 'text-teal-700 dark:text-teal-300' : ''}`}
      onClick={() => {
        if (open) { close(); return; }
        const rect = trigger.current!.getBoundingClientRect();
        setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.right - 264, window.innerWidth - 272)) });
      }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v11M4 9l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {position && createPortal(<div ref={menu} id={id} role="menu" aria-label={`Ordenar ${label}`} onKeyDown={keyDown}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPosition(null); }}
      className="fixed z-[100] w-[264px] overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
      style={{ ...position, maxHeight: `min(420px, calc(100dvh - ${position.top + 8}px))` }}>
      <p className="px-2 py-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">Ordenar tarjetas</p>
      {KANBAN_SORT_OPTIONS.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={value === option.value}
        className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
        onClick={() => { onChange(option.value); close(); }}><span aria-hidden="true" className="w-3 shrink-0 text-teal-600 dark:text-teal-300">{value === option.value ? '✓' : ''}</span>{option.label}</button>)}
      <p className="px-2 py-1.5 text-[10px] text-slate-500 dark:text-slate-400">Ordenación visual; no altera la prioridad operativa.</p>
    </div>, document.body)}
  </>;
}
