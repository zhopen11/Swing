'use client';

import { useState, useRef } from 'react';

function formatGameTime(point, league) {
  if (!point) return '';
  const p = point.p;
  const c = point.c || '';
  if (!p) return c;
  if (league === 'NBA') {
    const label = p <= 4 ? `Q${p}` : `OT${p > 5 ? p - 4 : ''}`;
    return `${label} ${c}`;
  }
  // CBB — 2 halves
  const label = p === 1 ? '1st Half' : p === 2 ? '2nd Half' : `OT${p > 3 ? p - 2 : ''}`;
  return `${label} ${c}`;
}

export default function Sparkline({ chartAway, chartHome, awayColor, homeColor, awayAbbr, homeAbbr, isLive, league, mvixAway, mvixHome }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);
  const tooltipTimer = useRef(null);
  if (!chartAway || !chartHome || chartAway.length < 2) return null;

  const W = 300;
  const H = 80;
  const n = Math.min(chartAway.length, chartHome.length);

  // For live games, data occupies 75% of width; rest is forecast zone
  const dataW = isLive ? W * 0.87 : W;
  const forecastX = dataW; // "NOW" line position

  // Compute auto-scaled Y range from actual data
  const allVals = [
    ...chartAway.slice(0, n).map((p) => p.v),
    ...chartHome.slice(0, n).map((p) => p.v),
  ];
  const dataMin = Math.min(...allVals);
  const dataMax = Math.max(...allVals);
  const padding = Math.max(5, (dataMax - dataMin) * 0.15);
  const yMin = Math.max(0, Math.floor(dataMin - padding));
  const yMax = Math.min(100, Math.ceil(dataMax + padding));
  const yRange = yMax - yMin || 1;

  function toX(i) {
    return (i / (n - 1)) * (dataW - 4) + 2;
  }
  function toY(v) {
    return H - 4 - ((v - yMin) / yRange) * (H - 8);
  }

  // Convert period + clock to total game seconds elapsed
  function gameSecondsElapsed(point) {
    const p = point.p || 1;
    const c = point.c || '0:00';
    const [m, s] = c.split(':').map(Number);
    const clockSecs = (m || 0) * 60 + (s || 0);
    // NBA: 12-min quarters, CBB: 20-min halves
    const periodMins = league === 'NBA' ? 12 : 20;
    const periodSecs = periodMins * 60;
    // Clock counts down, so elapsed in current period = periodSecs - clockSecs
    return (p - 1) * periodSecs + (periodSecs - clockSecs);
  }

  // Get indices for last 5 game-time minutes of data
  function getLast5MinIndices(chart) {
    if (!chart || chart.length < 2) return { startIdx: 0, endIdx: chart.length - 1 };
    const lastElapsed = gameSecondsElapsed(chart[chart.length - 1]);
    const cutoff = lastElapsed - 3 * 60; // 3 game-time minutes
    let startIdx = chart.length - 1;
    for (let i = chart.length - 1; i >= 0; i--) {
      if (gameSecondsElapsed(chart[i]) >= cutoff) {
        startIdx = i;
      } else {
        break;
      }
    }
    return { startIdx, endIdx: chart.length - 1 };
  }

  // Linear regression
  function trendLine(chart, startIdx, endIdx) {
    const points = [];
    for (let i = startIdx; i <= endIdx; i++) {
      points.push({ x: i, y: chart[i].v });
    }
    if (points.length < 2) return null;

    const nPts = points.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    }
    const denom = nPts * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const slope = (nPts * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / nPts;

    return { startIdx, endIdx, slope, intercept };
  }

  function projectValue(trend, steps) {
    if (!trend) return null;
    const val = trend.slope * (trend.endIdx + steps) + trend.intercept;
    return Math.max(yMin, Math.min(yMax, val));
  }

  const pathA = Array.from({ length: n }, (_, i) =>
    (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ' ' + toY(chartAway[i].v).toFixed(1),
  ).join(' ');

  const pathH = Array.from({ length: n }, (_, i) =>
    (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ' ' + toY(chartHome[i].v).toFixed(1),
  ).join(' ');

  const midY = toY(50).toFixed(1);
  const nowX = toX(n - 1).toFixed(1);

  // Compute trends — if last 5 min has < 3 points, use last 25% of all data
  function getTrendRange(chart) {
    const range = getLast5MinIndices(chart);
    const count = range.endIdx - range.startIdx + 1;
    if (count >= 3) return range;
    // Fallback: use last 25% of data points
    const fallbackStart = Math.max(0, chart.length - Math.ceil(chart.length * 0.25));
    return { startIdx: fallbackStart, endIdx: chart.length - 1 };
  }

  const awayRange = getTrendRange(chartAway);
  const homeRange = getTrendRange(chartHome);
  const awayTrend = trendLine(chartAway, awayRange.startIdx, awayRange.endIdx);
  const homeTrend = trendLine(chartHome, homeRange.startIdx, homeRange.endIdx);

  // Project to right edge of chart
  const projSteps = Math.max(1, Math.round(n * 0.10));
  const projEndX = W - 2;
  const awayProjVal = projectValue(awayTrend, projSteps);
  const homeProjVal = projectValue(homeTrend, projSteps);

  const handleChartClick = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clickXRatio = (e.clientX - rect.left) / rect.width;
    const svgX = clickXRatio * W;
    const clickYRatio = (e.clientY - rect.top) / rect.height;
    const svgY = clickYRatio * H;
    const leftPct = clickXRatio * 100;

    // Check if click is in the forecast zone
    if (isLive && svgX > forecastX && awayTrend && homeTrend) {
      // Interpolate projected values at click position
      const forecastRatio = (svgX - forecastX) / (W - forecastX);
      const steps = forecastRatio * projSteps;

      const awayProjAtClick = Math.max(yMin, Math.min(yMax,
        awayTrend.slope * (awayTrend.endIdx + steps) + awayTrend.intercept
      ));
      const homeProjAtClick = Math.max(yMin, Math.min(yMax,
        homeTrend.slope * (homeTrend.endIdx + steps) + homeTrend.intercept
      ));

      const awayRound = Math.round(awayProjAtClick);
      const homeRound = Math.round(homeProjAtClick);

      if (Math.abs(awayRound - homeRound) <= 2) {
        setTooltip({ dual: true, away: { team: awayAbbr, val: awayRound, color: awayColor }, home: { team: homeAbbr, val: homeRound, color: homeColor }, time: 'Projected', leftPct });
      } else {
        const awayY = toY(awayProjAtClick);
        const homeY = toY(homeProjAtClick);
        const pickAway = Math.abs(awayY - svgY) <= Math.abs(homeY - svgY);
        const team = pickAway ? awayAbbr : homeAbbr;
        const color = pickAway ? awayColor : homeColor;
        const val = pickAway ? awayRound : homeRound;
        setTooltip({ team, val, time: 'Projected', color, leftPct });
      }
      clearTimeout(tooltipTimer.current);
      tooltipTimer.current = setTimeout(() => setTooltip(null), 5000);
      return;
    }

    // Find closest data index
    let closestIdx = 0;
    let closestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(toX(i) - svgX);
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    const awayVal = chartAway[closestIdx].v;
    const homeVal = chartHome[closestIdx].v;
    const awayScore = chartAway[closestIdx].as;
    const homeScore = chartAway[closestIdx].hs;
    const score = awayScore != null && homeScore != null ? { awayAbbr, awayScore, homeAbbr, homeScore } : null;

    const time = formatGameTime(chartAway[closestIdx], league);
    const mvix = mvixAway && mvixHome ? { away: mvixAway, home: mvixHome } : null;

    if (Math.abs(awayVal - homeVal) <= 2) {
      setTooltip({ dual: true, away: { team: awayAbbr, val: awayVal, color: awayColor }, home: { team: homeAbbr, val: homeVal, color: homeColor }, time, score, mvix, leftPct });
    } else {
      const awayY = toY(awayVal);
      const homeY = toY(homeVal);
      const isAway = Math.abs(awayY - svgY) <= Math.abs(homeY - svgY);
      const team = isAway ? awayAbbr : homeAbbr;
      const color = isAway ? awayColor : homeColor;
      const val = isAway ? awayVal : homeVal;
      const teamMvix = isAway ? mvixAway : mvixHome;
      setTooltip({ team, val, time, score, mvix: teamMvix, color, leftPct });
    }
    clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltip(null), 5000);
  };

  return (
    <div className="pb-3 pt-3 border-t border-[#f0f0f0]" style={{ position: 'relative' }}>
      <div className="text-sm text-[#6b7c93] text-center" style={{ marginBottom: '4px' }}>
        <span className="font-medium">Momentum Chart</span>
      </div>
      <svg ref={svgRef} onClick={handleChartClick} className="w-full block" style={{ height: '80px', cursor: 'crosshair' }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {/* Forecast zone background (live only) */}
        {isLive && (
          <rect
            x={forecastX}
            y="0"
            width={W - forecastX}
            height={H}
            fill="#f0f4f9"
            opacity="0.6"
          />
        )}

        {/* Zone shading: green above midline, red below */}
        <rect x="0" y="0" width={W} height={midY} fill="#00C853" opacity="0.08" />
        <rect x="0" y={midY} width={W} height={H - parseFloat(midY)} fill="#C0392B" opacity="0.08" />

        {/* Center line */}
        <line x1="0" y1={midY} x2={W} y2={midY} stroke="#e0e0e0" strokeWidth="1" strokeDasharray="3,3" />

        {/* NOW vertical line (live only) */}
        {isLive && (
          <>
            <line
              x1={nowX}
              y1="0"
              x2={nowX}
              y2={H}
              stroke="#8494a7"
              strokeWidth="1"
              strokeDasharray="2,2"
              opacity="0.6"
            />
            <text
              x={parseFloat(nowX) - 4}
              y={H - 3}
              textAnchor="end"
              fill="#8494a7"
              fontSize="6"
              fontFamily="'DM Sans', sans-serif"
              opacity="0.7"
            >
              NOW
            </text>
          </>
        )}

        {/* Projected trend lines (live only, in forecast zone) */}
        {isLive && awayProjVal !== null && (
          <line
            x1={nowX}
            y1={toY(chartAway[n - 1].v).toFixed(1)}
            x2={projEndX.toFixed(1)}
            y2={toY(awayProjVal).toFixed(1)}
            stroke={awayColor}
            strokeWidth="1.5"
            strokeDasharray="4,3"
            opacity="0.4"
          />
        )}
        {isLive && homeProjVal !== null && (
          <line
            x1={nowX}
            y1={toY(chartHome[n - 1].v).toFixed(1)}
            x2={projEndX.toFixed(1)}
            y2={toY(homeProjVal).toFixed(1)}
            stroke={homeColor}
            strokeWidth="1.5"
            strokeDasharray="4,3"
            opacity="0.4"
          />
        )}

        {/* No trend lines for final games */}
        {false && !isLive && awayTrend && (
          <line
            x1={toX(awayTrend.startIdx).toFixed(1)}
            y1={toY(awayTrend.slope * awayTrend.startIdx + awayTrend.intercept).toFixed(1)}
            x2={toX(awayTrend.endIdx).toFixed(1)}
            y2={toY(awayTrend.slope * awayTrend.endIdx + awayTrend.intercept).toFixed(1)}
            stroke={awayColor}
            strokeWidth="1.5"
            strokeDasharray="4,3"
            opacity="0.35"
          />
        )}
        {false && !isLive && homeTrend && (
          <line
            x1={toX(homeTrend.startIdx).toFixed(1)}
            y1={toY(homeTrend.slope * homeTrend.startIdx + homeTrend.intercept).toFixed(1)}
            x2={toX(homeTrend.endIdx).toFixed(1)}
            y2={toY(homeTrend.slope * homeTrend.endIdx + homeTrend.intercept).toFixed(1)}
            stroke={homeColor}
            strokeWidth="1.5"
            strokeDasharray="4,3"
            opacity="0.35"
          />
        )}

        {/* Main momentum lines */}
        <path d={pathA} fill="none" stroke={awayColor} strokeWidth="2" opacity="0.85" />
        <path d={pathH} fill="none" stroke={homeColor} strokeWidth="2" opacity="0.85" />

        {/* Current position dots */}
        <circle cx={nowX} cy={toY(chartAway[n - 1].v).toFixed(1)} r="3.5" fill={awayColor} />
        <circle cx={nowX} cy={toY(chartHome[n - 1].v).toFixed(1)} r="3.5" fill={homeColor} />

        {/* Projected end dots (live only, smaller and lighter) */}
        {isLive && awayProjVal !== null && (
          <circle cx={projEndX.toFixed(1)} cy={toY(awayProjVal).toFixed(1)} r="2.5" fill={awayColor} opacity="0.4" />
        )}
        {isLive && homeProjVal !== null && (
          <circle cx={projEndX.toFixed(1)} cy={toY(homeProjVal).toFixed(1)} r="2.5" fill={homeColor} opacity="0.4" />
        )}

        {/* Team labels at bottom center */}
        <text
          x={W / 2 - 6}
          y={H - 2}
          textAnchor="end"
          fill={awayColor}
          fontSize="7"
          fontWeight="700"
          fontFamily="'DM Sans', sans-serif"
        >
          {awayAbbr}
        </text>
        <text
          x={W / 2}
          y={H - 2}
          textAnchor="middle"
          fill="#c0c7d0"
          fontSize="7"
          fontFamily="'DM Sans', sans-serif"
        >
          |
        </text>
        <text
          x={W / 2 + 6}
          y={H - 2}
          textAnchor="start"
          fill={homeColor}
          fontSize="7"
          fontWeight="700"
          fontFamily="'DM Sans', sans-serif"
        >
          {homeAbbr}
        </text>
      </svg>
      {tooltip && !tooltip.dual && (
        <div style={{
          position: 'absolute',
          left: `${tooltip.leftPct}%`,
          bottom: '90px',
          transform: 'translateX(-50%)',
          background: '#fff',
          color: '#222',
          padding: '8px 14px',
          borderRadius: '8px',
          border: '2px solid #222',
          fontSize: '15px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontFamily: "'DM Sans', sans-serif",
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700 }}>
            <span style={{ color: '#fff', backgroundColor: tooltip.color, padding: '2px 8px', borderRadius: '4px' }}>{tooltip.team}: {tooltip.val}</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: '13px', color: '#6b7c93', marginTop: '4px' }}>{tooltip.time}</div>
          {tooltip.score && <div style={{ textAlign: 'center', fontSize: '12px' }}><span style={{ color: awayColor, fontWeight: 700 }}>{tooltip.score.awayAbbr}</span> {tooltip.score.awayScore} - <span style={{ color: homeColor, fontWeight: 700 }}>{tooltip.score.homeAbbr}</span> {tooltip.score.homeScore}</div>}
          {tooltip.mvix && !tooltip.mvix.away && <div style={{ textAlign: 'center', fontSize: '11px', color: '#8494a7', marginTop: '2px' }}>MVIX {tooltip.mvix.mvix} &middot; bias {tooltip.mvix.bias > 0 ? '+' : ''}{tooltip.mvix.bias}</div>}
          {tooltip.mvix && !tooltip.mvix.away && tooltip.mvix.mrvi != null && <div style={{ textAlign: 'center', fontSize: '11px', color: '#8494a7', marginTop: '1px' }}>MRVI {Math.round(tooltip.mvix.mrvi)}</div>}
          <div style={{
            position: 'absolute',
            bottom: '-7px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid #222',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-5px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #fff',
          }} />
        </div>
      )}
      {tooltip && tooltip.dual && (
        <div style={{
          position: 'absolute',
          left: `${tooltip.leftPct}%`,
          bottom: '90px',
          transform: 'translateX(-50%)',
          background: '#fff',
          color: '#222',
          padding: '8px 14px',
          borderRadius: '8px',
          border: '2px solid #222',
          fontSize: '15px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          zIndex: 50,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontFamily: "'DM Sans', sans-serif",
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0' }}>
            <span style={{ color: '#fff', backgroundColor: tooltip.away.color, padding: '2px 8px', borderRadius: '4px 0 0 4px' }}>{tooltip.away.team}: {tooltip.away.val}</span>
            <span style={{ color: '#fff', backgroundColor: tooltip.home.color, padding: '2px 8px', borderRadius: '0 4px 4px 0' }}>{tooltip.home.team}: {tooltip.home.val}</span>
          </div>
          <div style={{ textAlign: 'center', fontSize: '13px', color: '#6b7c93', marginTop: '4px' }}>{tooltip.time}</div>
          {tooltip.score && <div style={{ textAlign: 'center', fontSize: '12px' }}><span style={{ color: awayColor, fontWeight: 700 }}>{tooltip.score.awayAbbr}</span> {tooltip.score.awayScore} - <span style={{ color: homeColor, fontWeight: 700 }}>{tooltip.score.homeAbbr}</span> {tooltip.score.homeScore}</div>}
          {tooltip.mvix && tooltip.mvix.away && <div style={{ textAlign: 'center', fontSize: '11px', color: '#8494a7', marginTop: '2px' }}>MVIX: <span style={{ color: awayColor }}>{tooltip.mvix.away.mvix}</span> / <span style={{ color: homeColor }}>{tooltip.mvix.home.mvix}</span></div>}
          {tooltip.mvix && tooltip.mvix.away && tooltip.mvix.away.mrvi != null && tooltip.mvix.home.mrvi != null && <div style={{ textAlign: 'center', fontSize: '11px', color: '#8494a7', marginTop: '1px' }}>MRVI: <span style={{ color: awayColor }}>{Math.round(tooltip.mvix.away.mrvi)}</span> / <span style={{ color: homeColor }}>{Math.round(tooltip.mvix.home.mrvi)}</span></div>}
          <div style={{
            position: 'absolute',
            bottom: '-7px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '7px solid #222',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-5px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid #fff',
          }} />
        </div>
      )}

      {/* MVIX Meter */}
      {mvixAway && mvixHome && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', padding: '0 2px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: awayColor, minWidth: '30px', textAlign: 'right', lineHeight: 1 }}>{awayAbbr}</span>
            <div style={{ flex: 1, height: '6px', background: '#ebebeb', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${Math.min(100, mvixAway.mvix)}%`,
                height: '100%',
                borderRadius: '3px',
                background: mvixAway.bias > 5 ? '#00C853' : mvixAway.bias < -5 ? '#C0392B' : '#FFD700',
                transition: 'width 1s ease-out',
              }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7c93', minWidth: '18px', textAlign: 'right', lineHeight: 1 }}>{mvixAway.mvix}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: mvixAway.bias > 5 ? '#00C853' : mvixAway.bias < -5 ? '#C0392B' : '#8494a7', minWidth: '24px', lineHeight: 1 }}>
              {mvixAway.bias > 0 ? '\u2191' : mvixAway.bias < 0 ? '\u2193' : '\u2194'}{mvixAway.bias > 0 ? '+' : ''}{mvixAway.bias}
            </span>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#8494a7', whiteSpace: 'nowrap', lineHeight: 1 }}>Live MVIX</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: mvixHome.bias > 5 ? '#00C853' : mvixHome.bias < -5 ? '#C0392B' : '#8494a7', minWidth: '24px', textAlign: 'right', lineHeight: 1 }}>
              {mvixHome.bias > 0 ? '\u2191' : mvixHome.bias < 0 ? '\u2193' : '\u2194'}{mvixHome.bias > 0 ? '+' : ''}{mvixHome.bias}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7c93', minWidth: '18px', lineHeight: 1 }}>{mvixHome.mvix}</span>
            <div style={{ flex: 1, height: '6px', background: '#ebebeb', borderRadius: '3px', overflow: 'hidden', position: 'relative', direction: 'rtl' }}>
              <div style={{
                width: `${Math.min(100, mvixHome.mvix)}%`,
                height: '100%',
                borderRadius: '3px',
                background: mvixHome.bias > 5 ? '#00C853' : mvixHome.bias < -5 ? '#C0392B' : '#FFD700',
                transition: 'width 1s ease-out',
              }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: homeColor, minWidth: '30px', lineHeight: 1 }}>{homeAbbr}</span>
          </div>
        </div>
      )}

      {/* MRVI Meter */}
      {chartAway && chartHome && chartAway.length > 0 && (() => {
        const awayMrvi = mvixAway?.mrvi;
        const homeMrvi = mvixHome?.mrvi;
        const computing = !mvixAway || !mvixHome || awayMrvi == null || homeMrvi == null;
        const awayVal = awayMrvi ?? 0;
        const homeVal = homeMrvi ?? 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', padding: '0 2px' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: awayColor, minWidth: '30px', textAlign: 'right', lineHeight: 1 }}>{awayAbbr}</span>
              <div style={{ flex: 1, height: '6px', background: '#ebebeb', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, awayVal))}%`,
                  height: '100%',
                  borderRadius: '3px',
                  background: computing ? '#ccc' : awayVal > 55 ? '#00C853' : awayVal < 45 ? '#C0392B' : '#FFD700',
                  transition: 'width 1s ease-out',
                }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7c93', minWidth: '18px', textAlign: 'right', lineHeight: 1 }}>{computing ? '–' : Math.round(awayVal)}</span>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#8494a7', whiteSpace: 'nowrap', lineHeight: 1 }}>{computing ? 'Computing' : 'Live MRVI'}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7c93', minWidth: '18px', lineHeight: 1 }}>{computing ? '–' : Math.round(homeVal)}</span>
              <div style={{ flex: 1, height: '6px', background: '#ebebeb', borderRadius: '3px', overflow: 'hidden', position: 'relative', direction: 'rtl' }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, homeVal))}%`,
                  height: '100%',
                  borderRadius: '3px',
                  background: computing ? '#ccc' : homeVal > 55 ? '#00C853' : homeVal < 45 ? '#C0392B' : '#FFD700',
                  transition: 'width 1s ease-out',
                }} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: homeColor, minWidth: '30px', lineHeight: 1 }}>{homeAbbr}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
