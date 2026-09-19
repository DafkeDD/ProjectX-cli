/** Een volledig Express 5-project in TypeScript (ESM), zonder generator. */
export function expressFiles(appName: string): Record<string, string> {
    return {
        'package.json': JSON.stringify(
            {
                name: 'backend',
                version: '0.0.1',
                private: true,
                description: `API van ${appName}`,
                type: 'module',
                scripts: {
                    dev: 'tsx watch src/index.ts',
                    build: 'tsc -p tsconfig.json',
                    start: 'node dist/index.js',
                    typecheck: 'tsc --noEmit',
                    lint: 'eslint .'
                }
            },
            null,
            2
        ),
        'tsconfig.json': JSON.stringify(
            {
                compilerOptions: {
                    target: 'ES2023',
                    module: 'nodenext',
                    moduleResolution: 'nodenext',
                    rootDir: 'src',
                    outDir: 'dist',
                    strict: true,
                    esModuleInterop: true,
                    skipLibCheck: true,
                    sourceMap: true,
                    types: ['node']
                },
                include: ['src']
            },
            null,
            4
        ),
        '.gitignore': ['node_modules/', 'dist/', '.env', '.env.local', '*.log', ''].join('\n'),
        'eslint.config.mjs': `import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'

export default tseslint.config(
    { ignores: ['dist/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    // Als laatste: opmaak is voor Prettier.
    prettier
)
`,
        'src/index.ts': `// Eerst .env laden, vóór de rest van de app.
import { env } from './env.js'
import express from 'express'
import cors from 'cors'
import { healthRouter } from './routes/health.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'

const app = express()

// Enkel de frontend mag de API aanroepen, met cookies (taal, later login).
app.use(cors({ origin: env.frontendUrl, credentials: true }))
app.use(express.json())

app.use('/health', healthRouter)

// Onbekende route -> 404, en elke fout -> { statusCode, error, message } vertaald.
app.use(notFoundHandler)
app.use(errorHandler)

app.listen(env.port, () => {
    console.log(\`\${env.appName} API draait op http://localhost:\${env.port}\`)
})
`,
        'src/routes/health.ts': `import { Router } from 'express'
import { env } from '../env.js'
import { version } from '../version.js'

export const healthRouter = Router()

/** GET /health — de frontend toont hiermee of de API draait. */
healthRouter.get('/', (_req, res) => {
    res.json({ status: 'ok', app: env.appName, version, time: new Date().toISOString() })
})
`,
        'src/errors.ts': `import type { ErrorKey } from './i18n/i18n.js'

/**
 * Fout met een HTTP-status en (optioneel) een eigen vertaalsleutel:
 *   throw new HttpError(404)
 *   throw new HttpError(409, 'conflict')
 */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        readonly key?: ErrorKey
    ) {
        super(key ?? \`HTTP \${status}\`)
    }
}
`,
        'src/middleware/errors.ts': `import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../errors.js'
import { errorKeyFor, resolveLocale, t } from '../i18n/i18n.js'

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
    next(new HttpError(404))
}

/** Vertaalt elke fout naar { statusCode, error, message }. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
    const status = error instanceof HttpError ? error.status : 500
    if (status >= 500) console.error(error)

    const key = error instanceof HttpError && error.key ? error.key : errorKeyFor(status)
    res.status(status).json({ statusCode: status, error: key, message: t(resolveLocale(req.headers), key) })
}
`
    }
}

export const EXPRESS_DEPS = ['express@latest', 'cors@latest']
export const EXPRESS_DEV_DEPS = [
    // TypeScript 7 (native) wordt nog niet ondersteund door typescript-eslint;
    // NestJS pint om dezelfde reden ook ^6.
    'typescript@^6',
    'tsx@latest',
    '@types/node@latest',
    '@types/express@latest',
    '@types/cors@latest',
    'eslint@latest',
    '@eslint/js@latest',
    'typescript-eslint@latest',
    'eslint-config-prettier@latest'
]
