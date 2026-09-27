import { afterEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../src/room.js';

function createRoom(playerCount = 2) {
  const room = new Room('TEST01', 'p1', () => {});
  for (let index = 1; index <= playerCount; index += 1) {
    room.addPlayer(`p${index}`, `Player ${index}`);
  }
  return room;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('room presentation through player views', () => {
  it('deals the opening cards before starting the action clock', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();

    let view = room.getPlayerView('p1');
    expect(view.status).toBe('DEALING');
    expect(view.actionDeadline).toBeUndefined();
    expect(view.actionOptions).toBeUndefined();
    expect(view.players.every((player) => player.upcards.length === 0)).toBe(true);
    expect(view.initiativePlayerId).toBeUndefined();
    room.resetChips('p1');
    expect(room.getPlayerView('p1').players[0].chips).toBe(990);

    vi.advanceTimersByTime(3000);
    view = room.getPlayerView('p1');
    expect(view.status).toBe('PLAYING');
    expect(view.actionDeadline).toBeGreaterThan(Date.now());
    expect(view.players.every((player) => player.upcards.length === 1)).toBe(true);
  });

  it('reveals a two-card all-in one upcard at a time and pays only after showdown', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    vi.advanceTimersByTime(3000);

    const first = room.getPlayerView('p1').activePlayerId!;
    room.executeAction(first, { type: 'ALL_IN' });
    const caller = room.getPlayerView('p1').activePlayerId!;
    room.executeAction(caller, { type: 'CALL' });

    let view = room.getPlayerView('p1');
    expect(view.status).toBe('REVEALING');
    expect(view.actionOptions).toBeUndefined();
    expect(view.actionDeadline).toBeUndefined();
    expect(view.winners).toBeUndefined();
    expect(view.players.map((player) => player.upcards.length)).toEqual([1, 1]);
    expect(view.players[1].holeCard).toEqual({ isHidden: true });
    expect(view.players.map((player) => player.chips)).toEqual([0, 0]);
    expect(view.pot).toBe(2000);

    vi.advanceTimersByTime(219);
    expect(room.getPlayerView('p1').players.map((player) => player.upcards.length)).toEqual([1, 1]);
    vi.advanceTimersByTime(1);
    view = room.getPlayerView('p1');
    expect(view.players.map((player) => player.upcards.length)).toEqual([2, 1]);

    vi.advanceTimersByTime(499);
    view = room.getPlayerView('p1');
    expect(view.players.map((player) => player.upcards.length)).toEqual([2, 1]);
    vi.advanceTimersByTime(1);
    expect(room.getPlayerView('p1').players.map((player) => player.upcards.length)).toEqual([2, 2]);

    for (let step = 0; step < 30 && room.getPlayerView('p1').presentation?.phase !== 'COMPARE'; step += 1) {
      vi.advanceTimersToNextTimer();
    }
    view = room.getPlayerView('p1');
    expect(view.presentation?.phase).toBe('COMPARE');
    expect(view.players.map((player) => player.upcards.length)).toEqual([4, 4]);
    expect('isHidden' in view.players[1].holeCard!).toBe(false);
    expect(view.winners).toBeUndefined();

    vi.advanceTimersByTime(5500);
    view = room.getPlayerView('p1');
    expect(view.status).toBe('SUMMARY');
    expect(view.players.map((player) => player.upcards.length)).toEqual([4, 4]);
    expect('isHidden' in view.players[1].holeCard!).toBe(false);
    expect(view.winners?.length).toBeGreaterThan(0);
    expect(view.pot).toBe(0);
    expect(view.players.reduce((sum, player) => sum + player.chips, 0)).toBe(2000);
  });

  it('lets every player compare revealed hands for five seconds before the award', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    vi.advanceTimersByTime(3000);
    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'ALL_IN' });
    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'CALL' });

    for (let step = 0; step < 30 && room.getPlayerView('p1').presentation?.phase !== 'FLIP_HOLE'; step += 1) {
      vi.advanceTimersToNextTimer();
    }
    let view = room.getPlayerView('p1');
    expect(view.presentation?.phase).toBe('FLIP_HOLE');
    expect(view.players[1].holeCard).toEqual({ isHidden: true });

    vi.advanceTimersByTime(799);
    expect(room.getPlayerView('p1').presentation?.playerId).toBe(view.presentation?.playerId);
    vi.advanceTimersByTime(1);
    view = room.getPlayerView('p1');
    expect(view.presentation?.phase).toBe('FLIP_HOLE');
    expect(view.players[1].holeCard).not.toEqual({ isHidden: true });

    vi.advanceTimersByTime(800);
    view = room.getPlayerView('p1');
    expect(view.presentation?.phase).toBe('COMPARE');
    expect(view.players.every((player) => player.upcards.length === 4)).toBe(true);
    expect(view.winners).toBeUndefined();
    expect(view.pot).toBe(2000);
    const reconnectingView = room.getPlayerView('p2');
    expect(reconnectingView.presentation?.phase).toBe('COMPARE');
    expect(reconnectingView.presentation?.sequence).toBe(view.presentation?.sequence);
    expect(reconnectingView.players[0].holeCard).not.toEqual({ isHidden: true });
    expect(reconnectingView.winners).toBeUndefined();

    vi.advanceTimersByTime(4999);
    expect(room.getPlayerView('p1').presentation?.phase).toBe('COMPARE');
    expect(room.getPlayerView('p2').winners).toBeUndefined();
    vi.advanceTimersByTime(1);
    view = room.getPlayerView('p1');
    expect(view.presentation?.phase).toBe('AWARD');
    expect(view.winners?.length).toBeGreaterThan(0);
    expect(view.pot).toBe(0);
  });

  it('never exposes a winner’s hole card when everyone else folds', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    vi.advanceTimersByTime(3000);
    const folder = room.getPlayerView('p1').activePlayerId!;
    room.executeAction(folder, { type: 'FOLD' });
    vi.advanceTimersByTime(2000);

    const view = room.getPlayerView(folder);
    expect(view.status).toBe('SUMMARY');
    const winnerId = view.winners![0].playerId;
    expect(view.players.find((player) => player.id === winnerId)?.holeCard).toEqual({ isHidden: true });
  });

  it('pauses the action clock while dealing the next street', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    vi.advanceTimersByTime(3000);

    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'CHECK' });
    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'CHECK' });
    const duringDeal = room.getPlayerView('p1');
    expect(duringDeal.status).toBe('DEALING');
    expect(duringDeal.actionDeadline).toBeUndefined();
    expect(duringDeal.players.map((player) => player.upcards.length)).toEqual([1, 1]);
    expect(duringDeal.initiativePlayerId).toBeUndefined();

    vi.advanceTimersByTime(1500);
    const afterDeal = room.getPlayerView('p1');
    expect(afterDeal.status).toBe('PLAYING');
    expect(afterDeal.street).toBe('ROUND_2');
    expect(afterDeal.players.map((player) => player.upcards.length)).toEqual([2, 2]);
    expect(afterDeal.actionDeadline).toBeGreaterThan(Date.now());
  });

  it('keeps betting open when only one of three players is all-in', () => {
    vi.useFakeTimers();
    const room = createRoom(3);
    room.startHand();
    vi.advanceTimersByTime(3000);
    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'ALL_IN' });

    const view = room.getPlayerView('p1');
    expect(view.status).toBe('PLAYING');
    expect(view.activePlayerId).toBeDefined();
    expect(view.players.map((player) => player.upcards.length)).toEqual([1, 1, 1]);
  });

  it('shows reconnecting players the shared current step without allowing early ready', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    const handId = room.getPlayerView('p1').handId;
    room.toggleReady('p1', true);
    room.startHand();
    expect(room.getPlayerView('p1').handId).toBe(handId);

    vi.advanceTimersByTime(350);
    const first = room.getPlayerView('p1');
    const second = room.getPlayerView('p2');
    expect(first.status).toBe('DEALING');
    expect(first.presentation?.sequence).toBe(second.presentation?.sequence);
    expect(first.players.map((player) => player.upcards.length)).toEqual(second.players.map((player) => player.upcards.length));
    expect(first.players[1].holeCard).toEqual({ isHidden: true });
    expect(second.players[0].holeCard).toEqual({ isHidden: true });
  });

  it('keeps a disconnected showdown participant visible until the next hand', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    vi.advanceTimersByTime(3000);
    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'ALL_IN' });
    room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'CALL' });
    room.removePlayer('p2');

    expect(room.getPlayerView('p1').players).toHaveLength(2);
    vi.advanceTimersByTime(15000);
    const summary = room.getPlayerView('p1');
    expect(summary.status).toBe('SUMMARY');
    expect(summary.players).toHaveLength(2);
    expect(summary.winners?.every((winner) => summary.players.some((player) => player.id === winner.playerId))).toBe(true);

    room.toggleReady('p1', true);
    expect(room.getPlayerView('p1').players).toHaveLength(2);
    room.addPlayer('p3', 'Player 3');
    room.toggleReady('p3', true);
    const nextHand = room.getPlayerView('p1');
    expect(nextHand.status).toBe('DEALING');
    expect(nextHand.players.map((player) => player.id)).toEqual(['p1', 'p3']);
  });

  it('keeps a departing active player seated through the fold award', () => {
    vi.useFakeTimers();
    const room = createRoom();
    room.startHand();
    vi.advanceTimersByTime(3000);
    const folder = room.getPlayerView('p1').activePlayerId!;
    room.removePlayer(folder);

    expect(room.getPlayerView('p1').players).toHaveLength(2);
    vi.advanceTimersByTime(2000);
    const summary = room.getPlayerView('p1');
    expect(summary.status).toBe('SUMMARY');
    expect(summary.players).toHaveLength(2);
    expect(summary.winners).toHaveLength(1);
  });

  it('frees a departed seat for a replacement after a full-table summary', () => {
    vi.useFakeTimers();
    const room = createRoom(6);
    room.startHand();
    vi.advanceTimersByTime(3000);
    for (let index = 0; index < 5; index += 1) {
      room.executeAction(room.getPlayerView('p1').activePlayerId!, { type: 'FOLD' });
    }
    vi.advanceTimersByTime(2000);
    const winnerId = room.getPlayerView('p1').winners![0].playerId;
    room.removePlayer(winnerId);
    expect(room.getPlayerView('p1').players).toHaveLength(6);

    expect(() => room.addPlayer('p7', 'Replacement')).not.toThrow();
    const view = room.getPlayerView('p7');
    expect(view.players).toHaveLength(6);
    expect(view.winnerNames?.[winnerId]).toBe(`Player ${winnerId.slice(1)}`);
  });
});
