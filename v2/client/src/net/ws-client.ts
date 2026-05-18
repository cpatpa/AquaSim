import { getToken } from '../api/client';
import type { WSClientMessage, WSServerMessage } from '@aquasim/shared';

export type WSListener = (msg: WSServerMessage) => void;

export interface WSClient {
  send(msg: WSClientMessage): void;
  onMessage(listener: WSListener): () => void;
  close(): void;
  isConnected(): boolean;
}

export function createWSClient(url?: string): WSClient {
  const wsUrl = url ?? buildWsUrl();
  const listeners = new Set<WSListener>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let intentionallyClosed = false;

  function buildWsUrl(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function connect(): void {
    if (intentionallyClosed) return;

    const token = getToken();
    const connectUrl = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;
    ws = new WebSocket(connectUrl);

    ws.onopen = () => {
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSServerMessage = JSON.parse(event.data as string);
        for (const listener of listeners) {
          listener(msg);
        }
      } catch {
        // malformed message
      }
    };

    ws.onclose = () => {
      ws = null;
      if (!intentionallyClosed) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  }

  connect();

  return {
    send(msg: WSClientMessage): void {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },

    onMessage(listener: WSListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    close(): void {
      intentionallyClosed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
      ws = null;
    },

    isConnected(): boolean {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}
