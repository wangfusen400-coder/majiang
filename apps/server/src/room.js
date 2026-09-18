import { randomUUID } from 'node:crypto';
import {
  DEFAULT_RULES, canHuByPoint, canWin, createWall, getWaits,
  scoreWin, shuffle, sortTiles, tilePoint
} from '../../../packages/game-core/index.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const seatDistance = (from, seat) => (seat - from + 4) % 4;

export class GameRoom {
  constructor(code, owner, rules = {}) {
    this.code = code;
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.players = [];
    this.status = 'waiting';
    this.round = 0;
    this.dealer = 0;
    this.turn = 0;
    this.wall = [];
    this.discards = [];
    this.pending = null;
    this.lastResult = null;
    this.addPlayer(owner);
  }

  addPlayer({ id = randomUUID(), name, avatar = '🀄' }) {
    if (this.status !== 'waiting') throw new Error('牌局已开始，不能加入');
    if (this.players.length >= 4) throw new Error('房间已满');
    if (!name?.trim()) throw new Error('请输入昵称');
    const player = {
      id, name: name.trim().slice(0, 10), avatar, seat: this.players.length,
      online: true, ready: false, score: 0, hand: [], melds: [],
      declared: false, roundDelta: 0, stats: { selfDraw: 0, win: 0, discardLoss: 0, exposedKong: 0, concealedKong: 0 }
    };
    this.players.push(player);
    return player;
  }

  player(id) {
    const player = this.players.find((p) => p.id === id);
    if (!player) throw new Error('玩家不在房间中');
    return player;
  }

  toggleReady(id) {
    if (this.status !== 'waiting') throw new Error('当前不能准备');
    const player = this.player(id);
    player.ready = !player.ready;
  }

  start(id) {
    if (this.players[0]?.id !== id) throw new Error('仅房主可开始');
    if (this.players.length !== 4) throw new Error('需要 4 位玩家');
    if (!this.players.slice(1).every((p) => p.ready)) throw new Error('还有玩家未准备');
    this.beginRound();
  }

  beginRound() {
    this.round++;
    this.status = 'playing';
    this.wall = shuffle(createWall(this.rules.withWinds));
    this.discards = [];
    this.pending = null;
    this.lastResult = null;
    this.players.forEach((p) => {
      p.hand = sortTiles(this.wall.splice(0, 13));
      p.melds = []; p.declared = false; p.roundDelta = 0; p.ready = true;
    });
    this.turn = this.dealer;
    this.draw(this.turn);
  }

  draw(seat, replacement = false) {
    const reserve = this.rules.reserveSevenStacks ? 14 : 0;
    if (this.wall.length <= reserve) return this.drawGame();
    const tile = this.wall.shift();
    this.players[seat].hand.push(tile);
    this.players[seat].hand = sortTiles(this.players[seat].hand);
    this.turn = seat;
    this.pending = { kind: 'turn', seat, drawnTile: tile, replacement };
  }

  discard(id, tile, declare = false) {
    if (this.status !== 'playing' || this.pending?.kind !== 'turn') throw new Error('当前不能出牌');
    const player = this.player(id);
    if (player.seat !== this.turn) throw new Error('还没轮到你');
    const index = player.hand.indexOf(tile);
    if (index < 0) throw new Error('手牌中没有这张牌');
    if (player.declared && tile !== this.pending.drawnTile) throw new Error('报听后只能摸什么打什么');
    const remaining = [...player.hand]; remaining.splice(index, 1);
    if (declare) {
      const waits = getWaits(remaining, player.melds.length, this.rules);
      if (!waits.some((t) => tilePoint(t) >= 6)) throw new Error('听口中必须至少有一张 6 点以上的牌');
      player.declared = true;
    }
    player.hand = remaining;
    this.discards.push({ tile, seat: player.seat, declared: declare });
    this.openClaims(player.seat, tile);
  }

  openClaims(from, tile) {
    const candidates = [];
    for (const player of this.players) {
      if (player.seat === from) continue;
      const actions = [];
      if (player.declared && canHuByPoint(tile, false)
        && canWin([...player.hand, tile], player.melds.length, this.rules)) actions.push('hu');
      const count = player.hand.filter((t) => t === tile).length;
      if (!player.declared && count >= 3) actions.push('gang');
      if (!player.declared && count >= 2) actions.push('peng');
      if (actions.length) candidates.push({ seat: player.seat, actions, response: null });
    }
    if (!candidates.length) return this.nextTurn(from);
    this.pending = { kind: 'claim', from, tile, candidates, expiresAt: Date.now() + 12000 };
  }

  claim(id, action) {
    if (this.pending?.kind !== 'claim') throw new Error('当前没有可响应的牌');
    const player = this.player(id);
    const candidate = this.pending.candidates.find((c) => c.seat === player.seat);
    if (!candidate) throw new Error('你不能响应这张牌');
    if (candidate.response) throw new Error('已经响应过了');
    if (action !== 'pass' && !candidate.actions.includes(action)) throw new Error('无效操作');
    candidate.response = action;
    if (action === 'hu' || this.pending.candidates.every((c) => c.response)) this.resolveClaims();
  }

