'use client';

import Sparkline from './Sparkline';
import PlayFeed from './PlayFeed';

const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);

function periodLabel(p) {
  if (!p) return '';
  if (p === 1) return '1st';
  if (p === 2) return '2nd';
  if (p === 3) return '3rd';
  if (p === 4) return '4th';
  return `OT${p > 5 ? p - 4 : ''}`;
}

function formatTime(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function swingLabel(away, home, awayAbbr, homeAbbr, awayColor, homeColor) {
  const gap = Math.abs(away - home);
  if (gap <= 8) return { text: 'EVEN', color: '#6b7c93' };
  const leader = away > home ? awayAbbr : homeAbbr;
  const color = away > home ? awayColor : homeColor;
  return { text: `${leader} SWING`, color };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function colorDistance(c1, c2) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function lightenColor(hex, pct) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * pct,
    g + (255 - g) * pct,
    b + (255 - b) * pct,
  );
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function darkenColor(hex, pct) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - pct), g * (1 - pct), b * (1 - pct));
}

function ensureDistinct(awayColor, homeColor) {
  if (colorDistance(awayColor, homeColor) > 60) return { away: awayColor, home: homeColor };
  // Lighten the lighter one by 20%, darken the darker one by 20%
  if (luminance(awayColor) >= luminance(homeColor)) {
    return { away: lightenColor(awayColor, 0.2), home: darkenColor(homeColor, 0.2) };
  }
  return { away: darkenColor(awayColor, 0.2), home: lightenColor(homeColor, 0.2) };
}

