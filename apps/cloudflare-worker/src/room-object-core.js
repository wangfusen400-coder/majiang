import { GameRoom } from '../../server/src/room.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const ok = (data = {}) => ({ ok: true, ...data });
const failure = (error) => ({ ok: false, error: error?.message || String(error) });
const attachment = (socket) => socket.deserializeAttachment() || { playerId: '' };

export class RoomObjectCore {
  constructor(ctx) {
    this.ctx = ctx;
    this.room = null;
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get('room');
      if (!saved) return;
      const room = GameRoom.fromState(saved);
      const online = new Set(this.ctx.getWebSockets().map((socket) => attachment(socket).playerId));
      room.players.forEach((player) => { player.online = online.has(player.id); });
      await this.ctx.storage.put('room', clone(room));
      this.room = room;
    });
  }

  async create(code, owner, rules) {
    await this.ready;
    if (this.room) return { created: false };
    const room = new GameRoom(code, owner, rules);
    await this.ctx.storage.put('room', clone(room));
    this.room = room;
    return { created: true, code, playerId: room.players[0].id };
  }

  async join(player) {
    await this.ready;
    if (!this.room) throw new Error('房间不存在');
    const next = GameRoom.fromState(this.room);
    const joined = next.addPlayer(player);
    await this.ctx.storage.put('room', clone(next));
    this.room = next;
    this.broadcast();
    return { code: next.code, playerId: joined.id };
  }

  async fetch(request) {
    await this.ready;
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ ok: false, error: '需要 WebSocket 连接' }, { status: 426 });
    }
    if (!this.room) return Response.json({ ok: false, error: '房间不存在' }, { status: 404 });
    const playerId = new URL(request.url).searchParams.get('playerId') || '';
    const next = GameRoom.fromState(this.room);
    next.player(playerId).online = true;
    await this.ctx.storage.put('room', clone(next));
    this.room = next;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [`player:${playerId}`]);
    server.serializeAttachment({ playerId });
    server.send(JSON.stringify({ type: 'event', event: 'state', data: next.publicState(playerId) }));
    this.broadcast(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, rawMessage) {
    await this.ready;
    let packet;
    try {
      packet = JSON.parse(typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage));
    } catch {
      socket.send(JSON.stringify({ type: 'ack', id: '', data: failure('消息格式错误') }));
      return;
    }
    const { id = '', event, payload = {} } = packet;
    try {
      await this.handleEvent(attachment(socket).playerId, event, payload);
      socket.send(JSON.stringify({ type: 'ack', id, data: ok() }));
    } catch (error) {
      socket.send(JSON.stringify({ type: 'ack', id, data: failure(error) }));
    }
  }

  async handleEvent(playerId, event, payload) {
    if (!this.room) throw new Error('房间已失效');
    const next = GameRoom.fromState(this.room);
    if (event === 'discard') next.discard(playerId, payload.tile, !!payload.declare);
    else if (event === 'claim') next.claim(playerId, payload.action);
    else if (event === 'selfGang') next.selfGang(playerId, payload.tile);
    else if (['toggleReady', 'start', 'selfHu', 'nextRound'].includes(event)) next[event](playerId);
    else throw new Error('不支持的操作');
    await this.ctx.storage.put('room', clone(next));
    await this.scheduleClaimAlarm(next);
    this.room = next;
    this.broadcast();
  }

  async webSocketClose(socket) { await this.setOffline(socket); }
  async webSocketError(socket) { await this.setOffline(socket); }

  async setOffline(socket) {
    await this.ready;
    if (!this.room) return;
    const next = GameRoom.fromState(this.room);
    const player = next.players.find((candidate) => candidate.id === attachment(socket).playerId);
    if (!player) return;
    player.online = false;
    await this.ctx.storage.put('room', clone(next));
    this.room = next;
    this.broadcast();
  }

  async alarm() {
    await this.ready;
    if (!this.room?.pending || this.room.pending.kind !== 'claim') return;
    const next = GameRoom.fromState(this.room);
    if (next.pending.expiresAt > Date.now()) return this.scheduleClaimAlarm(next);
    next.pending.candidates.forEach((candidate) => {
      if (!candidate.response) candidate.response = 'pass';
    });
    next.resolveClaims();
    await this.ctx.storage.put('room', clone(next));
    await this.scheduleClaimAlarm(next);
    this.room = next;
    this.broadcast();
  }

  broadcast(except) {
    if (!this.room) return;
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      try {
        socket.send(JSON.stringify({ type: 'event', event: 'state', data: this.room.publicState(attachment(socket).playerId) }));
      } catch { /* stale sockets are removed by the runtime */ }
    }
  }

  async scheduleClaimAlarm(room) {
    if (room.pending?.kind === 'claim') await this.ctx.storage.setAlarm(room.pending.expiresAt);
    else await this.ctx.storage.deleteAlarm();
  }
}
