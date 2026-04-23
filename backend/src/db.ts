import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://script_user:ScriptDB2026@localhost:5432/script_db',
})

export async function query(sql: string, params?: any[]): Promise<any[]> {
  const res = await pool.query(sql, params)
  return res.rows
}

export async function queryOne(sql: string, params?: any[]): Promise<any | null> {
  const res = await pool.query(sql, params)
  return res.rows[0] || null
}
