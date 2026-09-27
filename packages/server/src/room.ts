import {
  ActionType,
  Card,
  GameState,
  GameStreet,
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
  status: RoomStatus;
  handId?: string;
  presentation?: {
    sequence: number;
    phase: PresentationPhase;
    playerId?: string;
  };
  lastAction?: {
    sequence: number;
    playerId: string;
    type: ActionType;
    amount: number;
  };
  players: RoomViewPlayer[];
  pot: number;
  effectiveCap: number;
  street: string;
  activePlayerId?: string;
  initiativePlayerId?: string;
  currentStreetMaxBet: number;
  actionDeadline?: number;
  winners?: GameState['winners'];
  winnerNames?: Record<string, string>;
  actionOptions?: PlayerActionOptions;
}

type RoomStatus = 'WAITING' | 'DEALING' | 'PLAYING' | 'REVEALING' | 'SUMMARY';
type PresentationPhase = 'DEAL_HOLE' | 'DEAL_UP' | 'ACTION' | 'FLIP_HOLE' | 'COMPARE' | 'AWARD';

interface PresentationFrame {
  status: 'DEALING' | 'REVEALING';
  street: GameStreet;
  phase: PresentationPhase;
  playerId?: string;
  visibleUpcards: Record<string, number>;
  dealtHoleIds: string[];
  revealedHoleIds: string[];
  awarded: boolean;
}

interface TimedFrame {
  frame: PresentationFrame;
  holdMs: number;
}

function copyFrame(frame: PresentationFrame, changes: Partial<PresentationFrame>): PresentationFrame {
  return {
    ...frame,
    ...changes,
    visibleUpcards: { ...frame.visibleUpcards, ...changes.visibleUpcards },
    dealtHoleIds: changes.dealtHoleIds ?? [...frame.dealtHoleIds],
    revealedHoleIds: changes.revealedHoleIds ?? [...frame.revealedHoleIds],
  };
}

export class Room {
  id: string;
  hostId: string;
  ante: number = 10;
  players: Player[] = [];
  gameState: GameState | null = null;
  status: RoomStatus = 'WAITING';
  socketMap: Map<string, string> = new Map(); // playerId -> socketId
  disconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  pendingRemovals: Set<string> = new Set();
  actionTimer: NodeJS.Timeout | null = null;
  actionDeadline: number = 0;
  presentationFrame: PresentationFrame | null = null;
  presentationTimer: NodeJS.Timeout | null = null;
  presentationSequence = 0;
  lastAction?: RoomView['lastAction'];
  onStateChange: () => void;

  constructor(id: string, hostId: string, onStateChange: () => void) {
    this.id = id;
    this.hostId = hostId;
    this.onStateChange = onStateChange;
  }

  addPlayer(playerId: string, name: string, isBot = false): Player {
    let player = this.players.find((p) => p.id === playerId);
    if (!player) {
      if (this.players.length >= 6 && this.status === 'SUMMARY' && this.pendingRemovals.size > 0) {
        const departedId = this.pendingRemovals.values().next().value!;
        this.pendingRemovals.delete(departedId);
        this.removePlayerNow(departedId);
      }
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
    this.pendingRemovals.delete(playerId);

    this.broadcast();
    return player;
  }

  removePlayer(playerId: string) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

    if ((this.status === 'PLAYING' || this.status === 'DEALING' || this.status === 'REVEALING' || this.status === 'SUMMARY')
      && this.gameState?.players.some((player) => player.id === playerId)) {
      this.pendingRemovals.add(playerId);
      this.socketMap.delete(playerId);
      const timer = this.disconnectTimers.get(playerId);
      if (timer) clearTimeout(timer);
      this.disconnectTimers.delete(playerId);
      if (this.status === 'PLAYING' && this.gameState.players[this.gameState.activePlayerIndex]?.id === playerId) {
        this.executeAction(playerId, { type: 'FOLD' });
      }
      this.broadcast();
      return;
    }

    this.removePlayerNow(playerId);
  }

