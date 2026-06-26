/**
 * Shared Tailwind class bundles for dark/light HR SaaS UI.
 * Prefer these on new components; globals.css also patches legacy `text-white` in light mode.
 */
export const textPrimary = 'dark:text-slate-100 light:text-slate-900'
export const textSecondary = 'dark:text-slate-300 light:text-slate-700'
export const textMuted = 'dark:text-slate-400 light:text-slate-600'

export const cardShell = 'glass-card card-hover rounded-2xl overflow-hidden smooth-transition'
export const cardHeader =
  'px-4 py-3 border-b dark:border-white/10 light:border-slate-200 flex flex-wrap items-center justify-between gap-2'
export const cardTitle = 'text-sm font-semibold dark:text-white light:text-slate-900'

export const fieldInput =
  'w-full rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-150 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-300 ' +
  'light:border-slate-300 light:bg-white light:text-slate-900 light:placeholder-slate-400 ' +
  'hover:border-blue-500 dark:hover:bg-slate-700 dark:hover:border-blue-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

/** Native <select> on dark dashboard surfaces — also auto-applied via utilities.css */
export const fieldSelect =
  'dashboard-select w-full rounded-xl border px-3 py-2.5 text-sm shadow-sm cursor-pointer ' +
  'border-slate-300 bg-white text-slate-900 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-white ' +
  'hover:border-blue-500 dark:hover:bg-slate-700 dark:hover:border-blue-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

export const tableWrap = 'table-scroll'
export const dataTable = 'warnings-table hr-table'
