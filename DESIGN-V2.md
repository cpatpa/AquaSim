# AquaSim 2 - Detailed Design Document

## 1. Architecture

### 1.1 Module Structure

The current monolith (`aquasim.html`, ~7,300 lines) splits into discrete ES modules bundled
via a lightweight bundler (Vite or esbuild). Each module owns its data and exposes a typed API.

```
aquasim2/
  index.html
  src/
    main.ts                  # Entry point, wires modules together
    types.ts                 # Shared type definitions
    constants.ts             # All tuning constants (evolution, grid, seasons, etc.)
    core/
      grid.ts                # Grid state: typed arrays, cell access, resize, toroidal wrap
      simulation.ts          # Tick loop orchestration, step sequencing
      scheduler.ts           # Event scheduling (disasters, immigration, seasons)
    species/
      registry.ts            # SPECIES map, dynamic species creation, ID allocation
      species-types.ts       # Species interface, tier enum, layer enum
    evolution/
      genetics.ts            # Diploid gene model, expression, mutation, crossover
      traits.ts              # Trait definitions, acquisition, degradation, synergies
      novel-adaptations.ts   # Novel adaptation definitions and triggers
      speciation.ts          # Speciation engine, niche shifting, self-predation
      evolution-engine.ts    # Orchestrates evo cycles, cooldowns, radiation boosts
    environment/
      terrain.ts             # Procedural terrain generation (FBM noise)
      currents.ts            # Current mechanics and nutrient flow
      seasons.ts             # Season cycle, modifiers
      disasters.ts           # Disaster definitions and spread/decay logic
      resources.ts           # NEW: dissolved oxygen, nutrients, light penetration
    creatures/
      movement.ts            # Movement logic, current sweeping, layer constraints
      feeding.ts             # Hunger, predation, diet resolution
      breeding.ts            # Reproduction logic, offspring gene inheritance
      death.ts               # Starvation, dominance culling, disaster kills, decay
    renderer/
      canvas-renderer.ts     # Main grid renderer (ImageData pipeline)
      overlays.ts            # NEW: heatmap/resource overlays
      particles.ts           # Death particles, disaster effects
      camera.ts              # NEW: pan, zoom, minimap
      portraits.ts           # Creature portrait generation
    ui/
      panels.ts              # Left/right/bottom panel layout and resize
      species-info.ts        # Species info modal
      phylo-tree.ts          # NEW: global phylogenetic tree view
      evo-tree-popup.ts      # Evolution tree context popup
      graphs.ts              # Population graph, diversity graph, new chart types
      settings.ts            # Settings panel, sliders, toggles
      toolbar.ts             # Paint tools, brush, disaster buttons
      timeline.ts            # NEW: time-lapse scrubber and replay
    data/
      serialisation.ts       # Save/load full simulation state
      export.ts              # JSON/CSV export
      history.ts             # Population history, evo event log, snapshot ring buffer
      replay.ts              # NEW: frame recording for time-lapse
    worker/
      sim-worker.ts          # NEW: Web Worker running the tick loop
      worker-protocol.ts     # NEW: message types between main thread and worker
```

### 1.2 Web Worker Architecture

The simulation tick loop moves to a dedicated Web Worker. The main thread owns rendering
and UI only.

**Message protocol (main thread <-> worker):**

```typescript
// Main -> Worker
type WorkerCommand =
  | { type: 'init'; grid: SharedArrayBuffer; config: SimConfig }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'step'; count: number }
  | { type: 'setSpeed'; tickInterval: number }
  | { type: 'paint'; cells: Array<{ x: number; y: number; speciesId: number }> }
  | { type: 'disaster'; kind: DisasterKind; cx: number; cy: number; radius: number }
  | { type: 'updateConfig'; changes: Partial<SimConfig> }
  | { type: 'save' }
  | { type: 'load'; state: SerializedState }

// Worker -> Main
type WorkerEvent =
  | { type: 'tick'; generation: number; season: string; popCounts: Record<number, number> }
  | { type: 'evoEvent'; event: EvoEventData }
  | { type: 'speciation'; newSpecies: SpeciesData; parentId: number }
  | { type: 'extinction'; speciesId: number }
  | { type: 'snapshot'; state: SnapshotData }
  | { type: 'saved'; state: SerializedState }
  | { type: 'error'; message: string }
```

