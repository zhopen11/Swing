'use client';

export default function Sparkline({ chartAway, chartHome, awayColor, homeColor, awayAbbr, homeAbbr }) {
  if (!chartAway || !chartHome || chartAway.length < 2) return null;

  const W = 300;
  const H = 60;
  const n = Math.min(chartAway.length, chartHome.length);

  function toX(i) {
    return (i / (n - 1)) * (W - 4) + 2;
  }
  function toY(v) {
    return H - 4 - ((v - 5) / 90) * (H - 8);
  }

  const pathA = Array.from({ length: n }, (_, i) =>
    (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ' ' + toY(chartAway[i].v).toFixed(1),
  ).join(' ');

  const pathH = Array.from({ length: n }, (_, i) =>
    (i === 0 ? 'M' : 'L') + toX(i).toFixed(1) + ' ' + toY(chartHome[i].v).toFixed(1),
  ).join(' ');

  const midY = toY(50).toFixed(1);
  const lastX = toX(n - 1).toFixed(1);

  return (
    <div className="pb-3 pt-3 border-t border-[#f0f0f0]">
      <div className="text-sm text-[#6b7c93] flex justify-between mb-1.5">
        <span className="font-semibold" style={{ color: awayColor }}>{awayAbbr}</span>
        <span className="font-medium">Momentum Chart</span>
        <span className="font-semibold" style={{ color: homeColor }}>{homeAbbr}</span>
      </div>
      <svg className="w-full h-[60px] block" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1="0" y1={midY} x2={W} y2={midY} stroke="#e0e0e0" strokeWidth="1" strokeDasharray="3,3" />
        <path d={pathA} fill="none" stroke={awayColor} strokeWidth="2" opacity="0.85" />
        <path d={pathH} fill="none" stroke={homeColor} strokeWidth="2" opacity="0.85" />
        <circle cx={lastX} cy={toY(chartAway[n - 1].v).toFixed(1)} r="3.5" fill={awayColor} />
        <circle cx={lastX} cy={toY(chartHome[n - 1].v).toFixed(1)} r="3.5" fill={homeColor} />
      </svg>
    </div>
  );
}
