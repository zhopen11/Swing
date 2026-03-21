'use client';

import { useState, useRef, useCallback } from 'react';

function mvixColor(v) {
  if (v < 40) return '#00C853';
  if (v > 65) return '#C0392B';
  return '#FFD700';
}

function mrviColor(v) {
  if (v > 55) return '#00C853';
  if (v < 45) return '#C0392B';
  return '#FFD700';
}

function StatRow({ label, awayVal, homeVal, colorFn }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '2px 0' }}>
      <span className="font-mono text-xs font-bold" style={{ color: colorFn ? colorFn(awayVal) : '#555', minWidth: '32px' }}>
        {awayVal}
      </span>
      <span className="text-xs text-[#8494a7] flex-1 text-center">{label}</span>
      <span className="font-mono text-xs font-bold text-right" style={{ color: colorFn ? colorFn(homeVal) : '#555', minWidth: '32px' }}>
        {homeVal}
      </span>
    </div>
  );
}

function SubsectionHeader({ title }) {
  return (
    <div className="flex items-center gap-2" style={{ margin: '8px 0 4px' }}>
      <span className="text-xs font-bold text-[#001c55] uppercase tracking-wide">{title}</span>
      <div className="flex-1 h-px bg-[#dce6f0]" />
    </div>
  );
}

const TIERS = [
  { min: 305, label: 'Elite', color: '#C0392B' },
  { min: 255, label: 'Excellent', color: '#E67E22' },
  { min: 215, label: 'Above Avg', color: '#1493ff' },
  { min: 175, label: 'Average', color: '#6b7c93' },
  { min: 0,   label: 'Below Avg', color: '#8494a7' },
];

