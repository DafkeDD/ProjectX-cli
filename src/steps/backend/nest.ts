import fs from 'node:fs'
import path from 'node:path'

/** Bestanden die we in een verse `nest new` zetten of vervangen. */
export function nestFiles(): Record<string, string> {
    return {
        'src/main.ts': `// Eerst .env laden, vóór de rest van de app.
import { env } from './env.js'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { I18nExceptionFilter } from './i18n/i18n-exception.filter.js'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)

    // Enkel de frontend mag de API aanroepen, met cookies (taal, later login).
    app.enableCors({ origin: env.frontendUrl, credentials: true })

    // Elke fout -> { statusCode, error, message } in de taal van de gebruiker.
    app.useGlobalFilters(new I18nExceptionFilter())

    await app.listen(env.port)
    console.log(\`\${env.appName} API draait op http://localhost:\${env.port}\`)
}

await bootstrap()
`,
        'src/health/health.controller.ts': `import { Controller, Get } from '@nestjs/common'
import { env } from '../env.js'
import { version } from '../version.js'

@Controller('health')
export class HealthController {
    /** GET /health — de frontend toont hiermee of de API draait. */
    @Get()
    check() {
        return { status: 'ok', app: env.appName, version, time: new Date().toISOString() }
    }
}
`,
        // nest new schrijft een test die 'supertest/types' importeert (bestaat niet in
        // supertest 7) en "Hello World!" verwacht: vervangen door een test op /health.
        'test/app.e2e-spec.ts': `import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from './../src/app.module.js'

describe('Health (e2e)', () => {
    let app: INestApplication<Server>

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile()
        app = moduleFixture.createNestApplication()
        await app.init()
    })

    it('GET /health', () => {
        return request(app.getHttpServer()).get('/health').expect(200)
    })

    afterEach(async () => {
        await app.close()
    })
})
`,
        'src/health/health.module.ts': `import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'

@Module({ controllers: [HealthController] })
export class HealthModule {}
`,
        'src/i18n/i18n-exception.filter.ts': `import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { errorKeyFor, isErrorKey, resolveLocale, t } from './i18n.js'

/**
 * Vertaalt elke fout. Een eigen sleutel meegeven kan zo:
 *   throw new BadRequestException({ key: 'conflict' })
 */
@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger('Fouten')

    catch(exception: unknown, host: ArgumentsHost) {
        const http = host.switchToHttp()
        const request = http.getRequest<Request>()
        const response = http.getResponse<Response>()

        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
        if (status >= 500) this.logger.error(exception)

        const body = exception instanceof HttpException ? exception.getResponse() : undefined
        const custom = typeof body === 'object' && body !== null ? (body as { key?: unknown }).key : undefined
        const key = isErrorKey(custom) ? custom : errorKeyFor(status)

        response.status(status).json({ statusCode: status, error: key, message: t(resolveLocale(request.headers), key) })
    }
}
`
    }
}

/** HealthModule registreren in AppModule. */
export function registerHealthModule(target: string): void {
    const file = path.join(target, 'src', 'app.module.ts')
    // nest new op Windows schrijft CRLF: eerst gelijktrekken, anders matcht niets.
    let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    if (source.includes('HealthModule')) return
    const importLine = `import { HealthModule } from './health/health.module.js'\n`
    const withImport = source.replace(/(import \{ Module \} from '@nestjs\/common';?\n)/, `$1${importLine}`)
    // Import nooit kwijt: lukt de regex niet, dan bovenaan.
    source = withImport !== source ? withImport : importLine + source
    const withModule = source.replace(/imports:\s*\[\s*\]/, 'imports: [HealthModule]')
    if (withModule === source) throw new Error('HealthModule kon niet in src/app.module.ts gezet worden.')
    source = withModule
    fs.writeFileSync(file, source, 'utf8')
}
