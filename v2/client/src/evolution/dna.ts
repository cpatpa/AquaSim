import type { GeneKey, GeneSet } from '../types';
import { GENE_KEYS } from '../constants';
import { geneVal } from './genetics';

export const NUCLEOTIDES: readonly string[] = ['A', 'T', 'C', 'G'] as const;
export const NUCLEOTIDE_COLOURS: readonly string[] = ['#44CC44', '#FF4444', '#4488FF', '#FFAA22'] as const;
export const GENE_LENGTH = 12;
export const GENOME_LENGTH = GENE_KEYS.length * GENE_LENGTH; // 192

export function createDNA(): Uint8Array {
  const dna = new Uint8Array(GENOME_LENGTH);
  for (let i = 0; i < GENOME_LENGTH; i++) {
    dna[i] = (Math.random() * 4) | 0;
  }
  return dna;
}

export function dnaFromGenes(genes: GeneSet): Uint8Array {
  const dna = new Uint8Array(GENOME_LENGTH);
  for (let gi = 0; gi < GENE_KEYS.length; gi++) {
    const key = GENE_KEYS[gi];
    const val = geneVal(genes[key] ?? 0.5);
    fillGeneRegion(dna, gi, val);
  }
  return dna;
}

// Fills a 12-nucleotide region so its average nucleotide value, scaled to 0-1, approximates the target
function fillGeneRegion(dna: Uint8Array, geneIndex: number, targetValue: number): void {
  const offset = geneIndex * GENE_LENGTH;
  const targetAvg = targetValue * 3; // scale 0-1 to 0-3
  const base = Math.floor(targetAvg);
  const frac = targetAvg - base;
  const highCount = Math.round(frac * GENE_LENGTH);

  for (let i = 0; i < GENE_LENGTH; i++) {
    const nucleotide = i < highCount ? Math.min(base + 1, 3) : base;
    dna[offset + i] = nucleotide as 0 | 1 | 2 | 3;
  }

  // Shuffle the region so the pattern is not monotonic
  for (let i = GENE_LENGTH - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const oi = offset + i;
    const oj = offset + j;
    const tmp = dna[oi];
    dna[oi] = dna[oj];
    dna[oj] = tmp;
  }
}

export function expressGeneFromDNA(dna: Uint8Array, geneIndex: number): number {
  const offset = geneIndex * GENE_LENGTH;
  let sum = 0;
  for (let i = 0; i < GENE_LENGTH; i++) {
    sum += dna[offset + i];
  }
  return sum / (GENE_LENGTH * 3); // normalise to 0-1 (max nucleotide value is 3)
}

export function expressAllFromDNA(dna: Uint8Array): Record<GeneKey, number> {
  const result = {} as Record<GeneKey, number>;
  for (let gi = 0; gi < GENE_KEYS.length; gi++) {
    result[GENE_KEYS[gi]] = expressGeneFromDNA(dna, gi);
  }
  return result;
}

export function mutateDNA(dna: Uint8Array, rate: number): number {
  let mutationCount = 0;

  for (let i = 0; i < GENOME_LENGTH; i++) {
    if (Math.random() >= rate) continue;

    const roll = Math.random();

    if (roll < 0.85) {
      // Point mutation: swap to a different nucleotide
      let replacement = (Math.random() * 3) | 0;
      if (replacement >= dna[i]) replacement++;
      dna[i] = replacement as 0 | 1 | 2 | 3;
      mutationCount++;

    } else if (roll < 0.925) {
      // Insertion: duplicate a codon (3 nucleotides) by shifting downstream
      const codonStart = i - (i % 3);
      if (codonStart + 6 <= GENOME_LENGTH) {
        // Find which gene region this belongs to, only shift within that region
        const geneIndex = (codonStart / GENE_LENGTH) | 0;
        const regionEnd = (geneIndex + 1) * GENE_LENGTH;
        // Shift the tail of the gene region right by 3, dropping the last codon
        for (let j = regionEnd - 1; j >= codonStart + 6; j--) {
          dna[j] = dna[j - 3];
        }
        // The codon at codonStart is now duplicated at codonStart+3
        dna[codonStart + 3] = dna[codonStart];
        dna[codonStart + 4] = dna[codonStart + 1];
        dna[codonStart + 5] = dna[codonStart + 2];
        mutationCount++;
      }

    } else {
      // Deletion: remove a codon by shifting upstream, fill tail with random
      const codonStart = i - (i % 3);
      const geneIndex = (codonStart / GENE_LENGTH) | 0;
      const regionEnd = (geneIndex + 1) * GENE_LENGTH;
      for (let j = codonStart; j < regionEnd - 3; j++) {
        dna[j] = dna[j + 3];
      }
      // Fill the vacated tail with random nucleotides
      for (let j = regionEnd - 3; j < regionEnd; j++) {
        dna[j] = (Math.random() * 4) | 0;
      }
      mutationCount++;
    }
  }

  return mutationCount;
}

export function dnaDistance(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let mismatches = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) mismatches++;
  }
  return mismatches / len;
}

export function dnaToHtml(dna: Uint8Array, geneIndex?: number): string {
  const start = geneIndex !== undefined ? geneIndex * GENE_LENGTH : 0;
  const end = geneIndex !== undefined ? start + GENE_LENGTH : dna.length;
  const parts: string[] = [];

  for (let i = start; i < end; i++) {
    const n = dna[i];
    const letter = NUCLEOTIDES[n];
    const colour = NUCLEOTIDE_COLOURS[n];
    // Insert a thin space between gene regions for readability
    if (geneIndex === undefined && i > start && i % GENE_LENGTH === 0) {
      parts.push('<span style="display:inline-block;width:4px"></span>');
    }
    parts.push(`<span style="color:${colour};font-family:monospace;font-weight:bold">${letter}</span>`);
  }

  return parts.join('');
}
