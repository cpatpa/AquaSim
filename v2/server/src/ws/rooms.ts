import type WsWebSocket from 'ws';
import type { RoomInfo, SaveData } from '#shared/types.js';
import { incrementWsConnections, decrementWsConnections } from '../lib/health.js';

interface Room {
  info: RoomInfo;
  clients: Map<string, WsWebSocket>;
  lastSnapshot?: SaveData;
}

const rooms = new Map<string, Room>();

export function createRoom(id: string, name: string, hostId: string, simulationId: string, hostUsername: string): RoomInfo {
  const room: Room = {
    info: {
      id,
      name,
      hostId,
      simulationId,
      users: [{ userId: hostId, username: hostUsername, role: 'host' }],
      maxUsers: 20,
    },
    clients: new Map(),
  };
  rooms.set(id, room);
  return room.info;
}

export function joinRoom(roomId: string, userId: string, username: string, ws: WsWebSocket): RoomInfo | null {
  const room = rooms.get(roomId);
  if (!room) return null;
  if (room.clients.size >= room.info.maxUsers) return null;

  room.clients.set(userId, ws);
  incrementWsConnections();

  const existing = room.info.users.find((u: { userId: string }) => u.userId === userId);
  if (!existing) {
    room.info.users.push({
      userId,
      username,
      role: userId === room.info.hostId ? 'host' : 'spectator',
    });
  }

  return room.info;
}

export function leaveRoom(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  room.clients.delete(userId);
  decrementWsConnections();
  room.info.users = room.info.users.filter((u: { userId: string }) => u.userId !== userId);

  if (room.clients.size === 0) {
    rooms.delete(roomId);
  }
}

export function broadcast(roomId: string, message: string, excludeUserId?: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const [userId, ws] of room.clients) {
    if (userId === excludeUserId) continue;
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  }
}

export function getRoom(roomId: string): RoomInfo | null {
  return rooms.get(roomId)?.info ?? null;
}

export function getRoomCount(): number {
  return rooms.size;
}

export function getAllRooms(): RoomInfo[] {
  return Array.from(rooms.values()).map(r => r.info);
}

export function setRoomSnapshot(roomId: string, snapshot: SaveData): void {
  const room = rooms.get(roomId);
  if (room) room.lastSnapshot = snapshot;
}

export function getRoomSnapshot(roomId: string): SaveData | undefined {
  return rooms.get(roomId)?.lastSnapshot;
}
