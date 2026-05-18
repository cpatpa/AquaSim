let currentSection = 'overview';

function sectionBtn(id: string, label: string): string {
  return `<button class="help-nav-btn${currentSection === id ? ' active' : ''}" data-section="${id}">${label}</button>`;
}

function buildNav(): string {
  return `
    <div class="help-nav">
      ${sectionBtn('overview', 'Overview')}
      ${sectionBtn('species', 'Species')}
      ${sectionBtn('genetics', 'Genetics')}
      ${sectionBtn('evolution', 'Evolution')}
      ${sectionBtn('traits', 'Traits')}
      ${sectionBtn('disasters', 'Disasters')}
      ${sectionBtn('seasons', 'Seasons')}
      ${sectionBtn('controls', 'Controls')}
      ${sectionBtn('about', 'About')}
    </div>`;
}

function buildSection(): string {
  switch (currentSection) {
    case 'overview': return overviewSection();
    case 'species': return speciesSection();
    case 'genetics': return geneticsSection();
    case 'evolution': return evolutionSection();
    case 'traits': return traitsSection();
    case 'disasters': return disastersSection();
    case 'seasons': return seasonsSection();
    case 'controls': return controlsSection();
    case 'about': return aboutSection();
    default: return overviewSection();
  }
}

function overviewSection(): string {
  return `
    <h3>Welcome to AquaSim</h3>
    <p>AquaSim is a marine ecosystem simulator where you build, observe and experiment with ocean life. Species interact through food webs, compete for territory and, with evolution enabled, develop new traits and diverge into entirely new species over time.</p>

    <h4>Getting Started</h4>
    <p>When you first load AquaSim, a balanced reef ecosystem is generated with producers, herbivores, consumers, apex predators, megafauna and decomposers. Press <b>Play</b> to start the simulation and watch the ecosystem unfold.</p>
    <ul>
      <li><b>Paint species</b> onto the grid by selecting one from the left panel and clicking on the canvas.</li>
      <li><b>Toggle Evolution</b> to allow species to mutate, gain traits and speciate into new organisms.</li>
      <li><b>Change speed</b> from 0.5x up to MAX to fast-forward through generations.</li>
      <li><b>Try a scenario</b> from the dropdown (Producer Paradise, Predator Pit, Post-Extinction, Reef Fortress, Abyssal Plain) for different starting conditions.</li>
    </ul>

    <h4>The Food Web</h4>
    <p>Life in AquaSim follows a tiered food chain:</p>
    <table class="help-table">
      <tr><td class="help-key">Producers</td><td>Phytoplankton, Seaweed, Coral. They reproduce without eating.</td></tr>
      <tr><td class="help-key">Herbivores</td><td>Shrimp, Snail, Crab, Sea Urchin. They eat producers.</td></tr>
      <tr><td class="help-key">Consumers</td><td>Small Fish, Squid, Pufferfish. They eat herbivores.</td></tr>
      <tr><td class="help-key">Apex</td><td>Shark, Octopus. Top predators that eat consumers and herbivores.</td></tr>
      <tr><td class="help-key">Megafauna</td><td>Whale, Dolphin. Massive filter feeders and pack hunters.</td></tr>
      <tr><td class="help-key">Decomposers</td><td>Bacteria, Sea Worm. They break down dead matter, recycling nutrients.</td></tr>
    </table>

    <h4>Key Concepts</h4>
    <ul>
      <li><b>Hunger</b>: Animals must eat or they starve. Each species has a maximum hunger tolerance.</li>
      <li><b>Breeding</b>: Well-fed organisms reproduce into adjacent empty cells at species-specific rates.</li>
      <li><b>Seasons</b>: Spring, Summer, Autumn and Winter cycle every 80 ticks, each affecting breeding, hunger and movement.</li>
      <li><b>Biodiversity Score</b>: A composite score of species diversity, trait richness and tier representation shown in the top-right panel.</li>
      <li><b>Generations</b>: One generation equals one simulation tick. Evolution events are checked periodically.</li>
    </ul>
  `;
}

