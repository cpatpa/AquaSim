import type { GridState, EvoStats, PopSnapshot, EvoLogEntry } from '../types';
import { GENE_KEYS } from '../constants';
import { SPECIES, getLivingIds, getDynamicSpeciesIds } from '../species/registry';
import { geneVal } from '../evolution/genetics';
import { getSpeciesSynergies } from '../evolution/traits';

export interface ExportData {
  version: number;
  generation: number;
  gridWidth: number;
  gridHeight: number;
  evolveEnabled: boolean;
  biodiversityScore: number;
  species: Record<number, ExportSpeciesData>;
  popHistory: PopSnapshot[];
  evoLog: string[];
  lineageMap: Record<number, number[]>;
  summary: ExportSummary;
}

interface ExportSpeciesData {
  name: string;
  tier: string;
  color: string;
  parentId?: number;
  rootAncestor?: number;
  lineageDepth?: number;
  population: number;
  genes?: Record<string, number>;
  geneVariance?: Record<string, number>;
  traits?: string[];
  novelAdapts?: string[];
  synergies?: string[];
  breedRate: number;
  moveRate: number;
  hungerMax: number;
  extinct: boolean;
}

interface ExportSummary {
  totalSpeciesCreated: number;
  totalExtinctions: number;
  novelAdaptationsTotal: number;
  maxLineageDepth: number;
  dominantSpecies: string;
  emptyTiers: string[];
}

export function buildExportData(
  grid: GridState,
  evoStats: Record<number, EvoStats>,
  generation: number,
  evolveEnabled: boolean,
  popHistory: PopSnapshot[],
  evoLog: EvoLogEntry[],
  biodiversityScore: number,
): ExportData {
  const livingIds = getLivingIds();
  const dynamicIds = getDynamicSpeciesIds();
  const total = grid.width * grid.height;

  const counts: Record<number, number> = {};
  for (let i = 0; i < total; i++) {
    const s = grid.species[i];
    if (s !== 0) counts[s] = (counts[s] || 0) + 1;
  }

  const speciesData: Record<number, ExportSpeciesData> = {};
  const lineageMap: Record<number, number[]> = {};
  let totalExtinctions = 0;
  let novelTotal = 0;
  let maxDepth = 0;
  let dominantName = '';
  let dominantPop = 0;

  for (const id of livingIds) {
    const sp = SPECIES[id];
    if (!sp) continue;
    const es = evoStats[id];
    const pop = counts[id] || 0;
    const extinct = pop === 0 && dynamicIds.indexOf(id) !== -1;
    if (extinct) totalExtinctions++;

    const depth = (sp as any).lineageDepth || 0;
    if (depth > maxDepth) maxDepth = depth;
    if (pop > dominantPop) { dominantPop = pop; dominantName = sp.name; }

    let genesExport: Record<string, number> | undefined;
    let geneVarExport: Record<string, number> | undefined;
    if (es?.genes) {
      genesExport = {};
      for (const g of GENE_KEYS) genesExport[g] = geneVal(es.genes[g]);
      if (es.geneVar) {
        geneVarExport = {};
        for (const g of GENE_KEYS) geneVarExport[g] = es.geneVar[g];
      }
    }

    const rootId = (sp as any).rootAncestor;
    if (rootId !== undefined) {
      if (!lineageMap[rootId]) lineageMap[rootId] = [];
      lineageMap[rootId].push(id);
    }

    if (es?.novelAdapts) novelTotal += es.novelAdapts.length;

    const synergies = es?.traits ? getSpeciesSynergies(es.traits) : [];

    speciesData[id] = {
      name: sp.name,
      tier: sp.tier,
      color: sp.color,
      parentId: (sp as any).parentId,
      rootAncestor: rootId,
      lineageDepth: depth,
      population: pop,
      genes: genesExport,
      geneVariance: geneVarExport,
      traits: es?.traits,
      novelAdapts: es?.novelAdapts,
      synergies: synergies.map(s => s.name),
      breedRate: es?.breedRate ?? sp.breedRate ?? 0,
      moveRate: es?.moveRate ?? sp.moveRate ?? 0,
      hungerMax: es?.hungerMax ?? sp.hungerMax ?? 0,
      extinct,
    };
  }

  const tierCounts: Record<string, number> = {};
  for (const id of livingIds) {
    const sp = SPECIES[id];
    if (sp && (counts[id] || 0) > 0) {
      tierCounts[sp.tier] = (tierCounts[sp.tier] || 0) + (counts[id] || 0);
    }
  }
  const emptyTiers = ['producer', 'herbivore', 'consumer', 'apex', 'megafauna', 'decomposer']
    .filter(t => !tierCounts[t]);

  return {
    version: 2,
    generation,
    gridWidth: grid.width,
    gridHeight: grid.height,
    evolveEnabled,
    biodiversityScore,
    species: speciesData,
    popHistory,
    evoLog: evoLog.map(e => e.message),
    lineageMap,
    summary: {
      totalSpeciesCreated: livingIds.length,
      totalExtinctions,
      novelAdaptationsTotal: novelTotal,
      maxLineageDepth: maxDepth,
      dominantSpecies: dominantName,
      emptyTiers,
    },
  };
}

export function downloadExport(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `aquasim-export-gen${data.generation}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
