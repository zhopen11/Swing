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
  { min: 305, label: 'Elite', color: '#00C853' },
  { min: 255, label: 'Excellent', color: '#66BB6A' },
  { min: 215, label: 'Above Avg', color: '#FFD700' },
  { min: 175, label: 'Average', color: '#FF9800' },
  { min: 0,   label: 'Below Avg', color: '#C0392B' },
];

function getTier(avgImpact) {
  for (const t of TIERS) {
    if (avgImpact >= t.min) return t;
  }
  return TIERS[TIERS.length - 1];
}

function SwingerRow({ player, color, rank, maxImpact, advantageColor }) {
  const [showPopup, setShowPopup] = useState(false);
  const timerRef = useRef(null);
  const gamesPlayed = Number(player.gamesPlayed) || 1;
  const clutchRate = Number(player.clutchGames) / gamesPlayed;
  const clutch = clutchRate > 0.5;
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
          <span className="font-mono text-xs" style={{ color: advantageColor, fontWeight: 700 }}>
            {impact > 0 ? '+' : ''}{Math.round(impact)}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: '2px' }}>
        <span className="text-[10px] text-[#8494a7] shrink-0" style={{ width: '14px' }}></span>
        <div className="bg-[#ebebeb] rounded-full overflow-hidden flex-1" style={{ height: '3px' }}>
          <div className="rounded-full" style={{ width: `${barPct}%`, backgroundColor: advantageColor, height: '100%' }} />
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