function speciesSection(): string {
  return `
    <h3>Species Guide</h3>

    <h4 class="tier-heading tier-producer">Producers (Tier 0)</h4>
    <p>Producers are the foundation of the food web. They reproduce without consuming other organisms.</p>
    <table class="help-table">
      <tr>
        <td><span class="sp-dot" style="background:#22DD44"></span> <b>Phytoplankton</b></td>
        <td>The fastest-spreading producer and primary food source for most herbivores. Blooms rapidly in spring. Forms the base of nearly every food chain in the simulation.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#116633"></span> <b>Seaweed</b></td>
        <td>Slow-growing kelp forests that provide stable food patches. Consumed by snails and crabs. Hardier than plankton but reproduces much more slowly.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#DD44AA"></span> <b>Coral</b></td>
        <td>Rare reef-building organism. Very slow to establish but creates lasting habitat structure. The only food source for sea urchins. Clusters naturally around rock formations.</td>
      </tr>
    </table>

    <h4 class="tier-heading tier-herbivore">Herbivores (Tier 1)</h4>
    <p>Herbivores graze on producers and form the crucial link between plant life and predators.</p>
    <table class="help-table">
      <tr>
        <td><span class="sp-dot" style="background:#FFAA22"></span> <b>Shrimp</b></td>
        <td>Fast-breeding plankton grazers. High mobility and rapid reproduction make them the primary food source for small fish. Populations can boom and crash dramatically.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#AA8844"></span> <b>Snail</b></td>
        <td>Slow but hardy seaweed consumers that also scavenge dead matter. Their low metabolism helps them survive lean seasons. Prey for pufferfish.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#DD6622"></span> <b>Crab</b></td>
        <td>Versatile omnivores that eat both plants and dead matter. Moderate speed and decent hunger tolerance make them resilient generalists. Prey for pufferfish.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#886644"></span> <b>Sea Urchin</b></td>
        <td>Specialist coral predator. Very slow and rare, but extremely resilient with high hunger tolerance. The only herbivore that feeds on coral.</td>
      </tr>
    </table>

    <h4 class="tier-heading tier-consumer">Consumers (Tier 2)</h4>
    <p>Mid-level predators that control herbivore populations.</p>
    <table class="help-table">
      <tr>
        <td><span class="sp-dot" style="background:#4488FF"></span> <b>Small Fish</b></td>
        <td>Fast, agile schooling predators. They eat shrimp, plankton and dead matter. Their speed and breeding rate make them the most successful consumer species.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#AA44DD"></span> <b>Squid</b></td>
        <td>Agile deep-diving predator that hunts across multiple water layers. Good mobility but lower breeding rate than fish. A key food source for sharks.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#44AAAA"></span> <b>Pufferfish</b></td>
        <td>Tough bottom-dwelling consumer that feeds on crabs, snails and urchins. Slower but harder to kill than other consumers.</td>
      </tr>
    </table>

    <h4 class="tier-heading tier-apex">Apex Predators (Tier 3)</h4>
    <p>Top predators that keep consumer populations in check.</p>
    <table class="help-table">
      <tr>
        <td><span class="sp-dot" style="background:#FF4444"></span> <b>Shark</b></td>
        <td>The fastest organism in the simulation. Hunts consumers and herbivores across multiple layers. Low breeding rate balanced by extreme mobility and large hunger reserves.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#FF8800"></span> <b>Octopus</b></td>
        <td>Intelligent apex predator that operates in lower water layers. Moderate speed but with cunning hunting tactics. A crafty alternative to the brute-force shark.</td>
      </tr>
    </table>

    <h4 class="tier-heading tier-mega">Megafauna (Tier 4)</h4>
    <p>Massive ocean giants. Rare and slow to reproduce but immensely powerful.</p>
    <table class="help-table">
      <tr>
        <td><span class="sp-dot" style="background:#6666FF"></span> <b>Whale</b></td>
        <td>Enormous filter feeder that consumes huge amounts of prey across three water layers. Slowest breeding rate in the game but enormous hunger reserves. A true keystone species.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#44BBFF"></span> <b>Dolphin</b></td>
        <td>The fastest breeder among megafauna and the most mobile creature in the sim. Social pack hunters that coordinate across wide areas.</td>
      </tr>
    </table>

    <h4 class="tier-heading tier-decomp">Decomposers</h4>
    <p>Nature's recyclers. They break down dead matter, keeping the ecosystem clean.</p>
    <table class="help-table">
      <tr>
        <td><span class="sp-dot" style="background:#88AA44"></span> <b>Bacteria</b></td>
        <td>Extremely fast-breeding microorganisms that consume dead matter. The fastest reproducing species in the simulation. Essential for nutrient cycling.</td>
      </tr>
      <tr>
        <td><span class="sp-dot" style="background:#667744"></span> <b>Sea Worm</b></td>
        <td>Bottom-dwelling detritivores that feed on dead matter and bacteria. Slower than bacteria but more versatile, with moderate mobility.</td>
      </tr>
    </table>

    <h4>Environmental Elements</h4>
    <table class="help-table">
      <tr>
        <td><b>Rock</b></td>
        <td>Impassable terrain that shapes the landscape. Isolated rocks slowly erode. Coral clusters near rock formations.</td>
      </tr>
      <tr>
        <td><b>Currents</b></td>
        <td>Directional water flow that sweeps creatures along. Paint them by selecting the current tool and dragging in a direction.</td>
      </tr>
      <tr>
        <td><b>Dead Matter</b></td>
        <td>Left behind when organisms die. Consumed by decomposers and scavengers. Decays naturally after 14 ticks.</td>
      </tr>
    </table>

    <h4>Water Layers</h4>
    <p>The ocean has four vertical layers (0 to 3). Species occupy a home layer and can reach prey a fixed number of layers below them. This means a shark at layer 3 can hunt anything at layers 0 through 3, while a snail at layer 0 can only eat what shares its layer. This creates vertical niche separation and makes depth an important factor in ecosystem dynamics.</p>
  `;
}