export default function GameCard({ game, user, subscribedGames, onToggleSubscribe, onRequestAuth }) {
  const g = game;
  const { away: awayColorAdj, home: homeColorAdj } = ensureDistinct(g.awayColor || '#999', g.homeColor || '#999');
  const isLive = LIVE_STATUSES.has(g.status);
  const isFinal = g.status === 'STATUS_FINAL';
  const isPre = g.status === 'STATUS_SCHEDULED';
  const hasMom = !!g.mom;
  const clockDisplay = g.status === 'STATUS_HALFTIME' ? 'HALFTIME' : g.clock;
  const isSubscribed = user && subscribedGames && subscribedGames.includes(g.id);

  const aWin = g.awayScore > g.homeScore;
  const hWin = g.homeScore > g.awayScore;
  const aColor = isLive || isFinal ? (aWin ? awayColorAdj : '#ccc') : '#ccc';
  const hColor = isLive || isFinal ? (hWin ? homeColorAdj : '#ccc') : '#ccc';

  let borderClass = 'bg-white rounded-xl transition-all duration-300';
  let alertColor = null;
  if (g.bluffing) {
    alertColor = '#C0392B';
  } else if (g.comeback) {
    alertColor = '#00C853';
  } else if (g.swingWarning) {
    alertColor = '#FFD700';
  }

  return (
    <div className={`${borderClass} game-card-pad`} style={{
      padding: '12px',
      borderRadius: '12px',
      border: alertColor ? `3px solid ${alertColor}` : '1px solid #e0e0e0',
      borderTop: alertColor ? `3px solid ${alertColor}` : `3px solid ${homeColorAdj || '#dce6f0'}`,
      boxShadow: alertColor ? `0 0 0 3px ${alertColor}40` : '0 1px 3px rgba(0,0,0,0.08)',
    }}>
      {/* Top bar */}
      <div className="pb-3 mb-3 border-b border-black/5 flex justify-between items-center">
        <span className="text-sm font-semibold text-[#6b7c93]">
          {g.league} &middot; {g.shortName || g.name}
        </span>
        {g.network && (
          <span className="text-xs font-semibold text-[#8494a7]">{g.network}</span>
        )}
        <div className="flex items-center" style={{ gap: '8px' }}>
          {isLive && (
            <span className="text-sm font-bold text-[#C0392B] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#C0392B] animate-pulse" />
              {periodLabel(g.period)} &middot; <span className="font-mono">{clockDisplay}</span>
            </span>
          )}
          {isFinal && (
            <span className="text-sm font-bold text-[#6b7c93]">FINAL</span>
          )}
          {isPre && (
            <span className="text-sm font-bold text-[#6b7c93]">
              <span className="font-mono">{formatTime(g.date)}</span>
            </span>
          )}
          <button
            onClick={() => user ? onToggleSubscribe(g.id) : onRequestAuth && onRequestAuth()}
            title={user ? (isSubscribed ? 'Unsubscribe from alerts' : 'Subscribe to alerts') : 'Sign up for alerts'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              lineHeight: '1',
              transition: 'opacity 0.2s',
              opacity: !user ? 0.5 : 1,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill={user && isSubscribed ? '#00C853' : '#c0c7d0'} xmlns="http://www.w3.org/2000/svg">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Score row — fixed height for vertical alignment */}
      <div style={{ paddingBottom: '12px', minHeight: '80px' }}>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {/* Away team */}
          <div>
            <div
              className="text-lg font-black tracking-wide"
              style={{ color: awayColorAdj }}
            >
              {g.awayAbbr}
            </div>
            <div className="text-sm text-[#8494a7] mt-0.5">{g.awayName}</div>
          </div>

          {/* Center score */}
          <div className="text-center">
            {isLive || isFinal ? (
              <>
                <div className="flex items-center justify-center gap-2">
                  <span
                    className="score-num font-mono font-extrabold leading-none transition-colors duration-500"
                    style={{ color: aColor }}
                  >
                    {g.awayScore}
                  </span>
                  <span className="score-dash font-bold text-[#8494a7]">&ndash;</span>
                  <span
                    className="score-num font-mono font-extrabold leading-none transition-colors duration-500"
                    style={{ color: hColor }}
                  >
                    {g.homeScore}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-lg text-[#8494a7]">{formatTime(g.date)}</div>
              </>
            )}
          </div>

          {/* Home team */}
          <div className="text-right">
            <div
              className="text-lg font-black tracking-wide"
              style={{ color: homeColorAdj }}
            >
              {g.homeAbbr}
            </div>
            <div className="text-sm text-[#8494a7] mt-0.5">{g.homeName}</div>
          </div>
        </div>
      </div>

      {/* Momentum section */}
      {hasMom && (
        <>
          <div className="pb-3 pt-1">
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1 bg-[#ebebeb] rounded-full overflow-hidden relative" style={{ height: '26px' }}>
                <div
                  className="rounded-full transition-[width] duration-[1.2s] ease-out flex items-center"
                  style={{
                    width: `${Math.max(g.mom.away, 15)}%`,
                    backgroundColor: awayColorAdj,
                    height: '100%',
                    justifyContent: 'flex-end',
                    paddingRight: '6px',
                  }}
                >
                  <span className="font-mono font-bold text-white" style={{ fontSize: '16px', lineHeight: 1 }}>
                    {g.mom.away}
                  </span>
                </div>
              </div>
              <div className="min-w-[90px] text-center font-mono text-sm font-bold tracking-wide whitespace-nowrap">
                {(() => {
                  const s = swingLabel(
                    g.mom.away,
                    g.mom.home,
                    g.awayAbbr,
                    g.homeAbbr,
                    awayColorAdj,
                    homeColorAdj,
                  );
                  return <span className={s.text !== 'EVEN' ? 'animate-heartbeat' : ''} style={{ color: s.color, fontWeight: 800 }}>{s.text}</span>;
                })()}
              </div>
              <div className="flex-1 bg-[#ebebeb] rounded-full overflow-hidden relative" style={{ height: '26px' }}>
                <div
                  className="rounded-full transition-[width] duration-[1.2s] ease-out flex items-center"
                  style={{
                    width: `${Math.max(g.mom.home, 15)}%`,
                    backgroundColor: homeColorAdj,
                    height: '100%',
                    float: 'right',
                    justifyContent: 'flex-start',
                    paddingLeft: '6px',
                  }}
                >
                  <span className="font-mono font-bold text-white" style={{ fontSize: '16px', lineHeight: 1 }}>
                    {g.mom.home}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <Sparkline
            chartAway={g.mom.chartAway}
            chartHome={g.mom.chartHome}
            awayColor={awayColorAdj}
            homeColor={homeColorAdj}
            awayAbbr={g.awayAbbr}
            homeAbbr={g.homeAbbr}
            isLive={isLive}
            league={g.league}
          />

          <PlayFeed
            plays={g.mom.recentPlays}
            awayAbbr={g.awayAbbr}
            homeAbbr={g.homeAbbr}
            awayColor={awayColorAdj}
            homeColor={homeColorAdj}
          />
        </>
      )}

      {/* Pre-game placeholder */}
      {isPre && !hasMom && (
        <div className="py-4">
          <div className="h-2.5 bg-[#dce6f0] rounded-full opacity-50 mb-2" />
          <div className="text-sm text-[#8494a7] text-center">
            Momentum activates at tip-off
          </div>
        </div>
      )}

      {/* Alert strip */}
      {g.bluffing && (
        <div className="alert-strip mt-3 py-3.5 border-t border-[#f0f0f0] text-base italic leading-snug text-[#C0392B] bg-red-50/50 rounded-b-xl">
          &#x26A1; Score is Bluffing &mdash;{' '}
          {g.awayScore > g.homeScore ? g.awayAbbr : g.homeAbbr} leads score,{' '}
          {g.mom.away > g.mom.home ? g.awayAbbr : g.homeAbbr} leads The Swing
          {g.status === 'STATUS_HALFTIME' && (
            <span className="text-xs opacity-70 not-italic"> &middot; Full half of data</span>
          )}
        </div>
      )}
      {g.comeback && (
        <div className="alert-strip mt-3 py-3.5 border-t border-[#f0f0f0] text-base italic leading-snug text-[#00C853] bg-green-50/50 rounded-b-xl">
          &#x1F440; Comeback Watch &mdash;{' '}
          {g.awayScore < g.homeScore ? g.awayAbbr : g.homeAbbr} trails score but leads momentum
          {g.status === 'STATUS_HALFTIME' && (
            <span className="text-xs opacity-70 not-italic"> &middot; Full half of data</span>
          )}
        </div>
      )}
      {g.swingWarning && (
        <div className="alert-strip mt-3 py-3.5 border-t border-[#f0f0f0] text-base italic leading-snug text-[#FFD700] bg-yellow-50/50 rounded-b-xl">
          &#x26A0;&#xFE0F; Swing Warning &mdash; score is close but{' '}
          {g.mom.away > g.mom.home ? g.awayAbbr : g.homeAbbr} owns the momentum
          {g.status === 'STATUS_HALFTIME' && (
            <span className="text-xs opacity-70 not-italic"> &middot; Full half of data</span>
          )}
        </div>
      )}

      {/* Footer */}
      {!g.bluffing && !g.comeback && !g.swingWarning && (
        <div className="pt-3 mt-3 border-t border-[#f0f0f0]">
          <span className="text-sm text-[#6b7c93]">{g.venue}</span>
        </div>
      )}
    </div>
  );
}
