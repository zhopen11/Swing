'use client';

import { useState } from 'react';

export default function PlayFeed({ plays, awayAbbr, homeAbbr, awayColor, homeColor }) {
  const [open, setOpen] = useState(false);

  if (!plays || plays.length === 0) return null;

  return (
    <>
      <div
        className="flex items-center justify-between py-3 border-t border-[#f0f0f0] cursor-pointer select-none transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-semibold text-[#6b7c93]">
          {open ? '\u25BE' : '\u25B8'} Play Feed
        </span>
        <span
          className="text-sm text-[#8494a7] inline-block transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          &#x25BE;
        </span>
      </div>
      {open && (
        <div className="max-h-[180px] overflow-y-auto py-2 scrollbar-thin">
          {plays.map((p, i) => {
            const color = p.team === awayAbbr ? awayColor : homeColor;
            const isMake = (p.text || '').toLowerCase().includes('makes');
            const isTurnover =
              (p.type || '').toLowerCase().includes('turnover') ||
              (p.text || '').toLowerCase().includes('turnover');

            let itemClass = 'flex items-start gap-2.5 py-1.5 text-sm leading-relaxed';
            if (i === 0) itemClass += ' bg-[#fffde8]';

            let textClass = 'text-[#555] flex-1';
            if (isMake) textClass = 'text-[#222] font-semibold flex-1';
            if (isTurnover) textClass = 'text-[#C0392B] flex-1';

            const scoreTag =
              p.homeScore !== undefined && p.awayScore !== undefined
                ? `[${p.awayScore}\u2013${p.homeScore}] `
                : '';

            return (
              <div key={i} className={itemClass}>
                <span className="font-mono text-sm text-[#6b7c93] min-w-[40px] mt-[2px] shrink-0">
                  {p.clock || ''}
                </span>
                <span
                  className="w-2 h-2 rounded-full mt-[5px] shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className={textClass}>
                  {scoreTag && (
                    <span className="font-mono text-sm font-bold mr-1">{scoreTag}</span>
                  )}
                  {(p.text || '').replace(/\n/g, ' ').trim()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