**SharedArrayBuffer for grid state:**

The species, hunger, and age typed arrays live in a SharedArrayBuffer so the renderer
can read them without copying. The worker writes; the renderer reads. Atomics are not
required because a single-frame tear is visually acceptable (no correctness dependency
on the main thread reading consistent state).

**Fallback:** If SharedArrayBuffer is unavailable (cross-origin isolation not set),
fall back to postMessage with Transferable ArrayBuffers, copying grid state every N
ticks (configurable, default every 2 ticks for smooth rendering).

### 1.3 Save/Load System

**Serialised state structure:**

```typescript
interface SerializedState {
  version: 2;
  timestamp: number;
  config: SimConfig;
  grid: {
    width: number;
    height: number;
    species: Uint8Array;      // compressed via RLE
    hunger: Int16Array;       // compressed via RLE
    age: Uint16Array;         // compressed via RLE
    currents: Uint8Array;     // compressed via RLE
  };
  speciesRegistry: Record<number, SpeciesData>;
  evoStats: Record<number, EvoStatsData>;
  generation: number;
  season: { name: string; tick: number };
  popHistory: PopSnapshot[];
  evoLog: EvoLogEntry[];
  dynamicSpeciesIds: number[];
  nextSpeciesId: number;
  evoCooldown: number;
  radiationBoost: number;
  resources?: ResourceState;   // v2 resource layer
}
```

**Storage options:**
- IndexedDB for browser persistence (up to ~500 MB, handles large grids)
- File download/upload as `.aquasim` (gzipped JSON)
- Auto-save every 100 generations to IndexedDB with 3 rotating slots

**RLE compression for typed arrays:**
Grid arrays are highly compressible (large runs of the same value). Run-length encoding
typically achieves 10:1 to 50:1 compression on species arrays. Apply RLE before JSON
serialisation, then gzip the full payload for file export.

---

## 2. Simulation and Genetics

### 2.1 Resource Layer (new)

Three environmental resource fields overlay the grid, stored as Float32Arrays:

```typescript
interface ResourceState {
  oxygen: Float32Array;      // 0.0 - 1.0 per cell
  nutrients: Float32Array;   // 0.0 - 1.0 per cell
  light: Float32Array;       // 0.0 - 1.0 per cell (computed from depth + canopy)
}
```

**Oxygen:**
- Producers generate oxygen proportional to their population density and light level
- All animals consume oxygen proportional to their metabolicRate gene
- Oxygen diffuses to adjacent cells each tick (8-neighbour averaging, rate 0.15)
- Below 0.2: animals take hunger damage (simulates suffocation)
- Below 0.1: dead zone, only anaerobic decomposers and chemosynthetic species survive
- Currents accelerate oxygen diffusion in flow direction (2x diffusion rate)

**Nutrients:**
- Dead matter releases nutrients on decay (0.3 per cell)
- Decomposers accelerate nutrient release (2x)
- Producers consume nutrients to breed (require > 0.1 to reproduce)
- Nutrients diffuse at rate 0.08 per tick
- Currents carry nutrients downstream (advection model: shift 30% of nutrient value in current direction per tick)
- Nitrogen-fixing species generate nutrients directly (0.02 per tick)

**Light:**
- Computed per column, not per cell (vertical attenuation)
- Surface (layer 3): 1.0
- Per layer down: multiply by 0.6 (so layer 0 gets ~0.22 base light)
- Producer canopy above reduces light below: each producer cell in a column reduces light for cells below by 0.08
- Photosynthetic species require light > 0.15 to breed
- Chemosynthetic species ignore light entirely
- Bioluminescent species add 0.1 light to their cell and adjacent cells

**Update frequency:** Resources update every 2 ticks to limit performance impact. The
diffusion step uses a double-buffer swap (two Float32Arrays per resource, read from one,
write to the other, swap references).

### 2.2 Depth as a Spatial Axis

Current layers are metadata tags. In v2, depth becomes a selectable view dimension:

**Approach: Tabbed depth slices**

