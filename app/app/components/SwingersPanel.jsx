'use client';

import { useState, useRef, useCallback } from 'react';

function PlayerRow({ player, maxImpact, color, rank, advantageColor }) {
  const isClutch = player.clutchAppearances > 0;
  const [showTip, setShowTip] = useState(false);
  const timerRef = useRef(null);
  const impact = player.weightedImpact || 0;
  const barPct = maxImpact > 0 ? Math.min(Math.abs(impact) / maxImpact * 100, 100) : 0;

  const openTip = useCallback(() => {
    setShowTip(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowTip(false), 3000);
  }, []);

  const closeTip = useCallback(() => {
    clearTimeout(timerRef.current);
    setShowTip(false);
  }, []);

  const jerseyLabel = player.jersey ? `#${player.jersey}` : '';
  const tipText = [player.player, jerseyLabel].filter(Boolean).join(' · ');

  return (
    <div style={{ padding: '3px 0', position: 'relative' }}>
      <div className="flex items-center gap-1 cursor-pointer" onClick={openTip} onMouseEnter={openTip} onMouseLeave={closeTip}>
        <span className="font-mono font-bold text-[#8494a7] shrink-0" style={{ fontSize: '10px', width: '14px' }}>
          {rank}
        </span>
        <span className="text-xs font-semibold text-[#333] truncate flex-1">
          {player.player}
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {isClutch && (
            <span
              title={`${player.clutchPositive}/${player.clutchAppearances} clutch swing plays`}
              style={{
                fontSize: '8px',
                fontWeight: 800,
                color: '#C0392B',
                border: '1px solid #C0392B',
                borderRadius: '2px',
                padding: '0 2px',
                lineHeight: '12px',
              }}
            >
              CL
            </span>
          )}
          <span className="font-mono text-xs" style={{ color: advantageColor, fontWeight: 700 }}>
            {impact > 0 ? '+' : ''}{Math.round(impact)}
          </span>
        </span>
      </div>
      {showTip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            backgroundColor: '#001c55',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            padding: '4px 8px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            zIndex: 10,
            pointerEvents: 'none',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          }}
        >
          {tipText} · {player.efficiency}%
        </div>
      )}
      <div className="flex items-center gap-2" style={{ marginTop: '2px' }}>
        <span style={{ width: '14px' }} />
        <div className="bg-[#ebebeb] rounded-full overflow-hidden flex-1" style={{ height: '3px' }}>
          <div className="rounded-full transition-[width] duration-500" style={{ width: `${barPct}%`, backgroundColor: advantageColor, height: '100%' }} />
        </div>
      </div>
    </div>
  );
}

export default function SwingersPanel({ swingers, awayAbbr, homeAbbr, awayColor, homeColor }) {
  const [open, setOpen] = useState(false);

  if (!swingers?.away?.length && !swingers?.home?.length) return null;

  const awayPlayers = swingers.away || [];
  const homePlayers = swingers.home || [];
  const allImpacts = [...awayPlayers, ...homePlayers].map((p) => Math.abs(p.weightedImpact));
  const maxImpact = Math.max(...allImpacts, 1);
  const totalCount = awayPlayers.length + homePlayers.length;
  const awayTotal = awayPlayers.reduce((s, p) => s + (p.weightedImpact || 0), 0);
  const homeTotal = homePlayers.reduce((s, p) => s + (p.weightedImpact || 0), 0);
  const awayAdvColor = awayTotal >= homeTotal ? '#00C853' : '#C0392B';
  const homeAdvColor = homeTotal >= awayTotal ? '#00C853' : '#C0392B';

  return (
    <>
      <div
        className="flex items-center justify-between py-3 border-t border-[#f0f0f0] cursor-pointer select-none transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-[#1493ff]">
          {open ? '\u25BE' : '\u25B8'} Swingers - Live In Game{' '}<span className="text-[#8494a7]">({totalCount})</span>
        </span>
        <span
          className="text-sm text-[#8494a7] inline-block transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          &#x25BE;
        </span>
      </div>
      {open && (
        <div className="grid grid-cols-[1fr_1px_1fr] gap-3 pb-2" style={{ borderLeft: '2px solid #dce6f0', paddingLeft: '10px', marginBottom: '2px', background: '#f8fafc', borderRadius: '0 0 6px 6px' }}>
          {/* Away swingers */}
          <div>
            <div className="text-xs font-bold tracking-wide mb-1 flex items-center gap-1" style={{ color: awayColor }}>
              {awayAbbr}
              <span className="font-mono" style={{ fontSize: '10px', color: awayAdvColor, fontWeight: 700 }}>
                ({Math.round(awayTotal)} total)
              </span>
            </div>
            {awayPlayers.length > 0 ? (
              awayPlayers.map((p, i) => {
                const awayImp = p.weightedImpact || 0;
                const homeImp = homePlayers[i]?.weightedImpact || 0;
                const ac = awayImp >= homeImp ? '#00C853' : '#C0392B';
                return <PlayerRow key={i} player={p} maxImpact={maxImpact} color={awayColor} rank={i + 1} advantageColor={ac} />;
              })
            ) : (
              <span className="text-xs text-[#8494a7]">No swing plays</span>
            )}
          </div>
          <div style={{ backgroundColor: '#dce6f0' }} />
          {/* Home swingers */}
          <div>
            <div className="text-xs font-bold tracking-wide mb-1 flex items-center justify-end gap-1" style={{ color: homeColor }}>
              <span className="font-mono" style={{ fontSize: '10px', color: homeAdvColor, fontWeight: 700 }}>
                ({Math.round(homeTotal)} total)
              </span>
              {homeAbbr}
            </div>
            {homePlayers.length > 0 ? (
              homePlayers.map((p, i) => {
                const homeImp = p.weightedImpact || 0;
                const awayImp = awayPlayers[i]?.weightedImpact || 0;
                const ac = homeImp >= awayImp ? '#00C853' : '#C0392B';
                return <PlayerRow key={i} player={p} maxImpact={maxImpact} color={homeColor} rank={i + 1} advantageColor={ac} />;
              })
            ) : (
              <span className="text-xs text-[#8494a7]">No swing plays</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
