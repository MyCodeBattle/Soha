import {
  Card,
  Rank,
  SUIT_ORDER,
  ShowdownHandEvaluation,
  ShowdownHandRank,
  VisibleHandEvaluation,
  VisibleHandRank,
} from './types.js';

/**
 * Group cards by rank and sort groups by count descending, then by rank descending.
 */
function groupCardsByRank(cards: Card[]): { rank: Rank; cards: Card[] }[] {
  const map = new Map<Rank, Card[]>();
  for (const c of cards) {
    const list = map.get(c.rank) || [];
    list.push(c);
    map.set(c.rank, list);
  }
  return Array.from(map.entries())
    .map(([rank, groupedCards]) => ({ rank, cards: groupedCards }))
    .sort((a, b) => {
      if (b.cards.length !== a.cards.length) {
        return b.cards.length - a.cards.length;
      }
      return b.rank - a.rank;
    });
}

/**
 * Evaluates visible hand (1 to 4 cards) for deciding initiative order.
 * Rule 6: 4 cards CANNOT count as straight or flush!
 * Rule 7: Flower/Suit order ♠ > ♥ > ♦ > ♣ used as tiebreaker for initiative order ONLY.
 */
export function evaluateVisibleHand(cards: Card[]): VisibleHandEvaluation {
  if (cards.length === 0 || cards.length > 4) {
    throw new Error(`Visible hand must have 1 to 4 cards, got ${cards.length}`);
  }

  const groups = groupCardsByRank(cards);

  let rankType: VisibleHandRank = VisibleHandRank.HIGH_CARD;
  let rankName = '高牌';
  const tieBreakerRanks: number[] = [];
  let suitTieBreaker = 0;

  if (groups[0].cards.length === 4) {
    rankType = VisibleHandRank.FOUR_OF_A_KIND;
    rankName = '四条';
    tieBreakerRanks.push(groups[0].rank);
    // Highest suit of the four cards
    suitTieBreaker = Math.max(...groups[0].cards.map((c) => SUIT_ORDER[c.suit]));
  } else if (groups[0].cards.length === 3) {
    rankType = VisibleHandRank.THREE_OF_A_KIND;
    rankName = '三条';
    tieBreakerRanks.push(groups[0].rank);
    for (let i = 1; i < groups.length; i++) {
      tieBreakerRanks.push(groups[i].rank);
    }
    suitTieBreaker = Math.max(...groups[0].cards.map((c) => SUIT_ORDER[c.suit]));
  } else if (groups[0].cards.length === 2 && groups.length > 1 && groups[1].cards.length === 2) {
    rankType = VisibleHandRank.TWO_PAIR;
    rankName = '两对';
    tieBreakerRanks.push(groups[0].rank, groups[1].rank);
    if (groups.length > 2) {
      tieBreakerRanks.push(groups[2].rank);
    }
    // Compare higher pair's highest suit
    suitTieBreaker = Math.max(...groups[0].cards.map((c) => SUIT_ORDER[c.suit]));
  } else if (groups[0].cards.length === 2) {
    rankType = VisibleHandRank.ONE_PAIR;
    rankName = '一对';
    tieBreakerRanks.push(groups[0].rank);
    for (let i = 1; i < groups.length; i++) {
      tieBreakerRanks.push(groups[i].rank);
    }
    suitTieBreaker = Math.max(...groups[0].cards.map((c) => SUIT_ORDER[c.suit]));
  } else {
    // All cards distinct: High card
    rankType = VisibleHandRank.HIGH_CARD;
    rankName = '高牌';
    for (const g of groups) {
      tieBreakerRanks.push(g.rank);
    }
    // Highest suit of the highest card
    suitTieBreaker = SUIT_ORDER[groups[0].cards[0].suit];
  }

  return {
    rankType,
    rankName,
    tieBreakerRanks,
    suitTieBreaker,
    cards,
  };
}

/**
 * Compare two visible hands for initiative.
 * Returns > 0 if A > B, < 0 if A < B, = 0 if equal.
 */
export function compareVisibleHands(cardsA: Card[], cardsB: Card[]): number {
  const evalA = evaluateVisibleHand(cardsA);
  const evalB = evaluateVisibleHand(cardsB);

  if (evalA.rankType !== evalB.rankType) {
    return evalA.rankType - evalB.rankType;
  }

  // Compare tiebreaker ranks in order
  const len = Math.min(evalA.tieBreakerRanks.length, evalB.tieBreakerRanks.length);
  for (let i = 0; i < len; i++) {
    if (evalA.tieBreakerRanks[i] !== evalB.tieBreakerRanks[i]) {
      return evalA.tieBreakerRanks[i] - evalB.tieBreakerRanks[i];
    }
  }

  // If ranks are equal, break tie using suit order (♠ > ♥ > ♦ > ♣)
  return evalA.suitTieBreaker - evalB.suitTieBreaker;
}