The grid canvas shows one depth layer at a time. A tab bar above the canvas lets the user
switch between: Surface (3), Mid-water (2), Shallow (1), Benthic (0).

Each layer has its own visual style:
- Surface: bright caustics, strong light
- Mid-water: blue-green tint, moderate caustics
- Shallow: teal tint, subtle caustics
- Benthic: dark, no caustics, volcanic vent glow

**Cross-layer interaction rendering:**
When viewing a layer, species from adjacent layers that can interact (via layerReach) are
shown as faded silhouettes (20% opacity) so the user can see potential predator/prey
relationships across depth.

**Data model change:**
Add a `layer` field to the cell-level typed arrays:

```typescript
cellLayer: Uint8Array  // 0-3 per cell, which depth layer this cell is on
```

Species spawn on their native layer. Movement stays within the same layer unless a trait
(e.g., migratory, jetpropulsion) allows cross-layer movement. Feeding can reach across
layers within layerReach.

### 2.3 Expanded Genome

Expand from 16 to 24 genes by adding two new clusters:

```typescript
const GENE_CLUSTERS_V2 = {
  Morphology:   ['bodySize', 'bodyArmour', 'bodyShape', 'pigment'],
  Metabolism:    ['metabolicRate', 'fertility', 'hungerEfficiency', 'growthRate'],
  Behaviour:    ['aggression', 'sociality', 'curiosity', 'flightResponse'],
  Sensory:      ['visionRange', 'chemosensory', 'thermalAdapt', 'pressureAdapt'],
  Regulatory:   ['geneSwitch1', 'geneSwitch2', 'stressResponse', 'maturationRate'],
  Reproductive: ['mateSelectivity', 'offspringInvestment', 'broodSize', 'displayIntensity'],
};
```

**Regulatory cluster:**
- `geneSwitch1` / `geneSwitch2`: modulate expression of other genes. When switch1 > 0.6,
  the Behaviour cluster genes are amplified by 1.2x. When switch2 > 0.6, the Sensory
  cluster is amplified. This creates conditional gene expression.
- `stressResponse`: when hunger > 70% of hungerMax, this gene's value scales
  hungerEfficiency and flightResponse upward (survival mode).
- `maturationRate`: controls how quickly offspring reach breeding age. High values mean
  faster maturity but smaller adult bodySize (tradeoff encoded via epistasis).

**Reproductive cluster:**
- `mateSelectivity`: threshold for mate fitness evaluation (see 2.4).
- `offspringInvestment`: tradeoff between offspring quality and quantity. High values
  reduce broodSize but increase offspring starting hunger (better survival).
- `broodSize`: base number of offspring per breeding event (1 to 3, scaled by gene value).
- `displayIntensity`: drives sexual selection. High values increase mating success but
  also increase predation visibility.

**New epistasis rules:**
- `maturationRate` suppresses `bodySize` (fast maturation = smaller adults)
- `displayIntensity` increases `pigment` expression (brighter colours)
- `mateSelectivity` amplifies `offspringInvestment` (choosy mates invest more)
- `stressResponse` amplifies `flightResponse` when hunger > 70%
- `geneSwitch1` amplifies Behaviour cluster (conditional)
- `geneSwitch2` amplifies Sensory cluster (conditional)

### 2.4 Sexual Selection and Mate Choice

Currently breeding is: "if adjacent empty cell and random < breedRate, spawn offspring."

**New model:**

For animal species (herbivore and above), breeding requires a mate:

1. Scan 8 adjacent cells for same-species individuals
2. If `mateSelectivity` gene > 0.3, evaluate potential mates:
   - Mate fitness = weighted sum of expressed genes, weighted by the evaluator's own
     gene profile (species with high aggression value aggressive mates, etc.)
   - Mate must exceed fitness threshold = mateSelectivity * 0.8
3. If mate found, offspring genes = crossover of both parents' diploid genes
   - Per gene: offspring.a1 = random choice of parent1.a1 or parent1.a2
   - Per gene: offspring.a2 = random choice of parent2.a1 or parent2.a2
   - Dominance inherited from higher-fitness parent
