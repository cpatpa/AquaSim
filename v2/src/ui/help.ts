export function openHelp(): void {
  if (document.getElementById('help-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'help-overlay';
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-panel">
      <div class="help-header">
        <span>Keyboard Shortcuts</span>
        <button id="help-close">&times;</button>
      </div>
      <div class="help-body">
        <table class="help-table">
          <tr><td class="help-key">Space</td><td>Play / Pause</td></tr>
          <tr><td class="help-key">Right Arrow</td><td>Step forward one tick</td></tr>
          <tr><td class="help-key">0 - 4</td><td>Speed (0 = 0.5x, 1 = 1x, 2 = 2x, 3 = 4x, 4 = MAX)</td></tr>
          <tr><td class="help-key">E</td><td>Toggle evolution</td></tr>
          <tr><td class="help-key">M</td><td>Trigger mutation storm</td></tr>
          <tr><td class="help-key">S</td><td>Seed grid with species</td></tr>
          <tr><td class="help-key">B</td><td>Add balanced rock reefs</td></tr>
          <tr><td class="help-key">C</td><td>Clear grid</td></tr>
          <tr><td class="help-key">Ctrl+Z</td><td>Undo paint</td></tr>
          <tr><td class="help-key">Ctrl+Y</td><td>Redo paint</td></tr>
          <tr><td class="help-key">?</td><td>Show this help</td></tr>
          <tr><td class="help-key">Escape</td><td>Close modals</td></tr>
        </table>
        <div class="help-section">Mouse Controls</div>
        <table class="help-table">
          <tr><td class="help-key">Left Click</td><td>Paint selected species / trigger disaster</td></tr>
          <tr><td class="help-key">Scroll Wheel</td><td>Zoom in/out</td></tr>
          <tr><td class="help-key">Middle / Right Drag</td><td>Pan camera</td></tr>
          <tr><td class="help-key">Click species in stats</td><td>Open species info</td></tr>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector('#help-close')!;
  closeBtn.addEventListener('click', () => closeHelp());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeHelp();
  });
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
      width: 480px; max-width: 90vw;
      font-family: 'Share Tech Mono', monospace; color: #7EE8FA;
    }
    .help-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid #1A3A4B;
      font-family: 'Orbitron', monospace; color: #00E5FF; letter-spacing: 1px;
    }
    .help-header button {
      background: none; border: none; color: #4A7A8A; font-size: 1.5rem; cursor: pointer;
    }
    .help-header button:hover { color: #FF6B6B; }
    .help-body { padding: 16px; }
    .help-section {
      color: #4A7A8A; font-size: 0.8rem; text-transform: uppercase;
      letter-spacing: 1px; margin: 12px 0 6px; padding-top: 8px;
      border-top: 1px solid #0D1B2A;
    }
    .help-table { width: 100%; border-collapse: collapse; }
    .help-table td { padding: 4px 8px; font-size: 0.85rem; }
    .help-key {
      color: #00E5FF; width: 120px; font-weight: bold;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}
