'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import GameCard from './GameCard';
import AuthModal from './AuthModal';
import Footer from './Footer';
import SportsNav from './SportsNav';

const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);
const REFRESH_MS = 20000;
const FINAL_LINGER_MS = 5 * 60 * 1000; // 5 minutes

export default function Dashboard() {
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState('LIVE');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [tick, setTick] = useState(0);
  const [currentTime, setCurrentTime] = useState(null);
  const [otd, setOtd] = useState(null);
  const [user, setUser] = useState(null);
  const [subscribedGames, setSubscribedGames] = useState([]);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const timerRef = useRef(null);
  const clockRef = useRef(null);
  const finalTimestamps = useRef({});
  const seenLive = useRef(new Set());
  const leagueOrderRef = useRef({ order: null, lastUpdated: 0 });

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch('/api/subscriptions');
      const data = await res.json();
      setSubscribedGames(data.gameIds || []);
    } catch {
      setSubscribedGames([]);
    }
  }, []);

  const handleToggleSubscribe = useCallback(async (gameId) => {
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (data.subscribed) {
        setSubscribedGames((prev) => [...prev, gameId]);
      } else {
        setSubscribedGames((prev) => prev.filter((id) => id !== gameId));
      }
    } catch (err) {
      console.error('Toggle subscribe failed:', err);
    }
  }, []);

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
    setCurrentTime(new Date());
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 30000);
    fetch('/api/otd')
      .then((r) => r.json())
      .then((d) => d.event && setOtd(d.event))
      .catch(() => {});
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          fetchSubscriptions();
        }
      })
      .catch(() => {});
    return () => {
      clearInterval(timerRef.current);
      clearInterval(clockRef.current);
    };
  }, [fetchData]);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser(null);
      setSubscribedGames([]);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const openAuth = (mode) => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const allGames = games;
  const now = Date.now();

  // Track when games first go final (only if we saw them live this session)
  allGames.forEach((g) => {
    if (LIVE_STATUSES.has(g.status)) {
      seenLive.current.add(g.id);
      delete finalTimestamps.current[g.id];
    }
    if (g.status === 'STATUS_FINAL' && !finalTimestamps.current[g.id] && seenLive.current.has(g.id)) {
      finalTimestamps.current[g.id] = now;
    }
  });

  // A game is "recently final" if it went final less than 5 minutes ago
  const isRecentlyFinal = (g) =>
    g.status === 'STATUS_FINAL' &&
    finalTimestamps.current[g.id] &&
    now - finalTimestamps.current[g.id] < FINAL_LINGER_MS;

  const isLiveOrLingering = (g) => LIVE_STATUSES.has(g.status) || isRecentlyFinal(g);
  const isTrulyFinal = (g) => g.status === 'STATUS_FINAL' && !isRecentlyFinal(g);

  const liveCount = allGames.filter(isLiveOrLingering).length;
  const preCount = allGames.filter((g) => g.status === 'STATUS_SCHEDULED').length;
  const finalCount = allGames.filter(isTrulyFinal).length;

  let filtered = allGames;
  if (filter === 'LIVE') filtered = allGames.filter(isLiveOrLingering);
  else if (filter === 'PRE') filtered = allGames.filter((g) => g.status === 'STATUS_SCHEDULED');
  else if (filter === 'FINAL') filtered = allGames.filter(isTrulyFinal);

  // Estimate time remaining for sorting (lower = closer to ending)
  function timeRemaining(g) {
    if (g.status === 'STATUS_FINAL') return -1;
    if (g.status === 'STATUS_HALFTIME') {
      // NBA halftime = 2 quarters left, CBB halftime = 1 half left
      const totalPeriods = g.league === 'NBA' ? 4 : 2;
      const periodsLeft = totalPeriods - g.period;
      return periodsLeft * 12 * 60; // ~minutes per period in seconds
    }
    const totalPeriods = g.league === 'NBA' ? 4 : 2;
    const periodMins = g.league === 'NBA' ? 12 : 20;
    const periodsLeft = Math.max(0, totalPeriods - g.period);
    // Parse clock "7:13" to seconds
    let clockSecs = 0;
    if (g.clock && typeof g.clock === 'string' && g.clock.includes(':')) {
      const [m, s] = g.clock.split(':').map(Number);
      clockSecs = (m || 0) * 60 + (s || 0);
    }
    return periodsLeft * periodMins * 60 + clockSecs;
  }

  // Group live games by league, sort within each group, reorder groups every 15 min
  const liveUnsorted = filtered.filter(isLiveOrLingering);
  const nbaLive = liveUnsorted.filter((g) => g.league === 'NBA').sort((a, b) => timeRemaining(a) - timeRemaining(b));
  const cbbLive = liveUnsorted.filter((g) => g.league === 'CBB').sort((a, b) => timeRemaining(a) - timeRemaining(b));

  const live = [...cbbLive, ...nbaLive];

  const pre = filtered.filter((g) => g.status === 'STATUS_SCHEDULED');
  const final_ = filtered.filter(isTrulyFinal);

  const timeStr = currentTime
    ? currentTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '';
  const dateStr = currentTime
    ? currentTime
        .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        .toUpperCase()
    : '';

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
      <header className="header-main bg-[#001c55] border-b-[3px] border-[#1493ff] sticky top-0 z-[200]">
        <div className="flex items-center" style={{ gap: '16px' }}>
          <Image
            src="/swing-logo.jpg"
            alt="The Swing logo"
            width={48}
            height={48}
            className="rounded-full header-logo"
            style={{ background: '#001c55' }}
          />
          <div>
          <div className="header-subtitle tracking-[.12em] text-[#1493ff] mb-1 font-medium">
            LIVE PLAY-BY-PLAY MOMENTUM FORECASTER
          </div>
          <div className="header-title font-extrabold text-white tracking-tight">
            THE SWING
          </div>
          {otd && (
            <div className="text-xs text-[#8494a7] mt-1 italic">
              On this day: {otd}
            </div>
          )}
          </div>
        </div>
        <div className="header-live-section text-right">
          <div className="flex items-center justify-end mb-1" style={{ gap: '10px' }}>
            <span className="rounded-full bg-[#C0392B] animate-pulse" style={{ width: '12px', height: '12px' }} />
            <span className="font-bold text-[#C0392B]" style={{ fontSize: '20px' }}>
              <span className="font-mono">{liveCount}</span> LIVE
            </span>
          </div>
          <div className="text-sm text-[#6b7c93]">
            <span className="font-mono">{timeStr}</span> &middot; {dateStr}
          </div>
          <div className="flex items-center justify-end" style={{ gap: '10px', marginTop: '8px' }}>
            {user ? (
              <>
                <span className="header-auth-greeting text-sm font-semibold text-white">
                  Hi, {user.firstName}
                </span>
                <span className="header-auth-greeting" style={{ fontSize: '18px', cursor: 'pointer', color: '#FFD700' }} title="Alerts">
                  &#x1F514;
                </span>
                <button
                  onClick={handleSignOut}
                  className="header-auth-signout"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8494a7',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    textDecoration: 'underline',
                    padding: '0',
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => openAuth('signin')}
                  className="header-auth-signin"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#8494a7',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    textDecoration: 'underline',
                    padding: '0',
                  }}
                >
                  Sign In
                </button>
                <button
                  onClick={() => openAuth('register-phone')}
                  className="header-auth-alerts"
                  style={{
                    background: '#1493ff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '6px 16px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <span className="header-auth-alerts-icon" style={{ display: 'none' }}>&#x1F514;</span>
                  <span className="header-auth-alerts-text">Get Alerts</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Sports nav */}
      <SportsNav />

      {/* Filter tabs */}
      <div className="filter-bar bg-white border-b border-[#dce6f0]">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 ${
              filter === f.key
                ? 'bg-[#001c55] text-white'
                : 'bg-transparent text-[#001c55] hover:bg-[#dce6f0]'
            }`}
            style={{ padding: '6px 12px' }}
          >
            {f.dot && filter !== f.key ? '\u{1F534} ' : ''}
            {f.label}
          </button>
        ))}
        <div className="filter-refresh flex items-center gap-2">
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
          <span className="refresh-label text-sm text-[#8494a7]">
            Refreshes every 20s
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '1px', height: '24px', background: '#dce6f0' }} />
          <button
            onClick={() => setFilter('CLV')}
            className={`border-none rounded-lg text-base font-bold cursor-pointer transition-all duration-150 ${
              filter === 'CLV'
                ? 'bg-[#001c55] text-white'
                : 'bg-transparent text-[#001c55] hover:bg-[#dce6f0]'
            }`}
            style={{ padding: '6px 12px' }}
          >
            CLV
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="main-content">
        {filter === 'CLV' ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '40px 20px',
          }}>
            <div style={{
              background: '#fff',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0, 28, 85, 0.12)',
              maxWidth: '500px',
              width: '100%',
              textAlign: 'center',
              overflow: 'hidden',
            }}>
              <div style={{
                background: '#001c55',
                padding: '40px 24px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <Image
                  src="/swing-logo.jpg"
                  alt="The Swing"
                  width={120}
                  height={120}
                  style={{ borderRadius: '50%', marginBottom: '20px' }}
                />
                <div style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: '#fff',
                  letterSpacing: '-0.5px',
                }}>
                  Closing Line Value
                </div>
              </div>
              <div style={{ padding: '32px 28px 40px' }}>
                <div style={{
                  fontSize: '18px',
                  color: '#6b7c93',
                  lineHeight: '1.6',
                }}>
                  Just Google <span style={{ color: '#001c55', fontWeight: 700, fontStyle: 'italic' }}>&ldquo;THE SWING&rdquo;</span> &mdash; this will show you how good I am...
                </div>
              </div>
            </div>
          </div>
        ) : loading ? (
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
              <div className="section-pad bg-[#f0f4f9] rounded-xl border border-[#dce6f0] mb-10">
                <div className="flex items-center gap-3" style={{ marginBottom: '10px' }}>
                  <div className="text-base font-bold text-[#C0392B] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C0392B] animate-pulse" />
                    In Progress
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                  <div className="text-sm text-[#1493ff]">
                    Updated: <span className="font-mono">{lastUpdatedStr}</span>
                  </div>
                </div>
                <div className="game-grid">
                  {live.map((g) => (
                    <GameCard key={g.id} game={g} user={user} subscribedGames={subscribedGames} onToggleSubscribe={handleToggleSubscribe} onRequestAuth={() => openAuth('register-phone')} />
                  ))}
                  {/* Legend card */}
                  <div className="bg-white rounded-xl border border-[#dce6f0] flex flex-col justify-center" style={{ padding: '12px' }}>
                    <div className="flex flex-col items-center" style={{ marginBottom: '12px' }}>
                      <Image src="/swing-logo.jpg" alt="" width={96} height={96} className="rounded-full" style={{ background: '#fff', marginBottom: '8px' }} />
                      <div className="text-xl font-bold text-[#1493ff]">
                        THE SWING &middot; How to Read
                      </div>
                    </div>
                    <div className="flex flex-col" style={{ gap: '8px' }}>
                      <div className="flex items-center" style={{ gap: '10px' }}>
                        <span className="w-3 h-3 rounded-full bg-[#6b7c93] shrink-0" />
                        <span className="text-sm">
                          <strong style={{ color: '#6b7c93' }}>Momentum 0&ndash;100</strong> <span className="text-[#001c55]">&mdash; process, not outcome</span>
                        </span>
                      </div>
                      <div className="flex items-center" style={{ gap: '10px' }}>
                        <span className="w-3 h-3 rounded-full bg-[#C0392B] shrink-0" />
                        <span className="text-sm">
                          <strong style={{ color: '#C0392B' }}>Bluffing</strong> <span className="text-[#001c55]">&mdash; score &amp; momentum leaders disagree</span>
                        </span>
                      </div>
                      <div className="flex items-center" style={{ gap: '10px' }}>
                        <span className="w-3 h-3 rounded-full bg-[#00C853] shrink-0" />
                        <span className="text-sm">
                          <strong style={{ color: '#00C853' }}>Comeback Watch</strong> <span className="text-[#001c55]">&mdash; trailing team leads momentum</span>
                        </span>
                      </div>
                      <div className="flex items-center" style={{ gap: '10px' }}>
                        <span className="w-3 h-3 rounded-full bg-[#FFD700] shrink-0" />
                        <span className="text-sm">
                          <strong style={{ color: '#FFD700' }}>Swing Warning</strong> <span className="text-[#001c55]">&mdash; close score, one-sided momentum</span>
                        </span>
                      </div>
                    </div>
                  </div>
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
                <div className="game-grid mb-10">
                  {final_.map((g) => (
                    <GameCard key={g.id} game={g} user={user} subscribedGames={subscribedGames} onToggleSubscribe={handleToggleSubscribe} onRequestAuth={() => openAuth('register-phone')} />
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
                <div className="game-grid mb-10">
                  {pre.map((g) => (
                    <GameCard key={g.id} game={g} user={user} subscribedGames={subscribedGames} onToggleSubscribe={handleToggleSubscribe} onRequestAuth={() => openAuth('register-phone')} />
                  ))}
                </div>
              </>
            )}
          </>
        )}


      </main>

      <Footer />

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onAuth={(u) => { setUser(u); fetchSubscriptions(); }}
        />
      )}
    </div>
  );
}
