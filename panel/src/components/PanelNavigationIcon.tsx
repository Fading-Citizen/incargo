import { NAVIGATION_ICON_PATHS, type NavigationSymbol } from '../lib/panel-navigation-icons';

/** Shared line style with the panel's existing SVG icons; always accompanied by text. */
export default function PanelNavigationIcon({ name, className }: { name: string; className?: string }) {
  return <svg className={className} aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={NAVIGATION_ICON_PATHS[name as NavigationSymbol] ?? NAVIGATION_ICON_PATHS.dashboard} /></svg>;
}
