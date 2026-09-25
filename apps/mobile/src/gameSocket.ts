type Listener = (...args: any[]) => void;
type Ack = (result: any) => void;

const normalizedServerUrl = (serverUrl: string) => serverUrl.trim().replace(/\/$/, '');

const websocketUrl = (serverUrl: string, room: string, playerId: string) => {
  const url = new URL(serverUrl.trim());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
  url.search = new URLSearchParams({ room, playerId }).toString();
  url.hash = '';
  return url.toString();
};

export class GameSocket {
  private serverUrl: string;
  private room = '';
  private playerId = '';
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private acks = new Map<string, { callback: Ack; timer: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  private stopped = false;
  private retry = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(serverUrl: string) {
    this.serverUrl = normalizedServerUrl(serverUrl);
  }

  on(event: string, listener: Listener) {
    const group = this.listeners.get(event) || new Set<Listener>();
    group.add(listener);
    this.listeners.set(event, group);
    return this;
  }

  once(event: string, listener: Listener) {
    const wrapper: Listener = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload: any = {}, ack?: Ack) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      ack?.({ ok: false, error: '尚未连接服务器' });
      return this;
    }
    const id = `${Date.now().toString(36)}_${++this.sequence}`;
    if (ack) {
      const timer = setTimeout(() => {
        this.acks.delete(id);
        ack({ ok: false, error: '服务器响应超时' });
      }, 8000);
      this.acks.set(id, { callback: ack, timer });
    }
    this.ws.send(JSON.stringify({ id, event, payload }));
    return this;
  }

  async enter(mode: 'create' | 'join', payload: any, ack: Ack) {
    try {
      const endpoint = mode === 'create' ? '/rooms' : `/rooms/${payload.code}/join`;
      const response = await fetch(`${this.serverUrl}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) return ack(result || { ok: false, error: '无法进入房间' });
      this.room = result.code;
      this.playerId = result.playerId;
      this.open(() => ack(result));
    } catch (error: any) {
      ack({ ok: false, error: error?.message || '无法连接服务器' });
    }
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
    this.rejectAcks('连接已关闭');
  }

  private dispatch(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  private open(onOpen?: () => void) {
    if (this.stopped || !this.room || !this.playerId) return;
    try {
      const ws = new WebSocket(websocketUrl(this.serverUrl, this.room, this.playerId));
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        this.dispatch('connect');
        onOpen?.();
      };
      ws.onmessage = (message) => {
        try {
          const packet = JSON.parse(String(message.data));
          if (packet.type === 'ack') {
            const pending = this.acks.get(packet.id);
            if (!pending) return;
            clearTimeout(pending.timer);
            this.acks.delete(packet.id);
            pending.callback(packet.data);
          } else if (packet.type === 'event') {
            this.dispatch(packet.event, packet.data);
          }
        } catch {
          this.dispatch('connect_error', new Error('服务器消息格式错误'));
        }
      };
      ws.onerror = () => this.dispatch('connect_error', new Error('无法连接服务器'));
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.rejectAcks('网络连接已断开');
        this.dispatch('disconnect');
        if (!this.stopped) {
          const delay = Math.min(1000 * 2 ** this.retry++, 10000);
          this.reconnectTimer = setTimeout(() => this.open(), delay);
        }
      };
    } catch (error) {
      this.dispatch('connect_error', error);
    }
  }

  private rejectAcks(error: string) {
    for (const { callback, timer } of this.acks.values()) {
      clearTimeout(timer);
      callback({ ok: false, error });
    }
    this.acks.clear();
  }
}

export const connectGameSocket = (serverUrl: string) => new GameSocket(serverUrl);
