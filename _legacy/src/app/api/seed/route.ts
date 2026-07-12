import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash } from 'crypto'

function hash(p: string) {
  return createHash('sha256').update(p).digest('hex')
}

export async function POST() {
  try {
    // Check if already seeded
    const count = await db.user.count()
    if (count > 0) {
      return NextResponse.json({ ok: true, message: 'Already seeded' })
    }

    // 1. Create demo users
    const demoUser = await db.user.create({
      data: {
        email: 'demo@bridge.app',
        name: 'Alex Demo',
        role: 'user',
        locale: 'en',
        passwordHash: hash('demo1234'),
      },
    })
    const adminUser = await db.user.create({
      data: {
        email: 'admin@bridge.app',
        name: 'Admin Root',
        role: 'admin',
        locale: 'en',
        passwordHash: hash('admin1234'),
      },
    })
    const extraUsers = await Promise.all(
      [
        ['maria@bridge.app', 'Maria Garcia'],
        ['yuki@bridge.app', 'Yuki Tanaka'],
        ['klaus@bridge.app', 'Klaus Weber'],
        ['priya@bridge.app', 'Priya Patel'],
        ['liam@bridge.app', 'Liam OBrien'],
      ].map(([email, name]) =>
        db.user.create({
          data: {
            email,
            name,
            role: 'user',
            locale: 'en',
          },
        })
      )
    )

    // 2. Create plans
    const freePlan = await db.plan.create({
      data: {
        name: 'Free',
        tier: 'free',
        priceMonthly: 0,
        priceYearly: 0,
        meetingMinutes: 60,
        maxParticipants: 4,
        translationLangs: 3,
        apiTokens: 1,
        storageGb: 1,
        featuresCsv: 'HD video,3 languages,Basic captions',
        isActive: true,
      },
    })
    const proPlan = await db.plan.create({
      data: {
        name: 'Pro',
        tier: 'pro',
        priceMonthly: 1900,
        priceYearly: 19000,
        meetingMinutes: 3000,
        maxParticipants: 50,
        translationLangs: 30,
        apiTokens: 5,
        storageGb: 50,
        featuresCsv: 'HD video,30 languages,Recording,API access,Transcript export',
        isActive: true,
      },
    })
    const enterprisePlan = await db.plan.create({
      data: {
        name: 'Enterprise',
        tier: 'enterprise',
        priceMonthly: 7900,
        priceYearly: 79000,
        meetingMinutes: 50000,
        maxParticipants: 500,
        translationLangs: 95,
        apiTokens: 100,
        storageGb: 1000,
        featuresCsv: '4K video,95 languages,SSO,Recording,Unlimited API,SLA 99.9%,Dedicated support',
        isActive: true,
      },
    })

    // 3. Subscribe demo users
    await db.subscription.create({
      data: {
        userId: demoUser.id,
        planId: proPlan.id,
        status: 'active',
        interval: 'monthly',
        currentPeriodStart: new Date('2026-06-15'),
        currentPeriodEnd: new Date('2026-07-15'),
      },
    })
    await db.subscription.create({
      data: {
        userId: adminUser.id,
        planId: enterprisePlan.id,
        status: 'active',
        interval: 'yearly',
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2027-01-01'),
      },
    })

    // 4. Create sample meetings
    const now = new Date()
    const m1 = await db.meeting.create({
      data: {
        title: 'Weekly Product Sync',
        description: 'Roadmap review with EU + APAC teams',
        hostId: demoUser.id,
        status: 'scheduled',
        startAt: new Date(now.getTime() + 1000 * 60 * 60 * 2),
        joinCode: 'WKPROD-7K2',
        transcriptLang: 'en',
        targetLangs: 'en,es,fr,de,ja,zh,hi',
      },
    })
    const m2 = await db.meeting.create({
      data: {
        title: 'Customer Onboarding — Acme Co.',
        description: 'Walk through dashboard, billing, and API tokens.',
        hostId: demoUser.id,
        status: 'scheduled',
        startAt: new Date(now.getTime() + 1000 * 60 * 60 * 24),
        joinCode: 'ACME-9F4Q',
        transcriptLang: 'en',
        targetLangs: 'en,es,de,zh,hi',
      },
    })
    const m3 = await db.meeting.create({
      data: {
        title: 'Quarterly All-Hands',
        description: 'Company-wide update across all regions.',
        hostId: adminUser.id,
        status: 'ended',
        startAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2),
        endAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2 + 1000 * 60 * 75),
        joinCode: 'Q2AH-2026',
        transcriptLang: 'en',
        targetLangs: 'en,es,fr,de,ja,zh,hi,pt,ar,ru',
      },
    })
    const m4 = await db.meeting.create({
      data: {
        title: 'Design Critique',
        description: 'Critique new onboarding flow designs',
        hostId: demoUser.id,
        status: 'live',
        startAt: new Date(now.getTime() - 1000 * 60 * 15),
        joinCode: 'DSGN-CR1T',
        transcriptLang: 'en',
        targetLangs: 'en,es,de,ja',
      },
    })

    // 5. Add participants
    for (const u of extraUsers) {
      await db.meetingParticipant.create({
        data: {
          meetingId: m1.id,
          userId: u.id,
          displayName: u.name,
          role: 'participant',
        },
      })
    }
    await db.meetingParticipant.create({
      data: {
        meetingId: m4.id,
        userId: demoUser.id,
        displayName: demoUser.name,
        role: 'host',
        joinedAt: new Date(now.getTime() - 1000 * 60 * 15),
        audioOn: true,
        videoOn: true,
      },
    })

    // 6. Sample transcripts for ended meeting
    const samples = [
      ['Welcome everyone to the Q2 all-hands.', 'en', 'es', 'Bienvenidos a la reunión general del segundo trimestre.'],
      ['Today we will cover product updates and roadmap.', 'en', 'es', 'Hoy cubriremos las actualizaciones del producto y la hoja de ruta.'],
      ['Our user base grew 40% this quarter.', 'en', 'es', 'Nuestra base de usuarios creció un 40% este trimestre.'],
      ['Translation latency dropped to under 800ms.', 'en', 'es', 'La latencia de traducción bajó a menos de 800 ms.'],
      ['We are launching in three new markets next month.', 'en', 'es', 'Lanzaremos en tres nuevos mercados el próximo mes.'],
      ['Please submit your questions in the chat.', 'en', 'es', 'Por favor envíen sus preguntas en el chat.'],
    ]
    for (const [src, sl, tl, tgt] of samples) {
      await db.transcriptMessage.create({
        data: {
          meetingId: m3.id,
          speakerName: 'Admin Root',
          sourceLang: sl,
          sourceText: src as string,
          targetLang: tl as string,
          targetText: tgt as string,
        },
      })
    }

    // 7. Seed emails (Gmail-like)
    const emailSamples = [
      {
        from: 'maria@bridge.app',
        to: 'demo@bridge.app',
        subject: 'Translation quality review — Spanish',
        body: `Hi Alex,\n\nI went through the Spanish translations from yesterday's call. Quality is excellent overall — the OpenAI Realtime API handles idioms far better than the previous pipeline.\n\nA few notes:\n- "Quarterly All-Hands" was translated as "Reunión General Trimestral" — correct, but we may want to keep the English brand term.\n- Latency averaged 740ms — well within our 1s target.\n\nLet's chat tomorrow.\n\nBest,\nMaria`,
        labels: 'work,important',
        starred: true,
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 3),
      },
      {
        from: 'noreply@stripe.com',
        to: 'demo@bridge.app',
        subject: 'Your Pro subscription receipt — June 2026',
        body: `Thanks for your payment.\n\nPlan: Pro (monthly)\nAmount: $19.00 USD\nDate: June 15, 2026\nNext billing: July 15, 2026\n\nReceipt #INV-2026-0615-PM`,
        labels: 'billing',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3),
      },
      {
        from: 'yuki@bridge.app',
        to: 'demo@bridge.app',
        subject: 'Re: Japanese UI localization QA',
        body: `Alex-san,\n\nI finished the QA pass on the Japanese UI. Two minor issues:\n1. The "Start Meeting" button overflows on tablet width.\n2. The date picker shows English month abbreviations.\n\nOtherwise, all 120 strings look natural. Great work by the team.\n\nRegards,\nYuki`,
        labels: 'work',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 5),
      },
      {
        from: 'support@livekit.io',
        to: 'demo@bridge.app',
        subject: 'Your LiveKit Cloud usage this week',
        body: `Hi Alex,\n\nHere's your weekly summary:\n- Total track minutes: 12,840\n- Peak concurrent participants: 87\n- Recording storage: 4.2 GB\n- Average RTT: 142ms\n\nEverything looks healthy. Upgrade your plan before August to avoid overages.\n\n— LiveKit Team`,
        labels: '',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 8),
      },
      {
        from: 'klaus@bridge.app',
        to: 'demo@bridge.app',
        subject: 'GDPR compliance checklist for transcript storage',
        body: `Alex,\n\nPer our legal review, we need the following:\n1. Explicit consent capture before recording.\n2. Auto-deletion of transcripts after 90 days unless flagged.\n3. Per-region storage buckets (EU users → EU bucket).\n4. Audit log of every API token call that reads transcripts.\n\nI can draft the spec by Friday.\n\nKlaus`,
        labels: 'work,important',
        starred: true,
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 12),
      },
      {
        from: 'priya@bridge.app',
        to: 'demo@bridge.app',
        subject: 'New API customer — onboarding needed',
        body: `Hi Alex,\n\nAcme Co. signed up for Enterprise tier this morning. They need:\n- 50 API tokens provisioned\n- Custom rate limits (100 req/min)\n- Dedicated WebRTC region (ap-south-1)\n\nCan we get them onboarded by EOW?\n\nPriya`,
        labels: 'work,important',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 26),
      },
      {
        from: 'newsletter@productweekly.com',
        to: 'demo@bridge.app',
        subject: 'This week in product: AI-native tools, async standups, more',
        body: `Top stories this week:\n\n1. Why every SaaS is rebuilding around real-time AI\n2. The death of the standup meeting (and what replaces it)\n3. Five companies shipping AI-native translation features\n\nRead more at productweekly.com`,
        labels: '',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 36),
      },
      {
        from: 'liam@bridge.app',
        to: 'demo@bridge.app',
        subject: 'Bug: hand-raise notifications not showing in Safari',
        body: `Alex,\n\nUsers report the hand-raise toast doesn't appear on Safari 17. Likely a WebKit Permissions API quirk. I can take it tomorrow.\n\nLiam`,
        labels: 'work',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 48),
      },
      {
        from: 'noreply@github.com',
        to: 'demo@bridge.app',
        subject: '[bridge] PR #482 ready for review',
        body: `Pull request #482 by @yuki:\n\n"feat(translator): add Whisper-fallback when Realtime API is overloaded"\n\nChanges: 14 files, +612 -89\n\nReviewers requested: @alex, @maria`,
        labels: '',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 50),
      },
    ]
    for (const e of emailSamples) {
      const threadId = `thread-${Math.random().toString(36).slice(2, 10)}`
      const snippet = e.body.slice(0, 120).replace(/\n/g, ' ')
      await db.email.create({
        data: {
          ownerId: demoUser.id,
          threadId,
          fromAddr: e.from,
          toAddr: e.to,
          subject: e.subject,
          bodyPlain: e.body,
          snippet,
          isRead: Math.random() > 0.4,
          isStarred: e.starred ?? false,
          isSent: false,
          folder: 'inbox',
          labelsCsv: e.labels,
          receivedAt: e.sentAt,
          sentAt: e.sentAt,
        },
      })
    }
    // A couple of sent emails
    await db.email.create({
      data: {
        ownerId: demoUser.id,
        threadId: `thread-sent-1`,
        fromAddr: 'demo@bridge.app',
        toAddr: 'maria@bridge.app',
        subject: 'Re: Translation quality review — Spanish',
        bodyPlain: `Maria,\n\nGreat feedback. Let's keep "Quarterly All-Hands" untranslated as you suggest.\n\nWill review latency dashboards tomorrow.\n\nThanks,\nAlex`,
        snippet: 'Maria, Great feedback. Let\'s keep "Quarterly All-Hands" untranslated as you suggest.',
        isRead: true,
        isSent: true,
        folder: 'sent',
        labelsCsv: 'work',
        sentAt: new Date(now.getTime() - 1000 * 60 * 60 * 2),
        receivedAt: new Date(now.getTime() - 1000 * 60 * 60 * 2),
      },
    })

    // 8. Invoices
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 15)
      await db.invoice.create({
        data: {
          userId: demoUser.id,
          planId: proPlan.id,
          amount: 1900,
          currency: 'usd',
          status: 'paid',
          number: `INV-2026-${String(6 - i).padStart(2, '0')}-PM`,
          issuedAt: d,
          periodStart: d,
          periodEnd: new Date(d.getFullYear(), d.getMonth() + 1, 15),
        },
      })
    }

    // 9. API tokens for demo user
    await db.apiToken.create({
      data: {
        userId: demoUser.id,
        name: 'Production Web App',
        tokenPrefix: 'pm_live_8f2a',
        keyHash: 'mock_hash_1',
        scopesCsv: 'meetings:read,meetings:write,transcript:read',
        quotaMinutes: 1000,
        usedMinutes: 342,
        lastUsedAt: new Date(now.getTime() - 1000 * 60 * 30),
      },
    })
    await db.apiToken.create({
      data: {
        userId: demoUser.id,
        name: 'Mobile iOS App',
        tokenPrefix: 'pm_live_2c9d',
        keyHash: 'mock_hash_2',
        scopesCsv: 'meetings:read,transcript:read',
        quotaMinutes: 500,
        usedMinutes: 89,
        lastUsedAt: new Date(now.getTime() - 1000 * 60 * 60 * 6),
      },
    })

    // 10. Activity logs
    const actions = [
      ['user.signup', demoUser.id],
      ['meeting.created', demoUser.id],
      ['meeting.started', demoUser.id],
      ['meeting.ended', demoUser.id],
      ['email.sent', demoUser.id],
      ['api_token.created', demoUser.id],
      ['subscription.upgraded', demoUser.id],
      ['admin.login', adminUser.id],
      ['admin.user_blocked', adminUser.id],
      ['meeting.translated', demoUser.id],
    ]
    for (const [action, userId] of actions) {
      await db.activityLog.create({
        data: {
          action,
          userId,
          ipAddress: '127.0.0.1',
          metaJson: '{}',
          createdAt: new Date(now.getTime() - Math.random() * 1000 * 60 * 60 * 48),
        },
      })
    }

    return NextResponse.json({ ok: true, message: 'Seed complete' })
  } catch (e: any) {
    console.error('Seed error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
