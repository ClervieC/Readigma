import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as timer from '../lib/timer';
import * as books from '../lib/books';

const COUNTDOWN_SECONDS = 3;

type TimerContextType = {
  session: timer.ReadingSession | null;
  bookTitle: string | null;
  bookCover: string | null;
  elapsedSeconds: number;
  start: (bookId: string) => Promise<timer.ReadingSession>;
  stop: () => Promise<void>;
  // "Démarrage dans 3... 2... 1..." before a session actually starts — see
  // startWithCountdown below. null outside of a countdown.
  countdown: number | null;
  countdownBookId: string | null;
  startWithCountdown: (bookId: string) => void;
  cancelCountdown: () => void;
};

const TimerContext = createContext<TimerContextType>(null!);

// Lifted out of app/book/[id].tsx so a running session survives navigating
// away from that book's own detail page — that's what lets
// components/TimerBubble.tsx show a persistent mini-player everywhere else.
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<timer.ReadingSession | null>(null);
  const [bookTitle, setBookTitle] = useState<string | null>(null);
  const [bookCover, setBookCover] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownBookId, setCountdownBookId] = useState<string | null>(null);
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadBookMeta = async (bookId: string) => {
    const meta = await books.getBookMeta(bookId).catch(() => null);
    setBookTitle(meta?.title ?? null);
    setBookCover(meta?.cover_url ?? null);
  };

  useEffect(() => {
    timer.getActiveSession().then((active) => {
      setSession(active);
      if (active) loadBookMeta(active.book_id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!session) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = new Date(session.started_at).getTime();
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.id]);

  const start = async (bookId: string) => {
    const s = await timer.startSession(bookId);
    setSession(s);
    await loadBookMeta(bookId);
    return s;
  };

  const stop = async () => {
    if (!session) return;
    await timer.stopSession(session.id);
    setSession(null);
    setBookTitle(null);
    setBookCover(null);
  };

  const cancelCountdown = () => {
    if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current);
    countdownTimeoutRef.current = null;
    setCountdown(null);
    setCountdownBookId(null);
  };

  // A brief "Démarrage dans 3..." beat before the session actually starts —
  // gives a reader a moment to actually get settled/find their page instead
  // of the clock silently already running the instant they tap Start.
  const startWithCountdown = (bookId: string) => {
    cancelCountdown();
    setCountdownBookId(bookId);
    setCountdown(COUNTDOWN_SECONDS);

    const tick = (remaining: number) => {
      countdownTimeoutRef.current = setTimeout(() => {
        if (remaining <= 1) {
          countdownTimeoutRef.current = null;
          setCountdown(null);
          setCountdownBookId(null);
          start(bookId).catch(() => {});
        } else {
          setCountdown(remaining - 1);
          tick(remaining - 1);
        }
      }, 1000);
    };
    tick(COUNTDOWN_SECONDS);
  };

  useEffect(() => () => { if (countdownTimeoutRef.current) clearTimeout(countdownTimeoutRef.current); }, []);

  return (
    <TimerContext.Provider value={{
      session, bookTitle, bookCover, elapsedSeconds, start, stop,
      countdown, countdownBookId, startWithCountdown, cancelCountdown,
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export const useTimer = () => useContext(TimerContext);
