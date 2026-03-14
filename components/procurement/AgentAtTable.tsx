'use client';

/**
 * Animated SVG: Procurement AI agent sitting at a restaurant booth, working.
 * Themed for procurement: clipboard with PO, shipping boxes, phone,
 * vendor invoices, calculator. Same booth/table environment as rez agent.
 * Subtle animations: thinking pulse, data particles, screen glow,
 * coffee steam, pen tapping, box scanning.
 */

export function AgentAtTable({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox="0 0 400 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Screen glow */}
          <radialGradient id="procScreenGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(150, 60%, 50%)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(150, 60%, 50%)" stopOpacity="0" />
          </radialGradient>

          {/* Table surface gradient */}
          <linearGradient id="procTableGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(30, 30%, 25%)" />
            <stop offset="100%" stopColor="hsl(30, 30%, 18%)" />
          </linearGradient>

          {/* Ambient light */}
          <radialGradient id="procAmbient" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="hsl(40, 60%, 70%)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Coffee color */}
          <linearGradient id="coffeeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(25, 60%, 25%)" />
            <stop offset="100%" stopColor="hsl(25, 60%, 18%)" />
          </linearGradient>

          {/* Box gradient */}
          <linearGradient id="boxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(30, 50%, 55%)" />
            <stop offset="100%" stopColor="hsl(30, 50%, 40%)" />
          </linearGradient>

          {/* Data particle glow */}
          <filter id="procGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <rect width="400" height="300" fill="hsl(var(--background))" />
        <ellipse cx="200" cy="120" rx="180" ry="120" fill="url(#procAmbient)" />

        {/* ── Table ── */}
        <rect x="80" y="185" width="240" height="12" rx="3" fill="url(#procTableGrad)" />
        <rect x="100" y="197" width="8" height="80" rx="2" fill="hsl(30, 30%, 20%)" />
        <rect x="292" y="197" width="8" height="80" rx="2" fill="hsl(30, 30%, 20%)" />
        <rect x="80" y="185" width="240" height="2" rx="1" fill="hsl(30, 30%, 35%)" opacity="0.6" />

        {/* ── Coffee mug ── */}
        <g transform="translate(280, 148)">
          {/* Mug body */}
          <rect x="0" y="10" width="18" height="22" rx="3" fill="hsl(var(--muted))" opacity="0.5" />
          {/* Handle */}
          <path d="M 18 15 Q 26 15 26 21 Q 26 27 18 27" stroke="hsl(var(--muted))" strokeWidth="2.5" fill="none" opacity="0.4" />
          {/* Coffee surface */}
          <ellipse cx="9" cy="12" rx="8" ry="2.5" fill="url(#coffeeGrad)" opacity="0.7" />
          {/* Steam wisps */}
          <path d="M 5 8 Q 3 2 6 -2" stroke="hsl(var(--muted-foreground))" strokeWidth="0.8" fill="none" opacity="0.15">
            <animate attributeName="opacity" values="0.1;0.25;0.1" dur="3s" repeatCount="indefinite" />
            <animate attributeName="d" values="M 5 8 Q 3 2 6 -2;M 5 8 Q 7 2 4 -3;M 5 8 Q 3 2 6 -2" dur="3s" repeatCount="indefinite" />
          </path>
          <path d="M 11 7 Q 13 1 10 -3" stroke="hsl(var(--muted-foreground))" strokeWidth="0.8" fill="none" opacity="0.12">
            <animate attributeName="opacity" values="0.08;0.2;0.08" dur="3.5s" begin="0.5s" repeatCount="indefinite" />
            <animate attributeName="d" values="M 11 7 Q 13 1 10 -3;M 11 7 Q 9 1 12 -4;M 11 7 Q 13 1 10 -3" dur="3.5s" begin="0.5s" repeatCount="indefinite" />
          </path>
        </g>

        {/* ── Shipping boxes (stacked, right side of table) ── */}
        <g transform="translate(310, 150)">
          {/* Bottom box */}
          <rect x="0" y="15" width="22" height="18" rx="1.5" fill="url(#boxGrad)" opacity="0.6" />
          <line x1="3" y1="24" x2="19" y2="24" stroke="hsl(30, 50%, 30%)" strokeWidth="0.5" opacity="0.5" />
          <line x1="11" y1="17" x2="11" y2="31" stroke="hsl(30, 50%, 30%)" strokeWidth="0.5" opacity="0.5" />
          {/* Top box (smaller, tilted) */}
          <rect x="3" y="2" width="16" height="13" rx="1.5" fill="url(#boxGrad)" opacity="0.5" transform="rotate(-5 11 8)">
            <animate attributeName="opacity" values="0.5;0.6;0.5" dur="5s" repeatCount="indefinite" />
          </rect>
          {/* Checkmark on top box */}
          <text x="7" y="12" fill="hsl(150, 60%, 50%)" fontSize="7" opacity="0.5">&#10003;</text>
        </g>

        {/* ── Laptop / screen ── */}
        <g transform="translate(160, 130)">
          {/* Screen back */}
          <rect x="0" y="0" width="65" height="45" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          {/* Screen */}
          <rect x="3" y="3" width="59" height="35" rx="1" fill="hsl(220, 20%, 12%)">
            <animate attributeName="fill-opacity" values="0.9;1;0.9" dur="2s" repeatCount="indefinite" />
          </rect>
          {/* Screen glow */}
          <ellipse cx="32" cy="20" rx="40" ry="30" fill="url(#procScreenGlow)">
            <animate attributeName="opacity" values="0.4;0.7;0.4" dur="3s" repeatCount="indefinite" />
          </ellipse>

          {/* PO spreadsheet lines on screen */}
          {/* Header row */}
          <rect x="7" y="7" width="50" height="2" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.6" />
          {/* Data rows — animated like data flowing */}
          <rect x="7" y="11" width="35" height="1.5" rx="0.5" fill="hsl(var(--primary))" opacity="0.5">
            <animate attributeName="width" values="35;40;30;35" dur="4s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="14.5" width="28" height="1.5" rx="0.5" fill="hsl(var(--primary))" opacity="0.4">
            <animate attributeName="width" values="28;20;32;28" dur="3.5s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="18" width="42" height="1.5" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.4">
            <animate attributeName="width" values="42;35;45;42" dur="4.2s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="21.5" width="20" height="1.5" rx="0.5" fill="hsl(40, 80%, 60%)" opacity="0.5">
            <animate attributeName="width" values="20;30;15;20" dur="3.8s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="25" width="38" height="1.5" rx="0.5" fill="hsl(var(--primary))" opacity="0.4">
            <animate attributeName="width" values="38;28;42;38" dur="3s" repeatCount="indefinite" />
          </rect>
          {/* Dollar amount column */}
          <rect x="44" y="11" width="12" height="1.5" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.4" />
          <rect x="44" y="14.5" width="10" height="1.5" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.3" />
          <rect x="44" y="18" width="12" height="1.5" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.4" />
          <rect x="44" y="21.5" width="8" height="1.5" rx="0.5" fill="hsl(40, 80%, 60%)" opacity="0.4">
            <animate attributeName="opacity" values="0.4;0.7;0.4" dur="2s" repeatCount="indefinite" />
          </rect>
          {/* Total bar at bottom */}
          <rect x="7" y="30" width="50" height="0.5" rx="0.25" fill="hsl(var(--muted-foreground))" opacity="0.3" />
          <rect x="37" y="32" width="19" height="2" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.6">
            <animate attributeName="opacity" values="0.5;0.8;0.5" dur="3s" repeatCount="indefinite" />
          </rect>

          {/* Keyboard base */}
          <rect x="-5" y="45" width="75" height="8" rx="2" fill="hsl(var(--muted))" opacity="0.5" />
        </g>

        {/* ── The Agent (procurement robot) ── */}
        <g transform="translate(170, 55)">
          {/* Body / torso — slightly different color than rez agent */}
          <rect x="10" y="55" width="40" height="50" rx="8" fill="hsl(var(--muted-foreground))" opacity="0.15" />
          {/* Vest/apron detail */}
          <path d="M 15 60 L 15 95 L 45 95 L 45 60 Z" fill="hsl(var(--foreground))" opacity="0.04" />
          {/* Pocket with pen */}
          <rect x="36" y="65" width="6" height="8" rx="1" fill="hsl(var(--muted-foreground))" opacity="0.1" />
          <line x1="39" y1="62" x2="39" y2="68" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.3" />

          {/* Head */}
          <rect x="14" y="15" width="32" height="38" rx="10" fill="hsl(var(--muted-foreground))" opacity="0.2" />

          {/* Face screen / visor — green tint for procurement */}
          <rect x="18" y="22" width="24" height="16" rx="5" fill="hsl(160, 20%, 12%)" opacity="0.8" />

          {/* Eyes — green for procurement */}
          <circle cx="25" cy="30" r="2.5" fill="hsl(150, 60%, 50%)" filter="url(#procGlow)">
            <animate attributeName="r" values="2.5;3;2.5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="37" cy="30" r="2.5" fill="hsl(150, 60%, 50%)" filter="url(#procGlow)">
            <animate attributeName="r" values="2.5;3;2.5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Scanning line — horizontal sweep */}
          <rect x="19" y="28" width="22" height="1" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.4">
            <animate attributeName="y" values="23;36;23" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.5s" repeatCount="indefinite" />
          </rect>

          {/* Antenna / sensor — with package icon */}
          <line x1="30" y1="15" x2="30" y2="6" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" opacity="0.3" />
          <rect x="26" y="1" width="8" height="6" rx="1.5" fill="hsl(150, 60%, 50%)" opacity="0.5">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="1.5s" repeatCount="indefinite" />
          </rect>

          {/* Left arm — holding clipboard */}
          <path d="M 10 70 Q -8 82 -5 100" stroke="hsl(var(--muted-foreground))" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.15" />
          <circle cx="-5" cy="100" r="4" fill="hsl(var(--muted-foreground))" opacity="0.15" />

          {/* Right arm — on keyboard */}
          <path d="M 50 70 Q 60 85 55 100" stroke="hsl(var(--muted-foreground))" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.15" />
          <circle cx="55" cy="100" r="4" fill="hsl(var(--muted-foreground))" opacity="0.15">
            <animate attributeName="cy" values="100;98;100" dur="0.4s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── Clipboard (held by left arm) ── */}
        <g transform="translate(92, 155)">
          {/* Board */}
          <rect x="0" y="0" width="28" height="34" rx="2" fill="hsl(30, 30%, 55%)" opacity="0.35" transform="rotate(-8 14 17)" />
          {/* Clip */}
          <rect x="8" y="-3" width="12" height="5" rx="1.5" fill="hsl(var(--muted-foreground))" opacity="0.3" transform="rotate(-8 14 0)" />
          {/* Paper */}
          <rect x="3" y="4" width="22" height="26" rx="1" fill="hsl(0, 0%, 93%)" opacity="0.4" transform="rotate(-8 14 17)" />
          {/* PO lines */}
          <rect x="6" y="8" width="14" height="1" rx="0.5" fill="hsl(var(--primary))" opacity="0.25" transform="rotate(-8 13 8)" />
          <rect x="6" y="11" width="16" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" transform="rotate(-8 14 11)" />
          <rect x="6" y="14" width="10" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" transform="rotate(-8 11 14)" />
          <rect x="6" y="17" width="14" height="1" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.2" transform="rotate(-8 13 17)" />
          <rect x="6" y="20" width="8" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" transform="rotate(-8 10 20)" />
          {/* Checkmarks */}
          <text x="21" y="12" fill="hsl(150, 60%, 50%)" fontSize="5" opacity="0.4" transform="rotate(-8 21 12)">&#10003;</text>
          <text x="21" y="18" fill="hsl(150, 60%, 50%)" fontSize="5" opacity="0.4" transform="rotate(-8 21 18)">&#10003;</text>
        </g>

        {/* ── Invoice / papers on table ── */}
        <g transform="translate(245, 163)">
          {/* Stack */}
          <rect x="2" y="4" width="25" height="18" rx="1" fill="hsl(0, 0%, 95%)" opacity="0.25" transform="rotate(3 14 13)" />
          <rect x="0" y="2" width="25" height="18" rx="1" fill="hsl(0, 0%, 92%)" opacity="0.35" />
          {/* "INVOICE" header */}
          <rect x="3" y="5" width="14" height="1.5" rx="0.5" fill="hsl(350, 60%, 50%)" opacity="0.3" />
          {/* Lines */}
          <rect x="3" y="9" width="19" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" />
          <rect x="3" y="12" width="15" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" />
          <rect x="3" y="15" width="19" height="1" rx="0.5" fill="hsl(var(--primary))" opacity="0.2" />
        </g>

        {/* ── Data particles — green themed, flowing between screen and boxes ── */}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            r="1.5"
            fill="hsl(150, 60%, 50%)"
            opacity="0.6"
            filter="url(#procGlow)"
          >
            <animate
              attributeName="cx"
              values={`${195 + i * 3};${220 + i * 5};${280};${195 + i * 3}`}
              dur={`${3 + i * 0.8}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="cy"
              values={`${170 - i * 4};${155 - i * 2};${160};${170 - i * 4}`}
              dur={`${3 + i * 0.8}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.5;0.7;0"
              dur={`${3 + i * 0.8}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* ── Floating procurement symbols ── */}
        {/* Dollar sign */}
        <text x="140" y="100" fill="hsl(150, 60%, 50%)" fontSize="10" fontFamily="monospace" opacity="0">
          $
          <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin="0.5s" repeatCount="indefinite" />
          <animate attributeName="y" values="110;90;110" dur="4s" begin="0.5s" repeatCount="indefinite" />
        </text>
        {/* PO number */}
        <text x="248" y="108" fill="hsl(var(--primary))" fontSize="7" fontFamily="monospace" opacity="0">
          PO-1247
          <animate attributeName="opacity" values="0;0.35;0" dur="5s" begin="1s" repeatCount="indefinite" />
          <animate attributeName="y" values="112;92;112" dur="5s" begin="1s" repeatCount="indefinite" />
        </text>
        {/* Checkmark — approved */}
        <text x="260" y="128" fill="hsl(150, 60%, 50%)" fontSize="10" opacity="0">
          &#10003;
          <animate attributeName="opacity" values="0;0.5;0" dur="3.5s" begin="2s" repeatCount="indefinite" />
          <animate attributeName="y" values="132;110;132" dur="3.5s" begin="2s" repeatCount="indefinite" />
        </text>
        {/* Savings */}
        <text x="130" y="118" fill="hsl(150, 60%, 50%)" fontSize="7" fontFamily="monospace" opacity="0">
          -12%
          <animate attributeName="opacity" values="0;0.4;0" dur="4.5s" begin="1.5s" repeatCount="indefinite" />
          <animate attributeName="y" values="122;100;122" dur="4.5s" begin="1.5s" repeatCount="indefinite" />
        </text>
        {/* Package icon text */}
        <text x="315" y="140" fill="hsl(30, 50%, 55%)" fontSize="8" fontFamily="monospace" opacity="0">
          &#9744;
          <animate attributeName="opacity" values="0;0.3;0" dur="4s" begin="2.5s" repeatCount="indefinite" />
          <animate attributeName="y" values="142;125;142" dur="4s" begin="2.5s" repeatCount="indefinite" />
        </text>

        {/* ── Calculator on table ── */}
        <g transform="translate(340, 170)">
          <rect x="0" y="0" width="16" height="20" rx="1.5" fill="hsl(var(--muted))" opacity="0.3" />
          <rect x="2" y="2" width="12" height="5" rx="0.5" fill="hsl(220, 20%, 12%)" opacity="0.5" />
          {/* Display number */}
          <text x="4" y="6" fill="hsl(150, 60%, 50%)" fontSize="3.5" fontFamily="monospace" opacity="0.5">
            2,847
            <animate attributeName="opacity" values="0.4;0.6;0.4" dur="3s" repeatCount="indefinite" />
          </text>
          {/* Buttons grid */}
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => (
              <rect
                key={`${row}-${col}`}
                x={2 + col * 4.5}
                y={9 + row * 3.5}
                width="3.5"
                height="2.5"
                rx="0.5"
                fill="hsl(var(--muted-foreground))"
                opacity="0.15"
              />
            ))
          )}
        </g>

        {/* ── Pen on table ── */}
        <line x1="235" y1="175" x2="250" y2="182" stroke="hsl(var(--foreground))" strokeWidth="1.5" opacity="0.2" strokeLinecap="round" />
        <circle cx="250" cy="182" r="1" fill="hsl(150, 60%, 50%)" opacity="0.3" />
      </svg>

      {/* Thinking dots overlay */}
      <div className="absolute top-[18%] left-[55%] flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.2s' }} />
      </div>
    </div>
  );
}
