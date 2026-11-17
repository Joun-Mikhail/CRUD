/** Axis scaling for the V–I graph. */

/** A "nice" axis end (1, 2, 2.5 or 5 × 10ⁿ) at or above `value`, split into 4 or 5 steps. */
export function niceScale(value: number): { max: number; step: number } {
  const exponent = Math.floor(Math.log10(value))
  const base = 10 ** exponent
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * base >= value) {
      const max = m * base
      const step = max / (m === 2.5 || m === 5 ? 5 : 4)
      return { max, step }
    }
  }
  return { max: 10 * base, step: 2.5 * base }
}
