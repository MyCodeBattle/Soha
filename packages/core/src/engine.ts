import {
  ActionType,
  Card,
  GameState,
  GameStreet,
  Player,
  PlayerAction,
  PotWinner,
  Rank,
  ShowdownHandEvaluation,
  Suit,
} from './types.js';
import { compareShowdownHands, compareVisibleHands, evaluateShowdownHand } from './evaluator.js';

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], rng = Math.random): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function findInitiativePlayerIndex(players: Player[]): number {
  let bestIndex = -1;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.isFolded || p.upcards.length === 0) continue;
    if (bestIndex === -1) {
      bestIndex = i;
    } else {
      if (compareVisibleHands(p.upcards, players[bestIndex].upcards) > 0) {
        bestIndex = i;
      }
    }
  }
  return bestIndex;
}

export function startHand(
  players: Player[],
  ante: number,
  deckInput?: Card[]
): GameState {
  if (players.length < 2) {
    throw new Error('At least 2 players required to start a hand');
  }

  const effectiveCap = Math.min(...players.map((p) => p.chips));
  if (effectiveCap < ante) {
    throw new Error(`Minimum chip count (${effectiveCap}) is less than ante (${ante})`);
  }

  const deck = deckInput ? [...deckInput] : shuffleDeck(createDeck());

  const activePlayers: Player[] = players.map((p) => ({
    ...p,
    isFolded: false,
    isAllIn: p.chips <= ante || ante >= effectiveCap,
    upcards: [],
    currentStreetBet: 0,
    totalHandBet: ante,
    chips: p.chips - ante,
  }));

  const pot = ante * activePlayers.length;

  // Deal 1 hole card + 1 upcard to each player
  for (const p of activePlayers) {
    p.holeCard = deck.pop()!;
    p.upcards.push(deck.pop()!);
  }

  const initiativePlayerIndex = findInitiativePlayerIndex(activePlayers);

  // If after ante all or all-but-one players are already all-in:
  const canActPlayers = activePlayers.filter((p) => !p.isFolded && !p.isAllIn);
  let street: GameStreet = 'ROUND_1';

  let state: GameState = {
    id: `hand-${Date.now()}`,
    street,
    deck,
    players: activePlayers,
    pot,
    ante,
    effectiveCap,
    currentStreetMaxBet: 0,
    lastRaiseDiff: ante,
    activePlayerIndex: initiativePlayerIndex,
    initiativePlayerIndex,
    lastAggressorIndex: -1,
    actedInCurrentStreet: [],
  };

  // If nobody can act, fast forward to showdown
  if (canActPlayers.length <= 1) {
    state = fastForwardRemainingCards(state);
    state = resolveShowdown(state);
  }

  return state;
}

function getNextActiveIndex(state: GameState, startIndex: number): number {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (startIndex + step) % n;
    const p = state.players[idx];
    if (!p.isFolded && !p.isAllIn) {
      return idx;
    }
  }
  return -1;
}

function isBettingRoundComplete(state: GameState): boolean {
  const eligiblePlayers = state.players.filter((p) => !p.isFolded && !p.isAllIn);
  if (eligiblePlayers.length === 0) return true;

  // Everyone eligible must have acted in this street
  for (const p of eligiblePlayers) {
    if (!state.actedInCurrentStreet.includes(p.id)) {
      return false;
    }
    if (p.currentStreetBet !== state.currentStreetMaxBet) {
      return false;
    }
  }
  return true;
}

function fastForwardRemainingCards(state: GameState): GameState {
  const next = { ...state, deck: [...state.deck], players: state.players.map((p) => ({ ...p, upcards: [...p.upcards] })) };
  // Each remaining player gets up to 4 upcards (1 hole + 4 up = 5 cards total)
  for (let round = 0; round < 3; round++) {
    for (const p of next.players) {
      if (!p.isFolded && p.upcards.length < 4) {
        p.upcards.push(next.deck.pop()!);
      }
    }
  }
  return next;
}

