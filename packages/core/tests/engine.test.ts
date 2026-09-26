import { describe, it, expect } from 'vitest';
import { Card, Player, Rank, Suit } from '../src/types.js';
import { createDeck, shuffleDeck, startHand, applyAction } from '../src/engine.js';

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` };
}

describe('Show Hand Engine - Deck & Dealing', () => {
  it('creates a standard 52-card deck without jokers', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    const uniqueIds = new Set(deck.map((c) => c.id));
    expect(uniqueIds.size).toBe(52);
  });
});

describe('Show Hand Engine - Hand Lifecycle & Cap Rule', () => {
  const playersInit: Player[] = [
    {
      id: 'p1',
      name: 'Alice',
      chips: 1000,
      isReady: true,
      isFolded: false,
      isAllIn: false,
      upcards: [],
      currentStreetBet: 0,
      totalHandBet: 0,
    },
    {
      id: 'p2',
      name: 'Bob',
      chips: 500, // Smallest stack -> Cap is 500
      isReady: true,
      isFolded: false,
      isAllIn: false,
      upcards: [],
      currentStreetBet: 0,
      totalHandBet: 0,
    },
    {
      id: 'p3',
      name: 'Charlie',
      chips: 800,
      isReady: true,
      isFolded: false,
      isAllIn: false,
      upcards: [],
      currentStreetBet: 0,
      totalHandBet: 0,
    },
  ];

  it('deducts ante and enforces effectiveCap = 500 (Rule 16: minimum stack cap)', () => {
    const ante = 10;
    const state = startHand(playersInit, ante);

    expect(state.effectiveCap).toBe(500);
    expect(state.pot).toBe(30);
    expect(state.players[0].chips).toBe(990);
    expect(state.players[1].chips).toBe(490);
    expect(state.players[2].chips).toBe(790);

    // Each player has 1 hole card and 1 upcard
    for (const p of state.players) {
      expect(p.holeCard).toBeDefined();
      expect(p.upcards.length).toBe(1);
    }

    // Street is ROUND_1
    expect(state.street).toBe('ROUND_1');
    expect(state.activePlayerIndex).toBeGreaterThanOrEqual(0);
    expect(state.activePlayerIndex).toBe(state.initiativePlayerIndex);
  });

  it('Rule 15: If all other players fold, the last remaining player wins immediately without showing hole card', () => {
    let state = startHand(playersInit, 10);

    const firstPlayerId = state.players[state.activePlayerIndex].id;
    // First player bets 20
    state = applyAction(state, firstPlayerId, { type: 'BET', amount: 20 });

    const secondPlayerId = state.players[state.activePlayerIndex].id;
    // Second player folds
    state = applyAction(state, secondPlayerId, { type: 'FOLD' });

    const thirdPlayerId = state.players[state.activePlayerIndex].id;
    // Third player folds
    state = applyAction(state, thirdPlayerId, { type: 'FOLD' });

    expect(state.street).toBe('HAND_ENDED');
    expect(state.winners?.length).toBe(1);
    expect(state.winners?.[0].playerId).toBe(firstPlayerId);
    expect(state.winners?.[0].amount).toBe(state.pot);
  });

  it('Runs a full 4-street game with checks into showdown', () => {
    let state = startHand(playersInit, 10);

    // Round 1: Everyone checks
    for (let i = 0; i < 3; i++) {
      const pid = state.players[state.activePlayerIndex].id;
      state = applyAction(state, pid, { type: 'CHECK' });
    }
    expect(state.street).toBe('ROUND_2');
    for (const p of state.players) expect(p.upcards.length).toBe(2);

    // Round 2: Everyone checks
    for (let i = 0; i < 3; i++) {
      const pid = state.players[state.activePlayerIndex].id;
      state = applyAction(state, pid, { type: 'CHECK' });
    }
    expect(state.street).toBe('ROUND_3');
    for (const p of state.players) expect(p.upcards.length).toBe(3);

    // Round 3: Everyone checks
    for (let i = 0; i < 3; i++) {
      const pid = state.players[state.activePlayerIndex].id;
      state = applyAction(state, pid, { type: 'CHECK' });
    }
    expect(state.street).toBe('ROUND_4');
    for (const p of state.players) expect(p.upcards.length).toBe(4);

    // Round 4: Everyone checks -> Enters SHOWDOWN
    for (let i = 0; i < 3; i++) {
      const pid = state.players[state.activePlayerIndex].id;
      state = applyAction(state, pid, { type: 'CHECK' });
    }

    expect(state.street).toBe('HAND_ENDED');
    expect(state.winners).toBeDefined();
    expect(state.winners!.length).toBeGreaterThanOrEqual(1);
    const totalWon = state.winners!.reduce((acc, w) => acc + w.amount, 0);
    expect(totalWon).toBe(state.pot);
  });
});
