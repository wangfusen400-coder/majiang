import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { startMahjongServer } from './server.js';

startMahjongServer({
  express,
  cors,
  http,
  SocketIOServer,
  port: Number(process.env.PORT || 3000),
});
