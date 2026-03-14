'use client';

export default function Sparkline({ chartAway, chartHome, awayColor, homeColor, awayAbbr, homeAbbr, isLive }) {
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

  // Get indices for last 10 minutes of data
  function getLast10MinIndices(chart) {
    if (!chart || chart.length < 2) return { startIdx: 0, endIdx: chart.length - 1 };
    const lastTime = new Date(chart[chart.length - 1].t).getTime();
    const cutoff = lastTime - 12 * 60 * 1000;
    let startIdx = chart.length - 1;
    for (let i = chart.length - 1; i >= 0; i--) {
      if (new Date(chart[i].t).getTime() >= cutoff) {
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
    const range = getLast10MinIndices(chart);
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
  const projSteps = Math.max(1, Math.round(n * 0.33));
  const projEndX = W - 2;
  const awayProjVal = projectValue(awayTrend, projSteps);
  const homeProjVal = projectValue(homeTrend, projSteps);

  return (
    <div className="pb-3 pt-3 border-t border-[#f0f0f0]">
      <div className="text-sm text-[#6b7c93] text-center" style={{ marginBottom: '4px' }}>
        <span className="font-medium">Momentum Chart</span>
      </div>
      <svg className="w-full block" style={{ height: '80px' }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
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
    </div>
  );
}
