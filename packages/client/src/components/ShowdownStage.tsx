import React, { useState, useEffect, useRef } from 'react';
import { CardView } from './CardView.js';
import { RoomViewPlayer } from '../../../server/src/room.js';
import {
  PotWinner,
  evaluateShowdownHand,
  compareShowdownHands,
  Card,
} from '@soha/core';
import { sound } from '../utils/audio.js';
import { Crown, Swords, User, Bot, Coins } from 'lucide-react';

interface ShowdownStageProps {
  players: RoomViewPlayer[];
  winners?: PotWinner[];
  pot: number;
  phase?: string;
  isSummary: boolean;
  myPlayerId: string;
  winnerNames?: Record<string, string>;
}

type AnimationStage = 'fly-in' | 'reveal' | 'crowned';

export const ShowdownStage: React.FC<ShowdownStageProps> = ({
  players,
  winners,
  pot,
  phase,
  isSummary,
  myPlayerId,
  winnerNames,
}) => {
  // Only evaluate players who reached showdown: non-folded, have holeCard visible, and 4 upcards
  const showdownParticipants = players.filter(
    (p) =>
      !p.isFolded &&
      p.holeCard &&
      !('isHidden' in p.holeCard) &&
      p.upcards.length === 4
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
      const cmp = compareShowdownHands(
        evaluatedParticipants[i].allCards,
        bestHand.allCards
      );
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
  const soundPlayedRef = useRef<{
    clash: boolean;
    stamp: boolean;
    fanfare: boolean;
  }>({
    clash: false,
    stamp: false,
    fanfare: false,
  });

  useEffect(() => {
    if (isSummary || phase === 'AWARD') {
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

  const ordered = [...evaluatedParticipants].sort((a, b) => {
    const aWin = winnerPlayerIds.has(a.player.id) ? 1 : 0;
    const bWin = winnerPlayerIds.has(b.player.id) ? 1 : 0;
    return bWin - aWin || compareShowdownHands(b.allCards, a.allCards);
  });
  const isCrowned = animStage === 'crowned';
  const winnerLabel =
    winnerPlayerIds.size > 1
      ? `${winnerPlayerIds.size} 人平分底池`
      : `${
          players.find((p) => winnerPlayerIds.has(p.id))?.name ??
          Object.entries(winnerNames ?? {}).find(([id]) =>
            winnerPlayerIds.has(id)
          )?.[1] ??
          '获胜者'
        } 胜出`;
  const awardedAmount = winners?.reduce(
    (total, winner) => total + winner.amount,
    0
  );

  return (
    <section
      data-showdown-stage
      className="showdown-stage"
      aria-label="摊牌比大小"
    >
      <header className="result-heading">
        <div>
          <h1 className="result-title">
            {isCrowned ? '本局胜负' : '摊牌比大小'}
          </h1>
          <p className="result-subtitle">
            <Swords aria-hidden="true" />
            {ordered.length} 人摊牌 · 按牌型比较
          </p>
        </div>
        <div data-pot className="result-pot">
          <Coins aria-hidden="true" />
          <span>本局底池</span>
          <strong>${pot}</strong>
        </div>
      </header>
      <div className="result-banner" aria-live="polite">
        <span>
          <Crown aria-hidden="true" />
          {isCrowned ? winnerLabel : '终极对决 · 比牌中'}
        </span>
        {awardedAmount !== undefined && <strong>+${awardedAmount}</strong>}
      </div>
      <div className="showdown-hands" data-participant-count={ordered.length}>
        {ordered.map(({ player, evaluation }) => {
          const isWinner = winnerPlayerIds.has(player.id) && isCrowned;
          const award = winners?.find(
            (winner) => winner.playerId === player.id
          );
          return (
            <article
              key={player.id}
              data-seat-id={player.id}
              className={`showdown-hand ${isWinner ? 'is-winner' : ''}`}
            >
              <div className="showdown-player">
                <div className="showdown-name">
                  {player.isBot ? (
                    <Bot aria-hidden="true" />
                  ) : (
                    <User aria-hidden="true" />
                  )}
                  <span title={player.name}>
                    {player.name}
                    {player.id === myPlayerId && ' (我)'}
                  </span>
                </div>
                <div className="showdown-rank">
                  {animStage === 'fly-in' ? '比牌中…' : evaluation.rankName}
                </div>
                {isCrowned && (
                  <div className="showdown-outcome">
                    {isWinner
                      ? award
                        ? `胜出 +$${award.amount}`
                        : '胜出'
                      : '惜败'}
                  </div>
                )}
              </div>
              <div
                className={`showdown-cards ${animStage === 'fly-in' ? 'is-entering' : ''}`}
              >
                {evaluation.orderedCards.map((card) => {
                  const isScoring =
                    animStage !== 'fly-in' &&
                    evaluation.scoringCardIds.includes(card.id);
                  return (
                    <CardView
                      key={card.id}
                      card={card}
                      size="xs"
                      isHole={card.id === (player.holeCard as Card)?.id}
                      highlight={isScoring}
                      elevated={isScoring}
                      dimmed={animStage !== 'fly-in' && !isScoring}
                    />
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
