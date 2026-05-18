// ---------------------------------------------------------------------------
// Camera system -- pan, zoom, minimap for the AquaSim grid viewport
// ---------------------------------------------------------------------------

/** Tracks all camera state for pan/zoom and smooth interpolation. */
export interface CameraState {
  /** World-space offset of the viewport top-left corner (pixels). */
  x: number;
  y: number;
  /** Current zoom level (1.0 = 100%). */
  zoom: number;

  /** Interpolation targets for smooth animation. */
  targetX: number;
  targetY: number;
  targetZoom: number;

  /** Zoom bounds. */
  minZoom: number;
  maxZoom: number;

  /** Total world size in pixels. */
  worldW: number;
  worldH: number;

  /** Viewport size in CSS pixels. */
  viewW: number;
  viewH: number;

  /** Pan-drag tracking. */
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  dragStartCamX: number;
  dragStartCamY: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LERP_SPEED = 0.18;
const LERP_SNAP = 0.5;
const ZOOM_STEP = 0.1;
const MINIMAP_SIZE = 120;
const MINIMAP_PADDING = 8;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp camera position so the viewport never exceeds world edges. */
function clampPosition(cam: CameraState, x: number, y: number): [number, number] {
  const visibleW = cam.viewW / cam.zoom;
  const visibleH = cam.viewH / cam.zoom;

  // If the viewport is larger than the world, centre on the world.
  const minX = visibleW >= cam.worldW ? -(visibleW - cam.worldW) / 2 : 0;
  const maxX = visibleW >= cam.worldW ? minX : cam.worldW - visibleW;
  const minY = visibleH >= cam.worldH ? -(visibleH - cam.worldH) / 2 : 0;
  const maxY = visibleH >= cam.worldH ? minY : cam.worldH - visibleH;

  return [clamp(x, minX, maxX), clamp(y, minY, maxY)];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new camera centred on the world at zoom 1.0.
 */
export function createCamera(
  worldW: number,
  worldH: number,
  viewW: number,
  viewH: number,
): CameraState {
  const cam: CameraState = {
    x: 0,
    y: 0,
    zoom: 1.0,
    targetX: 0,
    targetY: 0,
    targetZoom: 1.0,
    minZoom: 0.25,
    maxZoom: 4.0,
    worldW,
    worldH,
    viewW,
    viewH,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartCamX: 0,
    dragStartCamY: 0,
  };

  // Centre the camera on the world.
  fitToView(cam);
  // Snap immediately (no animation on first frame).
  cam.x = cam.targetX;
  cam.y = cam.targetY;
  cam.zoom = cam.targetZoom;

  return cam;
}

/**
 * Attach mouse / touch event handlers to the canvas for pan and zoom.
 *
 * - Mouse wheel: zoom towards cursor position.
 * - Middle-mouse or right-click drag: pan.
 * - Pinch-to-zoom on touch devices.
 */
let singleFingerPanEnabled = false;
export function setSingleFingerPan(v: boolean): void { singleFingerPanEnabled = v; }

export function setupCameraHandlers(
  canvas: HTMLCanvasElement,
  cam: CameraState,
  onUpdate: () => void,
): void {
  // ---- Wheel zoom (towards cursor) -------------------------------------
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // World position under cursor before zoom.
    const [wx, wy] = screenToWorld(cam, mx, my);

    const direction = e.deltaY < 0 ? 1 : -1;
    const newZoom = clamp(
      cam.targetZoom * (1 + direction * ZOOM_STEP),
      cam.minZoom,
      cam.maxZoom,
    );

    cam.targetZoom = newZoom;

    // Adjust position so the world point under the cursor stays put.
    cam.targetX = wx - mx / newZoom;
    cam.targetY = wy - my / newZoom;
    const [cx, cy] = clampPosition(
      { ...cam, zoom: newZoom },
      cam.targetX,
      cam.targetY,
    );
    cam.targetX = cx;
    cam.targetY = cy;

    onUpdate();
  }, { passive: false });

  // ---- Mouse drag (middle or right button) ------------------------------
  const startDrag = (e: MouseEvent) => {
    // Middle button (1) or right button (2).
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();

    cam.isDragging = true;
    cam.dragStartX = e.clientX;
    cam.dragStartY = e.clientY;
    cam.dragStartCamX = cam.targetX;
    cam.dragStartCamY = cam.targetY;
  };

