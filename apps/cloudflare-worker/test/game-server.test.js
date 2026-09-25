import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomObjectCore } from '../src/room-object-core.js';

class MemoryStorage {
  constructor() { this.values = new Map(); this.alarm = null; }
  async get(key) { const value = this.values.get(key); return value == null ? value : structuredClone(value); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
}

class MockSocket {
  constructor(playerId) { this.session = { playerId }; this.sent = []; }
  serializeAttachment(value) { this.session = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.session); }
  send(value) { this.sent.push(JSON.parse(value)); }
}

const createContext = () => {
  const sockets = [];
  return {
    sockets, storage: new MemoryStorage(), getWebSockets: () => sockets,
    acceptWebSocket: (socket) => sockets.push(socket), blockConcurrencyWhile: (callback) => callback(),
  };
};

test('persists and starts an isolated four-player room', async () => {
  const ctx = createContext();
  const server = new RoomObjectCore(ctx);
  await server.ready;
  const created = await server.create('123456', { id: 'p0', name: '房主', avatar: '🀄' }, { rounds: 4 });
  assert.deepEqual(created, { created: true, code: '123456', playerId: 'p0' });

  const sockets = Array.from({ length: 4 }, (_, index) => new MockSocket(`p${index}`));
  ctx.sockets.push(...sockets);
  for (let index = 1; index < 4; index++) {
    await server.join({ id: `p${index}`, name: `玩家${index}`, avatar: '🐯' });
    await server.handleEvent(`p${index}`, 'toggleReady', {});
  }
  await server.handleEvent('p0', 'start', {});
  assert.equal(server.room.status, 'playing');
  assert.equal(server.room.players.length, 4);
  assert.equal(server.room.players[0].hand.length, 14);
  assert.ok(sockets.every((socket) => socket.sent.some((packet) => packet.event === 'state')));
  const saved = await ctx.storage.get('room');
  assert.equal(saved.code, '123456');
  assert.equal(saved.status, 'playing');
});

test('restores state and active socket identity after hibernation', async () => {
  const ctx = createContext();
  const first = new RoomObjectCore(ctx);
  await first.ready;
  await first.create('654321', { id: 'persistent-player', name: '持久化玩家', avatar: '🐲' });
  ctx.sockets.push(new MockSocket('persistent-player'));
  const restarted = new RoomObjectCore(ctx);
  await restarted.ready;
  assert.equal(restarted.room.player('persistent-player').name, '持久化玩家');
  assert.equal(restarted.room.player('persistent-player').online, true);
});

test('returns acknowledgements and private state over the JSON protocol', async () => {
  const ctx = createContext();
  const server = new RoomObjectCore(ctx);
  await server.ready;
  await server.create('112233', { id: 'p0', name: '协议玩家' });
  const socket = new MockSocket('p0');
  ctx.sockets.push(socket);
  await server.webSocketMessage(socket, JSON.stringify({ id: 'request-1', event: 'toggleReady', payload: {} }));
  const ack = socket.sent.find((packet) => packet.type === 'ack');
  const state = socket.sent.find((packet) => packet.type === 'event' && packet.event === 'state');
  assert.equal(ack.data.ok, true);
  assert.equal(state.data.players[0].handCount, 0);
  assert.deepEqual(state.data.players[0].hand, []);
});
