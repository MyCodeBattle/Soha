import { describe, it, expect } from 'vitest';
import { Card, Rank, Suit } from '../src/types.js';
import {
  evaluateVisibleHand,
  compareVisibleHands,
  evaluateShowdownHand,
  compareShowdownHands,
} from '../src/evaluator.js';

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` };
}

describe('Visible Hand Evaluator (1-4 Upcards for Initiative Order)', () => {
  it('Round 1 (1 card): compares ranks, then breaks tie with suit (♠ > ♥ > ♦ > ♣)', () => {
    const aSpades = [card('spades', 14)];
    const aHearts = [card('hearts', 14)];
    const kSpades = [card('spades', 13)];

    // A > K
    expect(compareVisibleHands(aHearts, kSpades)).toBeGreaterThan(0);
    // A♠ > A♥ (suit order)
    expect(compareVisibleHands(aSpades, aHearts)).toBeGreaterThan(0);
  });

  it('Round 2 (2 cards): Pair > High Card, and compares rank then suit', () => {
    const pairK = [card('spades', 13), card('diamonds', 13)];
    const highA = [card('spades', 14), card('hearts', 12)]; // AQ

    // KK > AQ
    expect(compareVisibleHands(pairK, highA)).toBeGreaterThan(0);

    const pairA_spade = [card('spades', 14), card('clubs', 14)];
    const pairA_heart = [card('hearts', 14), card('diamonds', 14)];
    // AA with spade > AA with heart
    expect(compareVisibleHands(pairA_spade, pairA_heart)).toBeGreaterThan(0);

    const akSpade = [card('spades', 14), card('hearts', 13)];
    const aqSpade = [card('spades', 14), card('hearts', 12)];
    // AK > AQ
    expect(compareVisibleHands(akSpade, aqSpade)).toBeGreaterThan(0);
  });

  it('Round 3 (3 cards): Three of a kind > Pair > High card', () => {
    const trips8 = [card('spades', 8), card('hearts', 8), card('diamonds', 8)];
    const pairA = [card('spades', 14), card('hearts', 14), card('diamonds', 12)]; // AAQ
    const highAKQ = [card('spades', 14), card('hearts', 13), card('diamonds', 12)]; // AKQ

    // 888 > AAQ > AKQ
    expect(compareVisibleHands(trips8, pairA)).toBeGreaterThan(0);
    expect(compareVisibleHands(pairA, highAKQ)).toBeGreaterThan(0);
  });

  it('Round 4 (4 cards): Four of a kind > Three of a kind > Two pair > One pair > High card', () => {
    const quads9 = [card('spades', 9), card('hearts', 9), card('diamonds', 9), card('clubs', 9)];
    const tripsA = [card('spades', 14), card('hearts', 14), card('diamonds', 14), card('clubs', 13)];
    const twoPair = [card('spades', 14), card('hearts', 14), card('diamonds', 13), card('clubs', 13)];
    const onePair = [card('spades', 14), card('hearts', 14), card('diamonds', 12), card('clubs', 11)];
    const highCard = [card('spades', 14), card('hearts', 13), card('diamonds', 12), card('clubs', 11)];

    expect(compareVisibleHands(quads9, tripsA)).toBeGreaterThan(0);
    expect(compareVisibleHands(tripsA, twoPair)).toBeGreaterThan(0);
    expect(compareVisibleHands(twoPair, onePair)).toBeGreaterThan(0);
    expect(compareVisibleHands(onePair, highCard)).toBeGreaterThan(0);
  });

  it('Rule 6: 4 cards cannot be counted as Straight or Flush', () => {
    // 10♠ J♠ Q♠ K♠ is 4 same suit and consecutive, but only counts as K High Card!
    const fourStraightFlush = [
      card('spades', 10),
      card('spades', 11),
      card('spades', 12),
      card('spades', 13),
    ];
    const lowPair = [
      card('hearts', 2),
      card('diamonds', 2),
      card('clubs', 3),
      card('spades', 4),
    ];

    // Any pair (even 22) beats a high card (even 10-J-Q-K) in 4 visible cards!
    expect(compareVisibleHands(lowPair, fourStraightFlush)).toBeGreaterThan(0);
  });
});

describe('Showdown Evaluator (5 Cards, No Suit Hierarchy, Split Pot on Ties)', () => {
  it('Evaluates Straight Flush and Royal Flush', () => {
    const royalFlush = [
      card('spades', 10),
      card('spades', 11),
      card('spades', 12),
      card('spades', 13),
      card('spades', 14),
    ];
    const straightFlush9 = [
      card('hearts', 9),
      card('hearts', 10),
      card('hearts', 11),
      card('hearts', 12),
      card('hearts', 13),
    ];
    const quadsA = [
      card('spades', 14),
      card('hearts', 14),
      card('diamonds', 14),
      card('clubs', 14),
      card('spades', 8),
    ];

    expect(compareShowdownHands(royalFlush, straightFlush9)).toBeGreaterThan(0);
    expect(compareShowdownHands(straightFlush9, quadsA)).toBeGreaterThan(0);
  });

  it('Evaluates Full House > Flush > Straight > Three of a kind', () => {
    const fullHouseAAA22 = [
      card('spades', 14),
      card('hearts', 14),
      card('diamonds', 14),
      card('spades', 2),
      card('hearts', 2),
    ];
    const fullHouseKKKAA = [
      card('spades', 13),
      card('hearts', 13),
      card('diamonds', 13),
      card('spades', 14),
      card('hearts', 14),
    ];
    const flush = [
      card('spades', 14),
      card('spades', 11),
      card('spades', 9),
      card('spades', 6),
      card('spades', 3),
    ];
    const straight = [
      card('spades', 7),
      card('hearts', 8),
      card('diamonds', 9),
      card('clubs', 10),
      card('spades', 11),
    ];

    // AAA22 > KKKAA
    expect(compareShowdownHands(fullHouseAAA22, fullHouseKKKAA)).toBeGreaterThan(0);
    // Full House > Flush
    expect(compareShowdownHands(fullHouseKKKAA, flush)).toBeGreaterThan(0);
    // Flush > Straight
    expect(compareShowdownHands(flush, straight)).toBeGreaterThan(0);
  });

  it('Rule 23: Straight nuances (A-2-3-4-5 is 5-high, 2-3-4-5-6 > A-2-3-4-5, Q-K-A-2-3 is not a straight)', () => {
    const straightA2345 = [
      card('spades', 14),
      card('hearts', 2),
      card('diamonds', 3),
      card('clubs', 4),
      card('spades', 5),
    ];
    const straight23456 = [
      card('spades', 2),
      card('hearts', 3),
      card('diamonds', 4),
      card('clubs', 5),
      card('spades', 6),
    ];
    const nonStraightQKA23 = [
      card('spades', 12),
      card('hearts', 13),
      card('diamonds', 14),
      card('clubs', 2),
      card('spades', 3),
    ];

    expect(compareShowdownHands(straight23456, straightA2345)).toBeGreaterThan(0);
    const evalNonStraight = evaluateShowdownHand(nonStraightQKA23);
    expect(evalNonStraight.rankType).not.toBe(5); // Not straight (STRAIGHT is 5)
  });

  it('Rule 28 & 29: Equal hands tie without suit comparison (Split pot)', () => {
    const handA = [
      card('spades', 14),
      card('hearts', 13),
      card('diamonds', 12),
      card('clubs', 11),
      card('spades', 9),
    ];
    const handB = [
      card('hearts', 14),
      card('diamonds', 13),
      card('clubs', 12),
      card('spades', 11),
      card('hearts', 9),
    ];

    // Exactly equal rank and kickers, suits differ -> MUST TIE (0)
    expect(compareShowdownHands(handA, handB)).toBe(0);
  });
});
