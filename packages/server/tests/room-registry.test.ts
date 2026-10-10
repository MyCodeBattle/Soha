import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoomRegistry } from '../src/room-registry.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('room creation and invitations', () => {
  it('allocates all 90 two-digit codes without replacing rooms and reports exhaustion', () => {
    const registry = new RoomRegistry(() => {});
    const rooms = Array.from({ length: 90 }, (_, index) => registry.create({
      playerId: `p${index}`, playerName: `Player ${index}`, socketId: `s${index}`,
    }));
    expect(new Set(rooms.map((room) => room.id)).size).toBe(90);
    expect(rooms.every((room) => /^[1-9]\d$/.test(room.id))).toBe(true);
    expect(() => registry.create({ playerId: 'extra', playerName: 'Extra', socketId: 'extra' }))
      .toThrow('房间数量已达上限，请稍后再试');
    for (const room of rooms) {
      expect(registry.join({ roomId: room.id, playerId: 'guest', playerName: 'Guest', socketId: 'guest' }))
        .toBe(room);
    }
    registry.dispose();
  });

  it('accepts a matching invitation and rejects invalid codes or invitation tokens', () => {
    const registry = new RoomRegistry(() => {});
    const room = registry.create({ playerId: 'host', playerName: 'Host', socketId: 'host' });
    const guest = { roomId: room.id, playerId: 'guest', playerName: 'Guest', socketId: 'guest' };
    const token = room.getPlayerView('host').inviteToken;
    expect(token).toBeTruthy();
    expect(registry.join({ ...guest, inviteToken: token })).toBe(room);
    expect(() => registry.join({ ...guest, inviteToken: 'expired-token' })).toThrow('邀请链接已失效');
    expect(() => registry.join({ ...guest, inviteToken: '' })).toThrow('邀请链接已失效');
    expect(() => registry.join({ ...guest, roomId: 'TEST01' })).toThrow('请输入 10–99 的两位数字房间码');
    expect(() => registry.join({ ...guest, roomId: '09' })).toThrow('请输入 10–99 的两位数字房间码');
    registry.dispose();
  });

  it('retains a disconnected room for 30 seconds, then frees its code and expires its invitation', () => {
    vi.useFakeTimers();
    const registry = new RoomRegistry(() => {});
    const rooms = Array.from({ length: 90 }, (_, index) => registry.create({
      playerId: `p${index}`, playerName: `Player ${index}`, socketId: `s${index}`,
    }));
    const oldRoom = rooms[0];
    const oldToken = oldRoom.getPlayerView('p0').inviteToken;
    registry.disconnect(oldRoom, 'p0', 's0');
    vi.advanceTimersByTime(29999);
    expect(registry.isCurrent(oldRoom)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(registry.isCurrent(oldRoom)).toBe(false);
    const newRoom = registry.create({ playerId: 'new', playerName: 'New', socketId: 'new' });
    expect(newRoom.id).toBe(oldRoom.id);
    const guest = { roomId: newRoom.id, playerId: 'guest', playerName: 'Guest', socketId: 'guest' };
    expect(() => registry.join({ ...guest, inviteToken: oldToken })).toThrow('邀请链接已失效');
    expect(registry.join({ ...guest, inviteToken: newRoom.getPlayerView('new').inviteToken })).toBe(newRoom);
    registry.disconnect(oldRoom, 'new', 'new');
    vi.advanceTimersByTime(60000);
    expect(registry.isCurrent(newRoom)).toBe(true);
    registry.dispose();
  });

  it('cancels expiry on reconnection and ignores disconnects from a superseded socket', () => {
    vi.useFakeTimers();
    const registry = new RoomRegistry(() => {});
    const room = registry.create({ playerId: 'host', playerName: 'Host', socketId: 'old' });
    registry.disconnect(room, 'host', 'old');
    vi.advanceTimersByTime(29000);
    registry.join({ roomId: room.id, playerId: 'host', playerName: 'Host', socketId: 'new' });
    registry.disconnect(room, 'host', 'old');
    vi.advanceTimersByTime(31000);
    expect(registry.isCurrent(room)).toBe(true);
    expect(room.getPlayerView('host').players[0].isOnline).toBe(true);
    registry.disconnect(room, 'host', 'new');
    vi.advanceTimersByTime(30000);
    expect(registry.isCurrent(room)).toBe(false);
    registry.dispose();
  });

  it.each([false, true])('reclaims bot-only rooms and stops their timers (playing: %s)', (playing) => {
    vi.useFakeTimers();
    const registry = new RoomRegistry(() => {});
    const room = registry.create({ playerId: 'host', playerName: 'Host', socketId: 'host' });
    room.addBot();
    if (playing) room.startHand();
    registry.disconnect(room, 'host', 'host');
    vi.advanceTimersByTime(29999);
    expect(registry.isCurrent(room)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(registry.isCurrent(room)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    registry.dispose();
  });

  it('does not register a failed join as an online player or prevent room expiry', () => {
    vi.useFakeTimers();
    const registry = new RoomRegistry(() => {});
    const room = registry.create({ playerId: 'host', playerName: 'Host', socketId: 'host' });
    for (let index = 0; index < 5; index++) room.addBot();
    expect(() => registry.join({ roomId: room.id, playerId: 'extra', playerName: 'Extra', socketId: 'extra' }))
      .toThrow('房间已满（最多 6 人）');
    expect(room.getPlayerView('host').players).toHaveLength(6);
    registry.disconnect(room, 'host', 'host');
    vi.advanceTimersByTime(30000);
    expect(registry.isCurrent(room)).toBe(false);
    registry.dispose();
  });
});
