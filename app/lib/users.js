import { sql } from '@vercel/postgres';

export async function findUserByPhone(phone) {
  const { rows } = await sql`
    SELECT id, phone, first_name AS "firstName", last_name AS "lastName",
           email, activated, alert_bluffing AS "alertBluffing",
           alert_comeback AS "alertComeback", alert_swing_warning AS "alertSwingWarning",
           created_at AS "createdAt"
    FROM users WHERE phone = ${phone}
  `;
  return rows[0] || null;
}

export async function findUserById(id) {
  const { rows } = await sql`
    SELECT id, phone, first_name AS "firstName", last_name AS "lastName",
           email, activated, alert_bluffing AS "alertBluffing",
           alert_comeback AS "alertComeback", alert_swing_warning AS "alertSwingWarning",
           created_at AS "createdAt"
    FROM users WHERE id = ${id}::uuid
  `;
  return rows[0] || null;
}

export async function createUser(phone) {
  const { rows } = await sql`
    INSERT INTO users (phone)
    VALUES (${phone})
    RETURNING id, phone, first_name AS "firstName", last_name AS "lastName",
              email, activated, created_at AS "createdAt"
  `;
  return rows[0];
}

export async function updateUser(id, data) {
  const { rows } = await sql`
    UPDATE users
    SET first_name = COALESCE(${data.firstName ?? null}, first_name),
        last_name  = COALESCE(${data.lastName ?? null}, last_name),
        email      = COALESCE(${data.email ?? null}, email),
        activated  = COALESCE(${data.activated ?? null}, activated),
        alert_bluffing = COALESCE(${data.alertBluffing ?? null}, alert_bluffing),
        alert_comeback = COALESCE(${data.alertComeback ?? null}, alert_comeback),
        alert_swing_warning = COALESCE(${data.alertSwingWarning ?? null}, alert_swing_warning)
    WHERE id = ${id}::uuid
    RETURNING id, phone, first_name AS "firstName", last_name AS "lastName",
              email, activated, created_at AS "createdAt"
  `;
  return rows[0] || null;
}