export default function PregameMatchup({ rolling3Away, rolling3Home, pregameSwingers, odds, awayAbbr, homeAbbr, awayColor, homeColor }) {
  const [open, setOpen] = useState(false);

  const hasMomentum = (rolling3Away && (rolling3Away.mvix != null || rolling3Away.mrvi != null)) ||
    (rolling3Home && (rolling3Home.mvix != null || rolling3Home.mrvi != null));
  const hasSwingers = pregameSwingers?.away?.length > 0 || pregameSwingers?.home?.length > 0;
  const hasOdds = odds && (odds.details || odds.overUnder != null);

  if (!hasMomentum && !hasSwingers && !hasOdds) return null;

  const awayGames = rolling3Away?.games || 0;
  const homeGames = rolling3Home?.games || 0;
  const gamesLabel = awayGames === homeGames ? `Last ${awayGames}gm` : 'Recent';

  const awaySwingers = [...(pregameSwingers?.away || [])].sort((a, b) => Number(b.avgWeightedImpact) - Number(a.avgWeightedImpact));
  const homeSwingers = [...(pregameSwingers?.home || [])].sort((a, b) => Number(b.avgWeightedImpact) - Number(a.avgWeightedImpact));
  const allImpacts = [...awaySwingers, ...homeSwingers].map(p => Math.abs(Number(p.avgWeightedImpact)));
  const maxImpact = Math.max(...allImpacts, 1);
  const awayTotal = awaySwingers.reduce((s, p) => s + (Number(p.avgWeightedImpact) || 0), 0);
  const homeTotal = homeSwingers.reduce((s, p) => s + (Number(p.avgWeightedImpact) || 0), 0);
  const awayAdvantageColor = awayTotal >= homeTotal ? '#00C853' : '#C0392B';
  const homeAdvantageColor = homeTotal >= awayTotal ? '#00C853' : '#C0392B';

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
          {/* Lines — compact inline */}
          {hasOdds && (
            <div className="flex items-center gap-2" style={{ margin: '6px 0 4px' }}>
              <span className="text-xs font-bold text-[#001c55] uppercase tracking-wide">Lines</span>
              <div className="flex-1 h-px bg-[#dce6f0]" />
              {odds.details && (
                <span className="font-mono text-xs font-bold" style={{
                  color: odds.details.includes(awayAbbr) ? awayColor
                    : odds.details.includes(homeAbbr) ? homeColor
                    : '#333'
                }}>{odds.details}</span>
              )}
              {odds.details && odds.overUnder != null && (
                <div style={{ width: '1px', height: '12px', background: '#dce6f0' }} />
              )}
              {odds.overUnder != null && (
                <span className="font-mono text-xs font-bold text-[#1493ff]">O/U {odds.overUnder}</span>
              )}
            </div>
          )}

          {/* Momentum Trends — single row */}
          {hasMomentum && (
            <>
            <div className="flex items-center gap-2" style={{ margin: '6px 0 2px' }}>
              <span className="text-xs font-bold text-[#001c55] uppercase tracking-wide">Momentum Trends</span>
              <span className="text-[10px] text-[#8494a7]">{gamesLabel}</span>
              <div className="flex-1 h-px bg-[#dce6f0]" />
            </div>
            <div className="flex items-center gap-2" style={{ margin: '0 0 4px' }}>
              <span className="font-mono text-xs">
                <span style={{ fontWeight: 700, color: rolling3Away?.mvix != null ? mvixColor(rolling3Away.mvix) : '#8494a7' }}>{rolling3Away?.mvix ?? '–'}</span>
                <span className="text-[#8494a7]"> MVIX</span>
                <span className="text-[#8494a7]"> | </span>
                <span style={{ fontWeight: 700, color: rolling3Away?.mrvi != null ? mrviColor(rolling3Away.mrvi) : '#8494a7' }}>{rolling3Away?.mrvi != null ? Math.round(rolling3Away.mrvi) : '–'}</span>
                <span className="text-[#8494a7]"> MRVI</span>
              </span>
              <div className="flex-1 h-px bg-[#dce6f0]" />
              <span className="font-mono text-xs">
                <span className="text-[#8494a7]">MVIX </span>
                <span style={{ fontWeight: 700, color: rolling3Home?.mvix != null ? mvixColor(rolling3Home.mvix) : '#8494a7' }}>{rolling3Home?.mvix ?? '–'}</span>
                <span className="text-[#8494a7]"> | MRVI </span>
                <span style={{ fontWeight: 700, color: rolling3Home?.mrvi != null ? mrviColor(rolling3Home.mrvi) : '#8494a7' }}>{rolling3Home?.mrvi != null ? Math.round(rolling3Home.mrvi) : '–'}</span>
              </span>
            </div>
            </>
          )}

          {/* Subsection: Top Swingers */}
          {hasSwingers && (
            <>
              <SubsectionHeader title="Top Swingers" />
              <div className="grid grid-cols-[1fr_1px_1fr] gap-3">
                <div>
                  <div className="text-xs font-bold tracking-wide mb-1 flex items-center gap-1" style={{ color: awayColor }}>
                    {awayAbbr}
                    <span className="font-mono" style={{ fontSize: '10px', color: awayAdvantageColor, fontWeight: 700 }}>
                      ({Math.round(awayTotal)} total)
                    </span>
                  </div>
                  {awaySwingers.length > 0 ? (
                    awaySwingers.map((p, i) => {
                      const awayImp = Number(p.avgWeightedImpact) || 0;
                      const homeImp = Number(homeSwingers[i]?.avgWeightedImpact) || 0;
                      const ac = awayImp >= homeImp ? '#00C853' : '#C0392B';
                      return <SwingerRow key={i} player={p} color={awayColor} rank={i + 1} maxImpact={maxImpact} advantageColor={ac} />;
                    })
                  ) : (
                    <span className="text-xs text-[#8494a7]">No data</span>
                  )}
                </div>
                <div style={{ backgroundColor: '#dce6f0' }} />
                <div>
                  <div className="text-xs font-bold tracking-wide mb-1 flex items-center justify-end gap-1" style={{ color: homeColor }}>
                    <span className="font-mono" style={{ fontSize: '10px', color: homeAdvantageColor, fontWeight: 700 }}>
                      ({Math.round(homeTotal)} total)
                    </span>
                    {homeAbbr}
                  </div>
                  {homeSwingers.length > 0 ? (
                    homeSwingers.map((p, i) => {
                      const homeImp = Number(p.avgWeightedImpact) || 0;
                      const awayImp = Number(awaySwingers[i]?.avgWeightedImpact) || 0;
                      const ac = homeImp >= awayImp ? '#00C853' : '#C0392B';
                      return <SwingerRow key={i} player={p} color={homeColor} rank={i + 1} maxImpact={maxImpact} advantageColor={ac} />;
                    })
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
