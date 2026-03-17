/** Compute MVIX and MRVI volatility metrics from momentum chart data. */

function gameSeconds(point, league) {
  const p = point.p || 1;
  const c = point.c || '0:00';
  const [m, s] = c.split(':').map(Number);
  const clockSecs = (m || 0) * 60 + (s || 0);
  const periodSecs = league === 'NBA' ? 12 * 60 : 20 * 60;
  return (p - 1) * periodSecs + (periodSecs - clockSecs);
}

function firstDerivative(chart, league) {
  const result = [];
  for (let i = 0; i < chart.length; i++) {
    const t = gameSeconds(chart[i], league);
    let dv;
    if (i === 0 && chart.length > 1) {
      const dt = gameSeconds(chart[i + 1], league) - t;
      dv = dt > 0 ? (chart[i + 1].v - chart[i].v) / dt : 0;
    } else if (i === chart.length - 1) {
      const dt = t - gameSeconds(chart[i - 1], league);
      dv = dt > 0 ? (chart[i].v - chart[i - 1].v) / dt : 0;
    } else {
      const dt = gameSeconds(chart[i + 1], league) - gameSeconds(chart[i - 1], league);
      dv = dt > 0 ? (chart[i + 1].v - chart[i - 1].v) / dt : 0;
    }
    result.push({ gameTime: t, v: chart[i].v, dv: Math.round(dv * 1000) / 1000 });
  }
  return result;
}

function secondDerivative(d1) {
  const result = [];
  for (let i = 0; i < d1.length; i++) {
    let d2v;
    if (i === 0 && d1.length > 1) {
      const dt = d1[i + 1].gameTime - d1[i].gameTime;
      d2v = dt > 0 ? (d1[i + 1].dv - d1[i].dv) / dt : 0;
    } else if (i === d1.length - 1) {
      const dt = d1[i].gameTime - d1[i - 1].gameTime;
      d2v = dt > 0 ? (d1[i].dv - d1[i - 1].dv) / dt : 0;
    } else {
      const dt = d1[i + 1].gameTime - d1[i - 1].gameTime;
      d2v = dt > 0 ? (d1[i + 1].dv - d1[i - 1].dv) / dt : 0;
    }
    result.push({ ...d1[i], d2v: Math.round(d2v * 10000) / 10000 });
  }
  return result;
}

function countInflections(d2) {
  let up = 0, down = 0;
  for (let i = 1; i < d2.length; i++) {
    const prev = d2[i - 1].d2v;
    const curr = d2[i].d2v;
    if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
      const upward = d2[i].v > d2[i - 1].v;
      if (upward) up++;
      else down++;
    }
  }
  return { up, down };
}

/**
 * Compute MRVI (Momentum Relative Volatility Index) from a chart series.
 * Adapts Dorsey's RVI: uses rolling stddev of momentum, classified by direction,
 * smoothed with Wilder's exponential method.
 * Returns 0-100 value, or null if insufficient data.
 */
