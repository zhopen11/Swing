import pg from 'pg';

let pool;

function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.POSTGRES_URL,
    });
  }
  return pool;
}

// Template tag that mimics @vercel/postgres sql`` interface
export function sql(strings, ...values) {
  const text = strings.reduce((acc, str, i) => {
    return acc + str + (i < values.length ? `$${i + 1}` : '');
  }, '');
  return getPool().query(text, values);
}

export function getDb() {
  return { sql };
}

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      phone VARCHAR(20) UNIQUE NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      email VARCHAR(255),
      activated BOOLEAN DEFAULT false,
      alert_bluffing BOOLEAN DEFAULT true,
      alert_comeback BOOLEAN DEFAULT true,
      alert_swing_warning BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    )
  `;

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_bluffing BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_comeback BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS alert_swing_warning BOOLEAN DEFAULT true`;

  await sql`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      game_id VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE(user_id, game_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS alert_history (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      game_id VARCHAR(100) NOT NULL,
      alert_type VARCHAR(50) NOT NULL,
      sent_at TIMESTAMP DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS team_mvix (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      team VARCHAR(10) NOT NULL,
      league VARCHAR(10) NOT NULL,
      game_id VARCHAR(100) NOT NULL,
      game_date DATE NOT NULL,
      won BOOLEAN,
      score VARCHAR(20),
      mvix INTEGER,
      mvix_up INTEGER,
      mvix_down INTEGER,
      bias INTEGER,
      up_inflections INTEGER,
      down_inflections INTEGER,
      avg_up_magnitude REAL,
      avg_down_magnitude REAL,
      rolling_avg_up_magnitude REAL,
      rolling_mvix REAL,
      mrvi REAL,
      combo REAL,
      games_in_rolling INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE(team, game_id)
    )
  `;

  await sql`ALTER TABLE team_mvix ADD COLUMN IF NOT EXISTS mrvi REAL`;
  await sql`ALTER TABLE team_mvix ADD COLUMN IF NOT EXISTS combo REAL`;
  await sql`ALTER TABLE team_mvix ADD COLUMN IF NOT EXISTS conf VARCHAR(10)`;
  await sql`ALTER TABLE team_mvix ADD COLUMN IF NOT EXISTS conf_strength REAL`;
  await sql`ALTER TABLE team_mvix ADD COLUMN IF NOT EXISTS adj_mvix REAL`;
  await sql`ALTER TABLE team_mvix ADD COLUMN IF NOT EXISTS adj_mrvi REAL`;

  await sql`
    CREATE TABLE IF NOT EXISTS player_swing_impact (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      game_id VARCHAR(100) NOT NULL,
      game_date DATE NOT NULL,
      league VARCHAR(10) NOT NULL,
      team VARCHAR(10) NOT NULL,
      athlete_id VARCHAR(20),
      player_name VARCHAR(100) NOT NULL,
      total_impact REAL NOT NULL,
      swing_appearances INTEGER NOT NULL,
      positive_plays INTEGER NOT NULL,
      negative_plays INTEGER NOT NULL,
      efficiency REAL NOT NULL,
      total_swings INTEGER NOT NULL,
      up_swings INTEGER NOT NULL,
      down_swings INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE(game_id, team, player_name)
    )
  `;

  await sql`ALTER TABLE player_swing_impact ADD COLUMN IF NOT EXISTS conference_id VARCHAR(10)`;
  await sql`ALTER TABLE player_swing_impact ADD COLUMN IF NOT EXISTS conference VARCHAR(60)`;
  await sql`ALTER TABLE player_swing_impact ADD COLUMN IF NOT EXISTS weighted_impact REAL`;
  await sql`ALTER TABLE player_swing_impact ADD COLUMN IF NOT EXISTS clutch_appearances INTEGER DEFAULT 0`;
  await sql`ALTER TABLE player_swing_impact ADD COLUMN IF NOT EXISTS jersey VARCHAR(5)`;

  await sql`
    CREATE TABLE IF NOT EXISTS game_odds (
      game_id VARCHAR(100) PRIMARY KEY,
      details VARCHAR(50),
      spread REAL,
      over_under REAL,
      provider VARCHAR(50),
      captured_at TIMESTAMP DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS alert_logs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      game_id VARCHAR(100) NOT NULL,
      alert_type VARCHAR(50) NOT NULL,
      period INTEGER,
      clock VARCHAR(10),
      away_abbr VARCHAR(10),
      home_abbr VARCHAR(10),
      away_score INTEGER,
      home_score INTEGER,
      away_momentum INTEGER,
      home_momentum INTEGER,
      away_mvix INTEGER,
      home_mvix INTEGER,
      away_bias INTEGER,
      home_bias INTEGER,
      away_mrvi REAL,
      home_mrvi REAL,
      away_rolling3_mvix REAL,
      home_rolling3_mvix REAL,
      away_rolling3_mrvi REAL,
      home_rolling3_mrvi REAL,
      created_at TIMESTAMP DEFAULT now(),
      UNIQUE(game_id, alert_type, period, clock)
    )
  `;
}
