import React, { useState } from 'react';
import { Card, Rank, Suit } from '@soha/core';

interface CardViewProps {
  card?: Card | { isHidden: true };
  size?: 'sm' | 'md' | 'lg';
  isHole?: boolean;
  canPeek?: boolean;
  className?: string;
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
}) => {
  const [isPeeking, setIsPeeking] = useState(false);

  // Size configurations
  const sizeClasses = {
    sm: 'w-10 h-14 text-xs rounded-md',
    md: 'w-14 h-20 text-sm rounded-lg',
    lg: 'w-20 h-28 text-base rounded-xl',
  }[size];

  if (!card) {
    // Empty card slot placeholder
    return (
      <div
        className={`${sizeClasses} border-2 border-dashed border-emerald-900/60 bg-emerald-950/20 flex items-center justify-center ${className}`}
      />
    );
  }

  const isHidden = 'isHidden' in card;

  // Face down card (opponent's hole card)
  if (isHidden) {
    return (
      <div
        className={`${sizeClasses} relative bg-gradient-to-br from-blue-900 via-indigo-950 to-blue-950 border border-indigo-400/40 shadow-md flex items-center justify-center overflow-hidden ${className}`}
      >
        <div className="absolute inset-1 border border-indigo-300/30 rounded flex items-center justify-center bg-[radial-gradient(#4338ca_1px,transparent_1px)] [background-size:6px_6px]">
          <span className="text-indigo-300/60 font-serif font-black text-sm select-none">
            ♠
          </span>
        </div>
      </div>
    );
  }

  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const suitColor = SUIT_COLORS[card.suit];
  const rankStr = formatRank(card.rank);

  return (
    <div
      className={`relative select-none transition-transform duration-200 ${
        isPeeking ? '-translate-y-2 scale-105 shadow-xl ring-2 ring-gold' : 'shadow-md'
      } ${className}`}
      onMouseDown={() => canPeek && setIsPeeking(true)}
      onMouseUp={() => canPeek && setIsPeeking(false)}
      onMouseLeave={() => canPeek && setIsPeeking(false)}
      onTouchStart={() => canPeek && setIsPeeking(true)}
      onTouchEnd={() => canPeek && setIsPeeking(false)}
    >
      <div
        className={`${sizeClasses} relative bg-white border border-slate-300 shadow flex flex-col justify-between p-1 overflow-hidden font-semibold`}
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
          <div className="absolute top-0 right-0 bg-gold-dark text-[9px] text-slate-950 font-bold px-1 rounded-bl leading-none py-0.5">
            暗
          </div>
        )}
      </div>

      {canPeek && (
        <div className="absolute -bottom-4 left-0 right-0 text-center text-[10px] text-gold-light/80 pointer-events-none">
          {isPeeking ? '松开' : '长按偷瞄'}
        </div>
      )}
    </div>
  );
};
