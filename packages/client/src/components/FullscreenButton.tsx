import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const isFullscreen = () => {
  const fullscreenDocument = document as FullscreenDocument;
  return Boolean(fullscreenDocument.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
};

export const FullscreenButton: React.FC = () => {
  const [active, setActive] = useState(isFullscreen);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const sync = () => setActive(isFullscreen());
    const showError = () => setMessage('当前浏览器无法切换全屏');
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    document.addEventListener('fullscreenerror', showError);
    document.addEventListener('webkitfullscreenerror', showError);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      document.removeEventListener('fullscreenerror', showError);
      document.removeEventListener('webkitfullscreenerror', showError);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 5000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const toggleFullscreen = async () => {
    const fullscreenDocument = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    const entering = !isFullscreen();

    try {
      setMessage('');
      if (!entering) {
        if (fullscreenDocument.exitFullscreen) {
          await fullscreenDocument.exitFullscreen();
        } else if (fullscreenDocument.webkitExitFullscreen) {
          await fullscreenDocument.webkitExitFullscreen();
        } else {
          throw new Error('Fullscreen exit is unavailable');
        }
      } else if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        await root.webkitRequestFullscreen();
      } else {
        setMessage('当前浏览器不支持网页全屏');
        return;
      }
    } catch {
      setMessage('当前浏览器无法切换全屏');
    }
  };

  return (
    <div className="fullscreen-control">
      <button
        type="button"
        onClick={toggleFullscreen}
        className="fullscreen-button flex items-center justify-center gap-1 rounded-lg bg-slate-800/90 px-2 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
        aria-label={active ? '退出全屏' : '进入全屏'}
        title={active ? '退出全屏' : '进入全屏'}
      >
        {active ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        <span>{active ? '退出' : '全屏'}</span>
      </button>
      {message && <div className="fullscreen-hint" role="status">{message}</div>}
    </div>
  );
};
