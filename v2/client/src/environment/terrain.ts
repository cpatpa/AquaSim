const _noiseP = new Uint8Array(512);

export function noiseSeed(s: number): void {
  const perm = new Uint8Array(256);
  for (let i = 0; i < 256; i++) perm[i] = i;
  let t = s | 0;
  for (let i = 255; i > 0; i--) {
    t = (t * 16807 + 0) & 0x7fffffff;
    const j = t % (i + 1);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 512; i++) _noiseP[i] = perm[i & 255];
}

function _grad2(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}

export function noise2D(x: number, y: number): number {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;
  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    n0 = t0 * t0 * _grad2(_noiseP[ii + _noiseP[jj]], x0, y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    n1 = t1 * t1 * _grad2(_noiseP[ii + i1 + _noiseP[jj + j1]], x1, y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    n2 = t2 * t2 * _grad2(_noiseP[ii + 1 + _noiseP[jj + 1]], x2, y2);
  }

  return 70.0 * (n0 + n1 + n2);
}

export function fbm(
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2D(x * freq, y * freq);
    max += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / max;
}

// Initialise with a default seed
noiseSeed(42);
