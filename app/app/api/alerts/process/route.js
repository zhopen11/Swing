import { NextResponse } from 'next/server';
import { readSubscriptions } from '../../../../lib/subscriptions';
import { wasAlertSentRecently, recordAlert } from '../../../../lib/alert-history';
import { findUserById } from '../../../../lib/users';

const {
  fetchNbaScoreboard,
  fetchCbbScoreboard,
  fetchGameSummary,
  parseScoreboardEvent,
  getPlaysFromSummary,
} = require('../../../../lib/espn');

const { computeMomentumFromPlays } = require('../../../../lib/momentum');
const { detectAlerts } = require('../../../../lib/alerts');

const LIVE_STATUSES = new Set(['STATUS_IN_PROGRESS', 'STATUS_HALFTIME']);

async function fetchAllGames() {
  const [nbaEvents, cbbEvents] = await Promise.all([
    fetchNbaScoreboard(),
    fetchCbbScoreboard(),
  ]);

  const allEvents = [
    ...nbaEvents.map((e) => ({ ...e, league: 'NBA' })),
    ...cbbEvents.map((e) => ({ ...e, league: 'CBB' })),
  ];

  const games = allEvents.map((e) => parseScoreboardEvent(e, e.league));

  const detailPromises = games.map(async (g) => {
    const needDetail =
      LIVE_STATUSES.has(g.status) ||
      (g.status === 'STATUS_FINAL' && g.period >= 2);

    if (needDetail) {
      const summary = await fetchGameSummary(g.id, g.league);
      const plays = getPlaysFromSummary(summary);
      if (plays.length > 0) {
        g.mom = computeMomentumFromPlays(
          plays,
          g.awayAbbr,
          g.homeAbbr,
          g.awayId,
          g.homeId
        );
      }
    }

    const alerts = detectAlerts(g);
    g.bluffing = alerts.bluffing;
    g.comeback = alerts.comeback;
    g.swingWarning = alerts.swingWarning;

    return g;
  });

  return Promise.all(detailPromises);
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const subscriptions = readSubscriptions();

    if (subscriptions.length === 0) {
      return NextResponse.json({ sent: [], message: 'No active subscriptions' });
    }

    const games = await fetchAllGames();
    const gameMap = new Map(games.map((g) => [g.id, g]));

    const alertsSent = [];
    const ALERT_TYPES = ['bluffing', 'comeback', 'swingWarning'];

    const ALERT_MESSAGES = {
      bluffing: (g) =>
        `Score is Bluffing — ${g.awayScore > g.homeScore ? g.awayAbbr : g.homeAbbr} leads score, ${g.mom?.away > g.mom?.home ? g.awayAbbr : g.homeAbbr} leads The Swing`,
      comeback: (g) =>
        `Comeback Watch — ${g.awayScore < g.homeScore ? g.awayAbbr : g.homeAbbr} trails score but leads momentum`,
      swingWarning: (g) =>
        `Swing Warning — score is close but ${g.mom?.away > g.mom?.home ? g.awayAbbr : g.homeAbbr} owns the momentum`,
    };

    for (const sub of subscriptions) {
      const game = gameMap.get(sub.gameId);
      if (!game) continue;

      const user = findUserById(sub.userId);
      if (!user) continue;

      for (const alertType of ALERT_TYPES) {
        if (!game[alertType]) continue;

        if (wasAlertSentRecently(sub.userId, sub.gameId, alertType)) continue;

        const message = ALERT_MESSAGES[alertType](game);
        const shortName = game.shortName || game.name || sub.gameId;

        console.log(
          `[SMS] To: ${user.phone} | Game: ${shortName} | Alert: ${alertType} | Message: ${message}`
        );

        recordAlert(sub.userId, sub.gameId, alertType);
        alertsSent.push({
          userId: sub.userId,
          phone: user.phone,
          gameId: sub.gameId,
          gameName: shortName,
          alertType,
          message,
        });
      }
    }

    return NextResponse.json({
      sent: alertsSent,
      processed: subscriptions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Alert processing error:', err);
    return NextResponse.json(
      { error: err.message, sent: [] },
      { status: 500 }
    );
  }
}
