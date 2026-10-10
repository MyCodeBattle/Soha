import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { buildInviteUrl, type RoomInvitation } from '../utils/invitation.js';

function copyWithSelection(text: string): boolean {
  const previousFocus = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.appendChild(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}

export const InviteButton: React.FC<RoomInvitation> = (invitation) => {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [manualLink, setManualLink] = useState('');
  const resetTimer = useRef<number>();
  const mounted = useRef(false);
  const manualField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!manualLink) return;
    manualField.current?.focus({ preventScroll: true });
    manualField.current?.select();
  }, [manualLink]);

  const copyInvitation = async () => {
    window.clearTimeout(resetTimer.current);
    setCopied(false);
    setCopying(true);
    setManualLink('');
    const link = buildInviteUrl(invitation);
    let success = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        success = true;
      }
    } catch {
      // Selection copying also supports LAN pages where Clipboard API is unavailable.
    }
    if (!mounted.current) return;
    if (!success) success = copyWithSelection(link);
    setCopying(false);
    if (success) {
      setCopied(true);
      resetTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } else {
      setManualLink(link);
    }
  };

  return (
    <div className="invitation-control relative shrink-0">
      <button
        type="button"
        onClick={copyInvitation}
        disabled={copying}
        className="invitation-button flex items-center justify-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60"
        aria-label="邀请好友，复制房间链接"
        title="复制房间链接"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        <span role="status" aria-live="polite">{copied ? '链接已复制' : '邀请好友'}</span>
      </button>
      {manualLink && (
        <div className="invitation-fallback absolute left-0 top-full z-[80] mt-2 w-[min(320px,80vw)] rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs text-slate-100 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <label htmlFor="manual-invitation-link" role="status">自动复制失败，请手动复制链接</label>
            <button type="button" onClick={() => setManualLink('')} aria-label="关闭邀请链接" className="rounded p-1 hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            ref={manualField}
            id="manual-invitation-link"
            type="text"
            readOnly
            value={manualLink}
            onFocus={(event) => event.target.select()}
            className="w-full rounded border border-slate-600 bg-slate-950 p-2 text-base text-slate-100 outline-none focus:border-amber-400"
          />
        </div>
      )}
    </div>
  );
};
