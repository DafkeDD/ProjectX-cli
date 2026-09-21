import { defaultLocale, locales, type Locale } from './locales.js'

/**
 * Teksten van de e-mails, per taal. {name}, {app} en {link} worden ingevuld.
 * Staan hier alle talen van de CLI; enkel de gekozen talen worden gebruikt.
 */
interface MailTexts {
    verifySubject: string
    verifyBody: string
    resetSubject: string
    resetBody: string
    existsSubject: string
    existsBody: string
    footer: string
}

const MAIL: Record<string, MailTexts> = {
    en: {
        verifySubject: 'Confirm your email address for {app}',
        verifyBody:
            'Hi {name},\n\nConfirm your email address to activate your {app} account:\n\n{link}\n\nThis link is valid for 24 hours.',
        resetSubject: 'Reset your {app} password',
        resetBody:
            'Hi {name},\n\nSomeone asked to reset your {app} password. Choose a new one here:\n\n{link}\n\nThis link is valid for 1 hour.',
        existsSubject: 'Someone tried to register with your email address',
        existsBody:
            'Hi {name},\n\nSomeone tried to create a {app} account with your email address. You already have one, so nothing changed.\n\nForgot your password? Choose a new one here:\n\n{link}',
        footer: 'Did not request this? Then you can ignore this email.'
    },
    nl: {
        verifySubject: 'Bevestig je e-mailadres voor {app}',
        verifyBody:
            'Hallo {name},\n\nBevestig je e-mailadres om je {app}-account te activeren:\n\n{link}\n\nDeze link is 24 uur geldig.',
        resetSubject: 'Nieuw wachtwoord voor {app}',
        resetBody:
            'Hallo {name},\n\nEr is gevraagd om je wachtwoord voor {app} opnieuw in te stellen. Kies hier een nieuw wachtwoord:\n\n{link}\n\nDeze link is 1 uur geldig.',
        existsSubject: 'Iemand probeerde te registreren met jouw e-mailadres',
        existsBody:
            'Hallo {name},\n\nIemand probeerde een {app}-account te maken met jouw e-mailadres. Je hebt er al een, dus er is niets gewijzigd.\n\nWachtwoord vergeten? Kies hier een nieuw:\n\n{link}',
        footer: 'Heb je dit niet aangevraagd? Dan mag je deze e-mail negeren.'
    },
    fr: {
        verifySubject: 'Confirmez votre adresse e-mail pour {app}',
        verifyBody:
            'Bonjour {name},\n\nConfirmez votre adresse e-mail pour activer votre compte {app} :\n\n{link}\n\nCe lien est valable 24 heures.',
        resetSubject: 'Réinitialisez votre mot de passe {app}',
        resetBody:
            'Bonjour {name},\n\nUne réinitialisation de votre mot de passe {app} a été demandée. Choisissez-en un nouveau ici :\n\n{link}\n\nCe lien est valable 1 heure.',
        existsSubject: "Quelqu'un a tenté de s'inscrire avec votre adresse e-mail",
        existsBody:
            "Bonjour {name},\n\nQuelqu'un a tenté de créer un compte {app} avec votre adresse e-mail. Vous en avez déjà un, rien n'a changé.\n\nMot de passe oublié ? Choisissez-en un nouveau ici :\n\n{link}",
        footer: 'Vous n’êtes pas à l’origine de cette demande ? Ignorez simplement cet e-mail.'
    },
    de: {
        verifySubject: 'Bestätige deine E-Mail-Adresse für {app}',
        verifyBody:
            'Hallo {name},\n\nbestätige deine E-Mail-Adresse, um dein {app}-Konto zu aktivieren:\n\n{link}\n\nDieser Link ist 24 Stunden gültig.',
        resetSubject: 'Neues Passwort für {app}',
        resetBody:
            'Hallo {name},\n\njemand hat angefordert, dein Passwort für {app} zurückzusetzen. Wähle hier ein neues:\n\n{link}\n\nDieser Link ist 1 Stunde gültig.',
        existsSubject: 'Jemand hat versucht, sich mit deiner E-Mail-Adresse zu registrieren',
        existsBody:
            'Hallo {name},\n\nJemand hat versucht, mit deiner E-Mail-Adresse ein {app}-Konto anzulegen. Du hast bereits eines, es wurde nichts geändert.\n\nPasswort vergessen? Hier ein neues wählen:\n\n{link}',
        footer: 'Du hast das nicht angefordert? Dann kannst du diese E-Mail ignorieren.'
    },
    es: {
        verifySubject: 'Confirma tu correo electrónico para {app}',
        verifyBody:
            'Hola {name}:\n\nConfirma tu correo electrónico para activar tu cuenta de {app}:\n\n{link}\n\nEste enlace es válido durante 24 horas.',
        resetSubject: 'Restablece tu contraseña de {app}',
        resetBody:
            'Hola {name}:\n\nSe ha solicitado restablecer tu contraseña de {app}. Elige una nueva aquí:\n\n{link}\n\nEste enlace es válido durante 1 hora.',
        existsSubject: 'Alguien intentó registrarse con tu dirección de correo',
        existsBody:
            'Hola {name},\n\nAlguien intentó crear una cuenta de {app} con tu dirección de correo. Ya tienes una, así que no ha cambiado nada.\n\n¿Olvidaste tu contraseña? Elige una nueva aquí:\n\n{link}',
        footer: '¿No lo has solicitado tú? Puedes ignorar este correo.'
    },
    it: {
        verifySubject: 'Conferma il tuo indirizzo e-mail per {app}',
        verifyBody:
            'Ciao {name},\n\nconferma il tuo indirizzo e-mail per attivare il tuo account {app}:\n\n{link}\n\nQuesto link è valido per 24 ore.',
        resetSubject: 'Reimposta la password di {app}',
        resetBody:
            'Ciao {name},\n\nè stato richiesto di reimpostare la tua password di {app}. Scegline una nuova qui:\n\n{link}\n\nQuesto link è valido per 1 ora.',
        existsSubject: 'Qualcuno ha provato a registrarsi con il tuo indirizzo e-mail',
        existsBody:
            'Ciao {name},\n\nQualcuno ha provato a creare un account {app} con il tuo indirizzo e-mail. Ne hai già uno, quindi non è cambiato nulla.\n\nPassword dimenticata? Scegline una nuova qui:\n\n{link}',
        footer: 'Non hai fatto tu questa richiesta? Puoi ignorare questa e-mail.'
    },
    pt: {
        verifySubject: 'Confirme o seu endereço de e-mail para {app}',
        verifyBody:
            'Olá {name},\n\nConfirme o seu endereço de e-mail para ativar a sua conta {app}:\n\n{link}\n\nEste link é válido durante 24 horas.',
        resetSubject: 'Redefina a sua palavra-passe de {app}',
        resetBody:
            'Olá {name},\n\nFoi pedido para redefinir a sua palavra-passe de {app}. Escolha uma nova aqui:\n\n{link}\n\nEste link é válido durante 1 hora.',
        existsSubject: 'Alguém tentou registar-se com o seu endereço de e-mail',
        existsBody:
            'Olá {name},\n\nAlguém tentou criar uma conta {app} com o seu endereço de e-mail. Já tem uma, por isso nada mudou.\n\nEsqueceu-se da palavra-passe? Escolha uma nova aqui:\n\n{link}',
        footer: 'Não fez este pedido? Pode ignorar este e-mail.'
    },
    pl: {
        verifySubject: 'Potwierdź swój adres e-mail w {app}',
        verifyBody:
            'Cześć {name},\n\npotwierdź swój adres e-mail, aby aktywować konto {app}:\n\n{link}\n\nTen link jest ważny przez 24 godziny.',
        resetSubject: 'Zresetuj hasło do {app}',
        resetBody:
            'Cześć {name},\n\nktoś poprosił o zresetowanie Twojego hasła do {app}. Wybierz nowe tutaj:\n\n{link}\n\nTen link jest ważny przez 1 godzinę.',
        existsSubject: 'Ktoś próbował się zarejestrować Twoim adresem e-mail',
        existsBody:
            'Cześć {name},\n\nKtoś próbował założyć konto {app} na Twój adres e-mail. Masz już konto, więc nic się nie zmieniło.\n\nNie pamiętasz hasła? Wybierz nowe tutaj:\n\n{link}',
        footer: 'To nie Ty? W takim razie zignoruj tę wiadomość.'
    }
}

export type MailKind = 'verify' | 'reset' | 'exists'

/** Onderwerp + tekst in de taal van de ontvanger (of de standaardtaal). */
export function mailText(locale: string | null | undefined, kind: MailKind, values: Record<string, string>) {
    const lang: Locale = (locales as readonly string[]).includes(locale ?? '') ? (locale as Locale) : defaultLocale
    const texts = MAIL[lang] ?? MAIL.en!
    const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
    const subject = { verify: texts.verifySubject, reset: texts.resetSubject, exists: texts.existsSubject }[kind]
    const body = { verify: texts.verifyBody, reset: texts.resetBody, exists: texts.existsBody }[kind]
    return { subject: fill(subject), text: `${fill(body)}\n\n${texts.footer}\n` }
}