4. Apply mutation (existing GENE_MUTATION_SD = 0.05 per allele)
5. `broodSize` gene determines offspring count (1-3)
6. `offspringInvestment` determines starting hunger of offspring

**Producers** continue with asexual reproduction (current model), with mutation only.

**Fallback:** If no mate is found within 3 ticks, asexual reproduction occurs at 50%
normal breedRate (prevents population collapse from overly selective mating).

### 2.5 Symbiosis and Mutualism

New relationship type beyond predator/prey:

```typescript
interface Symbiosis {
  host: number;        // species ID
  symbiont: number;    // species ID
  type: 'mutualist' | 'commensal' | 'parasitic';
  hostBenefit: SymEffect;
  symbiontBenefit: SymEffect;
}

interface SymEffect {
  breedMult?: number;
  hungerMult?: number;
  defenceMult?: number;
  nutrientGen?: number;
}
```

**Formation:** When two species coexist adjacently for 50+ generations with neither
preying on the other, a symbiosis check triggers (8% chance per evo cycle):
- Gene compatibility determines type: if both have high sociality, mutualist.
  If one has high aggression, parasitic.
- Mutualist: both get breedMult 1.15, hungerMult 0.9
- Commensal: symbiont gets breedMult 1.1, host unaffected
- Parasitic: parasite gets hungerMult 0.7, host gets hungerMult 1.2

**Rendering:** Symbiotic pairs shown with a thin connecting line in the phylogenetic
tree. Mutualists get a green link, parasitic gets a red link.

### 2.6 Horizontal Gene Transfer (HGT)

For producers and decomposers only (modelling prokaryotic biology):

- 3% chance per evo cycle per eligible species
- Donor and recipient must coexist adjacently
- Transfers 1 to 3 genes from donor to recipient
- Transferred genes replace recipient alleles (not additive)
- Can transfer across species boundaries (including cross-tier for decomposers)
- Logged as a distinct evo event type: "HGT: {donor} transferred {gene} to {recipient}"

### 2.7 Scheduled and Procedural Disasters

Replace paint-only disasters with a scheduler:

```typescript
interface ScheduledEvent {
  type: DisasterKind;
  triggerGen: number;       // generation to fire
  cx: number; cy: number;   // epicentre
  radius: number;
  intensity: number;        // 0.0 - 1.0, scales effect magnitude
}
```

**Procedural disaster generation:**
- Every 200 generations, roll for a natural disaster (30% chance)
- Type weighted by current state:
  - High population density -> Red Tide or Toxic Bloom
  - Many apex predators -> no effect (stable)
  - Low genetic diversity -> Heatwave (tests adaptability)
  - Near volcanic terrain -> Volcano
- Intensity scales with how long since last disaster (pressure builds)
- Chain reactions: Volcano can trigger Toxic Bloom (40% chance) 20 gens later

**Climate drift (long-term):**
- Every 500 generations, seasonal modifiers shift by +/- 5%
- Cumulative drift creates ice ages (winter gets harsher) or warm periods
- Resets after 2000 generations of drift (cyclical)
- Displayed as a "Climate" indicator in the UI (e.g., "Warming +12%")

**User control:** Procedural disasters can be toggled on/off in settings. Manual paint
disasters remain available regardless.

---

## 3. Visualisation and UI

### 3.1 Pan/Zoom Camera

Replace scrollbar-based navigation with a proper camera:

```typescript
interface Camera {
  x: number;           // world-space offset (pixels)
  y: number;
  zoom: number;        // 0.25 to 4.0 (default 1.0)
  targetX: number;     // for smooth interpolation
  targetY: number;
  targetZoom: number;
}
```

**Controls:**
- Mouse wheel: zoom in/out (centred on cursor)
- Click + drag (middle button or Ctrl+left): pan
- Pinch gesture on touch devices: zoom
- Double-click: zoom to 2x centred on click point
- Home key: reset to default view (fit grid to viewport)

**Minimap:**
- 120x120px canvas in bottom-right corner
- Shows entire grid at thumbnail scale
- Viewport rectangle drawn on minimap (draggable to pan)
- Population density heatmap colouring on minimap

