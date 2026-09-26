import { describe, it, expect } from 'vitest';
import { Player } from '../src/types.js';
import { startHand, applyAction } from '../src/engine.js';

describe('Show Hand Engine - Edge Cases: All-in, Cap & Raises', () => {
  const players: Player[] = [
    {
      id: 'p1',
      name: 'P1',
      chips: 200, // Smallest stack -> Cap is 200
      isReady: true,
      isFolded: false,
      isAllIn: false,
      upcards: [],
      currentStreetBet: 0,
      totalHandBet: 0,
    },
    {
      id: 'p2',
      name: 'P2',
      chips: 500,
      isReady: true,
      isFolded: false,
      isAllIn: false,
      upcards: [],
      currentStreetBet: 0,
      totalHandBet: 0,
    },
  ];

  it('Caps maximum bet to effectiveCap (200), preventing higher bets', () => {
    let state = startHand(players, 10);
    // Ante is 10, totalHandBet is 10, remaining to cap is 190
    expect(state.effectiveCap).toBe(200);

    const activePid = state.players[state.activePlayerIndex].id;
    // Player goes ALL_IN
    state = applyAction(state, activePid, { type: 'ALL_IN' });
    const p = state.players.find((x) => x.id === activePid)!;
    expect(p.isAllIn).toBe(true);
    expect(p.totalHandBet).toBe(200);
    expect(p.currentStreetBet).toBe(190);

    // Other player calls
    const otherPid = state.players[state.activePlayerIndex].id;
    state = applyAction(state, otherPid, { type: 'CALL' });

    // Since both players are now all-in (or one is all in and called up to cap),
    // remaining upcards are fast-forwarded and game ends in showdown
    expect(state.street).toBe('HAND_ENDED');
    expect(state.players[0].upcards.length).toBe(4);
    expect(state.players[1].upcards.length).toBe(4);
    expect(state.winners).toBeDefined();
    expect(state.winners!.length).toBeGreaterThanOrEqual(1);
    expect(state.pot).toBe(400); // 200 from each player
  });

  it('Raise re-opens the action for players who already checked', () => {
    let state = startHand(players, 10);
    const pA = state.players[state.activePlayerIndex].id;
    // Player A checks
    state = applyAction(state, pA, { type: 'CHECK' });

    const pB = state.players[state.activePlayerIndex].id;
    // Player B bets 30
    state = applyAction(state, pB, { type: 'BET', amount: 30 });

    // Action returns to Player A!
    expect(state.players[state.activePlayerIndex].id).toBe(pA);

    // Player A can now Call or Fold
    state = applyAction(state, pA, { type: 'CALL' });
    // Round 1 ends, goes to Round 2
    expect(state.street).toBe('ROUND_2');
  });
});
