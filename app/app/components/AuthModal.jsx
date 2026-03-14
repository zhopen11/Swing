'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function AuthModal({ mode: initialMode, onClose, onAuth }) {
  const [mode, setMode] = useState(initialMode || 'signin');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegisterPhone = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setUserId(data.userId);
      setMode('register-complete');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, firstName, lastName, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');
      onAuth(data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed');
      if (data.needsCompletion) {
        setUserId(data.userId);
        setMode('register-complete');
      } else {
        onAuth(data.user);
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
    maxWidth: '440px',
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
    borderRadius: '12px 12px 0 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
  };

  const mobileHeaderStyle = {
    ...headerStyle,
    borderRadius: 0,
  };

  const bodyStyle = {
    padding: '24px',
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '2px solid #dce6f0',
    borderRadius: '8px',
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  };

  const buttonStyle = {
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
  };

  const closeBtnStyle = {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '24px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px',
  };

  const closeAbsoluteStyle = {
    ...closeBtnStyle,
    position: 'absolute',
    top: '16px',
    right: '16px',
  };

  const fieldGap = { marginBottom: '16px' };
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600, color: '#001c55' };

  const titleMap = {
    signin: 'Sign In',
    'register-phone': 'Get Alerts',
    'register-complete': 'Complete Your Profile',
  };

  // Detect mobile via a simple media check using CSS
  // We use CSS media query in the overlay to handle both cases
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={isMobile ? mobileModalStyle : modalStyle}>
        {/* Header */}
        <div style={isMobile ? mobileHeaderStyle : headerStyle}>
          <button onClick={onClose} style={closeAbsoluteStyle} aria-label="Close">
            &#x2715;
          </button>
          <Image
            src="/swing-logo.jpg"
            alt="The Swing"
            width={56}
            height={56}
            style={{ borderRadius: '50%', marginBottom: '10px' }}
          />
          <div style={{ fontSize: '20px', fontWeight: 700 }}>{titleMap[mode]}</div>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#dc2626',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          {mode === 'signin' && (
            <form onSubmit={handleSignin}>
              <div style={fieldGap}>
                <label style={labelStyle}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={inputStyle}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: '#6b7c93' }}>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register-phone'); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#1493ff', fontWeight: 600, cursor: 'pointer', fontSize: '14px', fontFamily: "'DM Sans', sans-serif" }}
                >
                  Sign Up
                </button>
              </div>
            </form>
          )}

          {mode === 'register-phone' && (
            <form onSubmit={handleRegisterPhone}>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: '#6b7c93' }}>
                Enter your phone number to get started with game alerts.
              </div>
              <div style={fieldGap}>
                <label style={labelStyle}>Phone Number</label>
                <input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={inputStyle}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle}>
                {loading ? 'Please wait...' : 'Continue'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '14px', color: '#6b7c93' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#1493ff', fontWeight: 600, cursor: 'pointer', fontSize: '14px', fontFamily: "'DM Sans', sans-serif" }}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {mode === 'register-complete' && (
            <form onSubmit={handleComplete}>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: '#6b7c93' }}>
                Just a few more details to activate your account.
              </div>
              <div style={fieldGap}>
                <label style={labelStyle}>First Name</label>
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={inputStyle}
                  required
                  autoFocus
                />
              </div>
              <div style={fieldGap}>
                <label style={labelStyle}>Last Name</label>
                <input
                  type="text"
                  placeholder="Last name"
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
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>
              <button type="submit" disabled={loading} style={buttonStyle}>
                {loading ? 'Activating...' : 'Activate'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
