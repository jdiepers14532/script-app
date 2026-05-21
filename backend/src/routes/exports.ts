import { Router } from 'express'
import { authMiddleware } from '../auth'

const router = Router()
router.use(authMiddleware)

// Export-Routen wurden entfernt — werden neu gebaut.

export default router
