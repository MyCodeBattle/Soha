import React, { useState, useEffect, useRef } from 'react';
import { RoomView, RoomViewPlayer } from '../../../server/src/room.js';
import { PlayerAction, evaluateShowdownHand, evaluateVisibleHand } from '@soha/core';
import { ChipFlight, DealtCard } from './TableMotion.js';
import { ActionControls } from './ActionControls.js';
import { ShowdownStage } from './ShowdownStage.js';
import { RulesModal } from './RulesModal.js';
import { FullscreenButton } from './FullscreenButton.js';
import { sound } from '../utils/audio.js';
import {
  Volume2,
  VolumeX,
  Copy,
  Check,
  Bot,
  User,
  Crown,
  BookOpen,
  LogOut,
  RefreshCw,
  Coins,
  Clock,
  Sparkles,
  Trophy,
  MoreHorizontal,
} from 'lucide-react';

const opponentSeatSlots = [
  [],
  ['top-center'],
  ['top-left', 'top-right'],
  ['top-left', 'top-center', 'top-right'],
  ['top-left', 'top-right', 'side-left', 'side-right'],
  ['top-left', 'top-center', 'top-right', 'side-left', 'side-right'],
];

function isRoomShowdownActive(roomView: RoomView): boolean {
  const nonFoldedParticipants = roomView.players.filter(
    (p) => !p.isFolded && p.holeCard && !('isHidden' in p.holeCard) && p.upcards.length === 4
  );
  return (
    nonFoldedParticipants.length > 1 &&
    ((roomView.status === 'REVEALING' &&
      (roomView.presentation?.phase === 'COMPARE' || roomView.presentation?.phase === 'AWARD')) ||
      roomView.status === 'SUMMARY')
  );
}

interface TableProps {
  roomView: RoomView;
  myPlayerId: string;
  onAction: (action: PlayerAction) => void;
  onToggleReady: (ready: boolean) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onResetChips: () => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
}