function getTier(avgImpact) {
  for (const t of TIERS) {
    if (avgImpact >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

function SwingerRow({ player, color, rank, maxImpact }) {
  const [showPopup, setShowPopup] = useState(false);
  const timerRef = useRef(null);
  const clutch = player.clutchGames > 0;
  const impact = Number(player.avgWeightedImpact) || 0;
  const tier = getTier(impact);
  const jersey = player.jersey ? `#${player.jersey}` : '';
  const barPct = maxImpact > 0 ? Math.min(Math.abs(impact) / maxImpact * 100, 100) : 0;

  const openPopup = useCallback(() => {
    setShowPopup(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowPopup(false), 5000);
  }, []);

  const closePopup = useCallback(() => {
    clearTimeout(timerRef.current);
    setShowPopup(false);
  }, []);

  return (
    <div style={{ padding: '3px 0', position: 'relative' }}>
      <div
        className="flex items-center gap-1 cursor-pointer"
        onClick={openPopup}
      >
        <span className="font-mono font-bold text-[#8494a7] shrink-0" style={{ fontSize: '10px', width: '14px' }}>
          {rank}
        </span>
        <span className="text-xs font-semibold text-[#333] truncate flex-1">
          {player.player}
        </span>
        <span className="shrink-0 flex items-center gap-1">
          {clutch && (
            <span
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
          <span className="font-mono text-xs" style={{ color: tier.color, fontWeight: 700 }}>
            {impact > 0 ? '+' : ''}{Math.round(impact)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: '2px' }}>
        <span className="text-[10px] text-[#8494a7] shrink-0" style={{ width: '14px' }}></span>
        <div className="bg-[#ebebeb] rounded-full overflow-hidden flex-1" style={{ height: '3px' }}>
          <div className="rounded-full" style={{ width: `${barPct}%`, backgroundColor: tier.color, height: '100%' }} />
        </div>
        <span className="text-[10px] text-[#8494a7] shrink-0">
          {player.gamesPlayed}gm
        </span>
      </div>

      {/* Detail popup */}
      {showPopup && (
        <div
          onClick={closePopup}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            marginBottom: '4px',
            backgroundColor: '#001c55',
            color: '#fff',
            fontSize: '11px',
            padding: '10px 12px',
            borderRadius: '8px',
            zIndex: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: 'pointer',
          }}
        >
          <div className="font-bold" style={{ fontSize: '13px', marginBottom: '6px' }}>
            {player.player} {jersey && <span className="font-normal text-[#8494a7]">{jersey}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            <div>
              <span className="text-[#8494a7]">Tier: </span>
              <span style={{ color: tier.color, fontWeight: 700 }}>{tier.label}</span>
            </div>
            <div>
              <span className="text-[#8494a7]">Games: </span>
              <span className="font-mono">{player.gamesPlayed}</span>
            </div>
            <div>
              <span className="text-[#8494a7]">Adj. Impact: </span>
              <span className="font-mono">{player.avgWeightedImpact > 0 ? '+' : ''}{player.avgWeightedImpact}</span>
            </div>
            <div>
              <span className="text-[#8494a7]">Raw Impact: </span>
              <span className="font-mono">{player.rawAvgWeightedImpact > 0 ? '+' : ''}{player.rawAvgWeightedImpact || player.avgWeightedImpact}</span>
            </div>
            <div>
              <span className="text-[#8494a7]">Efficiency: </span>
              <span className="font-mono">{player.avgEfficiency}%</span>
            </div>
            <div>
              <span className="text-[#8494a7]">Conf. Strength: </span>
              <span className="font-mono">{player.confStrength ?? '–'}</span>
            </div>
            <div>
              <span className="text-[#8494a7]">Clutch Games: </span>
              <span className="font-mono">{player.clutchGames || 0}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PregameMatchup({ rolling3Away, rolling3Home, pregameSwingers, awayAbbr, homeAbbr, awayColor, homeColor }) {
  const [open, setOpen] = useState(false);

  const hasMomentum = (rolling3Away && (rolling3Away.mvix != null || rolling3Away.mrvi != null)) ||
    (rolling3Home && (rolling3Home.mvix != null || rolling3Home.mrvi != null));
  const hasSwingers = pregameSwingers?.away?.length > 0 || pregameSwingers?.home?.length > 0;

  if (!hasMomentum && !hasSwingers) return null;

  const awayGames = rolling3Away?.games || 0;
  const homeGames = rolling3Home?.games || 0;
  const gamesLabel = awayGames === homeGames ? `Last ${awayGames}gm` : 'Recent';

  const awaySwingers = [...(pregameSwingers?.away || [])].sort((a, b) => Number(b.avgWeightedImpact) - Number(a.avgWeightedImpact));
  const homeSwingers = [...(pregameSwingers?.home || [])].sort((a, b) => Number(b.avgWeightedImpact) - Number(a.avgWeightedImpact));
  const allImpacts = [...awaySwingers, ...homeSwingers].map(p => Math.abs(Number(p.avgWeightedImpact)));
  const maxImpact = Math.max(...allImpacts, 1);

  return (
    <>
      <div
        className="flex items-center justify-between py-3 border-t border-[#f0f0f0] cursor-pointer select-none transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-[#6b7c93]">
          {open ? '\u25BE' : '\u25B8'} Pregame 411
        </span>
        <span
          className="text-sm text-[#8494a7] inline-block transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          &#x25BE;
        </span>
      </div>
      {open && (
        <div style={{ paddingBottom: '6px', marginBottom: '2px', borderLeft: '2px solid #dce6f0', paddingLeft: '10px', background: '#f8fafc', borderRadius: '0 0 6px 6px' }}>
          {/* Subsection: Momentum Trends */}
          {hasMomentum && (
            <>
              <SubsectionHeader title="Momentum Trends" />
              <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
                <span className="text-xs font-bold tracking-wide" style={{ color: awayColor }}>{awayAbbr}</span>
                <span className="text-xs text-[#8494a7]">{gamesLabel}</span>
                <span className="text-xs font-bold tracking-wide" style={{ color: homeColor }}>{homeAbbr}</span>
              </div>
              {(rolling3Away?.mvix != null || rolling3Home?.mvix != null) && (
                <StatRow
                  label="MVIX"
                  awayVal={rolling3Away?.mvix ?? '–'}
                  homeVal={rolling3Home?.mvix ?? '–'}
                  colorFn={(v) => v === '–' ? '#8494a7' : mvixColor(v)}
                />
              )}
              {(rolling3Away?.mrvi != null || rolling3Home?.mrvi != null) && (
                <StatRow
                  label="MRVI"
                  awayVal={rolling3Away?.mrvi != null ? Math.round(rolling3Away.mrvi) : '–'}
                  homeVal={rolling3Home?.mrvi != null ? Math.round(rolling3Home.mrvi) : '–'}
                  colorFn={(v) => v === '–' ? '#8494a7' : mrviColor(v)}
                />
              )}
            </>
          )}

          {/* Subsection: Top Swingers */}
          {hasSwingers && (
            <>
              <SubsectionHeader title="Top Swingers" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-bold tracking-wide mb-1 flex items-center gap-1" style={{ color: awayColor }}>
                    {awayAbbr}
                    <span className="font-mono" style={{ fontSize: '10px', color: '#555' }}>
                      ({Math.round(awaySwingers.reduce((s, p) => s + (Number(p.avgWeightedImpact) || 0), 0))} total)
                    </span>
                  </div>
                  {awaySwingers.length > 0 ? (
                    awaySwingers.map((p, i) => (
                      <SwingerRow key={i} player={p} color={awayColor} rank={i + 1} maxImpact={maxImpact} />
                    ))
                  ) : (
                    <span className="text-xs text-[#8494a7]">No data</span>
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold tracking-wide mb-1 flex items-center justify-end gap-1" style={{ color: homeColor }}>
                    <span className="font-mono" style={{ fontSize: '10px', color: '#555' }}>
                      ({Math.round(homeSwingers.reduce((s, p) => s + (Number(p.avgWeightedImpact) || 0), 0))} total)
                    </span>
                    {homeAbbr}
                  </div>
                  {homeSwingers.length > 0 ? (
                    homeSwingers.map((p, i) => (
                      <SwingerRow key={i} player={p} color={homeColor} rank={i + 1} maxImpact={maxImpact} />
                    ))
                  ) : (
                    <span className="text-xs text-[#8494a7]">No data</span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
