import { GameRoom } from './room.js';

export function startMahjongServer({ express, cors, http, SocketIOServer, port = 3000 }) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });
  const rooms = new Map();

  const newCode = () => {
    let code;
    do code = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(code));
    return code;
  };

  const emitRoom = (room) => room.players.forEach((player) => {
    io.to(player.id).emit('state', room.publicState(player.id));
  });
  const ok = (ack, data = {}) => typeof ack === 'function' && ack({ ok: true, ...data });
  const fail = (ack, error) => typeof ack === 'function' && ack({ ok: false, error: error.message || String(error) });

  app.get('/health', (_, response) => response.json({
    ok: true,
    rooms: rooms.size,
    service: '晋麻·扣点点',
  }));

  io.on('connection', (socket) => {
    socket.on('createRoom', (payload = {}, ack) => {
      try {
        const code = newCode();
        const playerId = String(payload.playerId || socket.id);
        const room = new GameRoom(code, {
          id: playerId,
          name: payload.name,
          avatar: payload.avatar,
        }, payload.rules);
        rooms.set(code, room);
        socket.join(code);
        socket.join(playerId);
        socket.data = { code, playerId };
        ok(ack, { code, playerId });
        emitRoom(room);
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on('joinRoom', (payload = {}, ack) => {
      try {
        const code = String(payload.code || '').trim();
        const room = rooms.get(code);
        if (!room) throw new Error('房间不存在');
        const player = room.addPlayer({
          id: String(payload.playerId || socket.id),
          name: payload.name,
          avatar: payload.avatar,
        });
        socket.join(code);
        socket.join(player.id);
        socket.data = { code, playerId: player.id };
        ok(ack, { code, playerId: player.id });
        emitRoom(room);
      } catch (error) {
        fail(ack, error);
      }
    });

    socket.on('resumeRoom', (payload = {}, ack) => {
      try {
        const code = String(payload.code || '');
        const playerId = String(payload.playerId || '');
        const room = rooms.get(code);
        if (!room) throw new Error('房间已失效');
        const player = room.player(playerId);
        player.online = true;
        socket.join(code);
        socket.join(playerId);
        socket.data = { code, playerId };
        ok(ack);
        emitRoom(room);
      } catch (error) {
        fail(ack, error);
      }
    });

    for (const event of ['toggleReady', 'start', 'discard', 'claim', 'selfGang', 'selfHu', 'nextRound']) {
      socket.on(event, (payload = {}, ack) => {
        try {
          const room = rooms.get(socket.data.code);
          if (!room) throw new Error('房间已失效');
          const id = socket.data.playerId;
          if (event === 'discard') room.discard(id, payload.tile, !!payload.declare);
          else if (event === 'claim') room.claim(id, payload.action);
          else if (event === 'selfGang') room.selfGang(id, payload.tile);
          else room[event](id);
          ok(ack);
          emitRoom(room);
        } catch (error) {
          fail(ack, error);
        }
      });
    }

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      if (!room) return;
      const player = room.players.find((candidate) => candidate.id === socket.data.playerId);
      if (player) player.online = false;
      emitRoom(room);
      if (room.players.every((candidate) => !candidate.online)) {
        setTimeout(() => {
          if (room.players.every((candidate) => !candidate.online)) rooms.delete(room.code);
        }, 30 * 60 * 1000);
      }
    });
  });

  const claimTimer = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.pending?.kind === 'claim' && room.pending.expiresAt <= Date.now()) {
        room.pending.candidates.forEach((candidate) => {
          if (!candidate.response) candidate.response = 'pass';
        });
        room.resolveClaims();
        emitRoom(room);
      }
    }
  }, 500);

  server.listen(port, '0.0.0.0', () => {
    console.log(`晋麻服务已启动：http://0.0.0.0:${port}`);
  });

  return { app, server, io, rooms, claimTimer };
}
