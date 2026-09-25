import assert from 'node:assert/strict';

const baseUrl = process.argv[2]?.replace(/\/$/, '');
if (!baseUrl) throw new Error('Usage: node live-e2e.mjs https://worker.example.workers.dev');

const post = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.ok, true, result.error);
  assert.equal(result.ok, true, result.error);
  return result;
};

const sockets = [];
const states = new Map();
const pending = new Map();

const connect = (code, playerId) => new Promise((resolve, reject) => {
  const url = new URL(baseUrl);
  url.protocol = 'wss:';
  url.pathname = '/ws';
  url.search = new URLSearchParams({ room: code, playerId }).toString();
  const socket = new WebSocket(url);
  const timer = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
  socket.addEventListener('error', reject);
  socket.addEventListener('message', (message) => {
    const packet = JSON.parse(String(message.data));
    if (packet.type === 'event' && packet.event === 'state') {
      states.set(playerId, packet.data);
      if (packet.data.code === code) {
        clearTimeout(timer);
        resolve(socket);
      }
    }
    if (packet.type === 'ack' && pending.has(packet.id)) {
      pending.get(packet.id)(packet.data);
      pending.delete(packet.id);
    }
  });
  sockets.push(socket);
});

let sequence = 0;
const emit = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  const id = `e2e-${++sequence}`;
  const timer = setTimeout(() => reject(new Error(`${event} acknowledgement timeout`)), 10000);
  pending.set(id, (result) => {
    clearTimeout(timer);
    assert.equal(result.ok, true, result.error);
    resolve(result);
  });
  socket.send(JSON.stringify({ id, event, payload }));
});

try {
  const owner = await post('/rooms', { playerId: 'e2e-owner', name: '公网测试房主', rules: { rounds: 4 } });
  const players = [owner];
  for (let index = 1; index < 4; index++) {
    players.push(await post(`/rooms/${owner.code}/join`, { playerId: `e2e-p${index}`, name: `公网测试${index}` }));
  }
  const connections = [];
  for (const player of players) connections.push(await connect(owner.code, player.playerId));
  for (let index = 1; index < 4; index++) await emit(connections[index], 'toggleReady');
  await emit(connections[0], 'start');
  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const player of players) {
    const state = states.get(player.playerId);
    assert.equal(state.status, 'playing');
    assert.equal(state.players.length, 4);
    const own = state.players.find((candidate) => candidate.id === player.playerId);
    assert.ok(Array.isArray(own.hand));
    assert.ok(state.players.filter((candidate) => candidate.id !== player.playerId).every((candidate) => candidate.hand === undefined));
  }
  console.log(JSON.stringify({ ok: true, room: owner.code, players: players.length, status: 'playing', privateHands: true }));
} finally {
  sockets.forEach((socket) => socket.close());
}
