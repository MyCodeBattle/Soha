import {
  ActionType,
  Card,
  GameState,
  Player,
  PlayerAction,
  applyAction,
  startHand,
} from '@soha/core';
import { decideBotAction } from './bot.js';

export interface RoomViewPlayer extends Omit<Player, 'holeCard'> {
  holeCard?: Card | { isHidden: true };
  isOnline: boolean;
}

export interface PlayerActionOptions {
  canCheck: boolean;
  canBet: boolean;
  canCall: boolean;
  canRaise: boolean;
  canAllIn: boolean;
  canFold: boolean;
  callAmount: number;
  minBet: number;
  maxBet: number; // limited by chips and effectiveCap
  minRaise: number;
  maxRaise: number;
}

export interface RoomView {
  roomId: string;
  hostId: string;
  ante: number;
  status: 'WAITING' | 'PLAYING' | 'SUMMARY';
  players: RoomViewPlayer[];
  pot: number;
  effectiveCap: number;
  street: string;
  activePlayerId?: string;
  initiativePlayerId?: string;
  currentStreetMaxBet: number;
  actionDeadline?: number;
  winners?: GameState['winners'];
  actionOptions?: PlayerActionOptions;
}

export class Room {
  id: string;
  hostId: string;
  ante: number = 10;
  players: Player[] = [];
  gameState: GameState | null = null;
  status: 'WAITING' | 'PLAYING' | 'SUMMARY' = 'WAITING';
  socketMap: Map<string, string> = new Map(); // playerId -> socketId
  disconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  actionTimer: NodeJS.Timeout | null = null;
  actionDeadline: number = 0;
  onStateChange: () => void;

  constructor(id: string, hostId: string, onStateChange: () => void) {
    this.id = id;
    this.hostId = hostId;
    this.onStateChange = onStateChange;
  }

  addPlayer(playerId: string, name: string, isBot = false): Player {
    let player = this.players.find((p) => p.id === playerId);
    if (!player) {
      if (this.players.length >= 6) {
        throw new Error('Room is full (max 6 players)');
      }
      player = {
        id: playerId,
        name,
        chips: 1000,
        isReady: isBot, // Bots default to ready
        isFolded: false,
        isAllIn: false,
        isBot,
        upcards: [],
        currentStreetBet: 0,
        totalHandBet: 0,
      };
      this.players.push(player);
    } else {
      player.name = name;
    }

    // Clear disconnect timer if reconnecting
    const timer = this.disconnectTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
    }

