import type WebSocket from 'ws';
import type { WSClientMessage, WSServerMessage } from '#shared/types.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { joinRoom, leaveRoom, broadcast, setRoomSnapshot, getRoomSnapshot, getRoom } from './rooms.js';
import { validateSnapshot, validateDelta } from './sync.js';

interface ClientState {
  userId: string;
  username: string;
  roomId: string | null;
}

const clientStates = new Map<WebSocket, ClientState>();

export function handleWsConnection(ws: WebSocket): void {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data)) as WSClientMessage;
      handleMessage(ws, msg);
    } catch {
      sendError(ws, 'PARSE_ERROR', 'Invalid message format');
    }
  });

  ws.on('close', () => {
    const state = clientStates.get(ws);
    if (state?.roomId) {
      leaveRoom(state.roomId, state.userId);
      const room = getRoom(state.roomId);
      broadcast(state.roomId, JSON.stringify({
        type: 'presence',
        users: room?.users ?? [],
      } satisfies WSServerMessage));
    }
    clientStates.delete(ws);
  });
}

function handleMessage(ws: WebSocket, msg: WSClientMessage): void {
  switch (msg.type) {
    case 'join_room': {
      const payload = verifyAccessToken(msg.token);
      if (!payload) {
        sendError(ws, 'AUTH_FAILED', 'Invalid token');
        return;
      }

      const roomInfo = joinRoom(msg.roomId, payload.sub, payload.username, ws);
      if (!roomInfo) {
        sendError(ws, 'ROOM_NOT_FOUND', 'Room not found or full');
        return;
      }

      clientStates.set(ws, {
        userId: payload.sub,
        username: payload.username,
        roomId: msg.roomId,
      });

      send(ws, { type: 'room_state', room: roomInfo });

      const snapshot = getRoomSnapshot(msg.roomId);
      if (snapshot) {
        send(ws, { type: 'sync_snapshot', data: snapshot });
      }

      broadcast(msg.roomId, JSON.stringify({
        type: 'presence',
        users: roomInfo.users,
      } satisfies WSServerMessage));
      break;
    }

    case 'leave_room': {
      const state = clientStates.get(ws);
      if (state?.roomId) {
        leaveRoom(state.roomId, state.userId);
        const room = getRoom(state.roomId);
        broadcast(state.roomId, JSON.stringify({
          type: 'presence',
          users: room?.users ?? [],
        } satisfies WSServerMessage));
        state.roomId = null;
      }
      break;
    }

    case 'sync_snapshot': {
      const state = clientStates.get(ws);
      if (!state?.roomId) return;

      const room = getRoom(state.roomId);
      if (!room || room.hostId !== state.userId) return;

      if (!validateSnapshot(msg.data)) {
        sendError(ws, 'INVALID_SNAPSHOT', 'Snapshot failed validation');
        return;
      }

      setRoomSnapshot(state.roomId, msg.data);
      broadcast(state.roomId, JSON.stringify({
        type: 'sync_snapshot',
        data: msg.data,
      } satisfies WSServerMessage), state.userId);
      break;
    }

    case 'sync_delta': {
      const state = clientStates.get(ws);
      if (!state?.roomId) return;

      const room = getRoom(state.roomId);
      if (!room || room.hostId !== state.userId) return;

      if (!validateDelta(msg.delta)) {
        sendError(ws, 'INVALID_DELTA', 'Delta failed validation');
        return;
      }

      broadcast(state.roomId, JSON.stringify({
        type: 'sync_delta',
        delta: msg.delta,
      } satisfies WSServerMessage), state.userId);
      break;
    }

    case 'paint': {
      const state = clientStates.get(ws);
      if (!state?.roomId) return;

      const room = getRoom(state.roomId);
      if (!room) return;

      const userInfo = room.users.find((u: { userId: string }) => u.userId === state.userId);
      if (!userInfo || userInfo.role === 'spectator') return;

      broadcast(state.roomId, JSON.stringify({
        type: 'paint',
        cells: msg.cells,
        userId: state.userId,
      } satisfies WSServerMessage));
      break;
    }

    case 'chat': {
      const state = clientStates.get(ws);
      if (!state?.roomId) return;

      const sanitised = msg.message.slice(0, 500).replace(/[<>]/g, '');

      broadcast(state.roomId, JSON.stringify({
        type: 'chat',
        message: sanitised,
        username: state.username,
        timestamp: new Date().toISOString(),
      } satisfies WSServerMessage));
      break;
    }

    case 'cursor': {
      const state = clientStates.get(ws);
      if (!state?.roomId) return;

      const room = getRoom(state.roomId);
      if (!room) return;

      const user = room.users.find((u: { userId: string }) => u.userId === state.userId);
      if (user) {
        user.cursor = { x: msg.x, y: msg.y };
      }

      broadcast(state.roomId, JSON.stringify({
        type: 'presence',
        users: room.users,
      } satisfies WSServerMessage), state.userId);
      break;
    }
  }
}

function send(ws: WebSocket, msg: WSServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, code: string, message: string): void {
  send(ws, { type: 'error', code, message });
}
