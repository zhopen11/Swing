/**
 * /api/cron/backfill
 *
 * Vercel Cron route — runs daily at 9am UTC (schedule defined in vercel.json).
 * Backfills the last 7 days of MVIX data for BOTH NBA and CBB so the archive
 * stays current for both leagues. Without this, rolling-MVIX cards on the
 * dashboard only populate for whichever league was manually backfilled last.
 *
 * Vercel invokes cron routes with the header:
 *   Authorization: Bearer <CRON_SECRET>
 * where CRON_SECRET is set in the Vercel project environment variables.
 * Set CRON_SECRET in your Vercel dashboard → Settings → Environment Variables.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5-minute timeout for backfill work

export async function GET(request) {
  // Validate cron secret so this endpoint cannot be triggered by random callers.
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(request.url).origin;

  try {
    // Backfill 7 days for both leagues in parallel.
    const [nbaResult, cbbResult] = await Promise.all([
      fetch(`${origin}/api/mvix/backfill?days=7&league=NBA`).then((r) => r.json()),
      fetch(`${origin}/api/mvix/backfill?days=7&league=CBB`).then((r) => r.json()),
    ]);

    const summary = {
      timestamp: new Date().toISOString(),
      NBA: {
        processed: nbaResult.gamesProcessed ?? 0,
        skipped: nbaResult.gamesSkipped ?? 0,
        errors: nbaResult.errors ?? 0,
      },
      CBB: {
        processed: cbbResult.gamesProcessed ?? 0,
        skipped: cbbResult.gamesSkipped ?? 0,
        errors: cbbResult.errors ?? 0,
      },
    };

    console.log('Cron backfill complete:', JSON.stringify(summary));
    return Response.json({ success: true, ...summary });
  } catch (err) {
    console.error('Cron backfill error:', err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
