'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Head from 'next/head';

// ── K Symbol (matches KevaOSLogo component) ─────────────────────
function KMark({ size = 32, color = '#D4622B' }: { size?: number; color?: string }) {
  const h = Math.round(size * 58 / 52);
  return (
    <svg viewBox="0 0 52 58" width={size} height={h} aria-hidden="true" style={{ display: 'block' }}>
      <rect x="0" y="0" width="12" height="58" rx="2" fill={color} />
      <polygon points="12,18 52,0 52,12 12,30" fill={color} />
      <polygon points="12,34 52,46 52,58 12,40" fill={color} />
    </svg>
  );
}

// ── Proof Strip Steps ────────────────────────────────────────────
const PROOF_STEPS = ['Catch the leak.', 'Assign the owner.', 'Enforce the close.'];

// ── Feature Cards (3 cards: Find / Route / Close) ───────────────
const FEATURES = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
    ),
    title: 'Find it.',
    desc: 'Margin leaks, labor drift, comp abuse, broken standards \u2014 surfaced automatically, not discovered in a Monday debrief.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: 'Route it.',
    desc: 'Every exception goes to the person responsible. No all-hands emails. No guessing who owns it.',
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    title: 'Close it.',
    desc: 'Open issues stay active until resolved. Nothing disappears into a report.',
  },
];

