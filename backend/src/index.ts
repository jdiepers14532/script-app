import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { pool } from './db'

import healthRouter from './routes/health'
import staffelnRouter from './routes/staffeln'
import episodenRouter from './routes/episoden'
import stagesRouter from './routes/stages'
import szenenRouter from './routes/szenen'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3014

app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))

// Routes
app.use('/api', healthRouter)
app.use('/api/staffeln', staffelnRouter)
app.use('/api', episodenRouter)
app.use('/api', stagesRouter)
app.use('/api/szenen', szenenRouter)
app.use('/api', szenenRouter)

// Run migration on startup
async function runMigrations() {
  const migrationPath = path.join(__dirname, 'migrations', 'v1_init.sql')
  let sql: string
  try {
    sql = fs.readFileSync(migrationPath, 'utf-8')
  } catch (e) {
    // Try compiled path
    const altPath = path.join(__dirname, '..', 'src', 'migrations', 'v1_init.sql')
    sql = fs.readFileSync(altPath, 'utf-8')
  }
  await pool.query(sql)
  console.log('Migration v1 applied')
}

app.listen(PORT, async () => {
  try {
    await runMigrations()
  } catch (err) {
    console.error('Migration error:', err)
  }
  console.log(`Script backend running on port ${PORT}`)
})
