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
  return (
    new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/New_York',
    }) + ' ET'
  );
}

function swingLabel(away, home, awayAbbr, homeAbbr, awayColor, homeColor) {
  const gap = Math.abs(away - home);
  if (gap <= 8) return { text: 'EVEN', color: '#6b7c93' };
  const leader = away > home ? awayAbbr : homeAbbr;
  const color = away > home ? awayColor : homeColor;
  return { text: `${leader} SWING`, color };
}

export default function GameCard({ game }) {
  const g = game;
  const isLive = LIVE_STATUSES.has(g.status);
  const isFinal = g.status === 'STATUS_FINAL';
  const isPre = g.status === 'STATUS_SCHEDULED';
  const hasMom = !!g.mom;
  const clockDisplay = g.status === 'STATUS_HALFTIME' ? 'HALFTIME' : g.clock;

  const aWin = g.awayScore > g.homeScore;
  const hWin = g.homeScore > g.awayScore;
  const aColor = isLive || isFinal ? (aWin ? g.awayColor : '#ccc') : '#ccc';
  const hColor = isLive || isFinal ? (hWin ? g.homeColor : '#ccc') : '#ccc';

  let borderClass = 'bg-white rounded-xl border transition-all duration-300';
  if (g.bluffing) {
    borderClass += ' border-[#C0392B] shadow-[0_0_0_2px_#C0392B]';
  } else if (g.comeback) {
    borderClass += ' border-[#1493ff] shadow-[0_0_0_2px_#1493ff]';
  } else if (g.swingWarning) {
    borderClass += ' border-[#F1C40F] shadow-[0_0_0_2px_#F1C40F]';
  } else {
    borderClass += ' border-[#e0e0e0]';
  }

  return (
    <div className={borderClass} style={{ padding: '12px' }}>
      {/* Top bar */}
      <div className="pb-3 mb-3 border-b border-black/5 flex justify-between items-center">
        <span className="text-sm font-semibold text-[#6b7c93]">
          {g.league} &middot; {g.shortName || g.name}
        </span>
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
      </div>

      {/* Score row */}
      <div className="pb-3">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
          {/* Away team */}
          <div>
            <div
              className="text-lg font-black tracking-wide"
              style={{ color: g.awayColor }}
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
                    className="font-mono text-5xl font-extrabold leading-none transition-colors duration-500"
                    style={{ color: aColor }}
                  >
                    {g.awayScore}
                  </span>
                  <span className="text-3xl font-bold text-[#8494a7]">&ndash;</span>
                  <span
                    className="font-mono text-5xl font-extrabold leading-none transition-colors duration-500"
                    style={{ color: hColor }}
                  >
                    {g.homeScore}
                  </span>
                </div>
                <div className="text-sm text-[#6b7c93] mt-1">{g.network}</div>
              </>
            ) : (
              <>
                <div className="font-mono text-lg text-[#8494a7]">{formatTime(g.date)}</div>
                <div className="text-sm text-[#6b7c93] mt-1">{g.network}</div>
              </>
            )}
          </div>

          {/* Home team */}
          <div className="text-right">
            <div
              className="text-lg font-black tracking-wide"
              style={{ color: g.homeColor }}
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
              <div className="flex-1 h-2.5 bg-[#ebebeb] rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-[width] duration-[1.2s] ease-out opacity-90"
                  style={{ width: `${g.mom.away}%`, backgroundColor: g.awayColor }}
                />
              </div>
              <div className="min-w-[90px] text-center font-mono text-sm font-bold tracking-wide whitespace-nowrap">
                {(() => {
                  const s = swingLabel(
                    g.mom.away,
                    g.mom.home,
                    g.awayAbbr,
                    g.homeAbbr,
                    g.awayColor,
                    g.homeColor,
                  );
                  return <span style={{ color: s.color, fontWeight: 800 }}>{s.text}</span>;
                })()}
              </div>
              <div className="flex-1 h-2.5 bg-[#ebebeb] rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-[width] duration-[1.2s] ease-out opacity-90 float-right"
                  style={{ width: `${g.mom.home}%`, backgroundColor: g.homeColor }}
                />
              </div>
            </div>
            <div className="flex justify-between px-0.5">
              <span className="font-mono text-sm font-semibold text-[#8494a7]">
                {g.mom.away}
              </span>
              <span className="font-mono text-sm font-semibold text-[#8494a7]">
                {g.mom.home}
              </span>
            </div>
          </div>

          <Sparkline
            chartAway={g.mom.chartAway}
            chartHome={g.mom.chartHome}
            awayColor={g.awayColor}
            homeColor={g.homeColor}
            awayAbbr={g.awayAbbr}
            homeAbbr={g.homeAbbr}
          />

          <PlayFeed
            plays={g.mom.recentPlays}
            awayAbbr={g.awayAbbr}
            homeAbbr={g.homeAbbr}
            awayColor={g.awayColor}
            homeColor={g.homeColor}
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
        <div className="mt-3 -mx-8 px-8 py-3.5 border-t border-[#f0f0f0] text-base italic leading-snug text-[#C0392B] bg-red-50/50 rounded-b-xl">
          &#x26A1; Score is Bluffing &mdash;{' '}
          {g.awayScore > g.homeScore ? g.awayAbbr : g.homeAbbr} leads score,{' '}
          {g.mom.away > g.mom.home ? g.awayAbbr : g.homeAbbr} leads The Swing
          {g.status === 'STATUS_HALFTIME' && (
            <span className="text-xs opacity-70 not-italic"> &middot; Full half of data</span>
          )}
        </div>
      )}
      {g.comeback && (
        <div className="mt-3 -mx-8 px-8 py-3.5 border-t border-[#f0f0f0] text-base italic leading-snug text-[#1493ff] bg-blue-50/50 rounded-b-xl">
          &#x1F440; Comeback Watch &mdash;{' '}
          {g.awayScore < g.homeScore ? g.awayAbbr : g.homeAbbr} trails score but leads momentum
          {g.status === 'STATUS_HALFTIME' && (
            <span className="text-xs opacity-70 not-italic"> &middot; Full half of data</span>
          )}
        </div>
      )}
      {g.swingWarning && (
        <div className="mt-3 -mx-8 px-8 py-3.5 border-t border-[#f0f0f0] text-base italic leading-snug text-[#b8960c] bg-yellow-50/50 rounded-b-xl">
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
