import { createWSClient, type WSClient } from '../net/ws-client';
import type { RoomInfo, PresenceInfo, WSServerMessage, PaintOp, SaveData, StateDelta } from '@aquasim/shared';

const MP_STYLES = `
  .mp-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:955; display:flex; align-items:center; justify-content:center; }
  .mp-panel { background:#0A1520; border:1px solid #1A3A4B; border-radius:8px; width:520px; max-width:90vw; max-height:80vh; display:flex; flex-direction:column; }
  .mp-header { display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #1A3A4B; }
  .mp-header h2 { font-family:'Orbitron',monospace; color:#00E5FF; font-size:1rem; letter-spacing:1px; }
  .mp-close { background:none; border:none; color:#4A7A8A; font-size:1.5rem; cursor:pointer; }
  .mp-close:hover { color:#FF6B6B; }
  .mp-body { padding:16px 20px; overflow-y:auto; flex:1; }
  .mp-section-title { color:#7EE8FA; font-size:0.85rem; font-weight:bold; margin-bottom:10px; }
  .mp-input { width:100%; padding:8px 12px; background:#0D1B2A; border:1px solid #1B3A4B; color:#7EE8FA; font-family:inherit; font-size:13px; border-radius:4px; margin-bottom:8px; }
  .mp-input:focus { outline:none; border-color:#00E5FF; }
  .mp-input::placeholder { color:#3A5A6A; }
  .mp-btn { padding:8px 16px; border:none; border-radius:4px; font-family:inherit; font-size:0.8rem; cursor:pointer; margin-right:6px; margin-bottom:6px; }
  .mp-btn-primary { background:#00E5FF; color:#0A1520; font-weight:bold; }
  .mp-btn-primary:hover { background:#33EEFF; }
  .mp-btn-secondary { background:#0D1B2A; color:#7EE8FA; border:1px solid #1B3A4B; }
  .mp-btn-secondary:hover { background:#1B3A4B; }
  .mp-btn-danger { background:#FF6B6B22; color:#FF6B6B; border:1px solid #FF6B6B33; }
  .mp-btn-danger:hover { background:#FF6B6B44; }
  .mp-msg { font-size:0.8rem; min-height:18px; margin-bottom:8px; }
  .mp-msg-err { color:#FF6B6B; }
  .mp-room-list { list-style:none; padding:0; margin:0 0 12px 0; }
  .mp-room-item { display:flex; justify-content:space-between; align-items:center; padding:8px 10px; background:#0D1B2A; border:1px solid #1B3A4B; border-radius:4px; margin-bottom:6px; cursor:pointer; }
  .mp-room-item:hover { border-color:#00E5FF; }
  .mp-room-name { color:#7EE8FA; font-size:0.85rem; font-weight:bold; }
  .mp-room-meta { color:#4A7A8A; font-size:0.75rem; }
  .mp-users { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  .mp-user { display:flex; align-items:center; gap:4px; padding:4px 10px; background:#0D1B2A; border:1px solid #1B3A4B; border-radius:12px; font-size:0.75rem; color:#7EE8FA; }
  .mp-user-dot { width:6px; height:6px; border-radius:50%; }
  .mp-user-host { background:#FFD700; }
  .mp-user-collab { background:#22c55e; }
  .mp-user-spectator { background:#4A7A8A; }
  .mp-chat-box { display:flex; flex-direction:column; height:180px; border:1px solid #1B3A4B; border-radius:4px; overflow:hidden; }
  .mp-chat-messages { flex:1; overflow-y:auto; padding:8px; font-size:0.75rem; color:#7EE8FA; }
  .mp-chat-msg { margin-bottom:4px; }
  .mp-chat-msg-user { color:#00E5FF; }
  .mp-chat-input-row { display:flex; border-top:1px solid #1B3A4B; }
  .mp-chat-input { flex:1; padding:6px 10px; background:#0D1B2A; border:none; color:#7EE8FA; font-family:inherit; font-size:0.8rem; }
  .mp-chat-input:focus { outline:none; }
  .mp-chat-send { padding:6px 12px; background:#00E5FF; color:#0A1520; border:none; cursor:pointer; font-family:inherit; font-size:0.8rem; font-weight:bold; }
  .mp-empty { text-align:center; color:#4A7A8A; padding:20px 0; font-size:0.85rem; }
`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const el = document.createElement('style');
  el.textContent = MP_STYLES;
  document.head.appendChild(el);
  stylesInjected = true;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface MultiplayerCallbacks {
  onClose: () => void;
  onSnapshot: (data: SaveData) => void;
  onDelta: (delta: StateDelta) => void;
  onPaint: (cells: PaintOp[]) => void;
  getSnapshot: () => SaveData;
}

export interface MultiplayerSession {
  wsClient: WSClient;
  roomId: string;
  destroy: () => void;
}

