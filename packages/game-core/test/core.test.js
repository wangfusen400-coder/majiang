import test from 'node:test';
import assert from 'node:assert/strict';
import { canWin, getWaits, isSevenPairs, scoreWin, tilePoint } from '../index.js';

test('recognizes a normal winning hand', () => {
  assert.equal(canWin([0,1,2, 3,4,5, 9,10,11, 18,18,18, 27,27]), true);
});

test('honor tiles cannot form a sequence', () => {
  assert.equal(canWin([0,1,2, 3,4,5, 9,10,11, 27,28,29, 30,30]), false);
});

test('recognizes seven pairs and waits', () => {
  const thirteen = [0,0, 1,1, 9,9, 10,10, 18,18, 27,27, 33];
  assert.deepEqual(getWaits(thirteen), [33]);
  assert.equal(isSevenPairs([...thirteen, 33]), true);
});

test('scores point value, dealer bonus and self draw', () => {
  const result = scoreWin({
    hand: [0,1,2, 3,4,5, 9,10,11, 18,18,18, 27,27],
    winningTile: 5,
    selfDraw: true,
    dealer: true
  });
  assert.equal(tilePoint(5), 6);
  assert.equal(result.pointsPerPayer, 22);
});
