import { Logger } from '@nestjs/common'
import nodemailer from 'nodemailer'
import { env } from '../env.js'
import { mailText, type MailKind } from '../i18n/mail.js'

const logger = new Logger('Mail')

const transport = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    ...(env.mail.user ? { auth: { user: env.mail.user, pass: env.mail.password } } : {})
})

/**
 * Verstuurt een e-mail via SMTP. Buiten productie komt de link ook in de log,
 * zodat je zonder mailserver kan testen.
 */
export async function sendMail(
    to: { email: string; name: string; locale: string | null },
    kind: MailKind,
    link: string
): Promise<void> {
    const { subject, text } = mailText(to.locale, kind, { name: to.name, app: env.appName, link })
    if (!env.production) logger.log(`${kind} -> ${to.email}: ${link}`)
    try {
        await transport.sendMail({
            from: env.mail.from,
            to: `"${to.name.replace(/"/g, '')}" <${to.email}>`,
            subject,
            text
        })
    } catch (error) {
        // Geen mailserver in ontwikkeling: niet fataal, de link staat in de log.
        if (env.production) throw error
        logger.warn(
            `E-mail niet verstuurd (${error instanceof Error ? error.message : error}) — gebruik de link hierboven.`
        )
    }
}
