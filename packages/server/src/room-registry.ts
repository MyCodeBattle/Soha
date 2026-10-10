import { Room } from './room.js';

interface RoomConnection {
  playerId: string;
  playerName: string;
  socketId: string;
}

export type RoomEntryResult =
  | { success: true; roomId: string; playerId: string; inviteToken: string }
  | { success: false; error: string };

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private expiryTimers = new Map<Room, NodeJS.Timeout>();

  constructor(private onStateChange: (room: Room) => void) {}

  create(connection: RoomConnection & { ante?: number }): Room {
    const available = Array.from({ length: 90 }, (_, index) => String(index + 10))
      .filter((code) => !this.rooms.has(code));
    if (available.length === 0) throw new Error('房间数量已达上限，请稍后再试');
    const code = available[Math.floor(Math.random() * available.length)];
    const room = new Room(code, connection.playerId, () => {
      this.syncPresence(room);
      if (this.isCurrent(room)) this.onStateChange(room);
    });
    if (connection.ante && connection.ante > 0) room.ante = connection.ante;
    this.rooms.set(code, room);
    room.addPlayer(connection.playerId, connection.playerName);
    room.socketMap.set(connection.playerId, connection.socketId);
    this.syncPresence(room);
    return room;
  }

  join(connection: RoomConnection & { roomId: string; inviteToken?: string }): Room {
    const code = typeof connection.roomId === 'string' ? connection.roomId.trim() : '';
    if (!/^[1-9]\d$/.test(code)) throw new Error('请输入 10–99 的两位数字房间码');
    const room = this.rooms.get(code);
    if (connection.inviteToken !== undefined && (!room || room.inviteToken !== connection.inviteToken)) {
      throw new Error('邀请链接已失效');
    }
    if (!room) throw new Error('房间不存在');
    room.addPlayer(connection.playerId, connection.playerName);
    room.socketMap.set(connection.playerId, connection.socketId);
    this.syncPresence(room);
    return room;
  }

  isCurrent(room: Room): boolean {
    return this.rooms.get(room.id) === room;
  }

  disconnect(room: Room, playerId: string, socketId: string) {
    if (!this.isCurrent(room) || room.socketMap.get(playerId) !== socketId) return;
    room.handleDisconnect(playerId);
  }

  private syncPresence(room: Room) {
    if (!this.isCurrent(room)) return;
    const hasOnlineHuman = room.players.some((player) => !player.isBot && room.socketMap.has(player.id));
    if (hasOnlineHuman) {
      const timer = this.expiryTimers.get(room);
      if (timer) clearTimeout(timer);
      this.expiryTimers.delete(room);
    } else if (!this.expiryTimers.has(room)) {
      this.expiryTimers.set(room, setTimeout(() => {
        this.expiryTimers.delete(room);
        if (!this.isCurrent(room)) return;
        this.rooms.delete(room.id);
        room.dispose();
      }, 30000));
    }
  }

  dispose() {
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
  }
}