function geneticsSection(): string {
  return `
    <h3>Genetics</h3>
    <p>Every species in AquaSim has a genome of 16 genes organised into four functional clusters. When evolution is enabled, these genes mutate, drift and recombine, driving adaptation and speciation.</p>

    <h4>The 16 Genes</h4>
    <table class="help-table">
      <tr><td colspan="2" class="gene-cluster">Morphology</td></tr>
      <tr><td class="help-key">Body Size</td><td>Mass and bulk. Larger organisms have more reach and hunger capacity but are more visible to predators.</td></tr>
      <tr><td class="help-key">Body Armour</td><td>Exoskeleton thickness. Improves survival but can reduce agility.</td></tr>
      <tr><td class="help-key">Body Shape</td><td>Streamlining. Affects speed and hunting efficiency.</td></tr>
      <tr><td class="help-key">Pigment</td><td>Coloration intensity. Drives camouflage, mimicry and visual signalling.</td></tr>

      <tr><td colspan="2" class="gene-cluster">Metabolism</td></tr>
      <tr><td class="help-key">Metabolic Rate</td><td>Energy burning speed. High metabolism increases activity but demands more food.</td></tr>
      <tr><td class="help-key">Fertility</td><td>Reproductive drive. Directly influences breeding rate.</td></tr>
      <tr><td class="help-key">Hunger Efficiency</td><td>How much nutrition is extracted from each meal.</td></tr>
      <tr><td class="help-key">Growth Rate</td><td>Maturation speed. Faster growth means earlier breeding.</td></tr>

      <tr><td colspan="2" class="gene-cluster">Behaviour</td></tr>
      <tr><td class="help-key">Aggression</td><td>Hunting drive. Enables ambush, pack hunting and territorial behaviour.</td></tr>
      <tr><td class="help-key">Sociality</td><td>Group tendency. Enables schooling, cooperative hunting and pod defence.</td></tr>
      <tr><td class="help-key">Curiosity</td><td>Exploration drive. Increases movement range and prey detection.</td></tr>
      <tr><td class="help-key">Flight Response</td><td>Escape instinct. Improves evasion and camouflage activation.</td></tr>

      <tr><td colspan="2" class="gene-cluster">Sensory</td></tr>
      <tr><td class="help-key">Vision Range</td><td>Sight distance. Extends hunting and detection range.</td></tr>
      <tr><td class="help-key">Chemosensory</td><td>Chemical detection (smell). Improves food-finding and toxin production.</td></tr>
      <tr><td class="help-key">Thermal Adapt</td><td>Temperature tolerance. Enables cold or warm season adaptation.</td></tr>
      <tr><td class="help-key">Pressure Adapt</td><td>Pressure tolerance. Enables deep-water survival and burrowing.</td></tr>
    </table>

    <h4>Diploid Genetics</h4>
    <p>Each gene is diploid, meaning every species carries two alleles per gene. Each allele ranges from 0.02 to 0.98. A dominance value (0.1 to 0.9) determines how the two alleles blend to produce the expressed gene value. This mirrors real biology where one allele may be dominant over another.</p>

    <h4>Epistasis</h4>
    <p>Genes do not act in isolation. AquaSim models epistatic interactions where one gene modifies the expression of another:</p>
    <ul>
      <li><b>Body Size amplifies Body Armour</b>: Larger bodies support thicker exoskeletons.</li>
      <li><b>Body Size reduces Curiosity</b>: Larger organisms tend to be less exploratory.</li>
      <li><b>Metabolic Rate amplifies Fertility</b>: Higher metabolism supports faster reproduction.</li>
      <li><b>Aggression reduces Sociality</b>: Aggressive individuals are less cooperative.</li>
      <li><b>Body Shape amplifies Body Armour</b>: Streamlined forms distribute armour more efficiently.</li>
    </ul>

    <h4>Gene Variance</h4>
    <p>Each species tracks genetic variance per gene. Populations with high variance evolve faster and are more likely to speciate. Small populations (under 15 individuals) experience allele fixation, where genetic drift reduces variance and limits adaptability. Dominant species accumulate variance faster.</p>

    <h4>Stabilising Selection</h4>
    <p>Extreme gene values (above 0.88 or below 0.12) are gently pushed back toward the mid-range. This prevents runaway evolution and models the real-world tendency for extreme phenotypes to be selected against.</p>
  `;
}

function evolutionSection(): string {
  return `
    <h3>Evolution</h3>
    <p>When evolution is enabled (the Evo checkbox), species undergo mutation, speciation, niche shifts and competitive dynamics. This is where AquaSim transforms from a simple ecosystem model into a generator of emergent complexity.</p>

    <h4>Mutation</h4>
    <p>Each generation has an 18% chance of triggering an evolution pass. During a pass, gene values shift by small random amounts (standard deviation of 0.05). Mutations within the same gene cluster have a 30% chance of being correlated, modelling genetic linkage where nearby genes on a chromosome tend to be inherited together.</p>
    <p>After mass extinction events, a radiation boost doubles mutation rates for 5 generations, accelerating recovery and adaptation.</p>

    <h4>Speciation</h4>
    <p>When a species accumulates enough genetic divergence (drift threshold of 0.12), it may split into a new species. This requires:</p>
    <ul>
      <li>A minimum population of 20 individuals (lower for deeper lineages).</li>
      <li>Sufficient gene divergence from the parent species.</li>
      <li>Allopatric separation: the population must be spatially fragmented into distinct clusters.</li>
    </ul>
    <p>When speciation occurs, 35% of the parent population converts to the new species. The offspring species undergoes meiosis-like recombination, with each gene picking one parental allele and applying a small mutation. Sexual selection causes pigment to diverge more strongly, giving new species a visually distinct colour (shifted by up to 70 RGB units).</p>
    <p>New species have a 35% chance of adding their parent species to their diet and a 15% chance of dropping a random existing food source, leading to dietary innovation.</p>

    <h4>Niche Shift (Tier Evolution)</h4>
    <p>Under sustained ecological pressure, a species may jump to a different trophic tier entirely. This happens when:</p>
    <ul>
      <li>Predator pressure is high (predators outnumber the species by more than 1.05x).</li>
      <li>Prey availability is low (less than 80% of predator population).</li>
      <li>Population trend is declining (more than 15% drop).</li>
    </ul>
    <p>Convergent evolution accelerates this process: if a tier has less than 3% of total population, species in adjacent tiers get a 40% boost to niche-shift probability, naturally filling empty ecological roles.</p>
    <p>When a species shifts tier, its genes are nudged to match the new role (for example, increased body shape and aggression for a herbivore becoming a consumer) and it develops a new diet targeting species in the tier below.</p>

    <h4>Immigration</h4>
    <p>Periodically, new species immigrate into the ecosystem from outside. Different tiers have different immigration intervals (herbivores every 8 generations, consumers and apex every 6, megafauna every 10, decomposers every 15). Immigrants arrive as a cluster of 20 individuals near a food source and may bring novel adaptations. Consumer and apex immigrants co-migrate with prey species.</p>

    <h4>Competitive Dynamics</h4>
    <p><b>Overpopulation predation</b>: When a species exceeds 2.5x the average population, it may develop predatory behaviour toward lower-tier species, adding them to its diet.</p>
    <p><b>Self-predation</b>: Abundant species with close lineage relatives (shared ancestors) may begin consuming related species, modelling intraspecific competition.</p>
    <p><b>Character displacement</b>: Same-tier species with more than 50% diet overlap have their most different gene pushed further apart, reducing competition through niche differentiation.</p>
    <p><b>Dominance culling</b>: Species exceeding 20% of total population face a small additional death rate (2% base), preventing any single species from completely dominating.</p>
  `;
}

