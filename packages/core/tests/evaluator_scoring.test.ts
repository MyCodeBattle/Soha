import { describe, it, expect } from 'vitest';
import { Card, Rank, Suit } from '../src/types.js';
import { evaluateShowdownHand } from '../src/evaluator.js';

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` };
}

describe('Showdown scoring cards and ordered cards extraction', () => {
  it('extracts two pair scoring cards (4 cards) and puts single kicker at the end', () => {
    // Hand dealt in random order: 8♠, A♥, K♦, A♠, K♣
    const hand = [
      card('spades', 8),
      card('hearts', 14),
      card('diamonds', 13),
      card('spades', 14),
      card('clubs', 13),
    ];
    const res = evaluateShowdownHand(hand);
    expect(res.rankName).toBe('两对');
    // Scoring cards should be the 4 pair cards: A♥, A♠, K♦, K♣
    expect(res.scoringCardIds).toHaveLength(4);
    expect(res.scoringCardIds).toContain('hearts-14');
    expect(res.scoringCardIds).toContain('spades-14');
    expect(res.scoringCardIds).toContain('diamonds-13');
    expect(res.scoringCardIds).toContain('clubs-13');
    expect(res.scoringCardIds).not.toContain('spades-8');

    // Ordered cards should place the higher pair first, lower pair second, kicker last
    expect(res.orderedCards[0].rank).toBe(14);
    expect(res.orderedCards[1].rank).toBe(14);
    expect(res.orderedCards[2].rank).toBe(13);
    expect(res.orderedCards[3].rank).toBe(13);
    expect(res.orderedCards[4].rank).toBe(8);
  });

  it('extracts three of a kind scoring cards (3 cards) and orders kickers descending', () => {
    // Q♥, 5♠, Q♦, 2♣, Q♠
    const hand = [
      card('hearts', 12),
      card('spades', 5),
      card('diamonds', 12),
      card('clubs', 2),
      card('spades', 12),
    ];
    const res = evaluateShowdownHand(hand);
    expect(res.rankName).toBe('三条');
    expect(res.scoringCardIds).toHaveLength(3);
    expect(res.scoringCardIds).toContain('hearts-12');
    expect(res.scoringCardIds).toContain('diamonds-12');
    expect(res.scoringCardIds).toContain('spades-12');

    expect(res.orderedCards.map((c) => c.rank)).toEqual([12, 12, 12, 5, 2]);
  });

  it('extracts four of a kind scoring cards (4 cards) and 1 kicker', () => {
    const hand = [
      card('hearts', 9),
      card('spades', 9),
      card('diamonds', 9),
      card('clubs', 14),
      card('clubs', 9),
    ];
    const res = evaluateShowdownHand(hand);
    expect(res.rankName).toBe('四条');
    expect(res.scoringCardIds).toHaveLength(4);
    expect(res.orderedCards.map((c) => c.rank)).toEqual([9, 9, 9, 9, 14]);
  });

  it('extracts one pair scoring cards (2 cards) and 3 kickers in descending order', () => {
    const hand = [
      card('spades', 3),
      card('hearts', 10),
      card('diamonds', 14),
      card('clubs', 10),
      card('spades', 7),
    ];
    const res = evaluateShowdownHand(hand);
    expect(res.rankName).toBe('一对');
    expect(res.scoringCardIds).toEqual(expect.arrayContaining(['hearts-10', 'clubs-10']));
    expect(res.scoringCardIds).toHaveLength(2);
    expect(res.orderedCards.map((c) => c.rank)).toEqual([10, 10, 14, 7, 3]);
  });

  it('extracts full house: all 5 cards are scoring cards, trips first then pair', () => {
    const hand = [
      card('spades', 10),
      card('hearts', 14),
      card('diamonds', 14),
      card('clubs', 10),
      card('spades', 14),
    ];
    const res = evaluateShowdownHand(hand);
    expect(res.rankName).toBe('葫芦');
    expect(res.scoringCardIds).toHaveLength(5);
    expect(res.orderedCards.map((c) => c.rank)).toEqual([14, 14, 14, 10, 10]);
  });

  it('extracts straight and flush: all 5 cards are scoring cards', () => {
    // Straight 9-8-7-6-5
    const straight = [
      card('spades', 7),
      card('hearts', 9),
      card('diamonds', 6),
      card('clubs', 8),
      card('spades', 5),
    ];
    const resStraight = evaluateShowdownHand(straight);
    expect(resStraight.rankName).toBe('顺子');
    expect(resStraight.scoringCardIds).toHaveLength(5);
    expect(resStraight.orderedCards.map((c) => c.rank)).toEqual([9, 8, 7, 6, 5]);

    // Wheel Straight 5-4-3-2-A
    const wheel = [
      card('spades', 14),
      card('hearts', 2),
      card('diamonds', 3),
      card('clubs', 4),
      card('spades', 5),
    ];
    const resWheel = evaluateShowdownHand(wheel);
    expect(resWheel.rankName).toBe('顺子');
    expect(resWheel.orderedCards.map((c) => c.rank)).toEqual([5, 4, 3, 2, 14]);

    // Flush
    const flush = [
      card('diamonds', 3),
      card('diamonds', 14),
      card('diamonds', 8),
      card('diamonds', 11),
      card('diamonds', 5),
    ];
    const resFlush = evaluateShowdownHand(flush);
    expect(resFlush.rankName).toBe('同花');
    expect(resFlush.scoringCardIds).toHaveLength(5);
    expect(resFlush.orderedCards.map((c) => c.rank)).toEqual([14, 11, 8, 5, 3]);
  });

  it('extracts high card: highest card is the single scoring card, kickers descending', () => {
    const hand = [
      card('spades', 4),
      card('hearts', 14),
      card('diamonds', 8),
      card('clubs', 10),
      card('spades', 6),
    ];
    const res = evaluateShowdownHand(hand);
    expect(res.rankName).toBe('高牌');
    expect(res.scoringCardIds).toEqual(['hearts-14']);
    expect(res.orderedCards.map((c) => c.rank)).toEqual([14, 10, 8, 6, 4]);
  });
});
