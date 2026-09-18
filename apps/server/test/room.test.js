import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from '../src/room.js';

const readyRoom = () => {
  const room = new GameRoom('123456', { id: 'p0', name: '东家' });
  for (let i = 1; i < 4; i++) {
    room.addPlayer({ id: `p${i}`, name: `玩家${i}` });
    room.toggleReady(`p${i}`);
  }
  room.start('p0');
  return room;
};

test('starts a four-player room and keeps hands private', () => {
  const room = readyRoom();
  assert.equal(room.status, 'playing');
  assert.equal(room.players[0].hand.length, 14);
  assert.deepEqual(room.players.slice(1).map((p) => p.hand.length), [13, 13, 13]);
  const state = room.publicState('p0');
  assert.equal(state.players[0].hand.length, 14);
  assert.equal(state.players[1].hand, undefined);
  assert.equal(state.players[1].handCount, 13);
});

test('a discard with no claim advances and draws for next seat', () => {
  const room = readyRoom();
  room.players[0].hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 33];
  room.players[1].hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  room.players[2].hand = [...room.players[1].hand];
  room.players[3].hand = [...room.players[1].hand];
  room.pending = { kind: 'turn', seat: 0, drawnTile: 33 };
  room.discard('p0', 33, false);
  assert.equal(room.turn, 1);
  assert.equal(room.players[1].hand.length, 14);
  assert.equal(room.discards.at(-1).tile, 33);
});

test('peng removes two tiles and transfers the turn', () => {
  const room = readyRoom();
  room.players[0].hand = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 5];
  room.players[1].hand = [5, 5, 0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11];
  room.players[2].hand = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13];
  room.players[3].hand = [...room.players[2].hand];
  room.pending = { kind: 'turn', seat: 0, drawnTile: 5 };
  room.discard('p0', 5, false);
  room.claim('p1', 'peng');
  assert.equal(room.turn, 1);
  assert.equal(room.players[1].hand.filter((t) => t === 5).length, 0);
  assert.equal(room.players[1].melds[0].type, 'peng');
  assert.equal(room.discards.length, 0);
});
