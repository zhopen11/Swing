'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import GameCard from './GameCard';

const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);
const REFRESH_MS = 20000;

export default function Dashboard() {
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState('LIVE');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const timerRef = useRef(null);
  const clockRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/poll?_t=' + Date.now());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setGames(data.games || []);
      setLastUpdated(new Date());
      setTick((t) => t + 1);
    } catch (err) {
      console.error('Poll failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => {
      clearInterval(timerRef.current);
      clearInterval(clockRef.current);
    };
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const allGames = games;
  const liveCount = allGames.filter((g) => LIVE_STATUSES.has(g.status)).length;
  const preCount = allGames.filter((g) => g.status === 'STATUS_SCHEDULED').length;
  const finalCount = allGames.filter((g) => g.status === 'STATUS_FINAL').length;

  let filtered = allGames;
  if (filter === 'LIVE') filtered = allGames.filter((g) => LIVE_STATUSES.has(g.status));
  else if (filter === 'PRE') filtered = allGames.filter((g) => g.status === 'STATUS_SCHEDULED');
  else if (filter === 'FINAL') filtered = allGames.filter((g) => g.status === 'STATUS_FINAL');

  const live = filtered.filter((g) => LIVE_STATUSES.has(g.status));
  const pre = filtered.filter((g) => g.status === 'STATUS_SCHEDULED');
  const final_ = filtered.filter((g) => g.status === 'STATUS_FINAL');

  const timeStr = currentTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const dateStr = currentTime
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();

  const lastUpdatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
    : '\u2014';

  const filters = [
    { key: 'LIVE', label: `LIVE (${liveCount})`, dot: true },
    { key: 'FINAL', label: `FINAL (${finalCount})` },
    { key: 'PRE', label: `UPCOMING (${preCount})` },
    { key: 'ALL', label: `ALL (${allGames.length})` },
  ];

  return (
    <div
      className="min-h-screen bg-[#eaf0f6]"
      style={{ fontFamily: "'DM Sans', sans-serif", color: '#222' }}
    >
      {/* Header */}
      <header className="bg-[#001c55] border-b-[3px] border-[#1493ff] px-6 py-4 sticky top-0 z-[200] flex justify-between items-center">
        <div>
          <div className="text-sm tracking-[.12em] text-[#1493ff] mb-1 font-medium">
            THE SWING &middot; LIVE PLAY-BY-PLAY MOMENTUM
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight">
            NBA + NCAA &middot; Tonight
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="w-2 h-2 rounded-full bg-[#C0392B] animate-pulse" />
            <span className="text-base font-bold text-[#C0392B]">
              <span className="font-mono">{liveCount}</span> LIVE
            </span>
          </div>
          <div className="text-sm text-[#6b7c93]">
            <span className="font-mono">{timeStr}</span> &middot; {dateStr}
          </div>
        </div>
      </header>

      {/* Filter tabs */}
      <div className="bg-white border-b border-[#dce6f0] flex items-center gap-4" style={{ padding: '20px 32px' }}>
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{ padding: '6px 12px' }}
            className={`border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 ${
              filter === f.key
                ? 'bg-[#001c55] text-white'
                : 'bg-transparent text-[#001c55] hover:bg-[#dce6f0]'
            }`}
          >
            {f.dot && filter !== f.key ? '\u{1F534} ' : ''}
            {f.label}
          </button>
        ))}
        <div className="flex items-center gap-2" style={{ marginLeft: '48px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '4px 10px', fontSize: '24px' }}
            className={`bg-[#1493ff] text-white border-none rounded-lg leading-none cursor-pointer transition-opacity duration-150 ${
              refreshing ? 'opacity-40 pointer-events-none animate-spin' : 'hover:opacity-85'
            }`}
          >
            &#x27F3;
          </button>
          <span className="text-sm text-[#8494a7]">
            Refreshes every 20s
          </span>
        </div>
      </div>

      {/* Main content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '1% 2% 2% 2%' }}>
        {loading ? (
          <div className="text-center py-16 text-base text-[#6b7c93]">
            Loading The Swing&hellip;
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-base text-[#6b7c93]">
            No games in this filter
          </div>
        ) : (
          <>
            {live.length > 0 && (
              <div className="bg-[#f0f4f9] rounded-xl border border-[#dce6f0] mb-10" style={{ padding: '20px' }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-base font-bold text-[#C0392B] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C0392B] animate-pulse" />
                    In Progress
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-3.5">
                  {live.map((g) => (
                    <GameCard key={g.id} game={g} />
                  ))}
                </div>
              </div>
            )}

            {final_.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-base font-bold text-[#6b7c93]">
                    Final
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-3.5 mb-10">
                  {final_.map((g) => (
                    <GameCard key={g.id} game={g} />
                  ))}
                </div>
              </>
            )}

            {pre.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-base font-bold text-[#6b7c93]">
                    Upcoming Tonight
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(380px,1fr))] gap-3.5 mb-10">
                  {pre.map((g) => (
                    <GameCard key={g.id} game={g} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Last updated */}
        <div className="text-sm text-[#6b7c93] text-center py-4">
          Last updated: <span className="font-mono">{lastUpdatedStr}</span> &middot; Tick #{tick}
        </div>

        {/* Legend */}
        <div className="mt-2 px-6 py-4 bg-[#e8eef6] border border-[#1493ff] rounded-xl flex gap-8 flex-wrap items-center">
          <span className="text-sm font-bold text-[#1493ff]">
            The Swing &middot; How to Read
          </span>
          <span className="text-sm text-[#001c55]">
            Momentum 0&ndash;100 per team
          </span>
          <span className="text-sm text-[#001c55]">
            Momentum &ne; Score &mdash; process, not outcome
          </span>
          <span className="text-sm text-[#C0392B] font-semibold">
            &#x26A1; Bluffing = score &amp; momentum disagree
          </span>
          <span className="text-sm text-[#1493ff] font-semibold">
            &#x1F440; Comeback = trailing team leads momentum
          </span>
          <span className="text-sm text-[#b8960c] font-semibold">
            &#x26A0;&#xFE0F; Swing Warning = close score, one-sided momentum
          </span>
        </div>
      </main>
    </div>
  );
}