function traitsSection(): string {
  return `
    <h3>Traits and Novel Adaptations</h3>
    <p>Traits are phenotypic abilities that emerge when a species' gene values cross specific thresholds. Each species can hold up to 5 traits (configurable in settings). Producers are limited to 2 defensive traits.</p>

    <h4>How Traits Emerge</h4>
    <p>Each generation has a 12% chance of trait evaluation for each species. A trait expresses when all its required genes exceed their thresholds and none of its inhibitor genes exceed their maximum. For example, camouflage requires pigment above 0.50 and flight response above 0.35, but is inhibited if aggression exceeds 0.40. Trait strength scales with gene values, ranging from 0.5x to 1.5x effectiveness.</p>

    <h4>Defensive Traits</h4>
    <table class="help-table">
      <tr><td class="help-key">Camouflage</td><td>40% chance predators miss when hunting this species.</td></tr>
      <tr><td class="help-key">Chromatophores</td><td>Active colour-changing camouflage. More effective than static camouflage.</td></tr>
      <tr><td class="help-key">Toxic</td><td>Predators take hunger damage when consuming this species.</td></tr>
      <tr><td class="help-key">Shell</td><td>+40% hunger tolerance but 30% slower movement.</td></tr>
      <tr><td class="help-key">Armoured</td><td>30% chance to survive being eaten; predator gets only partial food.</td></tr>
      <tr><td class="help-key">Thorns</td><td>Predators take heavy hunger penalties when grazing.</td></tr>
      <tr><td class="help-key">Deep Root</td><td>35% chance to survive being consumed outright.</td></tr>
      <tr><td class="help-key">Regrowth</td><td>When eaten, spreads to 2 adjacent empty tiles. Cut one head off, two grow back.</td></tr>
      <tr><td class="help-key">Ink Cloud</td><td>50% dodge chance plus teleport 2 tiles away.</td></tr>
      <tr><td class="help-key">Mimicry</td><td>Appears dangerous to predators. 45% skip chance.</td></tr>
      <tr><td class="help-key">Pod Defence</td><td>50% miss chance when 2 or more allies are nearby.</td></tr>
      <tr><td class="help-key">Biofilm</td><td>35% damage reduction in clusters of 3 or more.</td></tr>
      <tr><td class="help-key">Dwarfism</td><td>35% less hunger needed, but can be eaten by same-tier species.</td></tr>
      <tr><td class="help-key">Gigantism</td><td>30% predator miss chance but 40% more hunger required.</td></tr>
    </table>

    <h4>Offensive Traits</h4>
    <table class="help-table">
      <tr><td class="help-key">Ambush</td><td>2-tile attack range along cardinal directions.</td></tr>
      <tr><td class="help-key">Bioluminescence</td><td>Attracts prey within 3 tiles using light lures.</td></tr>
      <tr><td class="help-key">Pack Hunter</td><td>Ignores camouflage and pod defence with 2+ allies adjacent.</td></tr>
      <tr><td class="help-key">Stalker</td><td>Moves 2 tiles toward nearest prey each tick.</td></tr>
      <tr><td class="help-key">Trap Jaw</td><td>First attack is an instant kill, ignoring all defences.</td></tr>
      <tr><td class="help-key">Venomous</td><td>Missed attacks still poison prey. Successful kills poison the surrounding area.</td></tr>
      <tr><td class="help-key">Bulk Feeder</td><td>Eats up to 3 adjacent prey in a single tick.</td></tr>
      <tr><td class="help-key">Streamlined</td><td>+30% speed and +15% hunt success, but 20% less armour.</td></tr>
    </table>

    <h4>Producer Traits</h4>
    <table class="help-table">
      <tr><td class="help-key">Spore</td><td>Can spread 2 tiles away instead of only to adjacent cells.</td></tr>
      <tr><td class="help-key">Lithivore</td><td>Eats rock, clearing terrain and restoring hunger.</td></tr>
      <tr><td class="help-key">Nitrogen Fixation</td><td>Breeds 2x faster near dead matter.</td></tr>
      <tr><td class="help-key">Allelopathy</td><td>Inhibits other producer species within 2 tiles via chemical warfare.</td></tr>
    </table>

    <h4>Metabolic and Survival Traits</h4>
    <table class="help-table">
      <tr><td class="help-key">Schooling</td><td>+50% breed rate when near 3 or more of the same species.</td></tr>
      <tr><td class="help-key">Symbiosis</td><td>Recovers hunger when adjacent to producers.</td></tr>
      <tr><td class="help-key">Photosynthesis</td><td>Slowly restores hunger in open water (1 per 4 ticks).</td></tr>
      <tr><td class="help-key">Filter Feeder</td><td>Passively feeds from any producer within 2 tiles.</td></tr>
      <tr><td class="help-key">Parasite</td><td>Steals hunger from adjacent species without killing them.</td></tr>
      <tr><td class="help-key">Scavenger</td><td>Can eat dead matter as a fallback food source.</td></tr>
      <tr><td class="help-key">Regeneration</td><td>Passively heals 1 hunger every 3 ticks.</td></tr>
      <tr><td class="help-key">Torpor</td><td>Enters low-metabolism dormancy near starvation.</td></tr>
      <tr><td class="help-key">Hypermetabolism</td><td>2x breed rate but 2x hunger rate. Live fast, die young.</td></tr>
    </table>

    <h4>Seasonal and Social Traits</h4>
    <table class="help-table">
      <tr><td class="help-key">Cold Adapted</td><td>Thrives in winter with no cold-season penalties.</td></tr>
      <tr><td class="help-key">Warm Adapted</td><td>Bonus breed rate in summer; reduced hunger in warmth.</td></tr>
      <tr><td class="help-key">Nocturnal</td><td>+40% breed/speed in autumn and winter, reduced in spring and summer.</td></tr>
      <tr><td class="help-key">Diurnal</td><td>+40% breed/speed in spring and summer, reduced in autumn and winter.</td></tr>
      <tr><td class="help-key">Migratory</td><td>Moves faster during seasonal transitions.</td></tr>
      <tr><td class="help-key">Colonial</td><td>Adjacent same-species share hunger, averaging across the cluster.</td></tr>
      <tr><td class="help-key">Maternal</td><td>Offspring start with zero hunger and a stat boost.</td></tr>
      <tr><td class="help-key">Territorial</td><td>Kills same-species neighbours when crowded. +60% breed rate when alone.</td></tr>
      <tr><td class="help-key">Cooperative Hunt</td><td>When one member of a pack kills, the entire group feeds.</td></tr>
    </table>

    <h4>Sensory Traits</h4>
    <table class="help-table">
      <tr><td class="help-key">Echolocation</td><td>Detects prey within 4 tiles and moves toward the nearest.</td></tr>
      <tr><td class="help-key">Thermosensing</td><td>Detects warm-blooded prey and is immune to temperature events.</td></tr>
      <tr><td class="help-key">Lateral Line</td><td>Detects movement within 3 tiles.</td></tr>
    </table>

    <h4>Trait Synergies</h4>
    <p>Certain trait combinations produce powerful synergy bonuses:</p>
    <table class="help-table">
      <tr><td class="help-key">Wolfpack</td><td>Schooling + Cooperative Hunt. 1.8x hunt bonus.</td></tr>
      <tr><td class="help-key">Fortress Mode</td><td>Shell + Torpor. 0.7x damage taken.</td></tr>
      <tr><td class="help-key">Aposematic</td><td>Toxic + Bioluminescence. 0.6x predator avoidance.</td></tr>
      <tr><td class="help-key">Perfect Ambush</td><td>Chromatophores + Ambush. 1.5x hunt bonus.</td></tr>
      <tr><td class="help-key">Pursuit Predator</td><td>Streamlined + Lateral Line. 1.25x speed bonus.</td></tr>
      <tr><td class="help-key">Stronghold</td><td>Parental Investment + Territorial. 1.3x breed bonus.</td></tr>
    </table>

    <h4>Novel Adaptations</h4>
    <p>Rare mutations that emerge when genes reach extreme values. Each species can develop up to 2 novel adaptations. There is a 2% chance per generation of a novel adaptation emerging (increased during radiation events).</p>
    <table class="help-table">
      <tr><td class="help-key">Jet Propulsion</td><td>Burst-moves 3 tiles when fleeing.</td></tr>
      <tr><td class="help-key">Flying Fish</td><td>Leaps over obstacles and terrain.</td></tr>
      <tr><td class="help-key">Burrowing</td><td>Digs into substrate to hide from predators.</td></tr>
      <tr><td class="help-key">Electric Organ</td><td>Stuns attackers with bioelectric discharge.</td></tr>
      <tr><td class="help-key">Calcification</td><td>Leaves rock instead of dead matter on death, building reefs.</td></tr>
      <tr><td class="help-key">Autotomy</td><td>Sheds a body part to escape predators (like a lizard's tail).</td></tr>
      <tr><td class="help-key">Mucus Coat</td><td>Slippery body that is difficult for predators to catch.</td></tr>
      <tr><td class="help-key">Kleptoplasty</td><td>Gains temporary photosynthesis from consumed algae.</td></tr>
      <tr><td class="help-key">Aestivation</td><td>Goes dormant when starving, waiting for conditions to improve.</td></tr>
      <tr><td class="help-key">Chemosynthesis</td><td>Feeds on minerals near rock and lava, independent of sunlight.</td></tr>
      <tr><td class="help-key">Brood Parasite</td><td>Converts rival species' cells when breeding.</td></tr>
      <tr><td class="help-key">Budding</td><td>Sometimes breeds into two cells at once.</td></tr>
      <tr><td class="help-key">Neoteny</td><td>Breeds faster but is more vulnerable (retained juvenile form).</td></tr>
      <tr><td class="help-key">Electroreception</td><td>Detects hidden prey through bioelectric fields.</td></tr>
      <tr><td class="help-key">Hivemind</td><td>Colony coordinates defence and breeding as one superorganism.</td></tr>
    </table>
  `;
}

