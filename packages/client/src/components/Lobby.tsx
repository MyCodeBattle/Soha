import React, { useState } from 'react';
import { Volume2, VolumeX, BookOpen, Users, Play, PlusCircle } from 'lucide-react';
import { sound } from '../utils/audio.js';
import { RulesModal } from './RulesModal.js';

interface LobbyProps {
  playerName: string;
  onNameChange: (name: string) => void;
  onCreateRoom: (ante: number) => void;
  onJoinRoom: (roomId: string) => void;
  isConnecting: boolean;
  error?: string;
}

export const Lobby: React.FC<LobbyProps> = ({
  playerName,
  onNameChange,
  onCreateRoom,
  onJoinRoom,
  isConnecting,
  error,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [ante, setAnte] = useState(10);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(sound.isEnabled());

  const handleToggleSound = () => {
    const next = sound.toggleSound();
    setSoundEnabled(next);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black text-slate-100 flex flex-col justify-between p-4 sm:p-6">
      {/* Top Bar */}
      <header className="flex items-center justify-between max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-yellow-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
            ♠
          </div>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
              港式五张梭哈
            </h1>
            <p className="text-[10px] text-slate-400">Show Hand Poker · 52张无王</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRulesOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-xs rounded-lg text-slate-300 transition"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>玩法规则</span>
          </button>
          <button
            onClick={handleToggleSound}
            className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg transition"
            title="音效开关"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-md w-full mx-auto my-auto flex flex-col gap-6 py-6">
        {/* Nickname Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
          <label className="block text-xs font-semibold text-slate-400 mb-2">
            你的昵称
          </label>
          <input
            type="text"
            value={playerName}
            maxLength={12}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="输入玩家昵称..."
            className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-4 py-2.5 text-sm font-semibold outline-none transition"
          />
        </div>

        {error && (
          <div className="bg-rose-950/60 border border-rose-800/80 text-rose-200 px-4 py-2.5 rounded-xl text-xs text-center font-medium">
            {error}
          </div>
        )}

        {/* Action Panels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Create Room */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PlusCircle className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-slate-100">创建新房间</h3>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">生成专属房间码，邀请好友开局</p>

              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                底注 Ante
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[10, 20, 50, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAnte(val)}
                    className={`py-1 rounded-lg text-xs font-bold transition ${
                      ante === val
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    ${val}
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={isConnecting || !playerName.trim()}
              onClick={() => onCreateRoom(ante)}
              className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 disabled:opacity-40 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition shadow-lg shadow-amber-950/50 flex items-center justify-center gap-1.5"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>创建牌桌</span>
            </button>
          </div>

          {/* Join Room */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm flex flex-col justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm text-slate-100">加入已有房间</h3>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">输入好友发送的 6 位房间码</p>

              <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                房间码
              </label>
              <input
                type="text"
                value={roomCodeInput}
                maxLength={6}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                placeholder="例如：A9K3F2"
                className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl px-3 py-2 text-center text-sm font-mono tracking-widest uppercase outline-none transition"
              />
            </div>

            <button
              disabled={isConnecting || !playerName.trim() || roomCodeInput.length !== 6}
              onClick={() => onJoinRoom(roomCodeInput)}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white font-bold rounded-xl text-xs sm:text-sm transition shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>进入牌局</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-[11px] text-slate-500 py-3">
        港式五张梭哈 · 52张标准扑克 · 网页/移动端响应式对战
      </footer>

      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
    </div>
  );
};
