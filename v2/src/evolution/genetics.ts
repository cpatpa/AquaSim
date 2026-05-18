import type {
  Gene,
  DiploidGene,
  GeneSet,
  ExpressedGenes,
} from '../types';
import { GENE_KEYS, GENE_MUTATION_SD, EPISTASIS } from '../constants';

export function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

export function makeDiploidGene(val: number, noise = 0): DiploidGene {
  return {
    a1: clamp(val + noise * 0.5, 0.02, 0.98),
    a2: clamp(val - noise * 0.3, 0.02, 0.98),
    dom: 0.5 + noise * 0.2,
  };
}

export function expressGene(gene: Gene): number {
  if (typeof gene === 'number') return gene;
  const stronger = gene.a1 > gene.a2 ? gene.a1 : gene.a2;
  const weaker = gene.a1 > gene.a2 ? gene.a2 : gene.a1;
  return stronger * gene.dom + weaker * (1 - gene.dom);
}

export function expressAllGenes(genes: GeneSet): ExpressedGenes {
  const exp = {} as ExpressedGenes;
  for (const g of GENE_KEYS) {
    exp[g] = expressGene(genes[g]);
  }
  for (const rule of EPISTASIS) {
    exp[rule.to] = clamp(rule.fn(exp[rule.from], exp[rule.to]), 0, 1);
  }
  return exp;
}

export function geneVal(gene: Gene): number {
  if (typeof gene === 'number') return gene;
  return expressGene(gene);
}

export function geneHeterozygosity(gene: Gene): number {
  if (typeof gene === 'number') return 0;
  return Math.abs(gene.a1 - gene.a2);
}

export function speciesGeneticDiversity(genes: GeneSet): number {
  let sum = 0;
  for (const g of GENE_KEYS) {
    sum += geneHeterozygosity(genes[g]);
  }
  return sum / GENE_KEYS.length;
}

export function cloneGenes(genes: GeneSet): GeneSet {
  const out = {} as GeneSet;
  for (const g of GENE_KEYS) {
    const v = genes[g];
    out[g] = typeof v === 'number' ? v : { a1: v.a1, a2: v.a2, dom: v.dom };
  }
  return out;
}

export function geneDivergence(genesA: GeneSet, genesB: GeneSet): number {
  let sum = 0;
  for (const g of GENE_KEYS) {
    const d = geneVal(genesA[g] ?? 0.5) - geneVal(genesB[g] ?? 0.5);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function gaussRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function nudgeAllele(val: number, sd: number): number {
  return clamp(val + gaussRandom() * sd, 0.02, 0.98);
}

export function mutateGene(gene: DiploidGene, sd = GENE_MUTATION_SD): DiploidGene {
  return {
    a1: nudgeAllele(gene.a1, sd),
    a2: nudgeAllele(gene.a2, sd),
    dom: clamp(gene.dom + gaussRandom() * sd * 0.5, 0.1, 0.9),
  };
}

export function crossoverGenes(parent1: GeneSet, parent2: GeneSet, sd = GENE_MUTATION_SD): GeneSet {
  const child = {} as GeneSet;
  for (const g of GENE_KEYS) {
    const g1 = parent1[g];
    const g2 = parent2[g];
    if (typeof g1 === 'number' || typeof g2 === 'number') {
      child[g] = makeDiploidGene((geneVal(g1) + geneVal(g2)) / 2);
      continue;
    }
    const a1 = Math.random() < 0.5 ? g1.a1 : g1.a2;
    const a2 = Math.random() < 0.5 ? g2.a1 : g2.a2;
    const dom = geneVal(g1) > geneVal(g2) ? g1.dom : g2.dom;
    child[g] = {
      a1: nudgeAllele(a1, sd),
      a2: nudgeAllele(a2, sd),
      dom: clamp(dom + gaussRandom() * sd * 0.3, 0.1, 0.9),
    };
  }
  return child;
}

export function deriveStats(
  baseBreedRate: number,
  baseMoveRate: number | undefined,
  baseHungerMax: number | undefined,
  expressed: ExpressedGenes
): { breedRate: number; moveRate: number; hungerMax: number } {
  let moveRate = 0;
  if (baseMoveRate) {
    moveRate = clamp(baseMoveRate * (
      0.3 + expressed.bodyShape * 0.25 + expressed.curiosity * 0.20 +
      (1 - expressed.bodySize) * 0.15 + (1 - expressed.bodyArmour) * 0.10
    ), 0.02, 0.98);
  }

  const breedRate = baseBreedRate * (
    0.2 + expressed.fertility * 0.35 + expressed.metabolicRate * 0.25 +
    expressed.growthRate * 0.15 + (1 - expressed.bodySize) * 0.05
  );

  let hungerMax = 0;
  if (baseHungerMax) {
    hungerMax = clamp(Math.round(baseHungerMax * (
      0.2 + expressed.bodySize * 0.25 + expressed.hungerEfficiency * 0.25 +
      (1 - expressed.metabolicRate) * 0.20 + 0.10
    )), 6, 80);
  }

  return { breedRate, moveRate, hungerMax };
}