  const moveDrag = (e: MouseEvent) => {
    if (!cam.isDragging) return;
    const dx = (e.clientX - cam.dragStartX) / cam.zoom;
    const dy = (e.clientY - cam.dragStartY) / cam.zoom;
    const [cx, cy] = clampPosition(cam, cam.dragStartCamX - dx, cam.dragStartCamY - dy);
    cam.targetX = cx;
    cam.targetY = cy;
    onUpdate();
  };

  const endDrag = () => {
    cam.isDragging = false;
  };

  canvas.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);

  // Suppress context menu so right-click drag works.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- Touch: pinch-to-zoom + two-finger pan + single-finger pan --------
  let lastTouchDist = 0;
  let lastTouchMidX = 0;
  let lastTouchMidY = 0;
  let isTouchPanning = false;
  let singleFingerPanX = 0;
  let singleFingerPanY = 0;
  let isSinglePanning = false;

  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isSinglePanning = false;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      lastTouchDist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      lastTouchMidX = (t0.clientX + t1.clientX) / 2;
      lastTouchMidY = (t0.clientY + t1.clientY) / 2;
      isTouchPanning = true;
    } else if (e.touches.length === 1 && singleFingerPanEnabled) {
      e.preventDefault();
      isSinglePanning = true;
      singleFingerPanX = e.touches[0].clientX;
      singleFingerPanY = e.touches[0].clientY;
      cam.dragStartCamX = cam.targetX;
      cam.dragStartCamY = cam.targetY;
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (e.touches.length === 2 && isTouchPanning) {
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;

      // Pinch zoom.
      if (lastTouchDist > 0) {
        const scale = dist / lastTouchDist;
        const rect = canvas.getBoundingClientRect();
        const mx = midX - rect.left;
        const my = midY - rect.top;
        const [wx, wy] = screenToWorld(cam, mx, my);

        const newZoom = clamp(cam.targetZoom * scale, cam.minZoom, cam.maxZoom);
        cam.targetZoom = newZoom;
        cam.targetX = wx - mx / newZoom;
        cam.targetY = wy - my / newZoom;
      }

      // Two-finger pan.
      const panDx = (midX - lastTouchMidX) / cam.zoom;
      const panDy = (midY - lastTouchMidY) / cam.zoom;
      cam.targetX -= panDx;
      cam.targetY -= panDy;

      const [cx, cy] = clampPosition(
        { ...cam, zoom: cam.targetZoom },
        cam.targetX,
        cam.targetY,
      );
      cam.targetX = cx;
      cam.targetY = cy;

      lastTouchDist = dist;
      lastTouchMidX = midX;
      lastTouchMidY = midY;

      onUpdate();
    } else if (e.touches.length === 1 && isSinglePanning) {
      e.preventDefault();
      const dx = (e.touches[0].clientX - singleFingerPanX) / cam.zoom;
      const dy = (e.touches[0].clientY - singleFingerPanY) / cam.zoom;
      const [cx, cy] = clampPosition(cam, cam.dragStartCamX - dx, cam.dragStartCamY - dy);
      cam.targetX = cx;
      cam.targetY = cy;
      onUpdate();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', (e: TouchEvent) => {
    if (e.touches.length < 2) {
      isTouchPanning = false;
      lastTouchDist = 0;
    }
    if (e.touches.length === 0) {
      isSinglePanning = false;
    }
  });
}

/**
 * Smoothly interpolate x, y, and zoom towards their targets.
 * Returns `true` if the camera moved (caller should re-render).
 */
export function updateCamera(cam: CameraState): boolean {
  let moved = false;

  const dz = cam.targetZoom - cam.zoom;
  if (Math.abs(dz) > 0.001) {
    cam.zoom += dz * LERP_SPEED;
    moved = true;
  } else if (dz !== 0) {
    cam.zoom = cam.targetZoom;
    moved = true;
  }

  const dx = cam.targetX - cam.x;
  const dy = cam.targetY - cam.y;

  if (Math.abs(dx) > LERP_SNAP) {
    cam.x += dx * LERP_SPEED;
    moved = true;
  } else if (dx !== 0) {
    cam.x = cam.targetX;
    moved = true;
  }

  if (Math.abs(dy) > LERP_SNAP) {
    cam.y += dy * LERP_SPEED;
    moved = true;
  } else if (dy !== 0) {
    cam.y = cam.targetY;
    moved = true;
  }

  return moved;
}

