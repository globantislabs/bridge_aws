'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Video,
  Globe,
  Shield,
  Sparkles,
  ArrowRight,
  Mic,
  Languages,
  Users,
  Check,
} from 'lucide-react'
import { AuthModal } from './auth-modal'

/**
 * Landing — Google Meet inspired, but richer.
 *
 * Sections:
 *   1. Sticky top bar (brand + Sign in / Get started)
 *   2. Hero — gradient backdrop, big headline, dual CTA, floating meeting mockup
 *   3. "Trusted by" mini-strip (languages + stats)
 *   4. Three feature cards
 *   5. "How it works" 3-step row
 *   6. Final CTA band
 *   7. Minimal footer
 */
export function Landing() {
  const [authOpen, setAuthOpen] = React.useState(false)
  const [mode, setMode] = React.useState<'login' | 'signup'>('login')

  function open(mode: 'login' | 'signup') {
    setMode(mode)
    setAuthOpen(true)
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* ─── Top bar ─── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-14 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[19px] font-semibold tracking-[-0.022em] leading-none">
              Bridge
            </span>
            <span className="text-[10px] text-muted-foreground/70 font-medium tracking-[0.14em] uppercase">
              Meet
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[13px]"
              onClick={() => open('login')}
            >
              Sign in
            </Button>
            <Button
              size="sm"
              className="h-8 text-[13px] rounded-full px-4"
              onClick={() => open('signup')}
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden">
        {/* Soft gradient backdrop */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 0%, oklch(0.55 0.18 264 / 0.10) 0%, transparent 70%), radial-gradient(40% 40% at 80% 20%, oklch(0.7 0.16 145 / 0.08) 0%, transparent 70%)',
          }}
        />
        {/* Subtle dot grid */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.4]"
          style={{
            backgroundImage:
              'radial-gradient(oklch(0.18 0.01 240 / 0.06) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pt-14 md:pt-20 pb-10">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
            {/* Left — copy */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 backdrop-blur px-3 py-1 text-[11px] font-medium text-foreground/80 mb-5">
                <span className="size-1.5 rounded-full bg-emerald-500 live-pulse" />
                <Sparkles className="size-3 text-primary" />
                Real-time AI translation, in 20+ languages
              </div>

              <h1 className="text-[42px] md:text-[56px] lg:text-[64px] font-semibold tracking-[-0.025em] leading-[1.02]">
                Meetings where{' '}
                <span className="relative inline-block">
                  <span className="text-primary">everyone</span>
                  <svg
                    className="absolute -bottom-1 left-0 w-full text-primary/30"
                    viewBox="0 0 200 8"
                    fill="none"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M2 6 Q 50 2, 100 5 T 198 4"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>{' '}
                speaks their own language.
              </h1>

              <p className="mt-5 text-[16px] md:text-[18px] text-muted-foreground max-w-xl leading-relaxed lg:mx-0 mx-auto">
                Start an instant meeting, share a code, and speak naturally.
                Bridge translates every voice in real time so you can focus on
                the conversation — not the language barrier.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3 justify-center lg:justify-start">
                <Button
                  size="lg"
                  className="h-12 px-6 rounded-full text-[15px] shadow-popover"
                  onClick={() => open('signup')}
                >
                  <Video className="size-4 mr-2" />
                  Start a meeting
                  <ArrowRight className="size-4 ml-2" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-5 rounded-full text-[15px] bg-card/60 backdrop-blur"
                  onClick={() => open('login')}
                >
                  I have an account
                </Button>
              </div>

              <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground justify-center lg:justify-start">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-500" />
                  No credit card
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-500" />
                  Works in any browser
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="size-3.5 text-emerald-500" />
                  Set up in 30 seconds
                </span>
              </div>
            </div>

            {/* Right — floating meeting mockup */}
            <div className="relative">
              <HeroMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats band ─── */}
      <section className="border-y border-border bg-card/30">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { stat: '20+', label: 'Languages' },
            { stat: '<800ms', label: 'Translation latency' },
            { stat: '1080p', label: 'HD video' },
            { stat: '99.9%', label: 'Uptime SLA' },
          ].map((s) => (
            <div key={s.label} className="text-center md:text-left">
              <div className="text-2xl md:text-3xl font-semibold tracking-tight tabular">
                {s.stat}
              </div>
              <div className="text-xs md:text-[13px] text-muted-foreground mt-0.5">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-2">
            Everything you need
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            One platform. Every language.
          </h2>
          <p className="mt-3 text-muted-foreground">
            From instant meetings to enterprise-grade admin controls, Bridge
            gives you the tools to communicate across languages without friction.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Video,
              title: 'Instant meetings',
              body: 'One click to start. Share a short code, anyone can join — no install, no account required. Up to 50 participants on Pro.',
              accent: 'from-blue-500/15 to-blue-500/5',
            },
            {
              icon: Languages,
              title: 'Real-time translation',
              body: 'Speak your language. Everyone reads and hears the conversation translated in real time, with captions powered by AI.',
              accent: 'from-emerald-500/15 to-emerald-500/5',
            },
            {
              icon: Shield,
              title: 'Admin controls',
              body: 'A serious admin panel for managing users, API providers, usage quotas, and billing — built for SaaS owners.',
              accent: 'from-violet-500/15 to-violet-500/5',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 hover:shadow-popover transition-all hover:-translate-y-0.5"
            >
              <div
                className={`size-12 rounded-xl grid place-items-center mb-5 bg-gradient-to-br ${f.accent}`}
              >
                <f.icon className="size-5 text-foreground" />
              </div>
              <h3 className="text-[17px] font-semibold mb-2">{f.title}</h3>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section className="bg-card/30 border-y border-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-16 md:py-20">
          <div className="text-center mb-12">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary mb-2">
              How it works
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Three steps to a multilingual meeting.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connecting line */}
            <div
              aria-hidden
              className="hidden md:block absolute top-7 left-[16%] right-[16%] h-px bg-border"
            />
            {[
              {
                step: '01',
                title: 'Start a meeting',
                body: 'Click "New meeting" on your home screen. An instant meeting opens in your browser — no download needed.',
                icon: Video,
              },
              {
                step: '02',
                title: 'Share the code',
                body: 'Send the short join code to your participants. They join from any browser, pick their language, and they’re in.',
                icon: Users,
              },
              {
                step: '03',
                title: 'Speak naturally',
                body: 'Talk in your own language. Bridge translates every voice and shows live captions in everyone’s chosen language.',
                icon: Mic,
              },
            ].map((s) => (
              <div key={s.step} className="relative text-center">
                <div className="relative inline-grid size-14 place-items-center rounded-full bg-background border border-border mx-auto mb-4">
                  <s.icon className="size-5 text-primary" />
                  <span className="absolute -top-1 -right-1 size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold grid place-items-center">
                    {s.step.slice(1)}
                  </span>
                </div>
                <h3 className="text-[16px] font-semibold mb-1.5">{s.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
        <div className="relative rounded-3xl overflow-hidden border border-border bg-gradient-to-br from-primary/10 via-accent/40 to-background p-10 md:p-16 text-center">
          <div
            aria-hidden
            className="absolute inset-0 opacity-50 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(oklch(0.18 0.01 240 / 0.05) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          <div className="relative">
            <Globe className="size-10 text-primary mx-auto mb-4" />
            <h2 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-2xl mx-auto leading-[1.05]">
              Ready to break the language barrier?
            </h2>
            <p className="mt-4 text-muted-foreground max-w-md mx-auto">
              Start your first multilingual meeting in under a minute. It’s free
              to try.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 justify-center">
              <Button
                size="lg"
                className="h-12 px-6 rounded-full text-[15px] shadow-popover"
                onClick={() => open('signup')}
              >
                <Video className="size-4 mr-2" />
                Get started free
                <ArrowRight className="size-4 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-5 rounded-full text-[15px] bg-card/60 backdrop-blur"
                onClick={() => open('login')}
              >
                Sign in
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[14px] font-semibold tracking-tight text-foreground">
              Bridge
            </span>
            <span className="text-[10px] uppercase tracking-wider">Meet</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-5">
            <button className="hover:text-foreground transition-colors">Privacy</button>
            <button className="hover:text-foreground transition-colors">Terms</button>
            <button className="hover:text-foreground transition-colors">Support</button>
            <button className="hover:text-foreground transition-colors">Status</button>
          </div>
        </div>
      </footer>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={mode} />
    </div>
  )
}

/**
 * Hero mockup — a stylized meeting window with 4 participant tiles + caption bar.
 * Pure CSS / SVG, no images.
 */
function HeroMockup() {
  return (
    <div className="relative">
      {/* Floating glow */}
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[2rem] blur-2xl opacity-50 pointer-events-none"
        style={{
          background:
            'radial-gradient(50% 50% at 50% 50%, oklch(0.55 0.18 264 / 0.25) 0%, transparent 70%)',
        }}
      />

      {/* Window chrome */}
      <div className="relative rounded-2xl border border-border bg-card shadow-float overflow-hidden">
        {/* Top bar */}
        <div className="h-9 border-b border-border bg-background/50 flex items-center px-3 gap-1.5">
          <div className="size-2.5 rounded-full bg-red-400/70" />
          <div className="size-2.5 rounded-full bg-amber-400/70" />
          <div className="size-2.5 rounded-full bg-emerald-400/70" />
          <div className="ml-3 text-[10px] text-muted-foreground font-medium">
            bridge.app/m/ WKPROD-7K2
          </div>
        </div>

        {/* Video grid */}
        <div className="p-3 bg-gradient-to-br from-background to-accent/30">
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: 'Maria', lang: 'ES', flag: '🇪🇸', color: 'from-emerald-500/25 to-emerald-500/5', speaking: true },
              { name: 'Yuki', lang: 'JP', flag: '🇯🇵', color: 'from-blue-500/25 to-blue-500/5', speaking: false },
              { name: 'Klaus', lang: 'DE', flag: '🇩🇪', color: 'from-amber-500/25 to-amber-500/5', speaking: false },
              { name: 'You', lang: 'EN', flag: '🇬🇧', color: 'from-primary/25 to-primary/5', speaking: false },
            ].map((p) => (
              <div
                key={p.name}
                className={`relative aspect-[4/3] rounded-xl bg-gradient-to-br ${p.color} border ${p.speaking ? 'border-emerald-500/60 ring-2 ring-emerald-500/30' : 'border-border/60'} grid place-items-center overflow-hidden`}
              >
                <div className="text-center">
                  <div className="size-9 rounded-full bg-background/70 grid place-items-center text-[12px] font-semibold mb-1">
                    {p.name[0]}
                  </div>
                  <div className="text-[10px] font-medium">{p.name}</div>
                </div>
                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[9px] font-medium bg-background/85 backdrop-blur px-1.5 py-0.5 rounded">
                  <span>{p.flag}</span>
                  <span>{p.lang}</span>
                </div>
                {p.speaking && (
                  <div className="absolute bottom-1.5 right-1.5 flex items-end gap-0.5 h-3">
                    {[3, 5, 4, 6, 3].map((h, i) => (
                      <span
                        key={i}
                        className="w-0.5 bg-emerald-500 rounded-full live-pulse"
                        style={{
                          height: `${h * 2}px`,
                          animationDelay: `${i * 100}ms`,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Caption bar */}
          <div className="mt-2 rounded-xl border border-border bg-background/70 backdrop-blur p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500 live-pulse" />
              Live caption · translating
            </div>
            <div className="text-[12px] leading-snug">
              <span className="text-muted-foreground">Maria: </span>
              <span>Hola, ¿cómo están todos hoy?</span>
            </div>
            <div className="text-[12px] leading-snug mt-1 text-primary font-medium">
              → Hi, how is everyone doing today?
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className="border-t border-border bg-background/50 px-3 py-2 flex items-center justify-center gap-1.5">
          {[
            { icon: Mic, active: true },
            { icon: Video, active: true },
            { icon: Users, active: false },
            { icon: Languages, active: true, primary: true },
            { icon: Shield, active: false },
          ].map((c, i) => (
            <div
              key={i}
              className={`size-7 rounded-lg grid place-items-center ${
                c.primary
                  ? 'bg-primary text-primary-foreground'
                  : c.active
                  ? 'bg-card border border-border text-foreground'
                  : 'bg-muted/60 text-muted-foreground'
              }`}
            >
              <c.icon className="size-3.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Floating badge: latency */}
      <div className="absolute -left-4 top-1/3 hidden md:block rounded-xl border border-border bg-card shadow-popover p-2.5">
        <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          Latency
        </div>
        <div className="text-[15px] font-semibold tabular text-foreground">
          740ms
        </div>
        <div className="text-[9px] text-emerald-600 font-medium">↓ 22% faster</div>
      </div>

      {/* Floating badge: languages */}
      <div className="absolute -right-3 bottom-1/4 hidden md:block rounded-xl border border-border bg-card shadow-popover p-2.5">
        <div className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          Languages
        </div>
        <div className="text-[15px] font-semibold tabular text-foreground">
          20+
        </div>
        <div className="text-[9px] text-muted-foreground">Real-time</div>
      </div>
    </div>
  )
}
