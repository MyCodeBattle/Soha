import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
import { PlayerAction } from '@soha/core';
import { Room } from './room.js';
import { RoomRegistry, type RoomEntryResult } from './room-registry.js';

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

const rooms = new RoomRegistry(broadcastRoom);

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
  let currentRoom: Room | null = null;

  const getCurrentRoom = () => {
    if (!currentRoom || !currentPlayerId || !rooms.isCurrent(currentRoom) ||
      currentRoom.socketMap.get(currentPlayerId) !== socket.id) return null;
    return currentRoom;
  };

  const enterRoom = (room: Room, playerId: string, callback?: (result: RoomEntryResult) => void) => {
    if (currentRoom && currentPlayerId && (currentRoom !== room || currentPlayerId !== playerId)) {
      rooms.disconnect(currentRoom, currentPlayerId, socket.id);
      socket.leave(currentRoom.id);
    }
    currentPlayerId = playerId;
    currentRoom = room;
    socket.join(room.id);
    callback?.({ success: true, roomId: room.id, playerId, inviteToken: room.inviteToken });
    room.broadcast();
  };

  socket.on('create_room', ({ playerName, ante }: { playerName: string; ante?: number }, callback) => {
    const playerId = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      const room = rooms.create({ playerId, playerName: playerName || '玩家', socketId: socket.id, ante });
      enterRoom(room, playerId, callback);
    } catch (err) {
      callback?.({ success: false, error: err instanceof Error ? err.message : '创建房间失败' });
    }
  });

  socket.on('join_room', ({ roomId, playerName, playerId: existingId, inviteToken }: {
    roomId: string; playerName: string; playerId?: string; inviteToken?: string;
  }, callback) => {
    const playerId = existingId || `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    try {
      const room = rooms.join({ roomId, playerId, playerName: playerName || '新玩家', socketId: socket.id, inviteToken });
      enterRoom(room, playerId, callback);
    } catch (err) {
      callback?.({ success: false, error: err instanceof Error ? err.message : '加入房间失败' });
    }
  });

  socket.on('toggle_ready', ({ isReady }: { isReady: boolean }) => {
    if (!currentPlayerId) return;
    const room = getCurrentRoom();
    if (room) {
      room.toggleReady(currentPlayerId, isReady);
    }
  });

  socket.on('add_bot', () => {
    if (!currentPlayerId) return;
    const room = getCurrentRoom();
    if (room && room.hostId === currentPlayerId) {
      try {
        room.addBot();
      } catch (err: any) {
        socket.emit('error_msg', { message: err.message });
      }
    }
  });

  socket.on('remove_bot', ({ botId }: { botId: string }) => {
    if (!currentPlayerId) return;
    const room = getCurrentRoom();
    if (room && room.hostId === currentPlayerId) {
      room.removeBot(botId);
    }
  });

  socket.on('player_action', (action: PlayerAction) => {
    if (!currentPlayerId) return;
    const room = getCurrentRoom();
    if (room) {
      try {
        room.executeAction(currentPlayerId, action);
      } catch (err: any) {
        socket.emit('error_msg', { message: err.message });
      }
    }
  });

  socket.on('reset_chips', () => {
    if (!currentPlayerId) return;
    const room = getCurrentRoom();
    if (room) {
      room.resetChips(currentPlayerId);
    }
  });

  socket.on('start_game', () => {
    if (!currentPlayerId) return;
    const room = getCurrentRoom();
    if (room && room.hostId === currentPlayerId) {
      room.startHand();
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && currentPlayerId) {
      rooms.disconnect(currentRoom, currentPlayerId, socket.id);
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

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`[ShowHand Server] Running on http://${HOST}:${PORT}`);
});
