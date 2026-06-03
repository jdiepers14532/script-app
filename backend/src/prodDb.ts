import { Pool } from 'pg'

// Read-only safeguard: PostgreSQL rejects any write on this pool at the session level.
// DB-user least-privilege is a separate DBA task; this is the immediate code-level guard.
const prodPool = new Pool({
  connectionString: 'postgresql://produktion:ProduktionDB2026@localhost:5432/produktion',
  max: 3,
  options: '-c default_transaction_read_only=on',
})

export async function prodQueryOne(sql: string, params?: any[]): Promise<any | null> {
  const res = await prodPool.query(sql, params)
  return res.rows[0] || null
}

export async function prodQuery(sql: string, params?: any[]): Promise<any[]> {
  const res = await prodPool.query(sql, params)
  return res.rows
}