function disastersSection(): string {
  return `
    <h3>Disasters</h3>
    <p>Disasters are cataclysmic events you can trigger by selecting a disaster from the species palette (marked in red) and clicking on the grid. They reshape ecosystems, create selection pressure and drive evolution in dramatic ways.</p>

    <table class="help-table">
      <tr>
        <td class="help-key" style="color:#FF6B6B">Bomb</td>
        <td>Obliterates all life and terrain in a radius. Creates a clean slate. Nothing survives.</td>
      </tr>
      <tr>
        <td class="help-key" style="color:#FF6B6B">Oil Spill</td>
        <td>Spreads slowly across the water (6% chance per direction per tick), killing adjacent life. Persists for 40 ticks before decaying. Creates dead zones that take generations to recover.</td>
      </tr>
      <tr>
        <td class="help-key" style="color:#FF6B6B">Heatwave</td>
        <td>Kills animals in the affected radius. Plants survive. Species with warm adaptation or thermosensing traits have a 50% chance of survival, creating strong selection pressure for heat tolerance.</td>
      </tr>
      <tr>
        <td class="help-key" style="color:#FF6B6B">Ice Age</td>
        <td>Freezes all non-empty cells in the radius. Cold-adapted species are unaffected. Frozen organisms thaw after 60 ticks. Favours cold-adapted species and can completely reshape which species dominate.</td>
      </tr>
      <tr>
        <td class="help-key" style="color:#FF6B6B">Toxic Bloom</td>
        <td>Spreading toxic algae (8% per direction per tick). Damages non-toxic species. Species with the toxic trait are immune and thrive. Biofilm clusters have 35% resistance. Persists for 50 ticks.</td>
      </tr>
      <tr>
        <td class="help-key" style="color:#FF6B6B">Volcano</td>
        <td>The most complex disaster. Creates a lava core that spreads aggressively in early ticks (12% spread rate), slows as it ages, and eventually cools into rock after 40 ticks. Spawns 1 to 3 active vents that continue erupting for 60 to 90 ticks. Radiates lethal heat 2 tiles out (35% kill chance). Warm-adapted and thermosensing species have 60% heat immunity. Cooled lava near existing rock formations permanently becomes rock, literally reshaping the terrain.</td>
      </tr>
    </table>

    <h4>Disasters and Evolution</h4>
    <p>Mass extinction events triggered by disasters activate a radiation boost, doubling mutation rates for 5 generations. This models the real-world pattern where mass extinctions are followed by explosive adaptive radiation as surviving species rapidly diversify to fill empty niches. Disasters are not just destructive: they are engines of evolutionary innovation.</p>
  `;
}

