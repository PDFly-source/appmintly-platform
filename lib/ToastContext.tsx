'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  leaving?: boolean;
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
});

/* Exit animation length. The global prefers-reduced-motion rule collapses
   this to ~0ms, so dismissals stay instant for reduced-motion users. */
const EXIT_MS = 160;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = (id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  };

  /* Two-step dismissal: mark leaving (fade-out) then actually remove,
     so toasts exit as calmly as they enter instead of vanishing. */
  const dismissToast = useCallback((id: string) => {
    clearTimer(id);
    setToasts((prev) => {
      if (prev.some((t) => t.id === id && !t.leaving)) {
        const t = setTimeout(() => {
          timers.current.delete(id);
          setToasts((cur) => cur.filter((x) => x.id !== id));
        }, EXIT_MS);
        timers.current.set(id, t);
        return prev.map((t) => (t.id === id ? { ...t, leaving: true } : t));
      }
      return prev;
    });
  }, []);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    const t = setTimeout(() => dismissToast(id), 4000);
    timers.current.set(id, t);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Screen-reader announcement region: success/info politely,
          errors assertively. Mirrors the aria-live pattern already
          used by the offline/update banners. */}
      {/* The container is deliberately NOT a live region: each toast below
          already carries its own role="status" (polite) or role="alert"
          (assertive). A live container plus live children makes screen
          readers announce every toast twice, so the container stays
          silent and the item-level roles speak exactly once. */}
      <div
        className="fixed bottom-20 sm:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm border backdrop-blur-md transition-all duration-150 ${
              t.leaving
                ? 'opacity-0 translate-y-1 motion-safe:animate-out motion-safe:fade-out motion-safe:duration-150'
                : 'animate-in fade-in slide-in-from-bottom-2'
            } ${
              t.type === 'success'
                ? 'bg-inkbg text-white border-[#16A765]/40'
                : t.type === 'error'
                ? 'bg-inkbg text-white border-[#E52B32]/40'
                : 'bg-inkbg text-white border-[#1976F3]/40'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#16A765] shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 text-[#E52B32] shrink-0" />}
            {t.type === 'info' && <Info className="w-4 h-4 text-[#1976F3] shrink-0" />}
            <span className="flex-1 font-medium">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="text-white/50 hover:text-white transition p-2.5 -m-1.5 rounded-full hover:bg-white/10 cursor-pointer"
              aria-label="Close notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);
