/** PRNG deterministico: stesso seed, stessi dati. Senza, i test E2E non sono
 *  riproducibili e "il bug si vede solo a volte" diventa la norma. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeRandom(seed = 20260906) {
  const r = mulberry32(seed)
  return {
    next: r,
    int: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!,
    chance: (p: number) => r() < p,
  }
}
