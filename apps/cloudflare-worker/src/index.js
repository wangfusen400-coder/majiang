import { DurableObject } from 'cloudflare:workers';
import { RoomObjectCore } from './room-object-core.js';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*' } });
const playerFrom = (payload) => ({
  id: String(payload.playerId || crypto.randomUUID()), name: payload.name, avatar: payload.avatar,
});
const newRoomCode = () => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(100000 + (value[0] % 900000));
};

export class GameRoomObject extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.core = new RoomObjectCore(ctx); }
  create(code, owner, rules) { return this.core.create(code, owner, rules); }
  join(player) { return this.core.join(player); }
  fetch(request) { return this.core.fetch(request); }
  webSocketMessage(socket, message) { return this.core.webSocketMessage(socket, message); }
  webSocketClose(socket) { return this.core.webSocketClose(socket); }
  webSocketError(socket) { return this.core.webSocketError(socket); }
  alarm() { return this.core.alarm(); }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' } });
    if (url.pathname === '/health') return json({ ok: true, service: '晋麻·扣点点', platform: 'Cloudflare Workers' });
    try {
      if (request.method === 'POST' && url.pathname === '/rooms') {
        const payload = await request.json();
        for (let attempt = 0; attempt < 12; attempt++) {
          const code = newRoomCode();
          const result = await env.GAME_ROOM.getByName(code).create(code, playerFrom(payload), payload.rules);
          if (result.created) return json({ ok: true, code, playerId: result.playerId });
        }
        return json({ ok: false, error: '暂时无法分配房间号，请重试' }, 503);
      }
      const joinMatch = url.pathname.match(/^\/rooms\/(\d{6})\/join$/);
      if (request.method === 'POST' && joinMatch) {
        const result = await env.GAME_ROOM.getByName(joinMatch[1]).join(playerFrom(await request.json()));
        return json({ ok: true, ...result });
      }
      if (url.pathname === '/ws') {
        const code = url.searchParams.get('room') || '';
        const playerId = url.searchParams.get('playerId') || '';
        if (!/^\d{6}$/.test(code) || !playerId) return json({ ok: false, error: '房间参数无效' }, 400);
        return env.GAME_ROOM.getByName(code).fetch(request);
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('request_failed', { path: url.pathname, message: error?.message });
      return json({ ok: false, error: error?.message || '服务器异常' }, 400);
    }
  },
};