function resolveShowdown(state: GameState): GameState {
  const remainingPlayers = state.players.filter((p) => !p.isFolded);

  if (remainingPlayers.length === 0) {
    return { ...state, street: 'HAND_ENDED', winners: [] };
  }

  if (remainingPlayers.length === 1) {
    const winner = remainingPlayers[0];
    winner.chips += state.pot;
    return {
      ...state,
      street: 'HAND_ENDED',
      winners: [{ playerId: winner.id, amount: state.pot }],
    };
  }

  // Compare 5 cards for each player
  const evaluations = remainingPlayers.map((p) => {
    const fullHand = [p.holeCard!, ...p.upcards];
    const evaluation = evaluateShowdownHand(fullHand);
    return { player: p, evaluation };
  });

  // Sort descending
  evaluations.sort((a, b) => compareShowdownHands(a.player.upcards.concat(a.player.holeCard!), b.player.upcards.concat(b.player.holeCard!)));
  evaluations.reverse();

  // Find all tied for highest
  const bestEval = evaluations[0];
  const tiedWinners = evaluations.filter(
    (e) => compareShowdownHands([e.player.holeCard!, ...e.player.upcards], [bestEval.player.holeCard!, ...bestEval.player.upcards]) === 0
  );

  const numWinners = tiedWinners.length;
  const splitAmount = Math.floor(state.pot / numWinners);
  let remainder = state.pot % numWinners;

  const potWinners: PotWinner[] = [];

  for (const tw of tiedWinners) {
    let winAmount = splitAmount;
    if (remainder > 0) {
      winAmount += 1;
      remainder -= 1;
    }
    tw.player.chips += winAmount;
    potWinners.push({
      playerId: tw.player.id,
      amount: winAmount,
      evaluation: tw.evaluation,
    });
  }

  return {
    ...state,
    street: 'HAND_ENDED',
    winners: potWinners,
  };
}

function advanceStreet(state: GameState): GameState {
  // Reset currentStreetBet for all players
  const nextPlayers = state.players.map((p) => ({
    ...p,
    currentStreetBet: 0,
    upcards: [...p.upcards],
  }));

  const nextDeck = [...state.deck];

  let nextStreet: GameStreet = state.street;
  if (state.street === 'ROUND_1') nextStreet = 'ROUND_2';
  else if (state.street === 'ROUND_2') nextStreet = 'ROUND_3';
  else if (state.street === 'ROUND_3') nextStreet = 'ROUND_4';
  else if (state.street === 'ROUND_4') nextStreet = 'SHOWDOWN';

  if (nextStreet === 'SHOWDOWN') {
    return resolveShowdown({
      ...state,
      players: nextPlayers,
      deck: nextDeck,
      currentStreetMaxBet: 0,
      actedInCurrentStreet: [],
    });
  }

  // Deal 1 upcard to all non-folded players
  for (const p of nextPlayers) {
    if (!p.isFolded) {
      p.upcards.push(nextDeck.pop()!);
    }
  }

  // Check how many players can still bet
  const canActPlayers = nextPlayers.filter((p) => !p.isFolded && !p.isAllIn);
  let nextState: GameState = {
    ...state,
    street: nextStreet,
    deck: nextDeck,
    players: nextPlayers,
    currentStreetMaxBet: 0,
    lastRaiseDiff: state.ante,
    actedInCurrentStreet: [],
  };

  if (canActPlayers.length <= 1) {
    // Fast forward remaining upcards and showdown
    nextState = fastForwardRemainingCards(nextState);
    return resolveShowdown(nextState);
  }

  const initiativeIndex = findInitiativePlayerIndex(nextPlayers);
  // Find first active player starting from initiative
  let activeIndex = initiativeIndex;
  if (nextPlayers[activeIndex].isFolded || nextPlayers[activeIndex].isAllIn) {
    activeIndex = getNextActiveIndex(nextState, activeIndex);
  }

  return {
    ...nextState,
    initiativePlayerIndex: initiativeIndex,
    activePlayerIndex: activeIndex,
  };
}

