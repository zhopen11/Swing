'use client';

const SPORTS = [
  { label: 'Basketball', key: 'basketball' },
  { label: 'Baseball',   key: 'baseball' },
  { label: 'Football',   key: 'football' },
  { label: 'Soccer',     key: 'soccer' },
  { label: 'Hockey',     key: 'hockey' },
  { label: 'More Sports', key: 'more' },
];

const ENABLED = new Set(['basketball', 'hockey']);

export default function SportsNav({ activeSport = 'basketball', onSportChange }) {
  const handleClick = (key) => {
    if (!ENABLED.has(key)) return;
    onSportChange?.(key);
  };

  return (
    <div className="sports-nav" style={{
      background: '#001c55',
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      overflow: 'visible',
      scrollbarWidth: 'none',
      borderBottom: '1px solid #0a2a6e',
      padding: '0 24px',
    }}>
      {SPORTS.map(({ label, key }) => {
        const isActive  = key === activeSport;
        const isEnabled = ENABLED.has(key);
        return (
          <button
            key={key}
            onClick={() => handleClick(key)}
            style={{
              background:   isActive ? '#1493ff' : 'transparent',
              color:        '#fff',
              border:       'none',
              padding:      '10px 18px',
              fontSize:     '14px',
              fontWeight:   isActive ? 700 : 500,
              cursor:       isEnabled ? 'pointer' : 'default',
              whiteSpace:   'nowrap',
              fontFamily:   "'DM Sans', sans-serif",
              borderBottom: isActive ? '2px solid #fff' : '2px solid transparent',
              opacity:      isActive ? 1 : isEnabled ? 0.85 : 0.5,
              transition:   'opacity 0.15s',
            }}
            onMouseEnter={(e) => { if (isEnabled && !isActive) e.target.style.opacity = 1; }}
            onMouseLeave={(e) => { if (isEnabled && !isActive) e.target.style.opacity = 0.85; }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
