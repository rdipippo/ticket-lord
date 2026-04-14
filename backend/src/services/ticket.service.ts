import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { TicketModel } from '../models/ticket.model';
import { OrderModel } from '../models/order.model';
import pool from '../config/database';

export const TicketService = {
  generateTicketNumber(): string {
    return `TL-${uuidv4().toUpperCase().replace(/-/g, '').slice(0, 10)}`;
  },

  async generateQrCode(ticketNumber: string, eventId: number): Promise<string> {
    const payload = JSON.stringify({ ticketNumber, eventId, issuer: 'TicketLord' });
    return QRCode.toDataURL(payload);
  },

  async issueTickets(data: {
    orderId: number;
    orderItemId: number;
    userId: number;
    eventId: number;
    ticketTypeId: number;
    quantity: number;
  }): Promise<number[]> {
    const ticketIds: number[] = [];
    for (let i = 0; i < data.quantity; i++) {
      const ticketNumber = this.generateTicketNumber();
      const qrCode = await this.generateQrCode(ticketNumber, data.eventId);
      const id = await TicketModel.create({
        orderId: data.orderId,
        orderItemId: data.orderItemId,
        userId: data.userId,
        eventId: data.eventId,
        ticketTypeId: data.ticketTypeId,
        ticketNumber,
        qrCode,
      });
      ticketIds.push(id);
    }
    return ticketIds;
  },

  async processOrderCompletion(orderId: number): Promise<void> {
    const order = await OrderModel.findById(orderId);
    if (!order) throw new Error('Order not found');
    const items = await OrderModel.getItems(orderId);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of items) {
        for (let i = 0; i < item.quantity; i++) {
          const ticketNumber = this.generateTicketNumber();
          const qrCode = await this.generateQrCode(ticketNumber, order.event_id);
          await client.query(
            `INSERT INTO tickets (order_id, order_item_id, user_id, event_id, ticket_type_id,
              ticket_number, qr_code, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'valid')`,
            [orderId, item.id, order.user_id, order.event_id, item.ticket_type_id, ticketNumber, qrCode]
          );
        }
        await client.query(
          'UPDATE ticket_types SET quantity_sold = quantity_sold + $1 WHERE id = $2',
          [item.quantity, item.ticket_type_id]
        );
      }

      await client.query("UPDATE orders SET status = 'completed' WHERE id = $1", [orderId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async validateTicket(ticketNumber: string, eventId: number): Promise<{
    valid: boolean;
    message: string;
    ticket?: object;
  }> {
    const result = await TicketModel.checkIn(ticketNumber, eventId);
    if (!result.success) return { valid: false, message: result.message };
    const ticket = await TicketModel.findByTicketNumber(ticketNumber);
    return { valid: true, message: result.message, ticket: ticket || undefined };
  },
};
