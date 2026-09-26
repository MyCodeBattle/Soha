import {
  Card,
  GameState,
  Player,
  PlayerAction,
  ShowdownHandRank,
  VisibleHandRank,
  evaluateShowdownHand,
  evaluateVisibleHand,
} from '@soha/core';

export function decideBotAction(state: GameState, botPlayerId: string): PlayerAction {
  const bot = state.players.find((p) => p.id === botPlayerId);
  if (!bot) return { type: 'FOLD' };

  const callAmount = state.currentStreetMaxBet - bot.currentStreetBet;
  const canCheck = callAmount === 0;

  // Evaluate visible hand
  const hasHole = !!bot.holeCard;
  const currentCards: Card[] = hasHole ? [bot.holeCard!, ...bot.upcards] : [...bot.upcards];

  // If we can check, check most of the time unless we have a monster hand
  if (canCheck) {
    // 25% chance to bet if we have pairs or better
    if (currentCards.length >= 2) {
      const vis = evaluateVisibleHand(bot.upcards);
      if (vis.rankType >= VisibleHandRank.ONE_PAIR && Math.random() < 0.4) {
        const betAmount = Math.max(state.lastRaiseDiff, state.ante * 2);
        return { type: 'BET', amount: betAmount };
      }
    }
    return { type: 'CHECK' };
  }

  // If facing a bet/raise
  // Small bet relative to pot: often call
  const potOdds = callAmount / (state.pot + callAmount);

  // If call amount is very small (<= 2 * ante), almost always call
  if (callAmount <= state.ante * 2) {
    return { type: 'CALL' };
  }

  // If we have 5 cards, check showdown evaluation
  if (currentCards.length === 5) {
    const evalResult = evaluateShowdownHand(currentCards);
    if (evalResult.rankType >= ShowdownHandRank.TWO_PAIR) { // Two pair or better
      return { type: 'CALL' };
    }
    if (evalResult.rankType === ShowdownHandRank.ONE_PAIR && potOdds < 0.35) { // One pair
      return { type: 'CALL' };
    }
    return Math.random() < 0.2 ? { type: 'CALL' } : { type: 'FOLD' };
  }

  // In early/mid rounds, call if we have pairs or high cards with decent probability
  if (currentCards.length >= 2) {
    const hasPair = new Set(currentCards.map((c) => c.rank)).size < currentCards.length;
    if (hasPair) {
      return { type: 'CALL' };
    }
  }

  // Otherwise 30% bluff/float call, 70% fold
  if (Math.random() < 0.3) {
    return { type: 'CALL' };
  }

  return { type: 'FOLD' };
}