export function applyAction(
  state: GameState,
  playerId: string,
  action: PlayerAction
): GameState {
  if (state.street === 'HAND_ENDED' || state.street === 'SHOWDOWN') {
    throw new Error('Hand has already ended');
  }

  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) {
    throw new Error(`Not player ${playerId}'s turn to act`);
  }

  let next = {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    actedInCurrentStreet: [...state.actedInCurrentStreet],
  };
  const player = next.players[next.activePlayerIndex];

  const maxPossibleAdd = Math.min(
    player.chips,
    next.effectiveCap - player.totalHandBet
  );

  switch (action.type) {
    case 'FOLD': {
      player.isFolded = true;
      const nonFolded = next.players.filter((p) => !p.isFolded);
      if (nonFolded.length === 1) {
        // Last player standing wins immediately! No showdown needed.
        const winner = nonFolded[0];
        winner.chips += next.pot;
        return {
          ...next,
          street: 'HAND_ENDED',
          winners: [{ playerId: winner.id, amount: next.pot }],
        };
      }
      break;
    }

    case 'CHECK': {
      if (next.currentStreetMaxBet !== player.currentStreetBet) {
        throw new Error('Cannot check when there is an active bet to call');
      }
      if (!next.actedInCurrentStreet.includes(playerId)) {
        next.actedInCurrentStreet.push(playerId);
      }
      break;
    }

    case 'BET': {
      if (next.currentStreetMaxBet !== 0) {
        throw new Error('Cannot bet; a bet already exists. Use RAISE instead.');
      }
      const betAmount = action.amount ?? next.lastRaiseDiff;
      if (betAmount <= 0) {
        throw new Error('Bet amount must be positive');
      }
      const actualBet = Math.min(betAmount, maxPossibleAdd);
      player.chips -= actualBet;
      player.currentStreetBet += actualBet;
      player.totalHandBet += actualBet;
      next.pot += actualBet;
      next.currentStreetMaxBet = actualBet;
      next.lastRaiseDiff = actualBet;
      next.lastAggressorIndex = next.activePlayerIndex;
      if (player.chips === 0 || player.totalHandBet >= next.effectiveCap) {
        player.isAllIn = true;
      }
      next.actedInCurrentStreet = [playerId];
      break;
    }

    case 'CALL': {
      const callDiff = next.currentStreetMaxBet - player.currentStreetBet;
      if (callDiff <= 0) {
        throw new Error('No bet to call; use CHECK instead');
      }
      const actualCall = Math.min(callDiff, maxPossibleAdd);
      player.chips -= actualCall;
      player.currentStreetBet += actualCall;
      player.totalHandBet += actualCall;
      next.pot += actualCall;
      if (player.chips === 0 || player.totalHandBet >= next.effectiveCap) {
        player.isAllIn = true;
      }
      if (!next.actedInCurrentStreet.includes(playerId)) {
        next.actedInCurrentStreet.push(playerId);
      }
      break;
    }

    case 'RAISE': {
      if (next.currentStreetMaxBet === 0) {
        throw new Error('Cannot raise when there is no bet; use BET instead');
      }
      const raiseTo = action.amount ?? (next.currentStreetMaxBet + next.lastRaiseDiff);
      const neededAdd = raiseTo - player.currentStreetBet;
      if (neededAdd <= 0) {
        throw new Error('Raise amount must exceed current bet');
      }
      const actualAdd = Math.min(neededAdd, maxPossibleAdd);
      const newStreetBet = player.currentStreetBet + actualAdd;
      const raiseStep = newStreetBet - next.currentStreetMaxBet;

      player.chips -= actualAdd;
      player.currentStreetBet = newStreetBet;
      player.totalHandBet += actualAdd;
      next.pot += actualAdd;
      if (raiseStep > 0) {
        next.lastRaiseDiff = raiseStep;
        next.currentStreetMaxBet = newStreetBet;
        next.lastAggressorIndex = next.activePlayerIndex;
        next.actedInCurrentStreet = [playerId];
      } else {
        if (!next.actedInCurrentStreet.includes(playerId)) {
          next.actedInCurrentStreet.push(playerId);
        }
      }
      if (player.chips === 0 || player.totalHandBet >= next.effectiveCap) {
        player.isAllIn = true;
      }
      break;
    }

    case 'ALL_IN': {
      const allInAmount = maxPossibleAdd;
      const targetStreetBet = player.currentStreetBet + allInAmount;
      player.chips -= allInAmount;
      player.currentStreetBet = targetStreetBet;
      player.totalHandBet += allInAmount;
      next.pot += allInAmount;
      player.isAllIn = true;

      if (targetStreetBet > next.currentStreetMaxBet) {
        const diff = targetStreetBet - next.currentStreetMaxBet;
        next.lastRaiseDiff = Math.max(next.lastRaiseDiff, diff);
        next.currentStreetMaxBet = targetStreetBet;
        next.lastAggressorIndex = next.activePlayerIndex;
        next.actedInCurrentStreet = [playerId];
      } else {
        if (!next.actedInCurrentStreet.includes(playerId)) {
          next.actedInCurrentStreet.push(playerId);
        }
      }
      break;
    }
  }

  // Check if betting round is complete
  if (isBettingRoundComplete(next)) {
    return advanceStreet(next);
  }

  // Advance to next active player
  next.activePlayerIndex = getNextActiveIndex(next, next.activePlayerIndex);
  return next;
}
