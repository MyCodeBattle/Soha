import React from 'react';
import { X, BookOpen } from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="rules-overlay fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="rules-panel bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-gold">
            <BookOpen className="w-5 h-5" />
            <h2 className="font-bold text-lg text-slate-100">52张港式五张梭哈规则速查</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          <section>
            <h3 className="font-bold text-gold mb-1">1. 基础构架</h3>
            <p>使用标准 52 张扑克牌（无王牌）。支持 2～6 人。每人最终获得 5 张牌（1 张暗牌 + 4 张明牌）。</p>
          </section>

          <section>
            <h3 className="font-bold text-gold mb-1">2. 发牌与下注流程（四轮）</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>开局</strong>：所有玩家支付固定底注 Ante。</li>
              <li><strong>第 1 轮</strong>：发 1 暗牌 + 1 明牌 → 第 1 轮下注。</li>
              <li><strong>第 2 轮</strong>：发第 2 张明牌 → 第 2 轮下注。</li>
              <li><strong>第 3 轮</strong>：发第 3 张明牌 → 第 3 轮下注。</li>
              <li><strong>第 4 轮</strong>：发第 4 张明牌 → 第 4 轮下注。</li>
              <li><strong>摊牌 (Showdown)</strong>：比 5 张完整手牌。</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-gold mb-1">3. 每轮由谁先行动（话事权）</h3>
            <p>每轮发完明牌后，由<strong>当前公开牌面最强者</strong>先行动（暗牌不参与）。</p>
            <p className="mt-1 text-slate-400">
              前三轮不足 5 张时只比已成组合（对子 &gt; 散牌；三条 &gt; 一对 &gt; 散牌）。<strong>4 张牌不能算顺子或同花</strong>。若公开牌面同级，辅助花色规则为：♠黑桃 &gt; ♥红桃 &gt; ♦方块 &gt; ♣梅花。
            </p>
          </section>

          <section>
            <h3 className="font-bold text-gold mb-1">4. 梭哈有效上限（Cap 简化房规）</h3>
            <p>开局时以参局玩家中<strong>筹码最少者的筹码量作为本局最大有效投入上限</strong>。整局只有一个底池，不设复杂边池。</p>
          </section>

          <section>
            <h3 className="font-bold text-gold mb-1">5. 最终摊牌与花色平局</h3>
            <p>牌型大小：同花顺 &gt; 四条 &gt; 葫芦 &gt; 同花 &gt; 顺子 &gt; 三条 &gt; 两对 &gt; 一对 &gt; 高牌。</p>
            <p className="mt-1 text-slate-400">
              <strong>摊牌时花色完全平等，不决定胜负！</strong> 若 5 张牌型点数完全一致则判定为平局，底池等额平分。
            </p>
          </section>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs sm:text-sm transition"
          >
            明白了
          </button>
        </div>
      </div>
    </div>
  );
};
