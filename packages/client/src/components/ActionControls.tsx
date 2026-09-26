import React, { useState, useEffect } from 'react';
import { PlayerActionOptions } from '../../../server/src/room.js';
import { PlayerAction } from '@soha/core';
import { Flame, Check, X, ArrowUpCircle } from 'lucide-react';
import { sound } from '../utils/audio.js';

interface ActionControlsProps {
  options: PlayerActionOptions;
  pot: number;
  onAction: (action: PlayerAction) => void;
}

export const ActionControls: React.FC<ActionControlsProps> = ({
  options,
  pot,
  onAction,
}) => {
  const isBetting = options.canBet;
  const isRaising = options.canRaise;
  const minAmount = isBetting ? options.minBet : options.minRaise;
  const maxAmount = isBetting ? options.maxBet : options.maxRaise;

  const [amount, setAmount] = useState<number>(minAmount || 10);

  useEffect(() => {
    if (minAmount && maxAmount) {
      setAmount(Math.min(maxAmount, Math.max(minAmount, minAmount)));
    }
  }, [minAmount, maxAmount]);

  const handleAction = (action: PlayerAction) => {
    if (action.type === 'FOLD') {
      // quiet fold
    } else {
      sound.playChipSound();
    }
    onAction(action);
  };

  const setPresetFraction = (fraction: number) => {
    const target = Math.round(pot * fraction);
    const clamped = Math.min(maxAmount, Math.max(minAmount, target));
    setAmount(clamped);
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-slate-900/95 border border-amber-500/30 backdrop-blur-md rounded-2xl p-3 sm:p-4 shadow-2xl flex flex-col gap-3">
      {/* Bet / Raise Slider if Bet or Raise is possible */}
      {(isBetting || isRaising) && minAmount < maxAmount && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs text-slate-300 font-medium px-1">
            <span>{isBetting ? '下注金额' : '加注至'}</span>
            <div className="flex items-center gap-1">
              <span className="text-amber-400 font-bold text-sm sm:text-base">${amount}</span>
              <span className="text-slate-400 text-xs">/ 最大 ${maxAmount}</span>
            </div>
          </div>

          <input
            type="range"
            min={minAmount}
            max={maxAmount}
            step={Math.max(1, Math.floor((maxAmount - minAmount) / 50))}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full accent-amber-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
          />

          {/* Quick presets */}
          <div className="grid grid-cols-4 gap-1.5 pt-1 text-xs">
            <button
              onClick={() => setAmount(minAmount)}
              className="py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition"
            >
              最小
            </button>
            <button
              onClick={() => setPresetFraction(0.5)}
              className="py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition"
            >
              1/2 底池
            </button>
            <button
              onClick={() => setPresetFraction(1.0)}
              className="py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition"
            >
              满底池
            </button>
            <button
              onClick={() => setAmount(maxAmount)}
              className="py-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-600/40 rounded font-semibold transition"
            >
              封顶
            </button>
          </div>
        </div>
      )}

      {/* Main Action Buttons */}
      <div className="grid grid-cols-4 gap-2">
        {/* FOLD */}
        <button
          onClick={() => handleAction({ type: 'FOLD' })}
          className="flex flex-col items-center justify-center py-2.5 px-2 bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-700/50 rounded-xl font-bold transition active:scale-95 text-xs sm:text-sm"
        >
          <X className="w-4 h-4 mb-0.5 text-rose-400" />
          <span>弃牌</span>
        </button>

        {/* CHECK or CALL */}
        {options.canCheck ? (
          <button
            onClick={() => handleAction({ type: 'CHECK' })}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 border border-emerald-500/60 rounded-xl font-bold transition active:scale-95 text-xs sm:text-sm shadow-lg shadow-emerald-950/50"
          >
            <Check className="w-4 h-4 mb-0.5 text-emerald-400" />
            <span>过牌</span>
          </button>
        ) : (
          <button
            disabled={!options.canCall}
            onClick={() => handleAction({ type: 'CALL' })}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-indigo-900/80 hover:bg-indigo-800 disabled:opacity-40 text-indigo-100 border border-indigo-500/60 rounded-xl font-bold transition active:scale-95 text-xs sm:text-sm shadow-lg"
          >
            <span className="text-[10px] sm:text-xs text-indigo-300">跟注</span>
            <span className="leading-tight">${options.callAmount}</span>
          </button>
        )}

        {/* BET or RAISE */}
        {isBetting ? (
          <button
            onClick={() => handleAction({ type: 'BET', amount })}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-amber-700 hover:bg-amber-600 text-white rounded-xl font-bold transition active:scale-95 text-xs sm:text-sm shadow-lg shadow-amber-950"
          >
            <ArrowUpCircle className="w-4 h-4 mb-0.5" />
            <span>下注 ${amount}</span>
          </button>
        ) : isRaising ? (
          <button
            disabled={amount <= (minAmount - 1)}
            onClick={() => handleAction({ type: 'RAISE', amount })}
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl font-bold transition active:scale-95 text-xs sm:text-sm shadow-lg shadow-amber-950"
          >
            <ArrowUpCircle className="w-4 h-4 mb-0.5" />
            <span>加注至 ${amount}</span>
          </button>
        ) : (
          <button
            disabled
            className="flex flex-col items-center justify-center py-2.5 px-2 bg-slate-800 opacity-40 text-slate-400 rounded-xl font-bold text-xs sm:text-sm"
          >
            <span>下注</span>
          </button>
        )}

        {/* SHOW HAND / ALL IN */}
        <button
          onClick={() => handleAction({ type: 'ALL_IN' })}
          className="flex flex-col items-center justify-center py-2.5 px-2 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 hover:from-amber-500 hover:to-yellow-400 text-slate-950 font-black rounded-xl transition active:scale-95 text-xs sm:text-sm shadow-lg shadow-amber-500/20 border border-yellow-300 animate-pulse"
        >
          <Flame className="w-4 h-4 mb-0.5 text-slate-950 fill-current" />
          <span>梭哈!</span>
        </button>
      </div>
    </div>
  );
};