function seasonsSection(): string {
  return `
    <h3>Seasons</h3>
    <p>The simulation cycles through four seasons, each lasting 80 ticks. Seasons significantly affect breeding rates, hunger pressure and movement speed.</p>

    <table class="help-table wide-table">
      <tr><th>Season</th><th>Breeding</th><th>Hunger</th><th>Movement</th><th>Producers</th></tr>
      <tr><td class="help-key" style="color:#88FF88">Spring</td><td>1.3x</td><td>0.9x</td><td>1.0x</td><td>1.5x</td></tr>
      <tr><td class="help-key" style="color:#FFDD44">Summer</td><td>1.1x</td><td>1.0x</td><td>1.1x</td><td>1.0x</td></tr>
      <tr><td class="help-key" style="color:#DD8844">Autumn</td><td>0.8x</td><td>1.2x</td><td>0.9x</td><td>0.7x</td></tr>
      <tr><td class="help-key" style="color:#88BBFF">Winter</td><td>0.5x</td><td>1.4x</td><td>0.7x</td><td>0.4x</td></tr>
    </table>

    <h4>Seasonal Strategies</h4>
    <p><b>Spring</b> is a time of abundance. Producer blooms fuel rapid herbivore growth, which in turn feeds predators. Populations peak in late spring.</p>
    <p><b>Summer</b> is stable with slightly elevated movement. Predators are at their most active.</p>
    <p><b>Autumn</b> brings increasing hunger pressure and slowing reproduction. Populations begin to contract. Species without efficient metabolisms start dying off.</p>
    <p><b>Winter</b> is brutal. Breeding halves, hunger spikes by 40%, and movement slows dramatically. Producer growth drops to 40% of normal. Only the well-adapted survive. Cold-adapted species with the right traits can actually thrive while others struggle.</p>

    <h4>Seasonal Trait Interactions</h4>
    <ul>
      <li><b>Cold Adapted</b> species ignore winter penalties entirely.</li>
      <li><b>Warm Adapted</b> species get a breeding bonus in summer and reduced hunger.</li>
      <li><b>Nocturnal</b> species peak in autumn and winter (+40% breed and speed).</li>
      <li><b>Diurnal</b> species peak in spring and summer (+40% breed and speed).</li>
      <li><b>Migratory</b> species move faster during seasonal transitions.</li>
    </ul>
    <p>These adaptations create temporal niche partitioning, where different species dominate in different seasons, maintaining year-round biodiversity.</p>
  `;
}

