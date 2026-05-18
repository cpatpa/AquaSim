import { createSimState } from './core/simulation';
import { MIN_GRID_PX, MAX_GRID_PX, CELL_SIZE } from './constants';
import { noiseSeed } from './environment/terrain';

noiseSeed(Date.now());

const viewW = Math.min(window.innerWidth - 400, MAX_GRID_PX);
const viewH = Math.min(window.innerHeight - 60, MAX_GRID_PX);
const gridW = Math.max(Math.floor(Math.max(viewW, MIN_GRID_PX) / CELL_SIZE), 60);
const gridH = Math.max(Math.floor(Math.max(viewH, MIN_GRID_PX) / CELL_SIZE), 60);

const state = createSimState({
  gridWidth: gridW,
  gridHeight: gridH,
});

console.log(
  `AquaSim v2 initialised: ${state.grid.width}x${state.grid.height} grid, ` +
  `${Object.keys(state.evoStats).length} species with evo stats`
);

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      color: #7EE8FA;
      font-family: 'Share Tech Mono', monospace;
      background: #04090F;
    ">
      <h1 style="
        font-family: 'Orbitron', monospace;
        color: #00E5FF;
        letter-spacing: 3px;
        margin-bottom: 16px;
      ">AquaSim v2</h1>
      <p>Grid: ${state.grid.width} x ${state.grid.height} cells</p>
      <p>Species with evo stats: ${Object.keys(state.evoStats).length}</p>
      <p>Season: ${state.season.current}</p>
      <p style="color: #4A7A8A; margin-top: 20px; font-size: 0.8rem;">
        Module scaffold operational. Rendering pipeline next.
      </p>
    </div>
  `;
}

export { state };
