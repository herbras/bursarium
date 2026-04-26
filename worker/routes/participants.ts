// /participants/* — exchange members.
import { Hono } from 'hono'
import { schemas } from '../lib/db.ts'
import { plainListRouter } from '../lib/route-builders.ts'
import type { Env } from '../lib/types.ts'

export const participantsRouter = new Hono<{ Bindings: Env }>()

participantsRouter.route('/brokers', plainListRouter(schemas.participantBroker))
participantsRouter.route('/dealers', plainListRouter(schemas.participantDealer))
participantsRouter.route('/profiles', plainListRouter(schemas.participantProfile))
