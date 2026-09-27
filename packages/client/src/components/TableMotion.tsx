import React, { useLayoutEffect, useRef } from 'react';
import { Card } from '@soha/core';
import { CardView } from './CardView.js';

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

function reduceMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

interface DealtCardProps {
  card: Card | { isHidden: true };
  size: 'sm' | 'md';
  isHole?: boolean;
  canPeek?: boolean;
  deckRef: React.RefObject<HTMLDivElement>;
  animateDeal: boolean;
  animateFlip: boolean;
  sequence?: number;
}

export const DealtCard: React.FC<DealtCardProps> = ({
  card,
  size,
  isHole,
  canPeek,
  deckRef,
  animateDeal,
  animateFlip,
  sequence,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || (!animateDeal && !animateFlip)) return;
    const reduced = reduceMotion();
    let animation: Animation;
    if (animateDeal) {
      const source = deckRef.current?.getBoundingClientRect();
      const destination = element.getBoundingClientRect();
      if (!source) return;
      const dx = source.left + source.width / 2 - destination.left - destination.width / 2;
      const dy = source.top + source.height / 2 - destination.top - destination.height / 2;
      animation = element.animate(
        reduced
          ? [{ opacity: 0.35 }, { opacity: 1 }]
          : [
              { transform: `translate(${dx}px, ${dy}px) rotate(-7deg) scale(0.94)`, opacity: 0.8 },
              { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 },
            ],
        { duration: 220, easing: EASE_OUT }
      );
    } else {
      animation = element.animate(
        reduced
          ? [{ opacity: 0.35 }, { opacity: 1 }]
          : [{ transform: 'rotateY(-85deg)', opacity: 0.65 }, { transform: 'rotateY(0)', opacity: 1 }],
        { duration: 260, easing: EASE_OUT }
      );
    }
    return () => animation.cancel();
  }, [animateDeal, animateFlip, deckRef, sequence]);

  return (
    <div ref={ref} className="relative shrink-0" style={{ backfaceVisibility: 'hidden' }}>
      <CardView card={card} size={size} isHole={isHole} canPeek={canPeek} />
    </div>
  );
};

interface ChipFlightProps {
  playerId: string;
  towardPot: boolean;
  sequence: number;
}

export const ChipFlight: React.FC<ChipFlightProps> = ({ playerId, towardPot, sequence }) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const seat = [...document.querySelectorAll<HTMLElement>('[data-seat-id]')]
      .find((candidate) => candidate.dataset.seatId === playerId);
    const pot = document.querySelector<HTMLElement>('[data-pot]');
    if (!element || !seat || !pot) return;
    const from = (towardPot ? seat : pot).getBoundingClientRect();
    const to = (towardPot ? pot : seat).getBoundingClientRect();
    const startX = from.left + from.width / 2 - 10;
    const startY = from.top + from.height / 2 - 10;
    const dx = to.left + to.width / 2 - 10 - startX;
    const dy = to.top + to.height / 2 - 10 - startY;
    element.style.left = `${startX}px`;
    element.style.top = `${startY}px`;
    const animation = element.animate(
      reduceMotion()
        ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }]
        : [
            { transform: 'translate(0, 0) scale(1)', opacity: 0.95 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.95 },
          ],
      { duration: 220, easing: EASE_OUT }
    );
    animation.onfinish = () => { element.style.opacity = '0'; };
    return () => animation.cancel();
  }, [playerId, towardPot, sequence]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed z-50 h-5 w-5 rounded-full border-2 border-yellow-200 bg-amber-500 shadow-lg pointer-events-none opacity-0"
    />
  );
};
