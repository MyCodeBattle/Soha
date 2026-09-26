import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { PlayerAction } from '@soha/core';
import { Room } from './room.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve client static files if built
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const rooms: Map<string, Room> = new Map();

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function broadcastRoom(room: Room) {
  for (const player of room.players) {
    if (player.isBot) continue;
    const socketId = room.socketMap.get(player.id);
    if (socketId) {
      const view = room.getPlayerView(player.id);
      io.to(socketId).emit('room_state', view);
    }
  }
}

io.on('connection', (socket: Socket) => {
  let currentPlayerId: string | null = null;
  let currentRoomId: string | null = null;

  socket.on('create_room', ({ playerName, ante }: { playerName: string; ante?: number }, callback) => {
    const roomId = generateRoomCode();
    const playerId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const room = new Room(roomId, playerId, () => broadcastRoom(room));
    if (ante && ante > 0) room.ante = ante;

    rooms.set(roomId, room);
    room.socketMap.set(playerId, socket.id);
    room.addPlayer(playerId, playerName || '玩家');

    currentPlayerId = playerId;
    currentRoomId = roomId;
    socket.join(roomId);

    if (callback) {
      callback({ success: true, roomId, playerId });
    }
    broadcastRoom(room);
  });

  socket.on('join_room', ({ roomId, playerName, playerId: existingId }: { roomId: string; playerName: string; playerId?: string }, callback) => {
    const code = roomId.trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      if (callback) callback({ success: false, error: '房间不存在' });
      return;
    }

    const playerId = existingId || `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      room.socketMap.set(playerId, socket.id);
      room.addPlayer(playerId, playerName || '新玩家');

      currentPlayerId = playerId;
      currentRoomId = code;
      socket.join(code);

      if (callback) {
        callback({ success: true, roomId: code, playerId });
      }
      broadcastRoom(room);
    } catch (err: any) {
      if (callback) callback({ success: false, error: err.message || '加入失败' });
    }
  });

  socket.on('toggle_ready', ({ isReady }: { isReady: boolean }) => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.toggleReady(currentPlayerId, isReady);
    }
  });

  socket.on('add_bot', () => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostId === currentPlayerId) {
      try {
        room.addBot();
      } catch (err: any) {
        socket.emit('error_msg', { message: err.message });
      }
    }
  });

  socket.on('remove_bot', ({ botId }: { botId: string }) => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostId === currentPlayerId) {
      room.removeBot(botId);
    }
  });

  socket.on('player_action', (action: PlayerAction) => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      try {
        room.executeAction(currentPlayerId, action);
      } catch (err: any) {
        socket.emit('error_msg', { message: err.message });
      }
    }
  });

  socket.on('reset_chips', () => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (room) {
      room.resetChips(currentPlayerId);
    }
  });

  socket.on('start_game', () => {
    if (!currentRoomId || !currentPlayerId) return;
    const room = rooms.get(currentRoomId);
    if (room && room.hostId === currentPlayerId) {
      room.startHand();
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId && currentPlayerId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        room.handleDisconnect(currentPlayerId);
      }
    }
  });
});

// Fallback all non-api routes to client index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('<h1>52 张港式五张梭哈服务端运行中</h1><p>请启动并构建前端客户端。</p>');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[ShowHand Server] Running on http://localhost:${PORT}`);
});
