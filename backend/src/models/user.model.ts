import pool from '../config/database';

export type UserRole = 'attendee' | 'host' | 'admin';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  email_verified: boolean;
  stripe_customer_id: string | null;
  stripe_connect_account_id: string | null;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export const UserModel = {
  async findById(id: number): Promise<User | null> {
    const result = await pool.query<User>('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query<User>('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0] || null;
  },

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role?: UserRole;
    stripeCustomerId?: string;
  }): Promise<number> {
    const result = await pool.query<{ id: number }>(
      'INSERT INTO users (email, password_hash, name, role, stripe_customer_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [data.email, data.passwordHash, data.name, data.role || 'attendee', data.stripeCustomerId ?? null]
    );
    return result.rows[0].id;
  },

  async updateEmailVerified(id: number): Promise<void> {
    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [id]);
  },

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  },

  async updateStripeCustomerId(id: number, customerId: string): Promise<void> {
    await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, id]);
  },

  async updateStripeConnectId(id: number, accountId: string): Promise<void> {
    await pool.query('UPDATE users SET stripe_connect_account_id = $1 WHERE id = $2', [accountId, id]);
  },

  async updateRole(id: number, role: UserRole): Promise<void> {
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
  },

  async updateProfile(id: number, data: { name?: string; avatar_url?: string }): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;
    if (data.name !== undefined) { fields.push(`name = $${paramIndex++}`); values.push(data.name); }
    if (data.avatar_url !== undefined) { fields.push(`avatar_url = $${paramIndex++}`); values.push(data.avatar_url); }
    if (fields.length === 0) return;
    values.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
  },
};
