// Eerst .env laden, vóór de rest van de app.
import { env } from './env.js'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module.js'
import { I18nExceptionFilter } from './i18n/i18n-exception.filter.js'
import { hubPool } from './db/hub.js'
import { runMigrations } from './db/migrate.js'
import { cleanupOidcStore } from './oidc/adapter.js'
import { deliverPending } from './hub/delivery.js'
import { createProvider } from './oidc/provider.js'

async function bootstrap() {
    // Eerst de hub-database bijwerken (migrations/hub).
    await runMigrations(hubPool, 'hub')

    // Zonder eigen body-parser: oidc-provider leest zijn verzoeken zelf.
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
    app.set('trust proxy', 'loopback, linklocal, uniquelocal')

    // De OIDC-server op /oidc (publiek: <frontend>/oidc — de frontend stuurt door).
    const provider = await createProvider()
    app.use('/oidc', provider.callback())

    // Daarna pas JSON voor de eigen API.
    app.useBodyParser('json', { limit: '100kb' })

    // De frontend (zelfde adres via doorsturen) mag de API aanroepen, met cookies.
    app.enableCors({ origin: env.frontendUrl, credentials: true })

    // Elke fout -> { statusCode, error, message } in de taal van de gebruiker.
    app.useGlobalFilters(new I18nExceptionFilter())

    // Verlopen codes en sessies opruimen.
    await cleanupOidcStore()
    setInterval(() => void cleanupOidcStore().catch(() => {}), 3600_000).unref()

    // Events naar de apps sturen die een webhook hebben.
    setInterval(() => void deliverPending().catch(error => console.error('Events bezorgen:', error)), 30_000).unref()

    await app.listen(env.port)
    console.log(
        `${env.appName} draait op http://localhost:${env.port} — publiek via ${env.frontendUrl} (issuer ${env.issuer})`
    )
}

await bootstrap()
