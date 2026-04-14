import { Pool } from 'pg';
import { config } from './index';

const pool = new Pool({
  connectionString: config.db.connectionString,
  ssl: { rejectUnauthorized: false },
});

export default pool;
