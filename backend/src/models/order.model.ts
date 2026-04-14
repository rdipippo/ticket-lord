import pool from '../config/database';

export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'refunded';

export interface Order {
  id: number;
  user_id: number;
  event_id: number;
  total_amount: number;
  platform_fee: number;
  status: OrderStatus;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  refund_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined
  event_title?: string;
  buyer_name?: string;
  buyer_email?: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  ticket_type_id: number;
  quantity: number;
  unit_price: number;
  ticket_type_name?: string;
}

export const OrderModel = {
  async findById(id: number): Promise<Order | null> {
    const result = await pool.query<Order>(
      `SELECT o.*, e.title as event_title, u.name as buyer_name, u.email as buyer_email
       FROM orders o
       JOIN events e ON o.event_id = e.id
       JOIN users u ON o.user_id = u.id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findByPaymentIntentId(paymentIntentId: string): Promise<Order | null> {
    const result = await pool.query<Order>(
      'SELECT * FROM orders WHERE stripe_payment_intent_id = $1',
      [paymentIntentId]
    );
    return result.rows[0] || null;
  },

  async findByUserId(userId: number): Promise<Order[]> {
    const result = await pool.query<Order>(
      `SELECT o.*, e.title as event_title, e.start_date, e.image_url
       FROM orders o
       JOIN events e ON o.event_id = e.id
       WHERE o.user_id = $1 AND o.status != 'pending'
       ORDER BY o.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async findByEventId(eventId: number, hostId: number): Promise<Order[]> {
    const result = await pool.query<Order>(
      `SELECT o.*, u.name as buyer_name, u.email as buyer_email
       FROM orders o
       JOIN events e ON o.event_id = e.id
       JOIN users u ON o.user_id = u.id
       WHERE o.event_id = $1 AND e.host_id = $2 AND o.status = 'completed'
       ORDER BY o.created_at DESC`,
      [eventId, hostId]
    );
    return result.rows;
  },

  async getItems(orderId: number): Promise<OrderItem[]> {
    const result = await pool.query<OrderItem>(
      `SELECT oi.*, tt.name as ticket_type_name
       FROM order_items oi
       JOIN ticket_types tt ON oi.ticket_type_id = tt.id
       WHERE oi.order_id = $1`,
      [orderId]
    );
    return result.rows;
  },

  async create(data: {
    userId: number;
    eventId: number;
    totalAmount: number;
    platformFee: number;
    stripePaymentIntentId: string;
  }): Promise<number> {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO orders (user_id, event_id, total_amount, platform_fee, stripe_payment_intent_id, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [data.userId, data.eventId, data.totalAmount, data.platformFee, data.stripePaymentIntentId]
    );
    return result.rows[0].id;
  },

  async addItem(data: {
    orderId: number;
    ticketTypeId: number;
    quantity: number;
    unitPrice: number;
  }): Promise<number> {
    const result = await pool.query<{ id: number }>(
      'INSERT INTO order_items (order_id, ticket_type_id, quantity, unit_price) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.orderId, data.ticketTypeId, data.quantity, data.unitPrice]
    );
    return result.rows[0].id;
  },

  async updateStatus(id: number, status: OrderStatus, extra?: {
    stripeChargeId?: string;
    refundId?: string;
  }): Promise<void> {
    const fields = ['status = $1'];
    const values: unknown[] = [status];
    let paramIndex = 2;
    if (extra?.stripeChargeId) { fields.push(`stripe_charge_id = $${paramIndex++}`); values.push(extra.stripeChargeId); }
    if (extra?.refundId) { fields.push(`refund_id = $${paramIndex++}`); values.push(extra.refundId); }
    values.push(id);
    await pool.query(`UPDATE orders SET ${fields.join(', ')} WHERE id = $${paramIndex}`, values);
  },

  async getEventRevenue(eventId: number, hostId: number): Promise<{
    totalRevenue: number; platformFees: number; netRevenue: number; orderCount: number;
  }> {
    const result = await pool.query<{
      totalrevenue: string; platformfees: string; netrevenue: string; ordercount: string;
    }>(
      `SELECT
        SUM(o.total_amount) as totalRevenue,
        SUM(o.platform_fee) as platformFees,
        SUM(o.total_amount - o.platform_fee) as netRevenue,
        COUNT(*)::text as orderCount
       FROM orders o
       JOIN events e ON o.event_id = e.id
       WHERE o.event_id = $1 AND e.host_id = $2 AND o.status = 'completed'`,
      [eventId, hostId]
    );
    const row = result.rows[0];
    return {
      totalRevenue: parseInt(row.totalrevenue, 10) || 0,
      platformFees: parseInt(row.platformfees, 10) || 0,
      netRevenue: parseInt(row.netrevenue, 10) || 0,
      orderCount: parseInt(row.ordercount, 10) || 0,
    };
  },
};