/**
 * Evaluates 5-card showdown hand.
 * Rule 18-27: Standard 5-card poker rankings.
 * Rule 28: Suits DO NOT decide winner at showdown!
 */
export function evaluateShowdownHand(cards: Card[]): ShowdownHandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`Showdown hand must have exactly 5 cards, got ${cards.length}`);
  }

  const groups = groupCardsByRank(cards);
  const sortedRanks = [...cards].map((c) => c.rank).sort((a, b) => b - a);

  // Check flush (all 5 cards same suit)
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  // Check straight
  let isStraight = false;
  let straightHighRank = 0;

  const isAllUniqueRanks = groups.length === 5;
  if (isAllUniqueRanks) {
    // Normal straight check: e.g. 14, 13, 12, 11, 10 or 6, 5, 4, 3, 2
    if (sortedRanks[0] - sortedRanks[4] === 4) {
      isStraight = true;
      straightHighRank = sortedRanks[0];
    } else if (
      sortedRanks[0] === 14 &&
      sortedRanks[1] === 5 &&
      sortedRanks[2] === 4 &&
      sortedRanks[3] === 3 &&
      sortedRanks[4] === 2
    ) {
      // Rule 23: A-2-3-4-5 is a 5-high straight (lowest straight, below 2-3-4-5-6)
      isStraight = true;
      straightHighRank = 5;
    }
  }

  // 1. Straight Flush
  if (isStraight && isFlush) {
    const isRoyal = straightHighRank === 14;
    return {
      rankType: ShowdownHandRank.STRAIGHT_FLUSH,
      rankName: isRoyal ? '皇家同花顺' : '同花顺',
      tieBreakerRanks: [straightHighRank],
      cards,
    };
  }

  // 2. Four of a Kind
  if (groups[0].cards.length === 4) {
    return {
      rankType: ShowdownHandRank.FOUR_OF_A_KIND,
      rankName: '四条',
      tieBreakerRanks: [groups[0].rank, groups[1].rank],
      cards,
    };
  }

  // 3. Full House
  if (groups[0].cards.length === 3 && groups[1].cards.length === 2) {
    return {
      rankType: ShowdownHandRank.FULL_HOUSE,
      rankName: '葫芦',
      tieBreakerRanks: [groups[0].rank, groups[1].rank],
      cards,
    };
  }

  // 4. Flush
  if (isFlush) {
    return {
      rankType: ShowdownHandRank.FLUSH,
      rankName: '同花',
      tieBreakerRanks: sortedRanks,
      cards,
    };
  }

  // 5. Straight
  if (isStraight) {
    return {
      rankType: ShowdownHandRank.STRAIGHT,
      rankName: '顺子',
      tieBreakerRanks: [straightHighRank],
      cards,
    };
  }

  // 6. Three of a Kind
  if (groups[0].cards.length === 3) {
    return {
      rankType: ShowdownHandRank.THREE_OF_A_KIND,
      rankName: '三条',
      tieBreakerRanks: [groups[0].rank, groups[1].rank, groups[2].rank],
      cards,
    };
  }

  // 7. Two Pair
  if (groups[0].cards.length === 2 && groups[1].cards.length === 2) {
    return {
      rankType: ShowdownHandRank.TWO_PAIR,
      rankName: '两对',
      tieBreakerRanks: [groups[0].rank, groups[1].rank, groups[2].rank],
      cards,
    };
  }

  // 8. One Pair
  if (groups[0].cards.length === 2) {
    return {
      rankType: ShowdownHandRank.ONE_PAIR,
      rankName: '一对',
      tieBreakerRanks: [
        groups[0].rank,
        groups[1].rank,
        groups[2].rank,
        groups[3].rank,
      ],
      cards,
    };
  }

  // 9. High Card
  return {
    rankType: ShowdownHandRank.HIGH_CARD,
    rankName: '高牌',
    tieBreakerRanks: sortedRanks,
    cards,
  };
}

/**
 * Compare two showdown hands.
 * Rule 28: Suits DO NOT break ties! If tieBreakerRanks are equal, returns 0.
 */
export function compareShowdownHands(cardsA: Card[], cardsB: Card[]): number {
  const evalA = evaluateShowdownHand(cardsA);
  const evalB = evaluateShowdownHand(cardsB);

  if (evalA.rankType !== evalB.rankType) {
    return evalA.rankType - evalB.rankType;
  }

  const len = Math.min(evalA.tieBreakerRanks.length, evalB.tieBreakerRanks.length);
  for (let i = 0; i < len; i++) {
    if (evalA.tieBreakerRanks[i] !== evalB.tieBreakerRanks[i]) {
      return evalA.tieBreakerRanks[i] - evalB.tieBreakerRanks[i];
    }
  }

  return 0; // Pure tie!
}