**Rendering adaptation:**
- At zoom < 0.5: skip bevel effect, skip trait indicators, use solid colour fills
- At zoom > 2.0: show cell borders, hunger bar per cell, species initial letter
- Only render cells within the viewport frustum (cull off-screen cells)

### 3.2 Global Phylogenetic Tree

A dedicated full-screen overlay showing the complete evolutionary history:

**Layout algorithm: Force-directed cladogram**
- Root nodes (base species) anchored at left
- Time flows left to right (x-axis = generation of speciation)
- Vertical spacing via force simulation (repulsion between nodes, attraction along edges)
- Extinct species rendered with dashed branches, greyed out
- Living species rendered with solid branches in species colour

**Node display:**
- Circle sized by current population (log scale)
- Species colour fill
- Name label (full, no truncation)
- Hover: tooltip with population, traits, key genes, generation born
- Click: open species info panel

**Edge display:**
- Parent to child connection
- Thickness proportional to genetic similarity
- Colour gradient from parent to child colour
- Symbiosis links shown as dotted cross-connections

**Controls:**
- Open via toolbar button or keyboard shortcut (T)
- Pan and zoom within the tree view
- Filter: show/hide extinct species, filter by tier, search by name
- Time slider: scrub to a past generation, tree shows state at that point
- Export: SVG download of current tree view

**Data structure:**

```typescript
interface PhyloNode {
  speciesId: number;
  parentId: number | null;
  bornGen: number;
  extinctGen: number | null;
  tier: Tier;
  colour: string;
  traits: string[];
  children: number[];
}

interface PhyloTree {
  nodes: Map<number, PhyloNode>;
  roots: number[];            // base species with no parent
  symbioses: Symbiosis[];
}
```

### 3.3 Heatmap and Resource Overlays

Toggle-able overlay layers rendered on top of the grid:

| Overlay           | Data Source              | Colour Scale                     |
|-------------------|--------------------------|----------------------------------|
| Population density| Count same-species in 5x5| Blue (sparse) to Red (dense)     |
| Genetic diversity | Per-cell heterozygosity  | Red (low/bottleneck) to Green    |
| Hunger stress     | hunger / hungerMax       | Green (fed) to Red (starving)    |
| Oxygen            | resources.oxygen         | Red (anoxic) to Blue (saturated) |
| Nutrients         | resources.nutrients      | Brown (depleted) to Green (rich) |
| Light             | resources.light          | Black (dark) to Yellow (bright)  |
| Trait distribution| Presence of selected trait| Grey (absent) to Gold (present)  |
| Age               | age typed array          | White (young) to Purple (old)    |

**Rendering:** Overlay renders as a semi-transparent (alpha 0.5) colour layer on top of
the normal grid render. Toggle via a dropdown in the toolbar. Only one overlay active
at a time to keep the display readable.

**Implementation:** A separate overlay canvas stacked on top of the main canvas via CSS
`position: absolute`. Updated every 4 ticks (not every frame) for performance.

### 3.4 Time-lapse and Replay

**Frame recording:**

```typescript
interface ReplayFrame {
  generation: number;
  season: string;
  speciesGrid: Uint8Array;    // RLE compressed snapshot of species array
  popCounts: Record<number, number>;
  events: EvoLogEntry[];      // events that occurred this frame
}
```

- Record a frame every N generations (configurable: 1, 5, 10, 25)
- Store in a ring buffer (max 2000 frames, configurable)
- Memory budget: ~500 KB per frame (RLE compressed 400x400 grid) = ~1 GB at 2000 frames
  for max grid. For default grids (~200x200), ~125 KB per frame = ~250 MB at 2000 frames.

**Playback UI:**
- Timeline scrubber bar at bottom of screen
- Play/pause/speed controls for replay
- Generation counter synced to scrubber position
- Overlay the recorded grid state on the canvas (read-only, simulation paused)
- Population graph highlights current replay position with a vertical marker

**Export:**
- Export replay as WebM video via MediaRecorder API (canvas.captureStream())
- Export as GIF via a client-side GIF encoder (e.g., gif.js)
- Export frame sequence as PNG zip

### 3.5 Improved Family Tree Views

Addressing the original readability concern, plus integrating with the new global tree:

