import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/mailer'

/**
 * POST /api/cron/scheduled-emails
 *
 * Dispatches scheduled emails whose sendAt time has passed.
 * Meant to be called every 5-10 minutes by an external cron (e.g.
 * cron-job.org, systemd timer, Vercel Cron, Caddy cron, etc.).
 *
 * Auth: requires a CRON_SECRET env var matching the `x-cron-secret` header.
 * If CRON_SECRET is not set, the endpoint is open (dev mode only).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  const expected = process.env.CRON_SECRET
  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = await db.scheduledEmail.findMany({
    where: {
      status: 'scheduled',
      sendAt: { lte: new Date() },
    },
    take: 50,
  })

  let sent = 0
  let failed = 0
  for (const s of due) {
    // Look up owner + signature separately (ScheduledEmail has no relation fields)
    const owner = await db.user.findUnique({
      where: { id: s.ownerId },
      select: { email: true, name: true },
    })
    let signatureBody = ''
    if (s.signatureId) {
      const sig = await db.emailSignature.findUnique({
        where: { id: s.signatureId },
        select: { body: true },
      })
      if (sig) signatureBody = sig.body
    }
    const body = signatureBody
      ? `${s.body}\n\n---\n${signatureBody}`
      : s.body
    const result = await sendEmail({
      to: s.toAddr,
      cc: s.ccAddr || undefined,
      bcc: s.bccAddr || undefined,
      subject: s.subject,
      text: body,
      from: owner?.email || 'no-reply@bridge.app',
    })
    if (result.ok && !result.skipped) {
      // Mark as sent + save copy in sent folder
      const email = await db.email.create({
        data: {
          ownerId: s.ownerId,
          threadId: `scheduled-${s.id}`,
          fromAddr: owner?.email || "no-reply@bridge.app",
          toAddr: s.toAddr,
          ccAddr: s.ccAddr || null,
          bccAddr: s.bccAddr || null,
          subject: s.subject,
          bodyPlain: body,
          snippet: body.slice(0, 120).replace(/\n/g, ' '),
          isRead: true,
          isSent: true,
          folder: 'sent',
          sentAt: new Date(),
          receivedAt: new Date(),
        },
      })
      await db.scheduledEmail.update({
        where: { id: s.id },
        data: { status: 'sent', sentEmailId: email.id },
      })
      sent++
    } else if (!result.ok) {
      await db.scheduledEmail.update({
        where: { id: s.id },
        data: { status: 'sent' }, // mark to avoid retry loop; log the failure
      })
      failed++
    } else {
      // SMTP skipped — save as a sent copy locally
      const email = await db.email.create({
        data: {
          ownerId: s.ownerId,
          threadId: `scheduled-${s.id}`,
          fromAddr: owner?.email || "no-reply@bridge.app",
          toAddr: s.toAddr,
          ccAddr: s.ccAddr || null,
          bccAddr: s.bccAddr || null,
          subject: s.subject,
          bodyPlain: body,
          snippet: body.slice(0, 120).replace(/\n/g, ' '),
          isRead: true,
          isSent: true,
          folder: 'sent',
          labelsCsv: 'smtp-not-configured',
          sentAt: new Date(),
          receivedAt: new Date(),
        },
      })
      await db.scheduledEmail.update({
        where: { id: s.id },
        data: { status: 'sent', sentEmailId: email.id },
      })
      sent++
    }
  }

  return NextResponse.json({
    processed: due.length,
    sent,
    failed,
    at: new Date().toISOString(),
  })
}
