import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { getClientIp } from '@/lib/crypto'
import { sendBulkEmails } from '@/lib/mailer'

/** POST /api/admin/broadcast — send an email to ALL users */
export async function POST(req: NextRequest) {
  const admin = await getSessionUser(req)
  if (!admin || admin.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }
  const body = await req.json()
  const { subject, body: emailBody, role, status } = body as {
    subject: string
    body: string
    role?: string
    status?: string
  }
  if (!subject || !emailBody) {
    return NextResponse.json(
      { error: 'subject and body required' },
      { status: 400 }
    )
  }
  const where: any = {}
  if (role) where.role = role
  if (status) where.status = status
  const recipients = await db.user.findMany({
    where,
    select: { id: true, email: true },
  })

  // Save a copy in each recipient's inbox
  for (const r of recipients) {
    await db.email.create({
      data: {
        ownerId: r.id,
        threadId: `broadcast-${Date.now()}-${r.id}`,
        fromAddr: 'no-reply@bridge.app',
        toAddr: r.email,
        subject,
        bodyPlain: emailBody,
        snippet: emailBody.slice(0, 120).replace(/\n/g, ' '),
        isRead: false,
        isSent: true,
        folder: 'inbox',
        labelsCsv: 'broadcast,important',
        isImportant: true,
        receivedAt: new Date(),
      },
    })
  }

  // Actually send via SMTP (batched). When SMTP isn't configured, this returns
  // { sent: N, skipped: true } so the admin knows the broadcast was in-app only.
  const smtpResult = await sendBulkEmails(
    recipients.map((r) => ({
      to: r.email,
      subject,
      text: emailBody,
      from: 'no-reply@bridge.app',
    }))
  )

  await db.activityLog.create({
    data: {
      userId: admin.id,
      action: 'admin.broadcast',
      metaJson: JSON.stringify({
        subject,
        recipients: recipients.length,
        smtpSent: smtpResult.sent,
        smtpFailed: smtpResult.failed,
        filter: { role, status },
      }),
      ipAddress: getClientIp(req),
      severity: 'warn',
    },
  })

  return NextResponse.json({
    sent: recipients.length,
    smtpSent: smtpResult.sent,
    smtpFailed: smtpResult.failed,
    smtpSkipped: smtpResult.sent === 0 && smtpResult.failed === 0,
    errors: smtpResult.errors.slice(0, 5),
  })
}