// ── Contact Form ─────────────────────────────────────────────────
function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed');
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-5 text-xl" style={{ background: '#FDF5EF', color: '#D4622B' }}>
          ✓
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: '#1C1917' }}>Request received.</h3>
        <p className="text-sm" style={{ color: '#8B7E6F' }}>
          We&apos;ll be in touch within 48 hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.65rem] font-semibold tracking-[0.12em] uppercase" style={{ color: '#8B7E6F' }} htmlFor="name">Full Name</label>
          <input type="text" id="name" name="name" className="text-sm rounded-md px-3.5 py-2.5 outline-none transition-colors" style={{ color: '#1C1917', background: '#FAF8F5', border: '1px solid #E8E2DA' }} placeholder="Jane Smith" required onFocus={e => e.target.style.borderColor = '#D4622B'} onBlur={e => e.target.style.borderColor = '#E8E2DA'} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.65rem] font-semibold tracking-[0.12em] uppercase" style={{ color: '#8B7E6F' }} htmlFor="email">Email</label>
          <input type="email" id="email" name="email" className="text-sm rounded-md px-3.5 py-2.5 outline-none transition-colors" style={{ color: '#1C1917', background: '#FAF8F5', border: '1px solid #E8E2DA' }} placeholder="jane@example.com" required onFocus={e => e.target.style.borderColor = '#D4622B'} onBlur={e => e.target.style.borderColor = '#E8E2DA'} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.65rem] font-semibold tracking-[0.12em] uppercase" style={{ color: '#8B7E6F' }} htmlFor="company">Company / Group</label>
          <input type="text" id="company" name="company" className="text-sm rounded-md px-3.5 py-2.5 outline-none transition-colors" style={{ color: '#1C1917', background: '#FAF8F5', border: '1px solid #E8E2DA' }} placeholder="Restaurant Group Name" required onFocus={e => e.target.style.borderColor = '#D4622B'} onBlur={e => e.target.style.borderColor = '#E8E2DA'} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[0.65rem] font-semibold tracking-[0.12em] uppercase" style={{ color: '#8B7E6F' }} htmlFor="venues">Venues</label>
          <select id="venues" name="venues" className="text-sm rounded-md px-3.5 py-2.5 outline-none transition-colors cursor-pointer" style={{ color: '#1C1917', background: '#FAF8F5', border: '1px solid #E8E2DA' }} required defaultValue="" onFocus={e => e.target.style.borderColor = '#D4622B'} onBlur={e => e.target.style.borderColor = '#E8E2DA'}>
            <option value="" disabled>Select</option>
            <option value="1-3">1 &ndash; 3</option>
            <option value="4-10">4 &ndash; 10</option>
            <option value="11-25">11 &ndash; 25</option>
            <option value="25+">25+</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 mb-5">
        <label className="text-[0.65rem] font-semibold tracking-[0.12em] uppercase" style={{ color: '#8B7E6F' }} htmlFor="message">
          Anything else? <span className="opacity-50">(Optional)</span>
        </label>
        <textarea
          id="message"
          name="message"
          className="text-sm rounded-md px-3.5 py-2.5 outline-none transition-colors"
          style={{ color: '#1C1917', background: '#FAF8F5', border: '1px solid #E8E2DA', minHeight: 80, resize: 'vertical' }}
          placeholder="What problems are you trying to solve?"
          onFocus={e => e.target.style.borderColor = '#D4622B'}
          onBlur={e => e.target.style.borderColor = '#E8E2DA'}
        />
      </div>
      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full text-[0.75rem] font-bold tracking-[0.08em] uppercase text-white py-3.5 px-8 rounded-md transition-all duration-200 hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
        style={{ background: '#D4622B' }}
      >
        {status === 'sending' ? 'Sending...' : 'Request Access'}
      </button>
      {status === 'error' && (
        <p className="text-center text-sm mt-3" style={{ color: '#DC2626' }}>
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}

// ── Reveal Animation Hook ────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

// ── Main Page ────────────────────────────────────────────────────
export default function MarketingPage() {
  const proofReveal = useReveal();
  const featuresReveal = useReveal();
  const formReveal = useReveal();

  return (
    <>
      <Head>
        <title>KevaOS &mdash; The AI-Enforced Control Plane for Hospitality</title>
        <meta name="description" content="KevaOS is the operating system for multi-unit restaurant groups. Enforce standards, catch margin leaks, and hold every venue accountable — automatically." />
      </Head>

      <div style={{ background: '#FFFEFB' }}>
        {/* ── Top Bar ─────────────────────────────────────────────── */}
        <nav
          className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 sm:px-12 py-4"
          style={{
            background: 'rgba(28,25,23,0.97)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-2">
            <KMark size={14} color="#D4622B" />
            <span className="text-lg tracking-[0.02em]" style={{ color: '#F5F1EB', fontWeight: 600 }}>
              Keva<span style={{ color: 'rgba(245,241,235,0.55)', fontWeight: 400, letterSpacing: '0.04em' }}>OS</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="hidden sm:inline-block text-[0.65rem] font-medium tracking-[0.08em] uppercase transition-colors"
              style={{ color: 'rgba(245,241,235,0.5)' }}
            >
              Beta Login
            </Link>
            <a
              href="#request"
              className="text-[0.65rem] font-semibold tracking-[0.08em] uppercase px-4 py-2 rounded-md transition-all duration-200"
              style={{
                color: '#D4622B',
                border: '1px solid rgba(212,98,43,0.4)',
              }}
            >
              Request Access
            </a>
          </div>
        </nav>

        {/* ── Hero (Dark Espresso) ──────────────────────────────────── */}
        <section
          className="relative flex flex-col justify-center items-center text-center min-h-screen px-6 pt-32 pb-20"
          style={{ background: '#1C1917' }}
        >
          {/* Warm radial glow */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[55%] w-[800px] h-[800px] pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(212,98,43,0.08) 0%, transparent 60%)' }}
          />

          {/* Badge */}
          <div
            className="relative inline-flex items-center gap-2.5 text-[0.6rem] font-semibold tracking-[0.2em] uppercase mb-10 rounded-full animate-[hero-in_0.65s_ease_0.1s_forwards] opacity-0"
            style={{ color: '#D4622B', border: '1px solid rgba(212,98,43,0.3)', padding: '0.5rem 1.2rem', background: 'rgba(212,98,43,0.08)' }}
          >
            <span className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: '#D4622B' }} />
            Now onboarding select multi-unit operators
          </div>

          {/* Title with K mark */}
          <div className="relative flex flex-col items-center gap-2 mb-7 animate-[hero-in_0.65s_ease_0.2s_forwards] opacity-0">
            <KMark size={44} color="#D4622B" />
            <h1 className="text-[clamp(3rem,8vw,5.5rem)] tracking-[0.02em] leading-none" style={{ color: '#F5F1EB', fontWeight: 600 }}>
              Nothing slips.
            </h1>
          </div>

          {/* Subhead */}
          <p
            className="relative text-[clamp(1rem,1.4vw,1.2rem)] max-w-[38rem] mb-12 leading-relaxed animate-[hero-in_0.65s_ease_0.35s_forwards] opacity-0"
            style={{ color: '#B5ADA1' }}
          >
            KevaOS is the control plane for restaurant groups &mdash; catching what your managers miss and enforcing the fix across every location, every night.
          </p>

          {/* CTA */}
          <a
            href="#request"
            className="relative inline-flex items-center gap-2.5 text-[0.75rem] font-bold tracking-[0.1em] uppercase transition-all duration-200 hover:-translate-y-px group animate-[hero-in_0.65s_ease_0.5s_forwards] opacity-0 rounded-md"
            style={{ color: '#FFFEFB', background: '#D4622B', padding: '1rem 2.5rem' }}
          >
            Request Access
            <span className="transition-transform duration-200 group-hover:translate-x-1">&rarr;</span>
          </a>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 animate-[scroll-float_2.5s_ease-in-out_infinite]" style={{ color: 'rgba(245,241,235,0.15)' }}>
            <span className="text-[0.5rem] tracking-[0.2em] uppercase">Scroll</span>
            <div className="w-px h-5" style={{ background: 'linear-gradient(to bottom, rgba(245,241,235,0.15), transparent)' }} />
          </div>

          {/* Bottom edge */}
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: '#D4622B' }} />
        </section>

        {/* ── Proof Strip ─────────────────────────────────────────── */}
        <section
          ref={proofReveal.ref}
          className={`py-16 transition-all duration-700 ${proofReveal.visible ? 'opacity-100' : 'opacity-0'}`}
          style={{ background: '#FAF8F5' }}
        >
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0 px-6">
            {PROOF_STEPS.map((step, i) => (
              <div key={step} className="flex items-center">
                {i > 0 && (
                  <span className="hidden sm:inline px-4 text-lg" style={{ color: '#E8E2DA' }}>
                    &rarr;
                  </span>
                )}
                <span
                  className="text-[0.8rem] font-semibold tracking-[0.06em]"
                  style={{
                    color: '#1C1917',
                    opacity: proofReveal.visible ? 1 : 0,
                    transform: proofReveal.visible ? 'none' : 'translateY(8px)',
                    transition: `all 0.5s ease ${i * 150}ms`,
                  }}
                >
                  {step}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ────────────────────────────────────────────── */}
        <section
          ref={featuresReveal.ref}
          className={`max-w-5xl mx-auto px-6 py-24 transition-all duration-700 ${featuresReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="text-center mb-14">
            <h2 className="text-[clamp(1.5rem,3vw,2.2rem)] font-bold tracking-tight mb-3" style={{ color: '#1C1917' }}>
              Not another dashboard.
            </h2>
            <p className="text-[clamp(1rem,1.6vw,1.15rem)]" style={{ color: '#8B7E6F' }}>
              Software that makes the operation hold its shape.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="p-7 rounded-lg transition-all duration-500"
                style={{
                  background: '#FFFEFB',
                  border: '1px solid #E8E2DA',
                  boxShadow: '0 1px 3px rgba(28,25,23,0.04)',
                  transitionDelay: `${i * 100}ms`,
                  opacity: featuresReveal.visible ? 1 : 0,
                  transform: featuresReveal.visible ? 'none' : 'translateY(12px)',
                }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-5" style={{ background: '#FDF5EF', color: '#D4622B' }}>
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-2" style={{ color: '#1C1917' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#8B7E6F' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Divider ─────────────────────────────────────────────── */}
        <hr className="border-none h-px max-w-[640px] mx-auto" style={{ background: '#E8E2DA' }} />

        {/* ── Contact / Request ───────────────────────────────────── */}
        <section
          ref={formReveal.ref}
          id="request"
          className={`max-w-[560px] mx-auto px-6 py-24 transition-all duration-700 ${formReveal.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <div className="text-center mb-10">
            <p className="text-[clamp(1rem,1.6vw,1.15rem)] leading-relaxed" style={{ color: '#8B7E6F' }}>
              For operators who want tighter control without adding more meetings, more reports, or more noise.
            </p>
          </div>

          <div className="rounded-lg p-8" style={{ background: '#FFFEFB', border: '1px solid #E8E2DA', boxShadow: '0 4px 12px rgba(28,25,23,0.06)' }}>
            <ContactForm />
          </div>
        </section>

        {/* ── Footer (Dark) ─────────────────────────────────────────── */}
        <footer className="py-10 px-6 text-center" style={{ background: '#1C1917', borderTop: '1px solid #D4622B' }}>
          <div className="flex items-center justify-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <KMark size={12} color="#D4622B" />
              <span className="text-[0.6rem] tracking-[0.2em] uppercase" style={{ color: '#8B7E6F' }}>
                KevaOS &copy; {new Date().getFullYear()}
              </span>
            </div>
            <Link
              href="/login"
              className="text-[0.6rem] tracking-[0.15em] uppercase transition-colors"
              style={{ color: '#D4622B' }}
            >
              Beta Login &rarr;
            </Link>
          </div>
          <p className="text-[0.55rem] tracking-[0.15em]" style={{ color: '#44403C' }}>
            The Binyan Group
          </p>
        </footer>

        {/* ── Keyframes ───────────────────────────────────────────── */}
        <style>{`
          @keyframes hero-in {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: none; }
          }
          @keyframes scroll-float {
            0%, 100% { transform: translateX(-50%) translateY(0); }
            50% { transform: translateX(-50%) translateY(5px); }
          }
        `}</style>
      </div>
    </>
  );
}
