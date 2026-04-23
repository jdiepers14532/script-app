import { Request, Response, NextFunction } from 'express'

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
    const response = await fetch('http://127.0.0.1:3002/api/internal/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    if (!response.ok) {
      return res.status(401).json({ error: 'Token ungültig' })
    }

    const data = await response.json() as any
    req.user = {
      user_id: data.user_id || data.id,
      name: data.name || '',
      email: data.email || '',
      role: data.role || '',
      roles: data.roles || [data.role],
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
