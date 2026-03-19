'use client';

import { useState } from 'react';

const ALERT_STYLES = {
  bluffing: { label: 'Score is Bluffing', color: '#C0392B' },
  comeback: { label: 'Comeback Watch', color: '#00C853' },
  swingWarning: { label: 'Swing Warning', color: '#FFD700' },
};

export default function AlertHistory({ alertLogs, awayAbbr, homeAbbr, awayColor, homeColor }) {
  const [open, setOpen] = useState(false);

  const alerts = alertLogs || [];

  return (
    <>
      <div
        className="flex items-center justify-between py-3 border-t border-[#f0f0f0] cursor-pointer select-none transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-[#6b7c93]">
          {open ? '\u25BE' : '\u25B8'} Swing History{alerts.length > 0 && <span className="ml-2 text-[#8494a7]">({alerts.length})</span>}
        </span>
        <span
          className="text-sm text-[#8494a7] inline-block transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          &#x25BE;
        </span>
      </div>
      {open && (
        <div className="max-h-[240px] overflow-y-auto py-2 scrollbar-thin">
          {alerts.length === 0 && (
            <div className="text-sm text-[#8494a7] text-center py-2">No swings recorded</div>
          )}
          {alerts.map((a, i) => {
            const style = ALERT_STYLES[a.alert_type] || ALERT_STYLES.bluffing;
            const period = a.period || '?';
            const clock = a.clock || '';

            return (
              <div
                key={a.id || i}
                className="py-2 px-1 text-sm leading-relaxed"
                style={{ borderLeft: `3px solid ${style.color}`, marginBottom: 4, paddingLeft: 8 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold" style={{ color: style.color }}>
                    {style.label}
                  </span>
                  <span className="font-mono text-xs text-[#6b7c93]">
                    P{period} {clock}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs mb-1 font-mono font-bold">
                  <span style={{ color: awayColor }}>{awayAbbr}</span>
                  <span className="text-[#555]">{a.away_score} – {a.home_score}</span>
                  <span style={{ color: homeColor }}>{homeAbbr}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold min-w-[36px]" style={{ color: awayColor }}>{awayAbbr}</span>
                  <span className="text-[#6b7c93]">
                    Mom {a.away_momentum} · MVIX {a.away_mvix ?? '–'}
                    {a.away_bias != null && <> · Bias {a.away_bias > 0 ? '+' : ''}{a.away_bias}</>}
                    {a.away_mrvi != null && <> · MRVI {Math.round(a.away_mrvi)}</>}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs mt-0.5">
                  <span className="font-semibold min-w-[36px]" style={{ color: homeColor }}>{homeAbbr}</span>
                  <span className="text-[#6b7c93]">
                    Mom {a.home_momentum} · MVIX {a.home_mvix ?? '–'}
                    {a.home_bias != null && <> · Bias {a.home_bias > 0 ? '+' : ''}{a.home_bias}</>}
                    {a.home_mrvi != null && <> · MRVI {Math.round(a.home_mrvi)}</>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