  resolveClaims() {
    if (this.pending?.kind !== 'claim') return;
    const pending = clone(this.pending);
    const priority = { hu: 3, gang: 2, peng: 1, pass: 0, null: 0 };
    const chosen = pending.candidates
      .filter((c) => c.response && c.response !== 'pass')
      .sort((a, b) => priority[b.response] - priority[a.response]
        || seatDistance(pending.from, a.seat) - seatDistance(pending.from, b.seat))[0];
    if (!chosen) return this.nextTurn(pending.from);
    const player = this.players[chosen.seat];
    if (chosen.response === 'hu') return this.finishWin(chosen.seat, pending.tile, false, pending.from);
    const needed = chosen.response === 'gang' ? 3 : 2;
    for (let i = 0; i < needed; i++) player.hand.splice(player.hand.indexOf(pending.tile), 1);
    player.melds.push({ type: chosen.response, tiles: Array(needed + 1).fill(pending.tile), from: pending.from });
    this.discards.pop();
    if (chosen.response === 'gang') {
      this.scoreGang(chosen.seat, pending.from, pending.tile, false);
      player.stats.exposedKong++;
      return this.draw(chosen.seat, true);
    }
    this.turn = chosen.seat;
    this.pending = { kind: 'turn', seat: chosen.seat, drawnTile: null, replacement: false };
  }

  selfGang(id, tile) {
    if (this.pending?.kind !== 'turn') throw new Error('当前不能杠牌');
    const player = this.player(id);
    if (player.seat !== this.turn) throw new Error('还没轮到你');
    if (player.declared) throw new Error('MVP 版本暂不支持报听后杠牌');
    if (player.hand.filter((t) => t === tile).length !== 4) throw new Error('不能暗杠这张牌');
    player.hand = player.hand.filter((t) => t !== tile);
    player.melds.push({ type: 'angang', tiles: Array(4).fill(tile), from: player.seat });
    player.stats.concealedKong++;
    this.scoreGang(player.seat, null, tile, true);
    this.draw(player.seat, true);
  }

  scoreGang(seat, from, tile, concealed) {
    const point = tilePoint(tile) * (concealed ? 2 : 1);
    const winner = this.players[seat];
    if (from != null && !this.players[from].declared) {
      const amount = point * 3;
      this.players[from].score -= amount; this.players[from].roundDelta -= amount;
      winner.score += amount; winner.roundDelta += amount;
    } else {
      this.players.forEach((p) => {
        if (p.seat === seat) return;
        p.score -= point; p.roundDelta -= point;
        winner.score += point; winner.roundDelta += point;
      });
    }
  }

  selfHu(id) {
    if (this.pending?.kind !== 'turn') throw new Error('当前不能胡牌');
    const player = this.player(id);
    if (player.seat !== this.turn || !player.declared) throw new Error('必须先报听');
    const tile = this.pending.drawnTile;
    if (tile == null || !canHuByPoint(tile, true) || !canWin(player.hand, player.melds.length, this.rules)) throw new Error('当前牌型不能自摸');
    this.finishWin(player.seat, tile, true, null);
  }

  finishWin(seat, tile, selfDraw, from) {
    const winner = this.players[seat];
    const fullHand = selfDraw ? winner.hand : [...winner.hand, tile];
    const detail = scoreWin({ hand: fullHand, melds: winner.melds, winningTile: tile, selfDraw, dealer: seat === this.dealer, rules: this.rules });
    const payers = selfDraw || this.players[from]?.declared
      ? this.players.filter((p) => p.seat !== seat)
      : [this.players[from]];
    const multiplier = payers.length === 1 && !selfDraw ? 3 : 1;
    for (const payer of payers) {
      const amount = detail.pointsPerPayer * multiplier;
      payer.score -= amount; payer.roundDelta -= amount;
      winner.score += amount; winner.roundDelta += amount;
    }
    if (selfDraw) winner.stats.selfDraw++; else { winner.stats.win++; this.players[from].stats.discardLoss++; }
    this.status = 'roundEnd';
    this.pending = null;
    this.lastResult = { type: selfDraw ? '自摸' : '接炮', winner: seat, from, tile, ...detail, deltas: this.players.map((p) => p.roundDelta) };
    this.dealer = seat;
  }

  drawGame() {
    this.status = 'roundEnd'; this.pending = null;
    this.lastResult = { type: '荒庄', deltas: this.players.map((p) => p.roundDelta) };
  }

  nextRound(id) {
    if (this.players[0]?.id !== id) throw new Error('仅房主可开下一局');
    if (this.status !== 'roundEnd') throw new Error('本局尚未结束');
    if (this.round >= this.rules.rounds) { this.status = 'finished'; return; }
    this.beginRound();
  }

  nextTurn(from) { this.draw((from + 1) % 4); }

  publicState(viewerId) {
    const viewer = this.players.find((p) => p.id === viewerId);
    return {
      code: this.code, rules: this.rules, status: this.status, round: this.round,
      dealer: this.dealer, turn: this.turn, wallCount: this.wall.length,
      discards: this.discards, lastResult: this.lastResult,
      me: viewer?.seat ?? null,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, seat: p.seat, online: p.online,
        ready: p.ready, score: p.score, declared: p.declared, roundDelta: p.roundDelta,
        handCount: p.hand.length, hand: p.id === viewerId ? p.hand : undefined,
        melds: p.melds, stats: p.stats
      })),
      pending: this.pending && {
        kind: this.pending.kind, seat: this.pending.seat, from: this.pending.from,
        tile: this.pending.tile, expiresAt: this.pending.expiresAt,
        drawnTile: this.pending.seat === viewer?.seat ? this.pending.drawnTile : undefined,
        actions: this.pending.kind === 'claim'
          ? this.pending.candidates.find((c) => c.seat === viewer?.seat)?.actions ?? [] : []
      }
    };
  }
}
