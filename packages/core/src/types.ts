export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

// Rank values: 2..14 (14 is Ace)
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // e.g. "spades-14"
}

// ♠ > ♥ > ♦ > ♣ for visible card initiative order tiebreaker ONLY
export const SUIT_ORDER: Record<Suit, number> = {
  spades: 4,
  hearts: 3,
  diamonds: 2,
  clubs: 1,
};

export enum ShowdownHandRank {
  HIGH_CARD = 1,
  ONE_PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  STRAIGHT = 5,
  FLUSH = 6,
  FULL_HOUSE = 7,
  FOUR_OF_A_KIND = 8,
  STRAIGHT_FLUSH = 9,
}

export interface ShowdownHandEvaluation {
  rankType: ShowdownHandRank;
  rankName: string;
  // tieBreakerRanks: numbers used to compare hands without suits.
  // e.g. For Two Pair AA KK 8: [14, 13, 8]
  // For Full House QQQ AA: [12, 14]
  tieBreakerRanks: number[];
  cards: Card[];
  scoringCardIds: string[];
  orderedCards: Card[];
}

export enum VisibleHandRank {
  HIGH_CARD = 1,
  ONE_PAIR = 2,
  TWO_PAIR = 3,
  THREE_OF_A_KIND = 4,
  FOUR_OF_A_KIND = 5,
}

export interface VisibleHandEvaluation {
  rankType: VisibleHandRank;
  rankName: string;
  // Primary comparison ranks (highest to lowest importance)
  tieBreakerRanks: number[];
  // Highest relevant card suit (for breaking ties in initiative order)
  suitTieBreaker: number; // 4 (♠) to 1 (♣)
  cards: Card[];
}

export type ActionType = 'CHECK' | 'BET' | 'CALL' | 'RAISE' | 'FOLD' | 'ALL_IN';

export interface PlayerAction {
  type: ActionType;
  amount?: number; // total amount for BET or RAISE to this level
}

export interface Player {
  id: string;
  name: string;
  chips: number;
  isReady: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  isBot?: boolean;
  holeCard?: Card;
  upcards: Card[];
  currentStreetBet: number;
  totalHandBet: number;
}

export type GameStreet = 
  | 'WAITING_READY'
  | 'ROUND_1' // 1 down + 1 up
  | 'ROUND_2' // 1 down + 2 up
  | 'ROUND_3' // 1 down + 3 up
  | 'ROUND_4' // 1 down + 4 up
  | 'SHOWDOWN'
  | 'HAND_ENDED';

export interface PotWinner {
  playerId: string;
  amount: number;
  evaluation?: ShowdownHandEvaluation;
}

export interface GameState {
  id: string;
  street: GameStreet;
  deck: Card[];
  players: Player[];
  pot: number;
  ante: number;
  effectiveCap: number; // minimum starting chip count among players in this hand
  currentStreetMaxBet: number;
  lastRaiseDiff: number; // for minimum raise step
  activePlayerIndex: number; // who must act now (-1 if none)
  initiativePlayerIndex: number; // who acted first this street
  lastAggressorIndex: number; // who made the latest bet/raise
  actedInCurrentStreet: string[]; // player IDs who have taken an action since last bet/raise
  winners?: PotWinner[];
  actionDeadline?: number; // unix timestamp ms
}