function computeMRVI(chart, stdPeriod = 8, smoothPeriod = 14) {
  const n = chart.length;
  if (n < stdPeriod + 2) return null;

  const values = chart.map((p) => p.v);

  // Step 1: Rolling standard deviation
  const stddevs = new Array(n).fill(0);
  for (let i = stdPeriod - 1; i < n; i++) {
    let sum = 0;
    for (let j = i - stdPeriod + 1; j <= i; j++) sum += values[j];
    const mean = sum / stdPeriod;
    let variance = 0;
    for (let j = i - stdPeriod + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    stddevs[i] = Math.sqrt(variance / stdPeriod);
  }

  // Step 2: Classify direction
  const upVol = new Array(n).fill(0);
  const downVol = new Array(n).fill(0);
  for (let i = stdPeriod; i < n; i++) {
    if (values[i] > values[i - 1]) {
      upVol[i] = stddevs[i];
    } else if (values[i] < values[i - 1]) {
      downVol[i] = stddevs[i];
    } else {
      upVol[i] = stddevs[i] / 2;
      downVol[i] = stddevs[i] / 2;
    }
  }

  // Step 3: Wilder's exponential smoothing
  const alpha = 1 / smoothPeriod;
  const start = stdPeriod;
  let smoothUp = upVol[start];
  let smoothDown = downVol[start];

  for (let i = start + 1; i < n; i++) {
    smoothUp = alpha * upVol[i] + (1 - alpha) * smoothUp;
    smoothDown = alpha * downVol[i] + (1 - alpha) * smoothDown;
  }

  // Step 4: MRVI
  const total = smoothUp + smoothDown;
  if (total === 0) return 50;
  return Math.round((100 * smoothUp / total) * 10) / 10;
}

/**
 * Compute MVIX volatility object from chart data.
 * Returns null if insufficient data.
 */
export function computeGameVolatility(chartAway, chartHome, league) {
  if (!chartAway || !chartHome || chartAway.length < 3 || chartHome.length < 3) return null;

  function compute(chart) {
    const d1 = firstDerivative(chart, league);
    const d2 = secondDerivative(d1);
    const { up, down } = countInflections(d2);
    const n = d1.length;

    const velocities = d1.map((p) => p.dv);
    const meanVel = velocities.reduce((a, b) => a + b, 0) / n;
    const variance = velocities.reduce((sum, v) => sum + (v - meanVel) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    const totalTime = d1[n - 1].gameTime;
    let weightedSum = 0, weightedMeanSum = 0, weightTotal = 0;
    for (let i = 0; i < n; i++) {
      const recency = d1[i].gameTime / totalTime;
      const weight = Math.exp(3 * (recency - 1));
      weightedMeanSum += velocities[i] * weight;
      weightTotal += weight;
    }
    const weightedMean = weightTotal > 0 ? weightedMeanSum / weightTotal : 0;
    for (let i = 0; i < n; i++) {
      const recency = d1[i].gameTime / totalTime;
      const weight = Math.exp(3 * (recency - 1));
      weightedSum += weight * (velocities[i] - weightedMean) ** 2;
    }
    const weightedStdDev = Math.sqrt(weightTotal > 0 ? weightedSum / weightTotal : 0);

    const RAW_MAX = 0.4;
    const mvix = Math.min(100, Math.round((weightedStdDev / RAW_MAX) * 100));

    const posVelocities = velocities.filter((v) => v > 0);
    const negVelocities = velocities.filter((v) => v < 0);
    const posStdDev = posVelocities.length > 1 ? Math.sqrt(posVelocities.reduce((s, v) => s + v ** 2, 0) / posVelocities.length) : 0;
    const negStdDev = negVelocities.length > 1 ? Math.sqrt(negVelocities.reduce((s, v) => s + v ** 2, 0) / negVelocities.length) : 0;
    const mvixUp = Math.min(100, Math.round((posStdDev / RAW_MAX) * 100));
    const mvixDown = Math.min(100, Math.round((negStdDev / RAW_MAX) * 100));

    // Avg inflection magnitudes
    let avgUpMag = 0, avgDnMag = 0, upCount = 0, dnCount = 0;
    for (let i = 1; i < d2.length; i++) {
      const prev = d2[i - 1].d2v;
      const curr = d2[i].d2v;
      if ((prev > 0 && curr < 0) || (prev < 0 && curr > 0)) {
        const mag = Math.abs(d2[i].v - d2[i - 1].v);
        if (d2[i].v > d2[i - 1].v) { avgUpMag += mag; upCount++; }
        else { avgDnMag += mag; dnCount++; }
      }
    }

    return {
      mvix,
      mvixUp,
      mvixDown,
      bias: mvixUp - mvixDown,
      upInflections: up,
      downInflections: down,
      avgUpMagnitude: Math.round((upCount > 0 ? avgUpMag / upCount : 0) * 100) / 100,
      avgDownMagnitude: Math.round((dnCount > 0 ? avgDnMag / dnCount : 0) * 100) / 100,
    };
  }

  const awayVol = compute(chartAway);
  const homeVol = compute(chartHome);

  // MRVI for all leagues
  awayVol.mrvi = computeMRVI(chartAway.map((p) => ({ v: p.v })));
  homeVol.mrvi = computeMRVI(chartHome.map((p) => ({ v: p.v })));
  // Combo score: -mvix + mrvi (higher = better)
  if (awayVol.mrvi !== null) {
    awayVol.combo = Math.round((-awayVol.mvix + awayVol.mrvi) * 10) / 10;
  }
  if (homeVol.mrvi !== null) {
    homeVol.combo = Math.round((-homeVol.mvix + homeVol.mrvi) * 10) / 10;
  }

  return { away: awayVol, home: homeVol };
}
