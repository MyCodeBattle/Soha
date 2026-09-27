import React, { useState, useEffect, useRef } from 'react';
import { CardView } from './CardView.js';
import { RoomViewPlayer } from '../../../server/src/room.js';
import { PotWinner, evaluateShowdownHand, compareShowdownHands, Card } from '@soha/core';
import { sound } from '../utils/audio.js';
import { Crown, Swords, Trophy, User, Bot, Sparkles, Coins } from 'lucide-react';

interface ShowdownStageProps {
  players: RoomViewPlayer[];
  winners?: PotWinner[];
  pot: number;
  phase?: string;
  isSummary: boolean;
  myPlayerId: string;
}

type AnimationStage = 'fly-in' | 'reveal' | 'crowned';

export const ShowdownStage: React.FC<ShowdownStageProps> = ({
  players,
  winners,
  pot,
  phase,
  isSummary,
  myPlayerId,
}) => {
  // Only evaluate players who reached showdown: non-folded, have holeCard visible, and 4 upcards
  const showdownParticipants = players.filter(
    (p) => !p.isFolded && p.holeCard && !('isHidden' in p.holeCard) && p.upcards.length === 4
  );

  // Pre-calculate evaluation for each participant
  const evaluatedParticipants = showdownParticipants.map((p) => {
    const allCards = [p.holeCard as Card, ...p.upcards];
    const evaluation = evaluateShowdownHand(allCards);
    return {
      player: p,
      allCards,
      evaluation,
    };
  });

  // Calculate winner IDs either from server winners or by comparing hands locally
  const winnerPlayerIds = new Set<string>();
  if (winners && winners.length > 0) {
    winners.forEach((w) => winnerPlayerIds.add(w.playerId));
  } else if (evaluatedParticipants.length > 0) {
    // Determine highest hand(s)
    let bestHand = evaluatedParticipants[0];
    const bests = [bestHand];
    for (let i = 1; i < evaluatedParticipants.length; i++) {
      const cmp = compareShowdownHands(evaluatedParticipants[i].allCards, bestHand.allCards);
      if (cmp > 0) {
        bestHand = evaluatedParticipants[i];
        bests.length = 0;
        bests.push(bestHand);
      } else if (cmp === 0) {
        bests.push(evaluatedParticipants[i]);
      }
    }
    bests.forEach((b) => winnerPlayerIds.add(b.player.id));
  }

  // Animation timeline state
  const [animStage, setAnimStage] = useState<AnimationStage>(
    isSummary ? 'crowned' : 'fly-in'
  );
  const soundPlayedRef = useRef<{ clash: boolean; stamp: boolean; fanfare: boolean }>({
    clash: false,
    stamp: false,
    fanfare: false,
  });

  useEffect(() => {
    if (isSummary) {
      setAnimStage('crowned');
      return;
    }

    if (phase === 'COMPARE') {
      setAnimStage('fly-in');
      if (!soundPlayedRef.current.clash) {
        sound.playShowdownClash();
        soundPlayedRef.current.clash = true;
      }

      const t1 = setTimeout(() => {
        setAnimStage('reveal');
        if (!soundPlayedRef.current.stamp) {
          sound.playStampRank();
          soundPlayedRef.current.stamp = true;
        }
      }, 700);

      const t2 = setTimeout(() => {
        setAnimStage('crowned');
        if (!soundPlayedRef.current.fanfare) {
          sound.playWinFanfare();
          soundPlayedRef.current.fanfare = true;
        }
      }, 2500);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [phase, isSummary]);

  if (evaluatedParticipants.length < 2) {
    return null;
  }

  const isDuel = evaluatedParticipants.length === 2;

  // For 2-player duel, sort so that opponent is on top/left and me is on bottom/right if applicable
  const duelOrdered = isDuel
    ? [...evaluatedParticipants].sort((a, b) => {
        if (a.player.id === myPlayerId) return 1;
        if (b.player.id === myPlayerId) return -1;
        return 0;
      })
    : evaluatedParticipants;

  const multiwayOrdered = [...evaluatedParticipants].sort((a, b) => {
    const aWin = winnerPlayerIds.has(a.player.id) ? 1 : 0;
    const bWin = winnerPlayerIds.has(b.player.id) ? 1 : 0;
    if (aWin !== bWin) return bWin - aWin;
    return compareShowdownHands(b.allCards, a.allCards);
  });

  return (
    <div
      data-showdown-stage
      className="relative z-30 w-full max-w-4xl mx-auto flex flex-col items-center justify-center p-2 sm:p-4 my-1 transition-all duration-500 animate-in fade-in zoom-in-95"
    >
      {/* Showdown Stage Outer Shield */}
      <div className="w-full bg-slate-950/90 border-2 border-amber-500/50 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-[0_0_50px_rgba(0,0,0,0.9),0_0_30px_rgba(245,158,11,0.2)] backdrop-blur-md flex flex-col items-center">
        {/* Top Header Banner with Embedded Contested Pot */}
        <div className="w-full flex items-center justify-between mb-3 px-1 sm:px-2">
          <div className="flex items-center gap-1.5 text-amber-400">
            <Swords className="w-4 h-4 animate-pulse" />
            <span className="text-xs sm:text-sm font-black tracking-widest text-amber-300 uppercase">
              {animStage === 'crowned' ? '比牌胜负揭晓' : '终极对决 · 摊牌比大小'}
            </span>
          </div>

          {/* Embedded Pot Box with data-pot for chip flight */}
          <div
            data-pot
            className="flex items-center gap-1.5 bg-slate-900/90 border border-amber-500/50 px-3 py-1 rounded-full shadow-lg"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[10px] text-slate-400 font-semibold uppercase">底池</span>
            <span className="text-sm sm:text-base font-black text-amber-300 leading-none">
              ${pot}
            </span>
          </div>
        </div>

        {/* 1v1 Duel Layout */}
        {isDuel ? (
          <div className="w-full flex flex-col sm:flex-row items-center justify-around gap-3 sm:gap-4 relative">
            {duelOrdered.map((item, idx) => {
              const isWinner = winnerPlayerIds.has(item.player.id);
              const isCrowned = animStage === 'crowned';
              const isMe = item.player.id === myPlayerId;
              const { player, evaluation } = item;

              return (
                <React.Fragment key={player.id}>
                  {/* Player Card Container */}
                  <div
                    className={`flex-1 w-full max-w-sm flex flex-col items-center p-3 rounded-2xl border transition-all duration-500 ${
                      isCrowned && isWinner
                        ? 'bg-amber-950/40 border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.35)] scale-105 z-10'
                        : isCrowned && !isWinner
                          ? 'bg-slate-900/60 border-slate-800 opacity-65 scale-95'
                          : 'bg-slate-900/80 border-slate-700 shadow-xl'
                    }`}
                  >
                    {/* Player Info Bar */}
                    <div className="w-full flex items-center justify-between text-xs font-bold mb-2 px-1">
                      <div className="flex items-center gap-1.5">
                        {player.isBot ? (
                          <Bot className="w-4 h-4 text-blue-400" />
                        ) : (
                          <User className="w-4 h-4 text-slate-300" />
                        )}
                        <span className="truncate max-w-[100px] text-slate-100">
                          {player.name} {isMe && '(我)'}
                        </span>
                      </div>

                      {/* Winner Crown / Badge */}
                      {isCrowned && isWinner && (
                        <div className="flex items-center gap-1 bg-amber-500 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded-full shadow-md animate-bounce">
                          <Crown className="w-3.5 h-3.5 fill-slate-950" />
                          <span>胜出 WIN</span>
                        </div>
                      )}
                      {isCrowned && !isWinner && (
                        <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                          惜败
                        </span>
                      )}
                    </div>

                    {/* 5 Cards Hand Row */}
                    <div
                      className={`flex items-center gap-1 sm:gap-2 my-1 transition-transform duration-300 ${
                        animStage === 'fly-in' ? 'scale-90 opacity-60' : 'scale-100 opacity-100'
                      }`}
                    >
                      {evaluation.orderedCards.map((c) => {
                        const isScoring = evaluation.scoringCardIds.includes(c.id);
                        const isRevealOrLater = animStage !== 'fly-in';
                        return (
                          <CardView
                            key={c.id}
                            card={c}
                            size="md"
                            isHole={c.id === (player.holeCard as Card)?.id}
                            highlight={isRevealOrLater && isScoring}
                            elevated={isRevealOrLater && isScoring}
                            dimmed={isRevealOrLater && !isScoring}
                          />
                        );
                      })}
                    </div>

                    {/* Rank Name Badge */}
                    <div className="mt-2 min-h-[28px] flex items-center justify-center">
                      {animStage !== 'fly-in' ? (
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wider border shadow-md transition-all duration-300 animate-in zoom-in-75 ${
                            isWinner && isCrowned
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 border-amber-300 shadow-amber-500/40 scale-110'
                              : 'bg-slate-950 text-amber-300 border-amber-500/40'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isWinner && isCrowned && <Sparkles className="w-3.5 h-3.5" />}
                            <span>{evaluation.rankName}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 font-semibold animate-pulse">
                          正在计算牌型...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* VS Badge between the two players */}
                  {idx === 0 && (
                    <div className="my-1 sm:my-0 flex items-center justify-center">
                      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-amber-500 via-rose-600 to-amber-700 flex items-center justify-center font-black text-slate-950 text-xs sm:text-sm shadow-[0_0_20px_rgba(244,63,94,0.6)] border-2 border-amber-200 select-none animate-pulse">
                        VS
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          /* Multi-way (3~6 players) Showdown Layout */
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3 max-h-[50vh] overflow-y-auto px-1 py-1">
            {multiwayOrdered.map((item) => {
              const isWinner = winnerPlayerIds.has(item.player.id);
              const isCrowned = animStage === 'crowned';
              const isMe = item.player.id === myPlayerId;
              const { player, evaluation } = item;

              return (
                <div
                  key={player.id}
                  className={`flex flex-col p-2 sm:p-2.5 rounded-xl border transition-all duration-500 ${
                    isCrowned && isWinner
                      ? 'bg-amber-950/50 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)] scale-[1.02] z-10'
                      : isCrowned && !isWinner
                        ? 'bg-slate-900/60 border-slate-800 opacity-65'
                        : 'bg-slate-900/80 border-slate-700'
                  }`}
                >
                  {/* Player header */}
                  <div className="w-full flex items-center justify-between text-xs font-bold mb-1.5 px-0.5">
                    <div className="flex items-center gap-1.5">
                      {player.isBot ? (
                        <Bot className="w-3.5 h-3.5 text-blue-400" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span className="truncate max-w-[90px] text-slate-100">
                        {player.name} {isMe && '(我)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {animStage !== 'fly-in' && (
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isWinner && isCrowned
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {evaluation.rankName}
                        </span>
                      )}
                      {isCrowned && isWinner && (
                        <Crown className="w-4 h-4 text-amber-400 fill-amber-400 animate-bounce" />
                      )}
                    </div>
                  </div>

                  {/* 5 Cards Row */}
                  <div className="flex items-center gap-1 justify-center py-0.5">
                    {evaluation.orderedCards.map((c) => {
                      const isScoring = evaluation.scoringCardIds.includes(c.id);
                      const isRevealOrLater = animStage !== 'fly-in';
                      return (
                        <CardView
                          key={c.id}
                          card={c}
                          size="xs"
                          isHole={c.id === (player.holeCard as Card)?.id}
                          highlight={isRevealOrLater && isScoring}
                          elevated={isRevealOrLater && isScoring}
                          dimmed={isRevealOrLater && !isScoring}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