/**
 * Convert world-pixel coordinates to screen coordinates.
 */
export function worldToScreen(
  cam: CameraState,
  wx: number,
  wy: number,
): [number, number] {
  return [
    (wx - cam.x) * cam.zoom,
    (wy - cam.y) * cam.zoom,
  ];
}

/**
 * Convert screen coordinates to world-pixel coordinates.
 */
export function screenToWorld(
  cam: CameraState,
  sx: number,
  sy: number,
): [number, number] {
  return [
    sx / cam.zoom + cam.x,
    sy / cam.zoom + cam.y,
  ];
}

/**
 * Returns the world-pixel bounds currently visible on screen.
 * Useful for culling cells that are off-screen.
 */
export function getVisibleBounds(
  cam: CameraState,
): { x0: number; y0: number; x1: number; y1: number } {
  const visibleW = cam.viewW / cam.zoom;
  const visibleH = cam.viewH / cam.zoom;
  return {
    x0: Math.max(0, Math.floor(cam.x)),
    y0: Math.max(0, Math.floor(cam.y)),
    x1: Math.min(cam.worldW, Math.ceil(cam.x + visibleW)),
    y1: Math.min(cam.worldH, Math.ceil(cam.y + visibleH)),
  };
}

/**
 * Draw a 120x120 minimap in the bottom-right corner of the given context.
 *
 * - Semi-transparent dark background.
 * - Species rendered as coloured dots at reduced resolution.
 * - White rectangle showing the current viewport bounds.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  cam: CameraState,
  speciesArray: Uint8Array,
  gridW: number,
  gridH: number,
  colorRGB: Record<number, [number, number, number]>,
): void {
  const size = MINIMAP_SIZE;
  const pad = MINIMAP_PADDING;

  // Position: bottom-right of the canvas (using the ctx canvas dimensions).
  const canvasW = ctx.canvas.width;
  const canvasH = ctx.canvas.height;
  const ox = canvasW - size - pad;
  const oy = canvasH - size - pad;

  // Semi-transparent dark background.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(ox, oy, size, size);

  // Scale factors: grid cells to minimap pixels.
  const scaleX = size / gridW;
  const scaleY = size / gridH;

  // Sampling step: skip cells when the grid is much larger than the minimap.
  const stepX = Math.max(1, Math.floor(gridW / size));
  const stepY = Math.max(1, Math.floor(gridH / size));

  // Draw species dots.
  for (let gy = 0; gy < gridH; gy += stepY) {
    for (let gx = 0; gx < gridW; gx += stepX) {
      const sid = speciesArray[gy * gridW + gx];
      if (sid === 0) continue;
      const rgb = colorRGB[sid];
      if (!rgb) continue;

      const px = ox + (gx * scaleX) | 0;
      const py = oy + (gy * scaleY) | 0;

      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fillRect(px, py, Math.max(1, scaleX | 0), Math.max(1, scaleY | 0));
    }
  }

  // Viewport rectangle (white outline).
  const visibleW = cam.viewW / cam.zoom;
  const visibleH = cam.viewH / cam.zoom;
  // Convert world-pixel camera offset to grid-cell coordinates.
  const cellW = cam.worldW / gridW;
  const cellH = cam.worldH / gridH;
  const vx = ox + (cam.x / cellW) * scaleX;
  const vy = oy + (cam.y / cellH) * scaleY;
  const vw = (visibleW / cellW) * scaleX;
  const vh = (visibleH / cellH) * scaleY;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    clamp(vx, ox, ox + size),
    clamp(vy, oy, oy + size),
    clamp(vw, 1, size),
    clamp(vh, 1, size),
  );

  // Thin border around the minimap itself.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox, oy, size, size);
}

/**
 * Reset zoom and position so the entire world fits within the viewport.
 */
export function fitToView(cam: CameraState): void {
  const scaleX = cam.viewW / cam.worldW;
  const scaleY = cam.viewH / cam.worldH;
  const fitZoom = clamp(Math.min(scaleX, scaleY), cam.minZoom, cam.maxZoom);

  cam.targetZoom = fitZoom;

  // Centre the world in the viewport.
  const visibleW = cam.viewW / fitZoom;
  const visibleH = cam.viewH / fitZoom;
  cam.targetX = -(visibleW - cam.worldW) / 2;
  cam.targetY = -(visibleH - cam.worldH) / 2;
}
