/**
 * SMTP email sender.
 *
 * Uses nodemailer when SMTP settings are configured by the super-admin in
 * the system settings table. If SMTP is not configured, the email is
 * "delivered" locally only (saved in DB as sent) — useful for dev/demo.
 *
 * Settings consumed (all from SystemSetting table):
 *   - smtp_host: e.g. "smtp.gmail.com"
 *   - smtp_port: e.g. 465 (SSL) or 587 (STARTTLS)
 *   - smtp_user: SMTP username
 *   - smtp_pass: SMTP password (app-specific password for Gmail)
 *   - smtp_from: From: address (defaults to smtp_user)
 */

import {
  getSetting,
} from './system-settings'

export interface SendEmailParams {
  to: string
  cc?: string
  bcc?: string
  subject: string
  text: string
  html?: string
  from?: string // optional override
  replyTo?: string
}

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
  secure: boolean
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const [host, portStr, user, pass, from] = await Promise.all([
    getSetting('smtp_host'),
    getSetting('smtp_port'),
    getSetting('smtp_user'),
    getSetting('smtp_pass'),
    getSetting('smtp_from'),
  ])
  if (!host || !user || !pass) return null
  const port = Number(portStr) || 587
  return {
    host,
    port,
    user,
    pass,
    from: from || user,
    secure: port === 465,
  }
}

/**
 * Send an email via configured SMTP. Returns { ok, messageId, error }.
 *
 * When SMTP is not configured, returns { ok: true, skipped: true } — caller
 * should treat this as "saved locally but not actually delivered".
 */
export async function sendEmail(params: SendEmailParams): Promise<{
  ok: boolean
  messageId?: string
  skipped?: boolean
  error?: string
}> {
  const cfg = await getSmtpConfig()
  if (!cfg) {
    return { ok: true, skipped: true }
  }

  try {
    // Dynamic import so we don't fail if nodemailer isn't installed in dev
    const nodemailer = await importNodemailer()
    if (!nodemailer) {
      return { ok: false, error: 'nodemailer not installed on server' }
    }
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    })
    const info = await transporter.sendMail({
      from: params.from || cfg.from,
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
    })
    return { ok: true, messageId: info.messageId }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) }
  }
}

/**
 * Lazy-load nodemailer. Returns null if not installed.
 */
async function importNodemailer(): Promise<any | null> {
  try {
    // nodemailer is CommonJS-only; dynamic import works in both.
    const mod = await import('nodemailer')
    return mod.default || mod
  } catch {
    return null
  }
}

/**
 * Bulk send — used by the broadcast endpoint.
 * Sends in batches of 10 concurrent to avoid SMTP rate limits.
 */
export async function sendBulkEmails(
  messages: SendEmailParams[],
  onProgress?: (sent: number, failed: number, total: number) => void
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const errors: string[] = []
  let sent = 0
  let failed = 0
  const BATCH = 10
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map((m) => sendEmail(m)))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) sent++
      else {
        failed++
        if (r.status === 'fulfilled') errors.push(r.value.error || 'unknown')
        else errors.push(String(r.reason))
      }
    }
    if (onProgress) onProgress(sent, failed, messages.length)
  }
  return { sent, failed, errors }
}