**Phylogenetic canvas (Species Info Panel):**
- Node row height: 16px -> 28px
- Node circles: 3.5px -> 6px radius (8px for current species)
- Font size: 7-8px -> 11px (13px bold for current)
- Label truncation: 12 chars -> 24 chars
- Add horizontal scroll if tree width exceeds panel width
- Add zoom buttons (+/-) on the canvas

**Evolution Tree Popup (right-click):**
- Max width: 340px -> 500px
- Node font: 0.6rem -> 0.8rem
- Stats font: 0.55rem -> 0.7rem
- Swatch size: 10x10px -> 14x14px
- Gene bars: 4px -> 8px height
- Add a "View Full Tree" link that opens the global phylogenetic tree (3.2) focused on
  this species' lineage

### 3.6 Responsive Panel Layout

Replace fixed pixel widths with a flexible layout:

- CSS Grid or Flexbox based layout with min/max constraints
- Left panel: collapsible (toggle button), min 140px, max 280px
- Right panel: collapsible, min 180px, max 400px
- Canvas: fills remaining space, maintains aspect ratio
- Bottom bar: collapsible to icon-only mode
- Breakpoints: at viewport < 1024px, stack panels below canvas (mobile-friendly)
- All panels support drag-resize (current divider approach, extended to all panels)

---

## 4. Data and Analysis

### 4.1 Extended Graph Suite

Beyond the current population graph, add:

| Graph               | X-axis      | Y-axis                    | Update interval |
|----------------------|-------------|---------------------------|-----------------|
| Population           | Generation  | Cell count per species    | 2 gens (existing)|
| Genetic diversity    | Generation  | Shannon diversity index   | 10 gens         |
| Trait frequency      | Generation  | % of living species with trait | 10 gens   |
| Food web connectivity| Generation  | Edge count in predation graph | 10 gens    |
| Trophic efficiency   | Generation  | Energy transfer ratio per tier | 10 gens   |
| Resource levels      | Generation  | Mean O2, nutrients, light | 5 gens          |
| Speciation rate      | Generation  | New species per 100 gens  | 50 gens         |

**Implementation:** A tabbed graph panel in the right sidebar. Each graph is a canvas
with the same rendering approach as the current population graph. Shared x-axis
(generation) and zoom/pan.

### 4.2 Experiment Mode

Run multiple simulations with the same starting conditions to compare outcomes:

```typescript
interface Experiment {
  name: string;
  baseState: SerializedState;    // starting conditions
  runs: ExperimentRun[];
  config: { runCount: number; maxGenerations: number; seed?: number };
}

interface ExperimentRun {
  seed: number;
  finalState: SerializedState;
  metrics: {
    finalBiodiversity: number;
    totalSpeciationsCount: number;
    totalExtinctions: number;
    maxLineageDepth: number;
    endPopulation: Record<number, number>;
  };
}
```

**Execution:** Each run executes in a separate Web Worker (up to navigator.hardwareConcurrency
workers in parallel). Progress bar shows completion across all runs.

**Results view:** Side-by-side comparison of key metrics across runs. Box plots for
biodiversity score, species count, extinction count. Highlight outlier runs for
detailed inspection.

### 4.3 Plugin / Custom Rules API

Allow users to define custom species, traits, and environmental rules:

```typescript
interface AquaSimPlugin {
  name: string;
  version: string;
  species?: CustomSpeciesDefinition[];
  traits?: CustomTraitDefinition[];
  rules?: CustomRule[];
  onTick?: (state: ReadonlySimState) => void;
  onEvoEvent?: (event: EvoEventData) => void;
}

interface CustomRule {
  name: string;
  trigger: 'tick' | 'breed' | 'death' | 'evoCheck';
  condition: (ctx: RuleContext) => boolean;
  effect: (ctx: RuleContext) => void;
}
```

**Loading:** Plugins loaded as ES modules from a `plugins/` directory or pasted into a
plugin editor panel. Sandboxed execution (no DOM access, no network, only the provided
API surface).

**Built-in plugin examples:**
- "Invasive Species": spawns a high-fitness species at random intervals
- "Pollution": gradually increases toxic cells from grid edges
- "Fishing Pressure": periodically removes apex predators

