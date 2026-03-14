'use client';

import Image from 'next/image';

export default function Footer() {
  const handleShare = async () => {
    const shareData = {
      title: 'THE SWING - Live Play-by-Play Momentum Forecaster',
      text: 'Check out THE SWING - live NBA + NCAA momentum tracking!',
      url: window.location.origin,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if (err.name !== 'AbortError') {
          fallbackCopy(shareData.url);
        }
      }
    } else {
      fallbackCopy(shareData.url);
    }
  };

  const fallbackCopy = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  };

  const footerStyle = {
    background: '#001c55',
    color: '#8494a7',
    padding: '24px 32px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
  };

  const linkStyle = {
    color: '#1493ff',
    textDecoration: 'none',
    cursor: 'pointer',
    fontWeight: 500,
  };

  const shareButtonStyle = {
    background: '#1493ff',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  return (
    <footer style={footerStyle}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Image
            src="/swing-logo.jpg"
            alt="The Swing"
            width={32}
            height={32}
            style={{ borderRadius: '50%' }}
          />
          <span style={{ color: '#fff', fontWeight: 700 }}>THE SWING</span>
          <span>&copy; 2026</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <a href="/terms" style={linkStyle}>Terms of Service</a>
          <a href="/privacy" style={linkStyle}>Privacy Policy</a>
          <button onClick={handleShare} style={shareButtonStyle}>
            <span>&#x1F517;</span> Share
          </button>
        </div>
      </div>
    </footer>
  );
}
