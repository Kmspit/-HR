export function calcKpiScore(
  total: number, completed: number, overdue: number, onTime: number,
): number {
  if (total === 0) return 0
  const onTimeRate    = completed > 0 ? onTime / completed : 0
  const completedRate = completed / total
  const overdueRate   = overdue  / total
  const raw = onTimeRate * 30 + completedRate * 30 - overdueRate * 20 + 20
  return Math.max(0, Math.min(100, Math.round(raw)))
}
