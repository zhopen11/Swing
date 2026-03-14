import { sql } from '@vercel/postgres';

export function getDb() {
  return sql;
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

  // Add columns if they don't exist (for existing databases)
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
}
