export const SUITS = ['万', '筒', '条'];
export const WINDS = ['东', '南', '西', '北', '中', '发', '白'];

export const tileLabel = (tile) => tile < 27
  ? `${tile % 9 + 1}${SUITS[Math.floor(tile / 9)]}`
  : WINDS[tile - 27];

export const tilePoint = (tile) => tile < 27 ? tile % 9 + 1 : 10;

export function createWall(withWinds = true) {
  const max = withWinds ? 34 : 27;
  return Array.from({ length: max * 4 }, (_, i) => Math.floor(i / 4));
}

export function shuffle(input, random = Math.random) {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const sortTiles = (tiles) => [...tiles].sort((a, b) => a - b);

function countsOf(tiles) {
  const counts = Array(34).fill(0);
  for (const tile of tiles) {
    if (!Number.isInteger(tile) || tile < 0 || tile > 33) return null;
    counts[tile]++;
  }
  return counts;
}

function canFormMelds(counts, remaining) {
  if (remaining === 0) return true;
  const first = counts.findIndex((n) => n > 0);
  if (first < 0) return false;
  if (counts[first] >= 3) {
    counts[first] -= 3;
    if (canFormMelds(counts, remaining - 3)) { counts[first] += 3; return true; }
    counts[first] += 3;
  }
  if (first < 27 && first % 9 <= 6 && counts[first + 1] && counts[first + 2]) {
    counts[first]--; counts[first + 1]--; counts[first + 2]--;
    if (canFormMelds(counts, remaining - 3)) {
      counts[first]++; counts[first + 1]++; counts[first + 2]++; return true;
    }
    counts[first]++; counts[first + 1]++; counts[first + 2]++;
  }
  return false;
}

export function isSevenPairs(tiles, meldCount = 0) {
  if (meldCount || tiles.length !== 14) return false;
  const counts = countsOf(tiles);
  return !!counts && counts.reduce((pairs, n) => pairs + Math.floor(n / 2), 0) === 7;
}

export function isLuxurySevenPairs(tiles, meldCount = 0) {
  if (!isSevenPairs(tiles, meldCount)) return false;
  return countsOf(tiles).some((n) => n === 4);
}

export function isThirteenOrphans(tiles, meldCount = 0) {
  if (meldCount || tiles.length !== 14) return false;
  const required = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  const counts = countsOf(tiles);
  return required.every((tile) => counts[tile] > 0) && required.some((tile) => counts[tile] > 1);
}

export function isStandardWin(tiles, meldCount = 0) {
  if (tiles.length !== 14 - meldCount * 3) return false;
  const counts = countsOf(tiles);
  if (!counts) return false;
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    if (canFormMelds(counts, tiles.length - 2)) { counts[pair] += 2; return true; }
    counts[pair] += 2;
  }
  return false;
}

export function canWin(tiles, meldCount = 0, rules = {}) {
  return isStandardWin(tiles, meldCount)
    || (rules.sevenPairs !== false && isSevenPairs(tiles, meldCount))
    || (rules.thirteenOrphans !== false && isThirteenOrphans(tiles, meldCount));
}

export function getWaits(hand, meldCount = 0, rules = {}) {
  const counts = countsOf(hand);
  if (!counts) return [];
  const max = rules.withWinds === false ? 27 : 34;
  const waits = [];
  for (let tile = 0; tile < max; tile++) {
    if (counts[tile] < 4 && canWin([...hand, tile], meldCount, rules)) waits.push(tile);
  }
  return waits;
}

function isPureSuit(tiles, melds) {
  const all = [...tiles, ...melds.flatMap((m) => m.tiles)];
  if (all.some((t) => t >= 27)) return false;
  return new Set(all.map((t) => Math.floor(t / 9))).size === 1;
}

function isStraight(tiles, melds) {
  const all = [...tiles, ...melds.flatMap((m) => m.tiles)];
  return [0, 9, 18].some((start) => Array.from({ length: 9 }, (_, i) => start + i)
    .every((t) => all.includes(t)));
}

export function analyzePatterns(tiles, melds = [], rules = {}) {
  const patterns = [{ name: '平胡', multiplier: 1 }];
  if (rules.sevenPairs !== false && isSevenPairs(tiles, melds.length)) {
    patterns.push({ name: isLuxurySevenPairs(tiles) ? '豪华七对' : '七对', multiplier: isLuxurySevenPairs(tiles) ? 4 : 2 });
  }
  if (rules.thirteenOrphans !== false && isThirteenOrphans(tiles, melds.length)) patterns.push({ name: '十三幺', multiplier: 2 });
  if (rules.pureSuit !== false && isPureSuit(tiles, melds)) patterns.push({ name: '清一色', multiplier: 2 });
  if (rules.straight !== false && isStraight(tiles, melds)) patterns.push({ name: '一条龙', multiplier: 2 });
  return patterns;
}

export function scoreWin({ hand, melds = [], winningTile, selfDraw, dealer, rules = {} }) {
  const patterns = analyzePatterns(hand, melds, rules);
  const patternMultiplier = Math.max(...patterns.map((p) => p.multiplier));
  const dealerBonus = rules.dealerBonus === false ? 0 : 5;
  const base = tilePoint(winningTile) + (dealer ? dealerBonus : 0);
  return {
    pointsPerPayer: base * (selfDraw ? 2 : 1) * patternMultiplier,
    base,
    patternMultiplier,
    patterns: patterns.filter((p) => p.multiplier > 1).map((p) => p.name).concat(patternMultiplier === 1 ? ['平胡'] : [])
  };
}

export function canHuByPoint(winningTile, selfDraw) {
  const point = tilePoint(winningTile);
  return point >= 6 || (selfDraw && point >= 3);
}

export const DEFAULT_RULES = Object.freeze({
  rounds: 8,
  withWinds: true,
  dealerBonus: true,
  reserveSevenStacks: true,
  sevenPairs: true,
  pureSuit: true,
  straight: true,
  thirteenOrphans: true
});
