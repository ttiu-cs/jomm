/** Deterministic, seedable PRNG utilities (mulberry32 + integer hashing). */
export function hashSeed(...parts: (number | string)[]): number {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function samplePoisson(rand: () => number, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 60) {
    // normal approximation for large rates
    const u = Math.max(1e-12, rand());
    const v = rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L);
  return k - 1;
}

/**
 * Exogenous shoppers for one store hour: a count and each shopper's private uniform draw.
 * Shopper i buys at price p iff u_i < conversion(p). Using identical draws across strategies
 * (common random numbers) makes fixed-vs-adaptive comparisons fair.
 */
export function hourShoppers(seed: number, day: number | string, hour: number, expectedVisits: number): number[] {
  const rand = mulberry32(hashSeed(seed, day, hour, "shoppers"));
  const n = samplePoisson(rand, expectedVisits);
  const us: number[] = [];
  for (let i = 0; i < n; i++) us.push(rand());
  return us;
}
