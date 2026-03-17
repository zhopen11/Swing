'use client';

import { useState, useEffect, useRef } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Convert "YYYY-MM-DD" to YYYYMMDD for the API */
function toApiDate(iso) {
  return iso.replace(/-/g, '');
}

/** Get today's date in "YYYY-MM-DD" (Eastern Time) */
function todayET() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })
  ).toISOString().slice(0, 10);
}

/** Format "YYYY-MM-DD" into "Tue, Mar 10" */
function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function DatePicker({ selectedDate, onDateChange, availableDates }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [viewYear, setViewYear] = useState(null);
  const [viewMonth, setViewMonth] = useState(null);
  const calRef = useRef(null);

  const dateSet = new Set(availableDates || []);
  const sorted = [...dateSet].sort();
  const isToday = !selectedDate;
  const displayDate = selectedDate || todayET();

  // Initialize calendar view to the displayed date's month
  useEffect(() => {
    const [y, m] = displayDate.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }, [displayDate, showCalendar]);

  // Close calendar on outside click
  useEffect(() => {
    if (!showCalendar) return;
    const handler = (e) => {
      if (calRef.current && !calRef.current.contains(e.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCalendar]);

  // Step to prev/next available date
  function stepDate(direction) {
    const current = displayDate;
    const idx = sorted.indexOf(current);

    if (direction === -1) {
      // Go to previous available date
      if (idx > 0) {
        onDateChange(sorted[idx - 1]);
      } else if (idx === -1) {
        // Current date isn't in sorted list — find closest earlier date
        const earlier = sorted.filter((d) => d < current);
        if (earlier.length > 0) onDateChange(earlier[earlier.length - 1]);
      }
    } else {
      // Go to next available date
      if (idx >= 0 && idx < sorted.length - 1) {
        const next = sorted[idx + 1];
        // If next date is today, go to live mode
        if (next === todayET()) {
          onDateChange(null);
        } else {
          onDateChange(next);
        }
      } else if (idx === -1) {
        const later = sorted.filter((d) => d > current);
        if (later.length > 0) {
          const next = later[0];
          if (next === todayET()) {
            onDateChange(null);
          } else {
            onDateChange(next);
          }
        }
      }
      // If we're on the last available date and today is after it, allow going to today
      if (idx === sorted.length - 1 && !isToday) {
        onDateChange(null);
      }
    }
  }

  function handleCalendarPick(iso) {
    setShowCalendar(false);
    if (iso === todayET()) {
      onDateChange(null);
    } else {
      onDateChange(iso);
    }
  }

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  // Build calendar grid
  function buildGrid() {
    if (viewYear == null || viewMonth == null) return [];
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const rows = [];
    let row = new Array(firstDay).fill(null);

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      row.push(iso);
      if (row.length === 7) {
        rows.push(row);
        row = [];
      }
    }
    if (row.length > 0) {
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return rows;
  }

  const canGoPrev = sorted.length > 0 && sorted[0] < displayDate;
  const canGoNext = !isToday && sorted.length > 0;

  return (
    <div className="date-picker-bar">
      {/* Left arrow */}
      <button
        onClick={() => stepDate(-1)}
        disabled={!canGoPrev}
        className="date-picker-arrow"
        title="Previous day with games"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
        </svg>
      </button>

      {/* Date display + calendar toggle */}
      <button
        onClick={() => setShowCalendar(!showCalendar)}
        className="date-picker-label"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px', opacity: 0.7 }}>
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z" />
        </svg>
        {isToday ? `Today \u2014 ${formatDateLabel(todayET())}` : formatDateLabel(displayDate)}
      </button>

      {/* Right arrow */}
      <button
        onClick={() => stepDate(1)}
        disabled={!canGoNext}
        className="date-picker-arrow"
        title="Next day with games"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
        </svg>
      </button>

      {/* Today button (only when viewing historical) */}
      {!isToday && (
        <button
          onClick={() => onDateChange(null)}
          className="date-picker-today"
        >
          LIVE TODAY
        </button>
      )}

      {/* Calendar popover */}
      {showCalendar && viewYear != null && (
        <div ref={calRef} className="date-picker-calendar">
          <div className="date-picker-cal-header">
            <button onClick={prevMonth} className="date-picker-cal-nav">&lt;</button>
            <span className="date-picker-cal-title">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button onClick={nextMonth} className="date-picker-cal-nav">&gt;</button>
          </div>
          <div className="date-picker-cal-days">
            {DAYS.map((d) => (
              <div key={d} className="date-picker-cal-dayname">{d}</div>
            ))}
          </div>
          <div className="date-picker-cal-grid">
            {buildGrid().map((row, ri) =>
              row.map((iso, ci) => {
                if (!iso) {
                  return <div key={`${ri}-${ci}`} className="date-picker-cal-cell empty" />;
                }
                const day = parseInt(iso.split('-')[2], 10);
                const hasData = dateSet.has(iso);
                const isSel = iso === displayDate;
                const isTod = iso === todayET();
                return (
                  <button
                    key={iso}
                    onClick={() => hasData || isTod ? handleCalendarPick(iso) : null}
                    disabled={!hasData && !isTod}
                    className={`date-picker-cal-cell${isSel ? ' selected' : ''}${isTod ? ' today' : ''}${hasData ? ' has-data' : ''}`}
                  >
                    {day}
                    {hasData && <span className="date-picker-cal-dot" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { toApiDate };