    this.broadcast();
    return player;
  }

  removePlayer(playerId: string) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

    const player = this.players[idx];
    if (this.status === 'PLAYING' && this.gameState) {
      // If playing, fold the player first
      if (!player.isFolded && this.gameState.street !== 'HAND_ENDED') {
        try {
          this.executeAction(playerId, { type: 'FOLD' });
        } catch {
          // ignore
        }
      }
    }

    this.players.splice(idx, 1);
    this.socketMap.delete(playerId);
    const dTimer = this.disconnectTimers.get(playerId);
    if (dTimer) {
      clearTimeout(dTimer);
      this.disconnectTimers.delete(playerId);
    }

    // Pass host if host leaves
    if (this.hostId === playerId && this.players.length > 0) {
      const nextHuman = this.players.find((p) => !p.isBot);
      this.hostId = nextHuman ? nextHuman.id : this.players[0].id;
    }

    this.broadcast();
  }

  handleDisconnect(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.isBot) return;

    this.socketMap.delete(playerId);
    // 30 seconds grace period
    const timer = setTimeout(() => {
      this.removePlayer(playerId);
    }, 30000);
    this.disconnectTimers.set(playerId, timer);
    this.broadcast();
  }

  toggleReady(playerId: string, isReady: boolean) {
    const player = this.players.find((p) => p.id === playerId);
    if (player) {
      player.isReady = isReady;
      this.broadcast();
      this.checkAutoStart();
    }
  }

  resetChips(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (player && this.status !== 'PLAYING') {
      player.chips = 1000;
      this.broadcast();
    }
  }

  addBot() {
    if (this.players.length >= 6) {
      throw new Error('Room is full');
    }
    const botNum = this.players.filter((p) => p.isBot).length + 1;
    const botId = `bot-${Date.now()}-${botNum}`;
    const botNames = ['阿星', '三叔', '陈金城', '大军', '海棠', '高进'];
    const name = `电脑·${botNames[(botNum - 1) % botNames.length]}`;
    this.addPlayer(botId, name, true);
    this.checkAutoStart();
  }

  removeBot(botId: string) {
    const bot = this.players.find((p) => p.id === botId && p.isBot);
    if (bot) {
      this.removePlayer(botId);
    }
  }

  checkAutoStart() {
    if (this.status === 'PLAYING') return;
    if (this.players.length >= 2 && this.players.every((p) => p.isReady)) {
      this.startHand();
    }
  }

  startHand() {
    // Filter players with enough chips for ante
    for (const p of this.players) {
      if (p.chips < this.ante) {
        p.chips = 1000; // Auto reload for busted players
      }
    }

    try {
      this.gameState = startHand(this.players, this.ante);
      this.status = this.gameState.street === 'HAND_ENDED' ? 'SUMMARY' : 'PLAYING';
      this.syncStateToRoomPlayers();
      this.setupTurnTimer();
      this.broadcast();
    } catch (err) {
      console.error('Failed to start hand', err);
    }
  }

  private syncStateToRoomPlayers() {
    if (!this.gameState) return;
    for (const gamePlayer of this.gameState.players) {
      const roomPlayer = this.players.find((p) => p.id === gamePlayer.id);
      if (roomPlayer) {
        roomPlayer.chips = gamePlayer.chips;
        roomPlayer.isFolded = gamePlayer.isFolded;
        roomPlayer.isAllIn = gamePlayer.isAllIn;
        roomPlayer.upcards = gamePlayer.upcards;
        roomPlayer.holeCard = gamePlayer.holeCard;
        roomPlayer.currentStreetBet = gamePlayer.currentStreetBet;
        roomPlayer.totalHandBet = gamePlayer.totalHandBet;
      }
    }
  }

  executeAction(playerId: string, action: PlayerAction) {
    if (!this.gameState || this.status !== 'PLAYING') {
      throw new Error('No game is currently in progress');
    }

    this.clearTurnTimer();
    this.gameState = applyAction(this.gameState, playerId, action);
    this.syncStateToRoomPlayers();

    if (this.gameState.street === 'HAND_ENDED') {
      this.status = 'SUMMARY';
      // Reset players' ready state for the next hand
      for (const p of this.players) {
        p.isReady = p.isBot ? true : false;
      }
      this.broadcast();
    } else {
      this.setupTurnTimer();
      this.broadcast();
    }
  }

  private setupTurnTimer() {
    this.clearTurnTimer();
    if (!this.gameState || this.gameState.street === 'HAND_ENDED') return;

    const activePlayer = this.gameState.players[this.gameState.activePlayerIndex];
    if (!activePlayer) return;

    if (activePlayer.isBot) {
      // Bot turn: 1.2s delay for natural feeling
      this.actionDeadline = Date.now() + 1200;
      this.actionTimer = setTimeout(() => {
        if (!this.gameState) return;
        const botAction = decideBotAction(this.gameState, activePlayer.id);
        this.executeAction(activePlayer.id, botAction);
      }, 1200);
    } else {
      // Human turn: 15s timer
      this.actionDeadline = Date.now() + 15000;
      this.actionTimer = setTimeout(() => {
        if (!this.gameState) return;
        // On timeout: check if possible, otherwise fold
        const canCheck = this.gameState.currentStreetMaxBet === activePlayer.currentStreetBet;
        const fallbackAction: PlayerAction = canCheck ? { type: 'CHECK' } : { type: 'FOLD' };
        this.executeAction(activePlayer.id, fallbackAction);
      }, 15000);
    }
  }

  private clearTurnTimer() {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
  }

  broadcast() {
    this.onStateChange();
  }

  getPlayerView(playerId: string): RoomView {
    const isPlaying = this.status === 'PLAYING' && !!this.gameState;
    // Rule 15: If all other players folded, the winner does NOT show hole card.
    // Hole cards are only revealed when 2+ players reach showdown!
    const nonFoldedCount = this.gameState ? this.gameState.players.filter((p) => !p.isFolded).length : 0;
    const isShowdown = this.gameState?.street === 'HAND_ENDED' && nonFoldedCount > 1;

    const viewPlayers: RoomViewPlayer[] = this.players.map((p) => {
      let holeCard: Card | { isHidden: true } | undefined = undefined;
      if (p.holeCard) {
        if (p.id === playerId || isShowdown) {
          holeCard = p.holeCard;
        } else {
          holeCard = { isHidden: true };
        }
      }

      return {
        ...p,
        holeCard,
        isOnline: p.isBot ? true : this.socketMap.has(p.id),
      };
    });

    let actionOptions: PlayerActionOptions | undefined = undefined;
    const activePlayer = this.gameState
      ? this.gameState.players[this.gameState.activePlayerIndex]
      : undefined;

    if (isPlaying && activePlayer && activePlayer.id === playerId) {
      const callDiff = this.gameState!.currentStreetMaxBet - activePlayer.currentStreetBet;
      const canCheck = callDiff === 0;
      const canBet = this.gameState!.currentStreetMaxBet === 0;
      const canCall = callDiff > 0;
      const canRaise = this.gameState!.currentStreetMaxBet > 0;

      const remainingToCap = this.gameState!.effectiveCap - activePlayer.totalHandBet;
      const maxPossibleAdd = Math.min(activePlayer.chips, remainingToCap);

      const minBet = Math.min(this.gameState!.lastRaiseDiff, maxPossibleAdd);
      const maxBet = maxPossibleAdd;

      const minRaise = Math.min(
        this.gameState!.currentStreetMaxBet + this.gameState!.lastRaiseDiff,
        activePlayer.currentStreetBet + maxPossibleAdd
      );
      const maxRaise = activePlayer.currentStreetBet + maxPossibleAdd;

      actionOptions = {
        canCheck,
        canBet: canBet && maxPossibleAdd > 0,
        canCall: canCall && maxPossibleAdd > 0,
        canRaise: canRaise && maxRaise > this.gameState!.currentStreetMaxBet,
        canAllIn: maxPossibleAdd > 0,
        canFold: true,
        callAmount: Math.min(callDiff, maxPossibleAdd),
        minBet,
        maxBet,
        minRaise,
        maxRaise,
      };
    }

    return {
      roomId: this.id,
      hostId: this.hostId,
      ante: this.ante,
      status: this.status,
      players: viewPlayers,
      pot: this.gameState ? this.gameState.pot : 0,
      effectiveCap: this.gameState ? this.gameState.effectiveCap : 0,
      street: this.gameState ? this.gameState.street : 'WAITING_READY',
      activePlayerId: activePlayer?.id,
      initiativePlayerId:
        this.gameState && this.gameState.initiativePlayerIndex >= 0
          ? this.gameState.players[this.gameState.initiativePlayerIndex]?.id
          : undefined,
      currentStreetMaxBet: this.gameState ? this.gameState.currentStreetMaxBet : 0,
      actionDeadline: this.actionDeadline,
      winners: this.gameState?.winners,
      actionOptions,
    };
  }
}
