import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Card, Rank, Suit } from '@soha/core';

interface CardViewProps {
  card?: Card | { isHidden: true };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isHole?: boolean;
  canPeek?: boolean;
  className?: string;
  highlight?: boolean;
  dimmed?: boolean;
  elevated?: boolean;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const SUIT_COLORS: Record<Suit, string> = {
  spades: 'text-slate-900',
  hearts: 'text-rose-600',
  diamonds: 'text-rose-600',
  clubs: 'text-slate-900',
};

function formatRank(rank: Rank): string {
  switch (rank) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    default:
      return rank.toString();
  }
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  size = 'md',
  isHole = false,
  canPeek = false,
  className = '',
  highlight = false,
  dimmed = false,
  elevated = false,
}) => {
  const [isPeeking, setIsPeeking] = useState(false);
  const [privacyHidden, setPrivacyHidden] = useState(false);
  const activePointer = useRef<{ id: number; element: HTMLDivElement } | null>(null);
  const actualCard = card && !('isHidden' in card) ? card : undefined;
  const cardIdentity = actualCard?.id;
  const isPeekable = isHole && canPeek && !!actualCard;

  const stopPeeking = useCallback(() => {
    const pointer = activePointer.current;
    activePointer.current = null;
    if (pointer?.element.hasPointerCapture(pointer.id)) {
      pointer.element.releasePointerCapture(pointer.id);
    }
    setIsPeeking(false);
  }, []);

  useLayoutEffect(() => {
    stopPeeking();
  }, [cardIdentity, isPeekable, stopPeeking]);

  useEffect(() => {
    if (!isPeekable) return;
    const handleVisibilityChange = () => {
      if (document.hidden) stopPeeking();
    };
    window.addEventListener('blur', stopPeeking);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', stopPeeking);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const pointer = activePointer.current;
      activePointer.current = null;
      if (pointer?.element.hasPointerCapture(pointer.id)) {
        pointer.element.releasePointerCapture(pointer.id);
      }
    };
  }, [isPeekable, stopPeeking]);

  const startPeeking = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPeekable || !event.isPrimary || event.button !== 0 || activePointer.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = { id: event.pointerId, element: event.currentTarget };
    setIsPeeking(true);
  };

  const finishPeeking = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activePointer.current?.id === event.pointerId) stopPeeking();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // A chorded mouse release emits pointermove until its final button is released.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) finishPeeking(event);
  };

  // Size configurations
  const sizeClasses = {
    xs: 'w-[clamp(22px,7vw,28px)] h-[clamp(32px,10vw,40px)] sm:w-10 sm:h-14 text-[10px] sm:text-xs rounded-md',
    sm: 'w-10 h-14 text-xs rounded-md',
    md: 'w-14 h-20 text-sm rounded-lg',
    lg: 'w-20 h-28 text-base rounded-xl',
  }[size];

  if (!card) {
    // Empty card slot placeholder
    return (
      <div
        className={`poker-card ${sizeClasses} border-2 border-dashed border-emerald-900/60 bg-emerald-950/20 flex items-center justify-center ${className}`}
      />
    );
  }

  const isHidden = 'isHidden' in card || (isHole && privacyHidden && !isPeeking);

  const suitSymbol = actualCard ? SUIT_SYMBOLS[actualCard.suit] : '';
  const suitColor = actualCard ? SUIT_COLORS[actualCard.suit] : '';
  const rankStr = actualCard ? formatRank(actualCard.rank) : '';

  return (
    <div
      className={`relative select-none transition-all duration-300 ${
        isPeeking
          ? '-translate-y-2 scale-105 shadow-xl ring-2 ring-gold'
          : elevated
            ? '-translate-y-2 sm:-translate-y-2.5 z-10'
            : 'shadow-md'
      } ${dimmed ? 'opacity-50 grayscale-[15%]' : ''} ${className}`}
    >
      <div
        data-peek-surface={isPeekable}
        onPointerDown={startPeeking}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPeeking}
        onPointerCancel={finishPeeking}
        onLostPointerCapture={finishPeeking}
      >
        {isHidden ? (
          <div className={`poker-card ${sizeClasses} relative bg-gradient-to-br from-blue-900 via-indigo-950 to-blue-950 border border-indigo-400/40 shadow-md flex items-center justify-center overflow-hidden ${isPeekable ? 'cursor-pointer' : ''}`}>
            <div className="absolute inset-1 border border-indigo-300/30 rounded flex flex-col items-center justify-center bg-[radial-gradient(#4338ca_1px,transparent_1px)] [background-size:6px_6px]">
              <span className="text-indigo-300/60 font-serif font-black text-sm">♠</span>
              {isPeekable && (
                <span className="text-[8px] text-amber-300 font-bold mt-1">按住偷瞄</span>
              )}
            </div>
          </div>
        ) : (
          <div
            data-card-face
            className={`poker-card ${sizeClasses} relative bg-white border border-slate-300 shadow flex flex-col justify-between p-1 overflow-hidden font-semibold transition-all duration-300 ${
              isHole ? 'hole-card-face' : ''
            } ${highlight ? 'ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.7)] border-amber-300' : ''}`}
          >
            {/* Top-left rank and suit */}
            <div className={`leading-none flex flex-col items-center ${suitColor}`}>
              <span className="font-bold tracking-tighter">{rankStr}</span>
              <span className="text-[10px] sm:text-xs leading-none">{suitSymbol}</span>
            </div>

            {/* Center watermark suit */}
            <div
              className={`absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none text-2xl sm:text-4xl ${suitColor}`}
            >
              {suitSymbol}
            </div>

            {/* Bottom-right inverted rank and suit */}
            <div className={`leading-none flex flex-col items-center rotate-180 ${suitColor}`}>
              <span className="font-bold tracking-tighter">{rankStr}</span>
              <span className="text-[10px] sm:text-xs leading-none">{suitSymbol}</span>
            </div>

            {/* Hole Card Indicator */}
            {isHole && (
              <div className="hole-card-indicator absolute top-0 right-0 bg-gold-dark text-[9px] text-slate-950 font-bold px-1 rounded-bl leading-none py-0.5">
                暗
              </div>
            )}
          </div>
        )}
      </div>

      {isPeekable && (
        <div className="flex items-center justify-center gap-1 mt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopPeeking();
              setPrivacyHidden((hidden) => !hidden);
            }}
            className="text-[9px] text-amber-300 hover:text-amber-200 bg-slate-900/80 px-1.5 py-0.5 rounded border border-amber-500/30"
          >
            {privacyHidden ? '显示底牌' : '隐藏底牌'}
          </button>
        </div>
      )}
    </div>
  );
};
