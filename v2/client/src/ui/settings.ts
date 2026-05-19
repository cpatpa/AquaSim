import type { SimConfig } from '../types';

export interface SettingsCallbacks {
  onMutationRateChange: (mult: number) => void;
  onSpeciationRateChange: (mult: number) => void;
  onTraitLimitChange: (limit: number) => void;
  onGridResize: (w: number, h: number) => void;
}

export function openSettings(
  config: SimConfig,
  maxTraits: number,
  callbacks: SettingsCallbacks,
): void {
  if (document.getElementById('settings-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.className = 'settings-overlay';
  overlay.innerHTML = `
    <div class="settings-panel">
      <div class="settings-header">
        <span>Settings</span>
        <button id="settings-close">&times;</button>
      </div>
      <div class="settings-body">
        <div class="settings-group">
          <label class="settings-label">Mutation Rate</label>
          <input type="range" id="set-mutation" min="0.5" max="3" step="0.1" value="${config.mutationRateMult}">
          <span id="set-mutation-val">${config.mutationRateMult.toFixed(1)}x</span>
        </div>
        <div class="settings-group">
          <label class="settings-label">Speciation Rate</label>
          <input type="range" id="set-speciation" min="0.5" max="3" step="0.1" value="${config.speciationRateMult}">
          <span id="set-speciation-val">${config.speciationRateMult.toFixed(1)}x</span>
        </div>
        <div class="settings-group">
          <label class="settings-label">Max Traits per Species</label>
          <input type="range" id="set-traits" min="3" max="7" step="1" value="${maxTraits}">
          <span id="set-traits-val">${maxTraits}</span>
        </div>
        <div class="settings-group">
          <label class="settings-label">Grid Width</label>
          <input type="number" id="set-grid-w" min="30" max="400" step="10" value="${config.gridWidth}" class="settings-num">
        </div>
        <div class="settings-group">
          <label class="settings-label">Grid Height</label>
          <input type="number" id="set-grid-h" min="30" max="400" step="10" value="${config.gridHeight}" class="settings-num">
        </div>
        <button id="set-resize" class="settings-btn">Resize Grid (clears sim)</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#settings-close')!;
  closeBtn.addEventListener('click', () => closeSettings());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettings();
  });

  const mutSlider = overlay.querySelector('#set-mutation') as HTMLInputElement;
  const mutVal = overlay.querySelector('#set-mutation-val')!;
  mutSlider.addEventListener('input', () => {
    const v = parseFloat(mutSlider.value);
    mutVal.textContent = v.toFixed(1) + 'x';
    callbacks.onMutationRateChange(v);
  });

  const specSlider = overlay.querySelector('#set-speciation') as HTMLInputElement;
  const specVal = overlay.querySelector('#set-speciation-val')!;
  specSlider.addEventListener('input', () => {
    const v = parseFloat(specSlider.value);
    specVal.textContent = v.toFixed(1) + 'x';
    callbacks.onSpeciationRateChange(v);
  });

  const traitSlider = overlay.querySelector('#set-traits') as HTMLInputElement;
  const traitVal = overlay.querySelector('#set-traits-val')!;
  traitSlider.addEventListener('input', () => {
    const v = parseInt(traitSlider.value);
    traitVal.textContent = String(v);
    callbacks.onTraitLimitChange(v);
  });

  const gridWInput = overlay.querySelector('#set-grid-w') as HTMLInputElement;
  const gridHInput = overlay.querySelector('#set-grid-h') as HTMLInputElement;
  const resizeBtn = overlay.querySelector('#set-resize')!;
  resizeBtn.addEventListener('click', () => {
    const w = Math.max(30, Math.min(400, parseInt(gridWInput.value) || 60));
    const h = Math.max(30, Math.min(400, parseInt(gridHInput.value) || 60));
    callbacks.onGridResize(w, h);
    closeSettings();
  });
}

export function closeSettings(): void {
  const el = document.getElementById('settings-overlay');
  if (el) el.remove();
}

export function injectSettingsStyles(): void {
  if (document.getElementById('settings-styles')) return;
  const style = document.createElement('style');
  style.id = 'settings-styles';
  style.textContent = `
    .settings-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 1000;
      display: flex; align-items: center; justify-content: center;
    }
    .settings-panel {
      background: #0d1f3c; border: 1px solid #1a3a5c; border-radius: 8px;
      width: 380px; max-width: 90vw;
      font-family: 'Share Tech Mono', monospace; color: #e0e8f0;
    }
    .settings-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid #1a3a5c;
      font-family: 'Orbitron', monospace; color: #4da6ff; letter-spacing: 1px;
    }
    .settings-header button {
      background: none; border: none; color: #5a7a9a; font-size: 1.5rem; cursor: pointer;
    }
    .settings-header button:hover { color: #ef4444; }
    .settings-body { padding: 16px; }
    .settings-group { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .settings-label { width: 140px; font-size: 0.85rem; color: #5a7a9a; flex-shrink: 0; }
    .settings-group input[type="range"] { flex: 1; accent-color: #4da6ff; }
    .settings-group span { width: 40px; text-align: right; font-size: 0.85rem; }
    .settings-num {
      width: 70px; background: #0d1f3c; border: 1px solid #1a3a5c; color: #e0e8f0;
      padding: 4px 8px; font-family: inherit; font-size: 0.85rem; border-radius: 3px;
    }
    .settings-btn {
      width: 100%; background: #0d1f3c; border: 1px solid #1a3a5c; color: #ef4444;
      padding: 8px; cursor: pointer; font-family: inherit; font-size: 0.85rem;
      border-radius: 3px; margin-top: 8px;
    }
    .settings-btn:hover { background: #1a3a5c; }
  `;
  document.head.appendChild(style);
}
