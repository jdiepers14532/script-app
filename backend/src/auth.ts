import { Request, Response, NextFunction } from 'express'
import { pool } from './db'

export interface AuthUser {
  user_id: string
  name: string
  email: string
  role: string
  roles: string[]
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Test mode bypass
  if (process.env.PLAYWRIGHT_TEST_MODE === 'true') {
    req.user = {
      user_id: 'test-user',
      name: 'Test User',
      email: 'test@serienwerft.de',
      role: 'superadmin',
      roles: ['superadmin'],
    }
    return next()
  }

  const token = req.cookies?.access_token
  if (!token) {
    return res.status(401).json({ error: 'Nicht authentifiziert' })
  }

  try {
    const response = await fetch('http://127.0.0.1:3002/api/internal/validate-with-roles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_SECRET_KEY || 'SerienwerftInternalKey2026xQzP',
      },
      body: JSON.stringify({ token, app_name: 'script' }),
    })

    if (!response.ok) {
      return res.status(401).json({ error: 'Token ungültig' })
    }

    const data = await response.json() as any
    if (!data.valid) {
      return res.status(401).json({ error: data.error || 'Token ungültig' })
    }
    req.user = {
      user_id: data.user_id,
      name: data.name || '',
      email: data.email || '',
      role: data.role || '',
      roles: data.roles || [],
    }
    next()
  } catch (err) {
    console.error('Auth error:', err)
    return res.status(401).json({ error: 'Auth-Service nicht erreichbar' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' })
    const userRoles = req.user.roles || [req.user.role]
    const hasRole = roles.some(r => userRoles.includes(r))
    if (!hasRole) return res.status(403).json({ error: 'Keine Berechtigung' })
    next()
  }
}

const TIER1_ROLES = ['superadmin', 'geschaeftsfuehrung', 'herstellungsleitung']

// DK-Settings Zugriffspruefung: Tier-1 immer erlaubt, sonst dk_settings_access
export function requireDkAccess(getProductionId: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' })
    const userRoles = req.user.roles || [req.user.role]
    if (userRoles.some(r => TIER1_ROLES.includes(r))) return next()

    const productionId = getProductionId(req)
    if (!productionId) return res.status(400).json({ error: 'Produktion fehlt' })

    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM dk_settings_access
         WHERE production_id = $1
         AND ((access_type = 'user' AND identifier = $2)
           OR (access_type = 'rolle' AND identifier = ANY($3::text[])))`,
        [productionId, req.user.user_id, userRoles]
      )
      if (rows.length === 0) {
        return res.status(403).json({ error: 'Kein Zugriff auf Drehbuchkoordination' })
      }
      next()
    } catch (err) {
      console.error('DK access check error:', err)
      return res.status(500).json({ error: 'Zugriffsprüfung fehlgeschlagen' })
    }
  }
}

// Prueft ob User DK-Zugriff fuer IRGENDEINE Produktion hat (fuer globale DK-Settings)
export function requireAnyDkAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Nicht authentifiziert' })
    const userRoles = req.user.roles || [req.user.role]
    if (userRoles.some(r => TIER1_ROLES.includes(r))) return next()

    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM dk_settings_access
         WHERE (access_type = 'user' AND identifier = $1)
            OR (access_type = 'rolle' AND identifier = ANY($2::text[]))
         LIMIT 1`,
        [req.user.user_id, userRoles]
      )
      if (rows.length === 0) {
        return res.status(403).json({ error: 'Kein Zugriff auf Drehbuchkoordination' })
      }
      next()
    } catch (err) {
      console.error('DK access check error:', err)
      return res.status(500).json({ error: 'Zugriffsprüfung fehlgeschlagen' })
    }
  }
}