---

## 5. Quality of Life

### 5.1 Undo/Redo

**Scope:** Paint operations and manual disasters only (not simulation ticks).

```typescript
interface UndoEntry {
  type: 'paint' | 'disaster' | 'clear' | 'biome';
  before: {
    species: Uint8Array;     // RLE snapshot of affected region
    hunger: Int16Array;
    age: Uint16Array;
    bounds: { x: number; y: number; w: number; h: number };
  };
}
```

- Stack depth: 20 entries
- Ctrl+Z / Ctrl+Shift+Z keybindings
- Only captures the bounding rectangle of affected cells (not full grid) to save memory

### 5.2 Scenario Presets

Pre-built starting configurations loaded via the toolbar:

| Preset         | Grid  | Terrain                    | Species Mix                            |
|----------------|-------|----------------------------|----------------------------------------|
| Coral Reef     | 200x150 | Dense rock formations, warm | Coral, Shrimp, Small Fish, Octopus   |
| Deep Ocean     | 300x300 | Sparse rock, volcanic vents | Bacteria, Worms, Squid, Whale        |
| Tidal Pool     | 100x100 | Rock borders, shallow       | Seaweed, Snails, Crabs, Urchins      |
| Open Ocean     | 400x200 | No rock, strong currents    | Phytoplankton, Fish, Shark, Dolphin  |
| Primordial Soup| 200x200 | Minimal rock, high nutrients| Bacteria only, evolution maxed        |
| Extinction Event| 250x250| Post-disaster wasteland     | 3 random survivors, high radiation   |

Each preset is a serialised state loaded via the save/load system.

### 5.3 Accessibility

- **Colour-blind palettes:** 3 alternate palettes (protanopia, deuteranopia, tritanopia)
  using scientifically validated colour sets. Toggle in settings.
- **High contrast mode:** White grid lines, bold species outlines, larger text
- **Screen reader:** ARIA labels on all panels, species counts announced on change,
  keyboard navigation for all interactive elements
- **Reduced motion:** Option to disable particles, caustics, and glow effects

### 5.4 Keyboard Navigation

Extend current shortcuts:

| Key       | Action                          |
|-----------|---------------------------------|
| T         | Toggle global phylogenetic tree |
| O         | Cycle overlay modes             |
| L         | Toggle depth layer view         |
| R         | Start/stop replay recording     |
| Ctrl+S    | Save to IndexedDB               |
| Ctrl+O    | Load from IndexedDB             |
| Ctrl+Z    | Undo                            |
| Ctrl+Shift+Z | Redo                        |
| Tab       | Cycle focus between panels      |
| 1-6       | Select scenario preset          |
| F         | Fit grid to viewport            |
| +/-       | Zoom in/out                     |

---

## 6. Migration Strategy

### Phase 1: Scaffold and Extract (no behaviour changes)
1. Set up Vite + TypeScript project
2. Extract constants, types, and species definitions into modules
3. Extract rendering pipeline into canvas-renderer.ts
4. Extract UI panel code into respective modules
5. Extract evolution engine into genetics.ts, traits.ts, speciation.ts
6. Verify: identical behaviour to v1 monolith

### Phase 2: Core Infrastructure
1. Implement save/load (serialisation.ts)
2. Implement Web Worker tick loop
3. Implement camera (pan/zoom/minimap)
4. Implement undo/redo for paint operations

### Phase 3: Simulation Enhancements
1. Add resource layer (oxygen, nutrients, light)
2. Add depth layer tabs
3. Expand genome to 24 genes
4. Implement sexual selection
5. Implement symbiosis mechanics
6. Implement HGT for producers/decomposers

### Phase 4: Visualisation
1. Build global phylogenetic tree view
2. Implement heatmap overlays
3. Improve family tree readability (the original ask)
4. Build extended graph suite
5. Implement time-lapse recording and playback

### Phase 5: Polish
1. Scenario presets
2. Accessibility features
3. Scheduled disasters and climate drift
4. Plugin API
5. Experiment mode

Each phase is independently shippable and testable. Phase 1 is the critical path
as it unblocks parallel work on all subsequent phases.
