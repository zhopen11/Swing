'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import GameCard from './GameCard';
import AuthModal from './AuthModal';
import Footer from './Footer';
import SportsNav from './SportsNav';
import SettingsModal from './SettingsModal';
import DatePicker, { toApiDate } from './DatePicker';

const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);
const REFRESH_MS = 10000;
const FINAL_LINGER_MS = 5 * 60 * 1000; // 5 minutes

export default function Dashboard() {
  const [activeSport, setActiveSport] = useState('basketball');
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
  const [showSettings, setShowSettings] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // null = today/live, "YYYY-MM-DD" = historical
  const [availableDates, setAvailableDates] = useState([]);
  const rootRef = useRef(null);
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

  const handleSportChange = useCallback((sport) => {
    setActiveSport(sport);
    setGames([]);
    setLoading(true);
    setFilter('LIVE');
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const base = activeSport === 'hockey' ? '/api/hockey/poll' : '/api/poll';
      let url = base + '?_t=' + Date.now();
      if (selectedDate) {
        url += '&date=' + toApiDate(selectedDate);
      }
      const res = await fetch(url);
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
  }, [selectedDate, activeSport]);

  // Fetch available dates on mount
  useEffect(() => {
    fetch('/api/dates')
      .then((r) => r.json())
      .then((d) => setAvailableDates(d.dates || []))
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
    fetch('/api/otd')
      .then((r) => r.json())
      .then((d) => d.event && setOtd(d.event))
      .catch(() => {});
  }, []);

  // Fetch games + set up polling (only poll live for today)
  useEffect(() => {
    setCurrentTime(new Date());
    setLoading(true);
    fetchData();
    if (!selectedDate) {
      // Live mode: poll every 10s
      timerRef.current = setInterval(fetchData, REFRESH_MS);
    }
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => {
      clearInterval(timerRef.current);
      clearInterval(clockRef.current);
    };
  }, [fetchData, selectedDate, activeSport]);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser(null);
      setSubscribedGames([]);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
    // Switch filter: historical shows ALL, going back to today shows LIVE
    setFilter(date ? 'ALL' : 'LIVE');
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

  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      try { screen.orientation.unlock(); } catch {}
      setIsFullscreen(false);
    } else {
      const el = rootRef.current;
      if (el?.requestFullscreen) {
        await el.requestFullscreen().catch(() => {});
      }
      try { await screen.orientation.lock('landscape'); } catch {}
      setIsFullscreen(true);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        try { screen.orientation.unlock(); } catch {}
      }
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

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

  // Sort by league (CBB first) then by time remaining within each league
  function sortByLeagueAndTime(arr) {
    const cbb = arr.filter((g) => g.league === 'CBB').sort((a, b) => timeRemaining(a) - timeRemaining(b));
    const nba = arr.filter((g) => g.league === 'NBA').sort((a, b) => timeRemaining(a) - timeRemaining(b));
    return [...cbb, ...nba];
  }

  const live = sortByLeagueAndTime(filtered.filter(isLiveOrLingering));
  const pre = sortByLeagueAndTime(filtered.filter((g) => g.status === 'STATUS_SCHEDULED'));
  const final_ = sortByLeagueAndTime(filtered.filter(isTrulyFinal));

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

  const isHistorical = !!selectedDate;
  const filters = isHistorical
    ? [
        { key: 'ALL', label: `ALL (${allGames.length})` },
        { key: 'FINAL', label: `FINAL (${finalCount})` },
      ]
    : [
        { key: 'LIVE', label: `LIVE (${liveCount})`, dot: true },
        { key: 'FINAL', label: `FINAL (${finalCount})` },
        { key: 'PRE', label: `UPCOMING (${preCount})` },
        { key: 'ALL', label: `ALL (${allGames.length})` },
      ];

  return (
    <div
      ref={rootRef}
      className={`min-h-screen bg-[#eaf0f6]${isFullscreen ? ' swing-fullscreen' : ''}`}
      style={{ fontFamily: "'DM Sans', sans-serif", color: '#222' }}
    >
      {/* Fullscreen exit button */}
      {isFullscreen && (
        <button onClick={toggleFullscreen} className="swing-fs-exit" title="Exit fullscreen">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
          </svg>
        </button>
      )}
      {/* Header */}
      {!isFullscreen && <header className="header-main bg-[#001c55] border-b-[3px] border-[#1493ff] z-[200]">
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
        <div className="header-live-section text-right" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
          {!isHistorical && (
            <div className="flex items-center justify-end mb-1" style={{ gap: '10px' }}>
              <span className="rounded-full bg-[#C0392B] animate-pulse" style={{ width: '12px', height: '12px' }} />
              <span className="font-bold text-[#C0392B]" style={{ fontSize: '20px' }}>
                <span className="font-mono">{liveCount}</span> LIVE
              </span>
            </div>
          )}
          <div className="text-sm text-[#6b7c93]">
            <span className="font-mono">{timeStr}</span> &middot; {dateStr}
          </div>
          <div className="flex items-center justify-end" style={{ gap: '10px', marginTop: '8px' }}>
            {user ? (
              <>
                <span className="header-auth-greeting text-sm font-semibold text-white">
                  Hi, {user.firstName}
                </span>
                <button
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    lineHeight: '1',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/>
                  </svg>
                </button>
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
                    whiteSpace: 'nowrap',
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
                    whiteSpace: 'nowrap',
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
      </header>}

      {/* Sports nav */}
      {!isFullscreen && <SportsNav activeSport={activeSport} onSportChange={handleSportChange} />}

      {/* Date picker + Filter tabs */}
      {!isFullscreen && (
        <div className="filter-bar bg-white border-b border-[#dce6f0]">
          <DatePicker
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            availableDates={availableDates}
          />
          <div style={{ width: '1px', height: '24px', background: '#dce6f0' }} />
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
          {!isHistorical && (
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
                Refreshes every 10s
              </span>
            </div>
          )}
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
            {(filter === 'LIVE' || filter === 'ALL') && !isHistorical && (
              <>
                <div style={{ width: '1px', height: '24px', background: '#dce6f0' }} />
                <button
                  onClick={toggleFullscreen}
                  title="Fullscreen mode"
                  className="border-none rounded-lg cursor-pointer transition-all duration-150 bg-transparent text-[#001c55] hover:bg-[#dce6f0]"
                  style={{ padding: '6px 10px', display: 'flex', alignItems: 'center' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
            {live.length > 0 && !isHistorical && (
              <div className="section-pad bg-[#f0f4f9] rounded-xl border border-[#dce6f0] mb-10">
                <div className="section-title-bar flex items-center gap-3" style={{ background: '#f0f4f9' }}>
                  <div className="text-base font-bold text-[#C0392B] flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C0392B] animate-pulse" />
                    In Progress
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                  <div className="text-sm text-[#1493ff] shrink-0">
                    Updated: <span className="font-mono">{lastUpdatedStr}</span>
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                  <button
                    onClick={() => setShowLegend(true)}
                    title="How to read The Swing"
                    className="border-none rounded-full cursor-pointer transition-all duration-150 bg-[#001c55] text-white hover:bg-[#1493ff] shrink-0"
                    style={{ width: '24px', height: '24px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    ?
                  </button>
                </div>
                <div className={isFullscreen ? "game-grid-fullscreen" : "game-grid"}>
                  {live.map((g) => (
                    <GameCard key={g.id} game={g} user={user} subscribedGames={subscribedGames} onToggleSubscribe={handleToggleSubscribe} onRequestAuth={() => openAuth('register-phone')} />
                  ))}
                </div>
              </div>
            )}

            {final_.length > 0 && (
              <>
                <div className="section-title-bar flex items-center gap-3" style={{ background: '#eaf0f6' }}>
                  <div className="text-base font-bold text-[#6b7c93]">
                    Final
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                  <button
                    onClick={() => setShowLegend(true)}
                    title="How to read The Swing"
                    className="border-none rounded-full cursor-pointer transition-all duration-150 bg-[#001c55] text-white hover:bg-[#1493ff] shrink-0"
                    style={{ width: '24px', height: '24px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    ?
                  </button>
                </div>
                <div className={isFullscreen ? "game-grid-fullscreen mb-10" : "game-grid mb-10"}>
                  {final_.map((g) => (
                    <GameCard key={g.id} game={g} user={user} subscribedGames={subscribedGames} onToggleSubscribe={handleToggleSubscribe} onRequestAuth={() => openAuth('register-phone')} />
                  ))}
                </div>
              </>
            )}

            {pre.length > 0 && !isHistorical && (
              <>
                <div className="section-title-bar flex items-center gap-3" style={{ background: '#eaf0f6' }}>
                  <div className="text-base font-bold text-[#6b7c93]">
                    Upcoming <span style={{ fontSize: '12px', fontWeight: 400, color: '#8494a7' }}>&mdash; all times shown in your local timezone</span>
                  </div>
                  <div className="flex-1 h-px bg-[#ddd]" />
                  <button
                    onClick={() => setShowLegend(true)}
                    title="How to read The Swing"
                    className="border-none rounded-full cursor-pointer transition-all duration-150 bg-[#001c55] text-white hover:bg-[#1493ff] shrink-0"
                    style={{ width: '24px', height: '24px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    ?
                  </button>
                </div>
                <div className={isFullscreen ? "game-grid-fullscreen mb-10" : "game-grid mb-10"}>
                  {pre.map((g) => (
                    <GameCard key={g.id} game={g} user={user} subscribedGames={subscribedGames} onToggleSubscribe={handleToggleSubscribe} onRequestAuth={() => openAuth('register-phone')} />
                  ))}
                </div>
              </>
            )}
          </>
        )}


      </main>

      {!isFullscreen && <Footer />}

      {showAuth && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuth(false)}
          onAuth={(u) => { setUser(u); fetchSubscriptions(); }}
        />
      )}

      {showSettings && user && (
        <SettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onUpdate={(u) => setUser(u)}
        />
      )}

      {/* Legend modal */}
      {showLegend && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowLegend(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl"
            style={{ maxWidth: '420px', width: '90%', maxHeight: '85vh', overflow: 'auto', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <div className="flex items-center gap-3">
                <Image src="/swing-logo.jpg" alt="" width={40} height={40} className="rounded-full" />
                <span className="text-lg font-bold text-[#001c55]">How to Read The Swing</span>
              </div>
              <button
                onClick={() => setShowLegend(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#8494a7', padding: '4px' }}
              >
                &times;
              </button>
            </div>
            <div className="flex flex-col" style={{ gap: '10px' }}>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm text-[#8494a7] shrink-0">📈</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">Chart</strong> &mdash; each team&rsquo;s momentum (0&ndash;100). Tap to inspect.</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#C0392B] shrink-0 mt-1" />
                <span className="text-sm"><strong style={{ color: '#C0392B' }}>Bluffing</strong> &mdash; score &amp; momentum disagree</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#00C853] shrink-0 mt-1" />
                <span className="text-sm"><strong style={{ color: '#00C853' }}>Comeback</strong> &mdash; trailing team leads momentum</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFD700] shrink-0 mt-1" />
                <span className="text-sm"><strong style={{ color: '#FFD700' }}>Swing Warning</strong> &mdash; close score, lopsided momentum</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm shrink-0">🌊</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">MVIX</strong> &mdash; volatility (lower = calmer). Arrow = bias direction.</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm shrink-0">🧭</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">MRVI</strong> &mdash; momentum direction. <strong style={{ color: '#00C853' }}>&gt;50 up</strong>, <strong style={{ color: '#C0392B' }}>&lt;50 down</strong>.</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm text-[#8494a7] shrink-0">▸</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">Pregame 411</strong> &mdash; rolling MVIX &amp; MRVI for each team</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm text-[#8494a7] shrink-0">▸</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">Play by Play Feed</strong> &mdash; live play-by-play log</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm text-[#8494a7] shrink-0">▸</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">Swingers - Live In Game</strong> &mdash; top players driving momentum shifts, weighted by magnitude. <strong style={{ color: '#C0392B' }}>CLUTCH</strong> = late-game impact.</span>
              </div>
              <div className="flex items-start" style={{ gap: '8px' }}>
                <span className="text-sm text-[#8494a7] shrink-0">▸</span>
                <span className="text-sm"><strong className="text-[#6b7c93]">Swing Alert Feed</strong> &mdash; every alert with full game state</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
