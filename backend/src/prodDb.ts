import { Pool } from 'pg'

const prodPool = new Pool({
  connectionString: 'postgresql://produktion:ProduktionDB2026@localhost:5432/produktion',
  max: 3,
})

export async function prodQueryOne(sql: string, params?: any[]): Promise<any | null> {
  const res = await prodPool.query(sql, params)
  return res.rows[0] || null
}