function controlsSection(): string {
  return `
    <h3>Controls</h3>

    <h4>Keyboard Shortcuts</h4>
    <table class="help-table">
      <tr><td class="help-key">Space</td><td>Play / Pause the simulation</td></tr>
      <tr><td class="help-key">Right Arrow</td><td>Step forward one tick</td></tr>
      <tr><td class="help-key">0 - 4</td><td>Speed (0 = 0.5x, 1 = 1x, 2 = 2x, 3 = 4x, 4 = MAX)</td></tr>
      <tr><td class="help-key">E</td><td>Toggle evolution on/off</td></tr>
      <tr><td class="help-key">M</td><td>Trigger a mutation storm (5-generation radiation boost)</td></tr>
      <tr><td class="help-key">S</td><td>Seed grid with a new random ecosystem</td></tr>
      <tr><td class="help-key">B</td><td>Add balanced rock reefs to the current grid</td></tr>
      <tr><td class="help-key">G</td><td>Generate a biome-based landscape</td></tr>
      <tr><td class="help-key">C</td><td>Clear the entire grid</td></tr>
      <tr><td class="help-key">Ctrl+Z</td><td>Undo last paint stroke</td></tr>
      <tr><td class="help-key">Ctrl+Y</td><td>Redo paint stroke</td></tr>
      <tr><td class="help-key">?</td><td>Open this help guide</td></tr>
      <tr><td class="help-key">Escape</td><td>Close modals and overlays</td></tr>
    </table>

    <h4>Mouse Controls</h4>
    <table class="help-table">
      <tr><td class="help-key">Left Click</td><td>Paint the selected species or trigger a disaster</td></tr>
      <tr><td class="help-key">Left Drag</td><td>Paint continuously (or set current direction for water currents)</td></tr>
      <tr><td class="help-key">Scroll Wheel</td><td>Zoom in and out (zooms toward cursor position)</td></tr>
      <tr><td class="help-key">Middle / Right Drag</td><td>Pan the camera across the grid</td></tr>
      <tr><td class="help-key">Click species in stats</td><td>Open detailed species info with creature portrait</td></tr>
    </table>

    <h4>Touch Controls (Mobile)</h4>
    <table class="help-table">
      <tr><td class="help-key">Single Finger</td><td>Pan camera (default). Toggle the Paint button to switch to painting.</td></tr>
      <tr><td class="help-key">Two Fingers</td><td>Pinch to zoom, drag to pan</td></tr>
      <tr><td class="help-key">Paint FAB</td><td>Floating button in bottom-right toggles between Pan and Paint modes</td></tr>
    </table>

    <h4>Bottom Bar Buttons</h4>
    <table class="help-table">
      <tr><td class="help-key">Play / Pause</td><td>Start or stop the simulation loop</td></tr>
      <tr><td class="help-key">Step</td><td>Advance exactly one tick (only when paused)</td></tr>
      <tr><td class="help-key">Speed</td><td>Simulation speed from 0.5x (slow) to MAX (as fast as your device can run)</td></tr>
      <tr><td class="help-key">Evo</td><td>Enable or disable evolution, mutation and speciation</td></tr>
      <tr><td class="help-key">Seed</td><td>Populate the grid with a balanced random ecosystem</td></tr>
      <tr><td class="help-key">Balance</td><td>Add rock reef formations without clearing existing life</td></tr>
      <tr><td class="help-key">Biome</td><td>Reset and generate a terrain-driven biome landscape</td></tr>
      <tr><td class="help-key">Clear</td><td>Wipe the grid completely (all species, terrain and history)</td></tr>
      <tr><td class="help-key">Save</td><td>Save simulation to your account (or download as file if not logged in)</td></tr>
      <tr><td class="help-key">Load</td><td>Load a simulation from a .json save file</td></tr>
      <tr><td class="help-key">My Sims</td><td>Browse and load your saved simulations (up to 10)</td></tr>
      <tr><td class="help-key">Ranks</td><td>Leaderboard of top scores across biodiversity, speciations and more</td></tr>
      <tr><td class="help-key">Export</td><td>Download a detailed data export (JSON) of the current simulation state</td></tr>
      <tr><td class="help-key">Tree</td><td>View the phylogenetic tree of all species lineages</td></tr>
      <tr><td class="help-key">Settings</td><td>Adjust mutation rate, speciation rate, trait limits and grid size</td></tr>
    </table>
  `;
}

function aboutSection(): string {
  return `
    <h3>About AquaSim</h3>

    <h4>The Story</h4>
    <p>I have always been fascinated by evolution. The idea that complexity, beauty and intelligence can emerge from simple rules applied over vast timescales is, to me, one of the most compelling ideas in all of science.</p>
    <p>AquaSim is inspired by a game I played on a Mac in the computer labs in high school in the 90s. I no longer remember the name of that game, but I vividly remember the feeling of watching digital creatures compete, adapt and evolve on screen. It felt like witnessing something profound in miniature. That experience stuck with me for decades and eventually became this project.</p>
    <p>AquaSim tries to capture that same sense of wonder while incorporating a much deeper simulation of genetics, ecology and evolutionary biology.</p>

    <h4>The Science</h4>
    <p>While AquaSim simplifies many real biological processes, it draws on genuine scientific principles:</p>
    <ul>
      <li><b>Mendelian genetics</b>: Diploid genomes with dominant and recessive alleles.</li>
      <li><b>Population genetics</b>: Genetic drift in small populations, allele fixation, and the founder effect during speciation.</li>
      <li><b>Natural selection</b>: Predation pressure, seasonal stress and resource competition drive adaptation.</li>
      <li><b>Allopatric speciation</b>: Geographic separation of populations leads to divergence and eventually new species.</li>
      <li><b>Epistasis</b>: Genes interact with each other, where one gene's expression modifies another's.</li>
      <li><b>Adaptive radiation</b>: Mass extinctions create empty niches that surviving species rapidly diversify to fill.</li>
      <li><b>Convergent evolution</b>: Unrelated species evolve similar traits when facing similar pressures.</li>
      <li><b>Character displacement</b>: Competing species diverge to reduce niche overlap.</li>
      <li><b>Red Queen hypothesis</b>: Predators and prey are locked in co-evolutionary arms races, each driving the other's adaptation.</li>
      <li><b>Trophic cascades</b>: Changes at one level of the food web ripple through the entire ecosystem.</li>
    </ul>

    <h4>Tips for Interesting Runs</h4>
    <ul>
      <li>Start with a balanced reef and enable evolution. Let it run for 500+ generations and check back to see what emerged.</li>
      <li>Try the Post-Extinction scenario: just phytoplankton, shrimp and bacteria. Watch how evolution fills the empty tiers.</li>
      <li>Drop a volcano in a thriving ecosystem and watch the recovery. The radiation boost often produces the most interesting new species.</li>
      <li>Use the phylogenetic tree viewer (Tree button) to trace the ancestry of evolved species.</li>
      <li>Click on a species in the stats panel to see its full genetic profile, traits and creature portrait.</li>
      <li>Paint currents to create migration corridors. Allopatric speciation happens faster when populations are separated by terrain.</li>
    </ul>
  `;
}

