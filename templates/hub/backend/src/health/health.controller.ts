import { Controller, Get } from '@nestjs/common'
import { env } from '../env.js'
import { version } from '../version.js'
import { hubIsHealthy } from '../db/hub.js'

@Controller('health')
export class HealthController {
    /** GET /health — status van de hub en de database. */
    @Get()
    async check() {
        const database = (await hubIsHealthy()) ? 'ok' : 'down'
        return { status: 'ok', app: env.appName, version, database, issuer: env.issuer, time: new Date().toISOString() }
    }
}