export function openMultiplayer(
  rooms: RoomInfo[],
  callbacks: MultiplayerCallbacks,
): void {
  injectStyles();

  const overlay = document.createElement('div');
  overlay.className = 'mp-overlay';

  function close(): void {
    overlay.remove();
    callbacks.onClose();
  }

  overlay.innerHTML = `
    <div class="mp-panel">
      <div class="mp-header">
        <h2>Multiplayer</h2>
        <button class="mp-close">&times;</button>
      </div>
      <div class="mp-body">
        <div class="mp-section-title">Create Room</div>
        <div class="mp-msg" id="mp-create-msg"></div>
        <input class="mp-input" id="mp-room-name" placeholder="Room name">
        <button class="mp-btn mp-btn-primary" id="mp-create-btn">Create</button>

        <div class="mp-section-title" style="margin-top:16px;">Join Room</div>
        <div class="mp-msg" id="mp-join-msg"></div>
        <input class="mp-input" id="mp-room-code" placeholder="Room code">
        <button class="mp-btn mp-btn-secondary" id="mp-join-btn">Join</button>

        <div class="mp-section-title" style="margin-top:16px;">Active Rooms</div>
        ${rooms.length === 0 ? '<div class="mp-empty">No active rooms</div>' : `
          <ul class="mp-room-list">
            ${rooms.map(r => `
              <li class="mp-room-item" data-id="${r.id}">
                <div>
                  <div class="mp-room-name">${escapeHtml(r.name)}</div>
                  <div class="mp-room-meta">${r.users.length}/${r.maxUsers} players</div>
                </div>
                <button class="mp-btn mp-btn-secondary" data-join="${r.id}">Join</button>
              </li>
            `).join('')}
          </ul>
        `}
      </div>
    </div>`;

  overlay.querySelector('.mp-close')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#mp-create-btn')!.addEventListener('click', () => {
    const name = (overlay.querySelector('#mp-room-name') as HTMLInputElement).value.trim();
    const msg = overlay.querySelector('#mp-create-msg')!;
    if (!name) { msg.className = 'mp-msg mp-msg-err'; msg.textContent = 'Enter a room name'; return; }
    close();
    const session = joinRoom(name, callbacks);
    if (!session) return;
  });

  overlay.querySelector('#mp-join-btn')!.addEventListener('click', () => {
    const code = (overlay.querySelector('#mp-room-code') as HTMLInputElement).value.trim();
    const msg = overlay.querySelector('#mp-join-msg')!;
    if (!code) { msg.className = 'mp-msg mp-msg-err'; msg.textContent = 'Enter a room code'; return; }
    close();
    joinRoom(code, callbacks);
  });

  for (const btn of overlay.querySelectorAll('[data-join]')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = (btn as HTMLElement).dataset.join!;
      close();
      joinRoom(id, callbacks);
    });
  }

  document.body.appendChild(overlay);
}

function joinRoom(
  roomId: string,
  callbacks: MultiplayerCallbacks,
): MultiplayerSession {
  const wsClient = createWSClient();

  const token = localStorage.getItem('aquasim_token') || '';
  wsClient.send({ type: 'join_room', roomId, token });

  const unsub = wsClient.onMessage((msg: WSServerMessage) => {
    switch (msg.type) {
      case 'sync_snapshot':
        callbacks.onSnapshot(msg.data);
        break;
      case 'sync_delta':
        callbacks.onDelta(msg.delta);
        break;
      case 'paint':
        callbacks.onPaint(msg.cells);
        break;
      case 'error':
        console.error(`[WS] ${msg.code}: ${msg.message}`);
        break;
    }
  });

  return {
    wsClient,
    roomId,
    destroy() {
      wsClient.send({ type: 'leave_room' });
      unsub();
      wsClient.close();
    },
  };
}

export function showRoomHud(
  room: RoomInfo,
  wsClient: WSClient,
  onLeave: () => void,
): HTMLElement {
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;top:10px;right:10px;z-index:940;background:#0A1520;border:1px solid #1A3A4B;border-radius:8px;padding:10px 14px;min-width:180px;font-size:0.75rem;';

  function updateHud(users: PresenceInfo[]): void {
    hud.innerHTML = `
      <div style="color:#00E5FF;font-weight:bold;margin-bottom:6px;">Room: ${escapeHtml(room.name)}</div>
      <div class="mp-users">
        ${users.map(u => `
          <div class="mp-user">
            <div class="mp-user-dot mp-user-${u.role}"></div>
            ${escapeHtml(u.username)}
          </div>
        `).join('')}
      </div>
      <button class="mp-btn mp-btn-danger mp-btn-leave" style="width:100%;margin:0;">Leave Room</button>
    `;
    hud.querySelector('.mp-btn-leave')!.addEventListener('click', () => {
      wsClient.send({ type: 'leave_room' });
      wsClient.close();
      hud.remove();
      onLeave();
    });
  }

  updateHud(room.users);

  wsClient.onMessage((msg) => {
    if (msg.type === 'presence') {
      updateHud(msg.users);
    }
  });

  document.body.appendChild(hud);
  return hud;
}

export function createChatPanel(wsClient: WSClient): HTMLElement {
  injectStyles();

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:940;width:280px;';
  panel.innerHTML = `
    <div class="mp-chat-box">
      <div class="mp-chat-messages" id="mp-chat-msgs"></div>
      <div class="mp-chat-input-row">
        <input class="mp-chat-input" id="mp-chat-in" placeholder="Message...">
        <button class="mp-chat-send" id="mp-chat-send">Send</button>
      </div>
    </div>`;

  const msgsEl = panel.querySelector('#mp-chat-msgs')!;
  const inputEl = panel.querySelector('#mp-chat-in') as HTMLInputElement;
  const sendBtn = panel.querySelector('#mp-chat-send')!;

  function addMessage(username: string, message: string): void {
    const div = document.createElement('div');
    div.className = 'mp-chat-msg';
    div.innerHTML = `<span class="mp-chat-msg-user">${escapeHtml(username)}:</span> ${escapeHtml(message)}`;
    msgsEl.appendChild(div);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function sendMessage(): void {
    const text = inputEl.value.trim();
    if (!text) return;
    wsClient.send({ type: 'chat', message: text });
    inputEl.value = '';
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  wsClient.onMessage((msg) => {
    if (msg.type === 'chat') {
      addMessage(msg.username, msg.message);
    }
  });

  document.body.appendChild(panel);
  return panel;
}
