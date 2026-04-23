import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { pool } from './db'

import healthRouter from './routes/health'
import staffelnRouter from './routes/staffeln'
import { episodenRouter, bloeckeRouter } from './routes/episoden'
import { stagesRouter, episodenStagesRouter } from './routes/stages'
import { szenenRouter, stagesSzenenRouter } from './routes/szenen'

// Load .env from project root or backend dir
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })
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
app.use('/api/episoden', episodenRouter)
app.use('/api/bloecke', bloeckeRouter)
app.use('/api/stages', stagesRouter)
app.use('/api/episoden', episodenStagesRouter)
app.use('/api/szenen', szenenRouter)
app.use('/api/stages', stagesSzenenRouter)

// Run migration on startup
async function runMigrations() {
  // Find migration file
  const paths = [
    path.join(__dirname, 'migrations', 'v1_init.sql'),
    path.join(__dirname, '..', 'src', 'migrations', 'v1_init.sql'),
  ]
  let sql: string | null = null
  for (const p of paths) {
    if (fs.existsSync(p)) { sql = fs.readFileSync(p, 'utf-8'); break }
  }
  if (!sql) throw new Error('Migration file not found')
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
