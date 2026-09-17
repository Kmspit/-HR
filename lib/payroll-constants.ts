/**
 * Social Security Fund — employee contribution (5%, capped monthly).
 * Ceiling wage base raised 15,000 → 17,500 THB/month, effective 2026-01-01
 * through 2028-12-31 (confirmed), so the 5% cap rises 750 → 875 THB/month.
 * Single source of truth — both the payroll generate route and the employee
 * edit page's SS preview must read from here, not hardcode either number.
 */
export const SS_RATE = 0.05
export const SS_MAX = 875