export const Table: React.FC<TableProps> = ({
  roomView,
  myPlayerId,
  onAction,
  onToggleReady,
  onAddBot,
  onRemoveBot,
  onResetChips,
  onStartGame,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sound.isEnabled());
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const deckRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const playedPresentationRef = useRef(roomView.presentation?.sequence ?? -1);
  const playedActionRef = useRef(roomView.lastAction?.sequence ?? -1);
  const previousStatusRef = useRef(roomView.status);
  const [actionFlightSequence, setActionFlightSequence] = useState<number | null>(null);
  const [awardFlightSequence, setAwardFlightSequence] = useState<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [roomView.status]);

  const me = roomView.players.find((p) => p.id === myPlayerId);
  const isHost = roomView.hostId === myPlayerId;
  const opponents = roomView.players.filter((p) => p.id !== myPlayerId);
  const isCrowdedTable = opponents.length >= 4;

  const isMyTurn = roomView.status === 'PLAYING' && roomView.activePlayerId === myPlayerId;
  const isShowingHands = roomView.status === 'SUMMARY' ||
    (roomView.status === 'REVEALING' &&
      ['FLIP_HOLE', 'COMPARE', 'AWARD'].includes(roomView.presentation?.phase ?? ''));

  const isShowdownActive = isRoomShowdownActive(roomView);

  const revealedHandRank = (player: RoomViewPlayer) => {
    if (!isShowingHands || player.isFolded || !player.holeCard || 'isHidden' in player.holeCard || player.upcards.length !== 4) {
      return null;
    }
    return evaluateShowdownHand([player.holeCard, ...player.upcards]).rankName;
  };

  // Sound toggle
  const handleToggleSound = () => {
    const next = sound.toggleSound();
    setSoundEnabled(next);
  };

  // Copy room link
  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomView.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Timer countdown
  useEffect(() => {
    if (!roomView.actionDeadline || roomView.status !== 'PLAYING') {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((roomView.actionDeadline! - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0 && remaining <= 5 && isMyTurn) {
        sound.playTimerTick();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [roomView.actionDeadline, roomView.status, isMyTurn]);

  // Sounds follow authoritative presentation steps, once per received step.
  useEffect(() => {
    const step = roomView.presentation;
    if (!step) return;
    if (playedPresentationRef.current === step.sequence) return;
    playedPresentationRef.current = step.sequence;
    if (step.phase === 'DEAL_UP' || step.phase === 'DEAL_HOLE' || step.phase === 'FLIP_HOLE') {
      sound.playCardDeal();
    }
    if (step.phase === 'AWARD') {
      setAwardFlightSequence(step.sequence);
      const timeout = setTimeout(() => setAwardFlightSequence(null), 300);
      return () => clearTimeout(timeout);
    }
  }, [roomView.presentation?.sequence]);

  useEffect(() => {
    const action = roomView.lastAction;
    if (!action) return;
    if (playedActionRef.current === action.sequence) return;
    playedActionRef.current = action.sequence;
    if (action.amount > 0) {
      sound.playChipSound();
      setActionFlightSequence(action.sequence);
      const timeout = setTimeout(() => setActionFlightSequence(null), 300);
      return () => clearTimeout(timeout);
    }
  }, [roomView.lastAction?.sequence]);

  useEffect(() => {
    if (previousStatusRef.current !== 'SUMMARY' && roomView.status === 'SUMMARY') {
      if (!isShowdownActive) {
        sound.playWinFanfare();
      }
    }
    previousStatusRef.current = roomView.status;
  }, [roomView.status, isShowdownActive]);

  const shouldAnimateCard = (phase: 'DEAL_HOLE' | 'DEAL_UP' | 'FLIP_HOLE', playerId: string) =>
    mountedRef.current && roomView.presentation?.phase === phase && roomView.presentation.playerId === playerId;

  // Format street name
  const getStreetLabel = () => {
    switch (roomView.street) {
      case 'ROUND_1':
        return '第 1 轮 · 1暗1明';
      case 'ROUND_2':
        return '第 2 轮 · 2张明牌';
      case 'ROUND_3':
        return '第 3 轮 · 3张明牌';
      case 'ROUND_4':
        return '第 4 轮 · 4张明牌';
      case 'SHOWDOWN':
        return '摊牌比大小';
      case 'HAND_ENDED':
        return '对局结束';
      default:
        return '等待开局';
    }
  };

  // Calculate my current best hand text
  const getMyHandEvaluationText = () => {
    if (!me || !me.holeCard || 'isHidden' in me.holeCard) return '';
    const allCards = [me.holeCard, ...me.upcards];
    if (allCards.length === 5) {
      const res = evaluateShowdownHand(allCards);
      return `${isShowingHands ? '最终牌型' : '当前牌型'}：${res.rankName}`;
    }
    if (me.upcards.length > 0) {
      const res = evaluateVisibleHand(me.upcards);
      return `明牌牌面：${res.rankName}`;
    }
    return '';
  };

  return (
    <div
      className="table-page relative min-h-screen bg-slate-950 flex flex-col justify-between overflow-x-hidden p-2 sm:p-4 text-slate-100"
      data-has-footer={isMyTurn || roomView.status === 'WAITING' || roomView.status === 'SUMMARY'}
    >
      {/* Top Header */}
      <header className="table-header flex items-center justify-between max-w-6xl w-full mx-auto px-2 py-1.5 bg-slate-900/80 border border-slate-800 rounded-xl backdrop-blur-sm z-30">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="room-code flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg">
            <span className="text-[11px] text-slate-400">房间</span>
            <span className="font-mono font-bold text-amber-400 text-xs sm:text-sm tracking-wider">
              {roomView.roomId}
            </span>
            <button
              onClick={handleCopyLink}
              className="p-1 hover:text-amber-300 text-slate-400 transition"
              title="复制房间码"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
            <span>底注: <strong className="text-amber-400">${roomView.ante}</strong></span>
            {roomView.status === 'PLAYING' && (
              <span>封顶: <strong className="text-amber-400">${roomView.effectiveCap}</strong></span>
            )}
          </div>
        </div>

        {/* Center Street Badge */}
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold text-amber-300">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{getStreetLabel()}</span>
        </div>

        {/* Right Tools */}
        <div className="table-header-tools flex items-center gap-1 sm:gap-2">
          <FullscreenButton />
          <button
            type="button"
            className="table-menu-toggle rounded-lg bg-slate-800 p-1.5 text-slate-200"
            aria-label={isMenuOpen ? '关闭牌桌菜单' : '打开牌桌菜单'}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          <div className={`table-utilities flex items-center gap-1 sm:gap-2 ${isMenuOpen ? 'is-open' : ''}`}>
            <button
              onClick={() => { setIsRulesOpen(true); setIsMenuOpen(false); }}
              className="p-1.5 sm:px-2 sm:py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span className="table-utility-label hidden sm:inline">规则</span>
            </button>
            <button
              onClick={() => { handleToggleSound(); setIsMenuOpen(false); }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
              aria-label="切换音效"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              <span className="table-utility-label hidden">音效</span>
            </button>
            <button
              onClick={() => { setIsMenuOpen(false); onLeaveRoom(); }}
              className="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/60 text-rose-300 rounded-lg transition"
              title="退出房间"
              aria-label="退出房间"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="table-utility-label hidden">退出房间</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Poker Table Area */}
      <main className="table-main relative flex-1 flex flex-col justify-center items-center my-2 max-w-5xl w-full mx-auto">
        {/* Felt Table Board */}
        <div className="felt-table relative w-full min-h-[62vh] sm:min-h-[68vh] rounded-[40px] sm:rounded-[60px] bg-gradient-to-b from-emerald-950 via-felt-dark to-emerald-950 border-[10px] sm:border-[16px] border-[#382212] shadow-[inset_0_0_80px_rgba(0,0,0,0.8),0_12px_36px_rgba(0,0,0,0.8)] flex flex-col justify-between p-3 sm:p-6 overflow-hidden">
          {/* Inner Table Felt Border Line */}
          <div className="absolute inset-2 sm:inset-3 rounded-[30px] sm:rounded-[48px] border-2 border-emerald-600/20 pointer-events-none" />

          {/* Opponents Section (Arc layout at top) */}
          <div data-opponent-count={opponents.length} className={`opponents-row relative z-10 w-full items-start gap-2 transition-all duration-500 ${isShowdownActive ? 'opacity-20 pointer-events-none filter blur-[0.5px]' : ''} ${isCrowdedTable ? 'grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-around' : 'flex flex-wrap justify-around'}`}>
            {opponents.map((player, index) => {
              const isTurn = roomView.activePlayerId === player.id && roomView.status === 'PLAYING';
              const isInitiative = roomView.initiativePlayerId === player.id && roomView.status === 'PLAYING';
              const rankName = revealedHandRank(player);

              return (
                <div
                  key={player.id}
                  data-seat-id={player.id}
                  data-seat-position={opponentSeatSlots[opponents.length]?.[index]}
                  className={`opponent-seat flex min-w-0 flex-col items-center ${isCrowdedTable ? 'p-0.5 sm:p-2' : 'p-2'} rounded-2xl transition duration-300 ${
                    isTurn ? 'ring-2 ring-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20 scale-105' : 'bg-slate-900/60'
                  } ${player.isFolded ? 'opacity-40 grayscale' : ''}`}
                >
                  {/* Player Info Badge */}
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1">
                    {player.isBot ? (
                      <Bot className="w-3.5 h-3.5 text-blue-400" />
                    ) : (
                      <User className="w-3.5 h-3.5 text-slate-300" />
                    )}
                    <span className="max-w-[70px] sm:max-w-[90px] truncate">{player.name}</span>
                    {player.id === roomView.hostId && (
                      <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />
                    )}
                    {isHost && player.isBot && roomView.status === 'WAITING' && (
                      <button
                        onClick={() => onRemoveBot(player.id)}
                        className="text-[10px] text-rose-400 hover:text-rose-200 ml-1"
                      >
                        移除
                      </button>
                    )}
                  </div>

                  {/* Chips & Current Bet */}
                  <div className="flex items-center gap-2 text-[11px] mb-1.5">
                    <span className="text-amber-400 font-bold">${player.chips}</span>
                    {player.currentStreetBet > 0 && (
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/40 px-1.5 py-0.2 rounded font-mono">
                        注 ${player.currentStreetBet}
                      </span>
                    )}
                  </div>

                  {/* Cards Display */}
                  <div className={`opponent-cards flex items-center ${isCrowdedTable ? 'gap-0.5 sm:gap-1' : 'gap-1'} folded-cards ${player.isFolded ? 'is-folded' : ''}`} aria-hidden={player.isFolded}>
                    {player.holeCard && (
                      <DealtCard
                        card={player.holeCard}
                        size={isCrowdedTable ? 'xs' : 'sm'}
                        isHole
                        deckRef={deckRef}
                        animateDeal={shouldAnimateCard('DEAL_HOLE', player.id)}
                        animateFlip={shouldAnimateCard('FLIP_HOLE', player.id)}
                        sequence={roomView.presentation?.sequence}
                      />
                    )}
                    {player.upcards.map((card, idx) => (
                      <DealtCard
                        key={card.id || idx}
                        card={card}
                        size={isCrowdedTable ? 'xs' : 'sm'}
                        deckRef={deckRef}
                        animateDeal={shouldAnimateCard('DEAL_UP', player.id) && idx === player.upcards.length - 1}
                        animateFlip={false}
                        sequence={roomView.presentation?.sequence}
                      />
                    ))}
                  </div>

                  {rankName && (
                    <div className="opponent-rank mt-1 rounded-full border border-amber-500/40 bg-slate-950/90 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                      {rankName}
                    </div>
                  )}

                  {/* Status Indicator */}
                  <div className="mt-1 flex items-center gap-1">
                    {player.isFolded && (
                      <span className="text-[10px] bg-rose-950 text-rose-300 px-1.5 py-0.5 rounded font-bold">
                        弃牌
                      </span>
                    )}
                    {player.isAllIn && (
                        <span className="text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded font-black">
                        梭哈!
                      </span>
                    )}
                    {isInitiative && !player.isFolded && (
                      <span className="text-[10px] bg-blue-900 text-blue-200 px-1.5 py-0.5 rounded font-bold">
                        话事
                      </span>
                    )}
                    {roomView.status === 'WAITING' && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          player.isReady ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {player.isReady ? '已准备' : '未准备'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center Table: Showdown Stage or Pot & Status Announcement */}
          <div className="pot-area relative z-20 flex flex-col items-center justify-center my-auto w-full">
            {isShowdownActive ? (
              <ShowdownStage
                players={roomView.players}
                winners={roomView.winners}
                pot={roomView.pot}
                phase={roomView.presentation?.phase}
                isSummary={roomView.status === 'SUMMARY'}
                myPlayerId={myPlayerId}
              />
            ) : (
              <div className="relative">
                <div ref={deckRef} aria-hidden="true" className="absolute right-full mr-3 top-1/2 -translate-y-1/2 w-9 h-12 rounded-md border border-indigo-300/50 bg-indigo-950 shadow-lg grid place-items-center text-indigo-300 text-xl">
                  ♠
                </div>
                {/* Pot Box */}
                <div data-pot className="flex items-center gap-2 bg-slate-950/80 border border-amber-500/40 px-4 py-2 rounded-2xl shadow-xl backdrop-blur-md transition-all duration-300">
                  <Coins className="w-5 h-5 text-amber-400" />
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">底池 Pot</span>
                    <span className="text-xl sm:text-2xl font-black text-amber-300 leading-none">
                      ${roomView.pot}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {!isShowdownActive && (roomView.status === 'DEALING' || roomView.status === 'REVEALING') && (
              <div className="mt-3 rounded-full bg-slate-950/85 px-3 py-1 text-xs font-semibold tracking-wide text-amber-200" aria-live="polite">
                {roomView.status === 'DEALING'
                  ? '正在发牌'
                  : roomView.presentation?.phase === 'DEAL_UP'
                    ? '逐张跑牌'
                    : roomView.presentation?.phase === 'FLIP_HOLE'
                      ? '正在摊牌'
                      : roomView.presentation?.phase === 'COMPARE'
                        ? '比牌中 · 查看每位玩家的手牌与牌型'
                      : '本局揭晓'}
              </div>
            )}

            {/* Turn Countdown Bar */}
            {roomView.status === 'PLAYING' && timeLeft > 0 && (
              <div className="mt-3 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 px-3 py-1 rounded-full text-xs font-semibold">
                <Clock className={`w-3.5 h-3.5 ${timeLeft <= 5 ? 'text-rose-400' : 'text-amber-400'}`} />
                <span className={timeLeft <= 5 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                  {isMyTurn ? '你的行动回合' : '等待玩家思考'}: {timeLeft}秒
                </span>
              </div>
            )}
          </div>

          {/* My Player Cockpit at Bottom of Table */}
          {me && (
            <div className={`player-cockpit relative z-10 w-full flex flex-col items-center transition-all duration-500 ${isShowdownActive ? 'opacity-20 pointer-events-none filter blur-[0.5px]' : ''}`}>
              <div
                data-seat-id={me.id}
                className={`player-seat w-full max-w-lg p-2.5 sm:p-3 rounded-2xl flex flex-col items-center transition ${
                  isMyTurn
                    ? 'ring-2 ring-amber-400 bg-amber-500/10 shadow-xl shadow-amber-500/20'
                    : 'bg-slate-900/80 backdrop-blur-sm'
                }`}
              >
                {/* My Header Info */}
                <div className="w-full flex items-center justify-between text-xs font-semibold mb-2 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-100">{me.name} (我)</span>
                    {me.id === roomView.hostId && (
                      <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    )}
                    {me.isFolded && (
                      <span className="text-[10px] bg-rose-900 text-rose-200 px-1 rounded font-bold">已弃牌</span>
                    )}
                    {me.isAllIn && (
                      <span className="text-[10px] bg-amber-500 text-slate-950 px-1 rounded font-black">梭哈!</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-sm sm:text-base">${me.chips}</span>
                    {me.currentStreetBet > 0 && (
                      <span className="bg-emerald-950 text-emerald-300 border border-emerald-600/40 px-2 py-0.5 rounded text-xs font-mono font-bold">
                        本轮下注 ${me.currentStreetBet}
                      </span>
                    )}
                  </div>
                </div>

                {/* My Hand Cards */}
                <div className={`player-cards flex items-center gap-2 sm:gap-3 py-1 folded-cards ${me.isFolded ? 'is-folded' : ''}`} aria-hidden={me.isFolded}>
                  {/* Hole Card (peekable!) */}
                  {me.holeCard && (
                    <DealtCard
                      card={me.holeCard}
                      size="md"
                      isHole
                      canPeek={!('isHidden' in me.holeCard)}
                      deckRef={deckRef}
                      animateDeal={shouldAnimateCard('DEAL_HOLE', me.id)}
                      animateFlip={false}
                      sequence={roomView.presentation?.sequence}
                    />
                  )}
                  {/* Upcards */}
                  {me.upcards.map((card, idx) => (
                    <DealtCard
                      key={card.id || idx}
                      card={card}
                      size="md"
                      deckRef={deckRef}
                      animateDeal={shouldAnimateCard('DEAL_UP', me.id) && idx === me.upcards.length - 1}
                      animateFlip={false}
                      sequence={roomView.presentation?.sequence}
                    />
                  ))}
                </div>

                {/* Hand Evaluation Display */}
                {!me.isFolded && getMyHandEvaluationText() && (
                  <div className="hand-evaluation mt-1 text-xs text-amber-300 font-semibold tracking-wide">
                    {getMyHandEvaluationText()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Action Area / Controls */}
      <footer className="table-footer relative z-30 max-w-xl w-full mx-auto mt-2">
        {/* If Active Playing Turn for ME */}
        {isMyTurn && roomView.actionOptions && (
          <ActionControls
            options={roomView.actionOptions}
            pot={roomView.pot}
            onAction={onAction}
          />
        )}

        {/* If In WAITING State */}
        {roomView.status === 'WAITING' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>房间人数: {roomView.players.length} / 6 (满 2 人可开局)</span>
              {me && me.chips < roomView.ante && (
                <button
                  onClick={onResetChips}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>补充筹码</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* Ready Button */}
              {me && (
                <button
                  onClick={() => onToggleReady(!me.isReady)}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition shadow-lg ${
                    me.isReady
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                  }`}
                >
                  {me.isReady ? '已准备 (取消)' : '点击准备'}
                </button>
              )}

              {/* Host: Add Bot */}
              {isHost && (
                <button
                  onClick={onAddBot}
                  disabled={roomView.players.length >= 6}
                  className="py-2.5 px-3 bg-indigo-900/80 hover:bg-indigo-800 disabled:opacity-40 text-indigo-100 border border-indigo-600/40 rounded-xl font-bold text-xs sm:text-sm transition flex items-center justify-center gap-1"
                >
                  <Bot className="w-4 h-4" />
                  <span>添加电脑</span>
                </button>
              )}

              {/* Host: Start Game */}
              {isHost && (
                <button
                  onClick={onStartGame}
                  disabled={roomView.players.length < 2 || !roomView.players.every((p) => p.isReady)}
                  className="col-span-2 sm:col-span-1 py-2.5 px-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition flex items-center justify-center gap-1 shadow-lg shadow-amber-950"
                >
                  <span>立即开局</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* If In SUMMARY State */}
        {roomView.status === 'SUMMARY' && (
          <div className="summary-panel bg-slate-900/95 border border-amber-500/40 rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-3 backdrop-blur-md summary-enter">
            <div className="flex items-center gap-2 text-amber-400 font-extrabold text-base">
              <Trophy className="w-5 h-5 text-amber-400 fill-amber-400" />
              <span>本局结算</span>
            </div>

            {/* Winners List */}
            <div className="summary-winners w-full flex flex-col gap-1.5 text-xs text-center">
              {roomView.winners?.map((w, idx) => {
                const winnerPlayer = roomView.players.find((p) => p.id === w.playerId);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800"
                  >
                    <span className="font-bold text-slate-200">
                      {winnerPlayer?.name ?? roomView.winnerNames?.[w.playerId] ?? '获胜者'}
                    </span>
                    {w.evaluation && (
                      <span className="text-amber-400 font-semibold">{w.evaluation.rankName}</span>
                    )}
                    <span className="text-emerald-400 font-black">+${w.amount}</span>
                  </div>
                );
              })}
            </div>

            {/* Ready for next hand button */}
            <button
              onClick={() => onToggleReady(true)}
              className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-slate-950 font-black rounded-xl text-sm transition shadow-lg shadow-amber-950"
            >
              准备下一局
            </button>
          </div>
        )}
      </footer>

      {roomView.lastAction && roomView.lastAction.amount > 0 && actionFlightSequence === roomView.lastAction.sequence && (
        <ChipFlight
          key={`action-${roomView.lastAction.sequence}`}
          playerId={roomView.lastAction.playerId}
          towardPot
          sequence={roomView.lastAction.sequence}
        />
      )}
      {roomView.presentation?.phase === 'AWARD' && awardFlightSequence === roomView.presentation.sequence && roomView.winners?.map((winner) => (
        <ChipFlight
          key={`award-${roomView.presentation?.sequence}-${winner.playerId}`}
          playerId={winner.playerId}
          towardPot={false}
          sequence={roomView.presentation!.sequence}
        />
      ))}

      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
    </div>
  );
};
