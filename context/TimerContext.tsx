import React, { createContext, useContext, useEffect, useState } from 'react';
import * as timer from '../lib/timer';
import * as books from '../lib/books';

type TimerContextType = {
  session: timer.ReadingSession | null;
  bookTitle: string | null;
  bookCover: string | null;
  elapsedSeconds: number;
  start: (bookId: string) => Promise<timer.ReadingSession>;
  stop: () => Promise<void>;
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

  return (
    <TimerContext.Provider value={{ session, bookTitle, bookCover, elapsedSeconds, start, stop }}>
      {children}
    </TimerContext.Provider>
  );
}

export const useTimer = () => useContext(TimerContext);