export function openHelp(): void {
  if (document.getElementById('help-overlay')) return;

  currentSection = 'overview';
  renderHelp();
}

function renderHelp(): void {
  let overlay = document.getElementById('help-overlay');
  const isNew = !overlay;

  if (isNew) {
    overlay = document.createElement('div');
    overlay.id = 'help-overlay';
    overlay.className = 'help-overlay';
  }

  overlay!.innerHTML = `
    <div class="help-panel">
      <div class="help-header">
        <span>AquaSim Guide</span>
        <button id="help-close">&times;</button>
      </div>
      ${buildNav()}
      <div class="help-body">
        ${buildSection()}
      </div>
    </div>
  `;

  if (isNew) {
    document.body.appendChild(overlay!);
  }

  overlay!.querySelector('#help-close')!.addEventListener('click', () => closeHelp());
  overlay!.addEventListener('click', (e) => {
    if (e.target === overlay) closeHelp();
  });

  for (const btn of overlay!.querySelectorAll('.help-nav-btn')) {
    btn.addEventListener('click', () => {
      currentSection = (btn as HTMLElement).dataset.section || 'overview';
      renderHelp();
    });
  }
}

export function closeHelp(): void {
  const el = document.getElementById('help-overlay');
  if (el) el.remove();
}

export function injectHelpStyles(): void {
  if (document.getElementById('help-styles')) return;
  const style = document.createElement('style');
  style.id = 'help-styles';
  style.textContent = `
    .help-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .help-panel {
      background: #0A1520; border: 1px solid #1A3A4B; border-radius: 8px;
      width: 720px; max-width: 95vw; max-height: 85vh;
      font-family: 'Share Tech Mono', monospace; color: #7EE8FA;
      display: flex; flex-direction: column;
    }
    .help-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid #1A3A4B;
      font-family: 'Orbitron', monospace; color: #00E5FF; letter-spacing: 1px;
      flex-shrink: 0;
    }
    .help-header button {
      background: none; border: none; color: #4A7A8A; font-size: 1.5rem; cursor: pointer;
    }
    .help-header button:hover { color: #FF6B6B; }
    .help-nav {
      display: flex; flex-wrap: wrap; gap: 0; border-bottom: 1px solid #1A3A4B;
      flex-shrink: 0; overflow-x: auto;
    }
    .help-nav-btn {
      background: none; border: none; border-bottom: 2px solid transparent;
      color: #4A7A8A; font-family: 'Share Tech Mono', monospace; font-size: 0.75rem;
      padding: 8px 12px; cursor: pointer; white-space: nowrap;
    }
    .help-nav-btn:hover { color: #7EE8FA; }
    .help-nav-btn.active { color: #00E5FF; border-bottom-color: #00E5FF; }
    .help-body {
      padding: 16px 20px; overflow-y: auto; flex: 1;
    }
    .help-body::-webkit-scrollbar { width: 6px; }
    .help-body::-webkit-scrollbar-thumb { background: #0C2D40; border-radius: 3px; }
    .help-body h3 {
      font-family: 'Orbitron', monospace; color: #00E5FF; font-size: 1rem;
      letter-spacing: 1px; margin: 0 0 12px;
    }
    .help-body h4 {
      color: #7EE8FA; font-size: 0.85rem; margin: 16px 0 8px;
      padding-top: 10px; border-top: 1px solid #0D1B2A;
    }
    .help-body h4:first-of-type { border-top: none; padding-top: 0; }
    .help-body p {
      color: #8AB4C4; font-size: 0.8rem; line-height: 1.55; margin: 0 0 8px;
    }
    .help-body ul {
      color: #8AB4C4; font-size: 0.8rem; line-height: 1.55;
      margin: 0 0 8px; padding-left: 18px;
    }
    .help-body li { margin-bottom: 4px; }
    .help-body b { color: #7EE8FA; }
    .help-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .help-table td, .help-table th {
      padding: 4px 8px; font-size: 0.78rem; vertical-align: top;
      border-bottom: 1px solid #0A1622;
    }
    .help-table th {
      color: #4A7A8A; font-size: 0.7rem; text-transform: uppercase;
      letter-spacing: 0.5px; text-align: left; padding-bottom: 6px;
    }
    .help-key {
      color: #00E5FF; min-width: 110px; font-weight: bold;
      white-space: nowrap;
    }
    .help-table td:last-child { color: #8AB4C4; }
    .gene-cluster {
      color: #4A7A8A !important; font-size: 0.7rem !important;
      text-transform: uppercase; letter-spacing: 1px;
      padding-top: 10px !important; font-weight: bold;
    }
    .sp-dot {
      display: inline-block; width: 10px; height: 10px;
      border-radius: 2px; vertical-align: middle; margin-right: 4px;
    }
    .tier-heading { margin-top: 14px !important; }
    .tier-producer { color: #22DD44 !important; }
    .tier-herbivore { color: #FFAA22 !important; }
    .tier-consumer { color: #4488FF !important; }
    .tier-apex { color: #FF4444 !important; }
    .tier-mega { color: #6666FF !important; }
    .tier-decomp { color: #88AA44 !important; }
    @media (max-width: 768px) {
      .help-panel { max-height: 90vh; border-radius: 0; }
      .help-nav-btn { padding: 6px 8px; font-size: 0.65rem; }
      .help-body { padding: 12px; }
      .help-key { min-width: 80px; }
    }
  `;
  document.head.appendChild(style);
}