  private removePlayerNow(playerId: string) {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return;

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

  private flushPendingRemovals() {
    for (const playerId of this.pendingRemovals) this.removePlayerNow(playerId);
    this.pendingRemovals.clear();
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
    if (this.status !== 'WAITING' && this.status !== 'SUMMARY') return;
    const player = this.players.find((p) => p.id === playerId);
    if (player) {
      player.isReady = isReady;
      this.broadcast();
      this.checkAutoStart();
    }
  }

  resetChips(playerId: string) {
    const player = this.players.find((p) => p.id === playerId);
    if (player && (this.status === 'WAITING' || this.status === 'SUMMARY')) {
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
    if (this.status !== 'WAITING' && this.status !== 'SUMMARY') return;
    const nextPlayers = this.players.filter((player) => !this.pendingRemovals.has(player.id));
    if (nextPlayers.length >= 2 && nextPlayers.every((player) => player.isReady)) {
      this.startHand();
    }
  }

  startHand() {
    if (this.status !== 'WAITING' && this.status !== 'SUMMARY') return;
    if (this.players.filter((player) => !this.pendingRemovals.has(player.id)).length < 2) return;
    this.flushPendingRemovals();
    this.clearTurnTimer();
    this.clearPresentationTimer();
    // Filter players with enough chips for ante
    for (const p of this.players) {
      if (p.chips < this.ante) {
        p.chips = 1000; // Auto reload for busted players
      }
    }

    try {
      this.gameState = startHand(this.players, this.ante);
      this.syncStateToRoomPlayers();
      this.lastAction = undefined;
      this.presentOpeningDeal();
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

    const before = this.gameState;
    const next = applyAction(before, playerId, action);
    this.clearTurnTimer();
    this.gameState = next;
    this.syncStateToRoomPlayers();
    this.lastAction = {
      sequence: ++this.presentationSequence,
      playerId,
      type: action.type,
      amount: Math.max(0, (next.players.find((player) => player.id === playerId)?.totalHandBet ?? 0)
        - (before.players.find((player) => player.id === playerId)?.totalHandBet ?? 0)),
    };

    if (this.gameState.street === 'HAND_ENDED') {
      this.presentResult(before);
    } else if (this.gameState.street !== before.street) {
      this.presentStreet(before);
    } else {
      this.setupTurnTimer();
      this.broadcast();
    }
  }

  private clearPresentationTimer() {
    if (this.presentationTimer) {
      clearTimeout(this.presentationTimer);
      this.presentationTimer = null;
    }
  }

  private present(frames: TimedFrame[], finalStatus: 'PLAYING' | 'SUMMARY') {
    this.clearPresentationTimer();
    let index = 0;
    const advance = () => {
      if (index >= frames.length) {
        this.presentationFrame = null;
        this.status = finalStatus;
        if (finalStatus === 'PLAYING') {
          this.setupTurnTimer();
        } else {
          for (const player of this.players) player.isReady = !!player.isBot;
        }
        this.broadcast();
        return;
      }
      const current = frames[index++];
      this.presentationFrame = current.frame;
      this.status = current.frame.status;
      this.presentationSequence += 1;
      this.broadcast();
      this.presentationTimer = setTimeout(advance, current.holdMs);
    };
    advance();
  }

  private initialFrame(status: 'DEALING' | 'REVEALING', street: GameStreet, counts: Record<string, number>, dealtHoleIds: string[]): PresentationFrame {
    return {
      status,
      street,
      phase: 'ACTION',
      visibleUpcards: counts,
      dealtHoleIds,
      revealedHoleIds: [],
      awarded: false,
    };
  }

  private frameBeforeAction(before: GameState, status: 'DEALING' | 'REVEALING'): PresentationFrame {
    const counts = Object.fromEntries(before.players.map((player) => [player.id, player.upcards.length]));
    const dealtHoleIds = before.players.filter((player) => player.holeCard).map((player) => player.id);
    return this.initialFrame(status, before.street, counts, dealtHoleIds);
  }

  private appendUpcards(frames: TimedFrame[], startingFrame: PresentationFrame, target: GameState, holdMs = 220): PresentationFrame {
    let frame = startingFrame;
    const maxCount = Math.max(0, ...target.players.filter((player) => !player.isFolded).map((player) => player.upcards.length));
    const initialCount = Math.max(0, ...Object.values(frame.visibleUpcards));
    for (let count = initialCount + 1; count <= maxCount; count += 1) {
      const street = `ROUND_${count}` as GameStreet;
      for (const player of target.players) {
        if (player.isFolded || player.upcards.length < count) continue;
        frame = copyFrame(frame, {
          street,
          phase: 'DEAL_UP',
          playerId: player.id,
          visibleUpcards: { [player.id]: count },
        });
        frames.push({ frame, holdMs });
      }
      if (count < maxCount) frames[frames.length - 1].holdMs += 300;
    }
    return frame;
  }

  private appendShowdown(frames: TimedFrame[], startingFrame: PresentationFrame) {
    if (!this.gameState) return;
    let frame = startingFrame;
    const remaining = this.gameState.players.filter((player) => !player.isFolded);
    if (remaining.length > 1) {
      for (const player of remaining) {
        frame = copyFrame(frame, {
          street: 'SHOWDOWN',
          phase: 'FLIP_HOLE',
          playerId: player.id,
          revealedHoleIds: [...frame.revealedHoleIds, player.id],
        });
        frames.push({ frame, holdMs: 800 });
      }
      frame = copyFrame(frame, { phase: 'COMPARE', playerId: undefined });
      frames.push({ frame, holdMs: 5000 });
    }
    frame = copyFrame(frame, { street: 'HAND_ENDED', phase: 'AWARD', playerId: undefined, awarded: true });
    frames.push({ frame, holdMs: 450 });
  }

  private presentOpeningDeal() {
    if (!this.gameState) return;
    let frame = this.initialFrame('DEALING', 'ROUND_1', {}, []);
    const frames: TimedFrame[] = [{ frame, holdMs: 140 }];
    for (const player of this.gameState.players) {
      frame = copyFrame(frame, { phase: 'DEAL_HOLE', playerId: player.id, dealtHoleIds: [...frame.dealtHoleIds, player.id] });
      frames.push({ frame, holdMs: 140 });
    }
    frame = this.appendUpcards(frames, frame, {
      ...this.gameState,
      players: this.gameState.players.map((player) => ({ ...player, upcards: player.upcards.slice(0, 1) })),
    });
    if (this.gameState.street === 'HAND_ENDED') {
      frame = copyFrame(frame, { status: 'REVEALING' });
      frame = this.appendUpcards(frames, frame, this.gameState, 500);
      this.appendShowdown(frames, frame);
      this.present(frames, 'SUMMARY');
    } else {
      frames[frames.length - 1].holdMs += 180;
      this.present(frames, 'PLAYING');
    }
  }

  private presentStreet(before: GameState) {
    if (!this.gameState) return;
    let frame = this.frameBeforeAction(before, 'DEALING');
    const frames: TimedFrame[] = [{ frame, holdMs: 180 }];
    frame = this.appendUpcards(frames, frame, this.gameState);
    frames[frames.length - 1].holdMs += 180;
    this.present(frames, 'PLAYING');
  }

  private presentResult(before: GameState) {
    if (!this.gameState) return;
    let frame = this.frameBeforeAction(before, 'REVEALING');
    const frames: TimedFrame[] = [{ frame, holdMs: this.lastAction?.type === 'ALL_IN' ? 400 : 220 }];
    frame = this.appendUpcards(frames, frame, this.gameState, 500);
    this.appendShowdown(frames, frame);
    this.present(frames, 'SUMMARY');
  }

  private setupTurnTimer() {
    this.clearTurnTimer();
    if (!this.gameState || this.gameState.street === 'HAND_ENDED') return;

    const activePlayer = this.gameState.players[this.gameState.activePlayerIndex];
    if (!activePlayer) return;

    if (this.pendingRemovals.has(activePlayer.id)) {
      this.actionDeadline = Date.now();
      this.actionTimer = setTimeout(() => this.executeAction(activePlayer.id, { type: 'FOLD' }), 0);
      return;
    }

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
    this.actionDeadline = 0;
  }

  broadcast() {
    this.onStateChange();
  }

  getPlayerView(playerId: string): RoomView {
    const isPlaying = this.status === 'PLAYING' && !!this.gameState;
    // Rule 15: If all other players folded, the winner does NOT show hole card.
    // Hole cards are only revealed when 2+ players reach showdown!
    const nonFoldedCount = this.gameState ? this.gameState.players.filter((p) => !p.isFolded).length : 0;
    const isShowdown = this.status === 'SUMMARY' && nonFoldedCount > 1;
    const frame = this.presentationFrame;

    const viewPlayers: RoomViewPlayer[] = this.players.map((p) => {
      let holeCard: Card | { isHidden: true } | undefined = undefined;
      if (p.holeCard && (!frame || frame.dealtHoleIds.includes(p.id))) {
        if (p.id === playerId || (isShowdown && !p.isFolded) || frame?.revealedHoleIds.includes(p.id)) {
          holeCard = p.holeCard;
        } else {
          holeCard = { isHidden: true };
        }
      }

      return {
        ...p,
        holeCard,
        upcards: frame ? p.upcards.slice(0, frame.visibleUpcards[p.id] ?? 0) : p.upcards,
        chips: frame && !frame.awarded
          ? p.chips - (this.gameState?.winners?.find((winner) => winner.playerId === p.id)?.amount ?? 0)
          : p.chips,
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
      handId: this.gameState?.id,
      presentation: frame ? { sequence: this.presentationSequence, phase: frame.phase, playerId: frame.playerId } : undefined,
      lastAction: this.lastAction,
      players: viewPlayers,
      pot: this.gameState && this.status !== 'SUMMARY' && (!frame || !frame.awarded) ? this.gameState.pot : 0,
      effectiveCap: this.gameState ? this.gameState.effectiveCap : 0,
      street: frame?.street ?? (this.gameState ? this.gameState.street : 'WAITING_READY'),
      activePlayerId: this.status === 'PLAYING' ? activePlayer?.id : undefined,
      initiativePlayerId:
        this.status === 'PLAYING' && this.gameState && this.gameState.initiativePlayerIndex >= 0
          ? this.gameState.players[this.gameState.initiativePlayerIndex]?.id
          : undefined,
      currentStreetMaxBet: this.gameState ? this.gameState.currentStreetMaxBet : 0,
      actionDeadline: this.status === 'PLAYING' ? this.actionDeadline : undefined,
      winners: frame && !frame.awarded ? undefined : this.gameState?.winners,
      winnerNames: frame && !frame.awarded ? undefined : Object.fromEntries(
        (this.gameState?.winners ?? []).map((winner) => [
          winner.playerId,
          this.gameState?.players.find((player) => player.id === winner.playerId)?.name ?? '获胜者',
        ])
      ),
      actionOptions,
    };
  }
}
