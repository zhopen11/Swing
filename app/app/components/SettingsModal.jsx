'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function SettingsModal({ user, onClose, onUpdate }) {
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [email, setEmail] = useState(user.email || '');
  const [alertBluffing, setAlertBluffing] = useState(user.alertBluffing !== false);
  const [alertComeback, setAlertComeback] = useState(user.alertComeback !== false);
  const [alertSwingWarning, setAlertSwingWarning] = useState(user.alertSwingWarning !== false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          alertBluffing,
          alertComeback,
          alertSwingWarning,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onUpdate(data.user);
      setSuccess('Settings saved!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 28, 85, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily: "'DM Sans', sans-serif",
  };

  const modalStyle = {
    background: '#fff',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '480px',
    maxHeight: '90vh',
    overflow: 'auto',
    position: 'relative',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  };

  const mobileModalStyle = {
    ...modalStyle,
    borderRadius: 0,
    maxWidth: '100%',
    maxHeight: '100%',
    height: '100%',
    width: '100%',
  };

  const headerStyle = {
    background: '#001c55',
    color: '#fff',
    padding: '20px 24px',
    borderRadius: isMobile ? 0 : '12px 12px 0 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
  };

  const closeBtnStyle = {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '24px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px',
    position: 'absolute',
    top: '16px',
    right: '16px',
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    fontSize: '15px',
    border: '2px solid #dce6f0',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#001c55',
  };

  const fieldGap = { marginBottom: '14px' };

  const toggleStyle = (on) => ({
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    background: on ? '#00C853' : '#ccc',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
  });

  const toggleDot = (on) => ({
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: '2px',
    left: on ? '22px' : '2px',
    transition: 'left 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
  });

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={isMobile ? mobileModalStyle : modalStyle}>
        <div style={headerStyle}>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            &#x2715;
          </button>
          <Image
            src="/swing-logo.jpg"
            alt="The Swing"
            width={48}
            height={48}
            style={{ borderRadius: '50%', marginBottom: '8px' }}
          />
          <div style={{ fontSize: '18px', fontWeight: 700 }}>Settings</div>
        </div>

        <form onSubmit={handleSave} style={{ padding: '24px' }}>
          {error && (
            <div style={{
              background: '#fef2f2',
              color: '#dc2626',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{
              background: '#f0fdf4',
              color: '#16a34a',
              padding: '10px 14px',
              borderRadius: '8px',
              fontSize: '14px',
              marginBottom: '16px',
            }}>
              {success}
            </div>
          )}

          {/* Profile section */}
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#001c55', marginBottom: '12px' }}>
            Profile
          </div>
          <div style={fieldGap}>
            <label style={labelStyle}>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={fieldGap}>
            <label style={labelStyle}>Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={fieldGap}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />
          </div>
          <div style={fieldGap}>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={user.phone || ''}
              disabled
              style={{ ...inputStyle, background: '#f0f4f9', color: '#8494a7' }}
            />
          </div>

          {/* Notification preferences */}
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#001c55', marginBottom: '12px', marginTop: '8px', borderTop: '1px solid #dce6f0', paddingTop: '16px' }}>
            Notification Preferences
          </div>
          <div style={{ ...fieldGap, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#222' }}>Bluffing Alerts</div>
              <div style={{ fontSize: '12px', color: '#8494a7' }}>Score and momentum leaders disagree</div>
            </div>
            <button type="button" onClick={() => setAlertBluffing(!alertBluffing)} style={toggleStyle(alertBluffing)}>
              <div style={toggleDot(alertBluffing)} />
            </button>
          </div>
          <div style={{ ...fieldGap, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#222' }}>Comeback Watch</div>
              <div style={{ fontSize: '12px', color: '#8494a7' }}>Trailing team leads momentum</div>
            </div>
            <button type="button" onClick={() => setAlertComeback(!alertComeback)} style={toggleStyle(alertComeback)}>
              <div style={toggleDot(alertComeback)} />
            </button>
          </div>
          <div style={{ ...fieldGap, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#222' }}>Swing Warning</div>
              <div style={{ fontSize: '12px', color: '#8494a7' }}>Close score, one-sided momentum</div>
            </div>
            <button type="button" onClick={() => setAlertSwingWarning(!alertSwingWarning)} style={toggleStyle(alertSwingWarning)}>
              <div style={toggleDot(alertSwingWarning)} />
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: '#1493ff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              opacity: loading ? 0.6 : 1,
              marginTop: '8px',
            }}
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}
