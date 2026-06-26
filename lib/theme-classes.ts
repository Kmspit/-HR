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

/** Standard dashboard form control — dark slate-800 (globals also auto-apply in .dark main) */
export const dashboardFormControl =
  'dashboard-form-control w-full rounded-lg border px-3 py-2 text-sm appearance-none ' +
  'bg-slate-800 text-slate-50 border-slate-600 placeholder:text-slate-400 ' +
  'hover:bg-slate-700 hover:border-blue-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

export const fieldInput =
  'dashboard-form-control w-full rounded-xl border px-3.5 py-2.5 text-sm transition-all duration-150 ' +
  'border-slate-600 bg-slate-800 text-slate-50 placeholder:text-slate-400 ' +
  'light:border-slate-300 light:bg-white light:text-slate-900 light:placeholder-slate-400 ' +
  'hover:border-blue-500 dark:hover:bg-slate-700 hover:border-blue-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

/** Native <select> trigger */
export const fieldSelect =
  'dashboard-select dashboard-form-control w-full rounded-xl border px-3 py-2.5 text-sm shadow-sm cursor-pointer appearance-none ' +
  'border-slate-600 bg-slate-800 text-slate-50 ' +
  'light:border-slate-300 light:bg-white light:text-slate-900 ' +
  'hover:border-blue-500 dark:hover:bg-slate-700 hover:border-blue-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

/** Modal / dialog form fields */
export const modalFieldInput =
  'modal-field-input dashboard-form-control w-full rounded-lg px-3 py-2 ' +
  'bg-slate-800 text-slate-50 border border-slate-600 placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

/** Dark dialog panel shell */
export const dashboardDialogPanel =
  'dashboard-dialog-panel bg-slate-950 border border-slate-800 text-slate-50 rounded-xl shadow-xl'

export const modalFieldStyle = {
  backgroundColor: '#1E293B',
  color: '#F8FAFC',
  borderColor: '#475569',
} as const

export const tableWrap = 'table-scroll'
export const dataTable = 'warnings-table hr-table'
