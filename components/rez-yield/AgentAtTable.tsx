'use client';

/**
 * Animated SVG: AI agent sitting at a restaurant table, working.
 * Subtle animations: thinking pulse, data particles flowing,
 * screen glow, wine glass shimmer, pen tapping.
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
          <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>

          {/* Table surface gradient */}
          <linearGradient id="tableGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(30, 30%, 25%)" />
            <stop offset="100%" stopColor="hsl(30, 30%, 18%)" />
          </linearGradient>

          {/* Ambient light */}
          <radialGradient id="ambientLight" cx="50%" cy="30%" r="60%">
            <stop offset="0%" stopColor="hsl(40, 60%, 70%)" stopOpacity="0.08" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>

          {/* Wine color */}
          <linearGradient id="wineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(350, 60%, 35%)" />
            <stop offset="100%" stopColor="hsl(350, 60%, 25%)" />
          </linearGradient>

          {/* Data particle */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background ambient light */}
        <rect width="400" height="300" fill="hsl(var(--background))" />
        <ellipse cx="200" cy="120" rx="180" ry="120" fill="url(#ambientLight)" />

        {/* ── Table ── */}
        <rect x="80" y="185" width="240" height="12" rx="3" fill="url(#tableGrad)" />
        {/* Table legs */}
        <rect x="100" y="197" width="8" height="80" rx="2" fill="hsl(30, 30%, 20%)" />
        <rect x="292" y="197" width="8" height="80" rx="2" fill="hsl(30, 30%, 20%)" />
        {/* Table edge highlight */}
        <rect x="80" y="185" width="240" height="2" rx="1" fill="hsl(30, 30%, 35%)" opacity="0.6" />

        {/* ── Tablecloth napkin ── */}
        <rect x="270" y="170" width="30" height="15" rx="2" fill="hsl(var(--muted))" opacity="0.5">
          <animate attributeName="opacity" values="0.5;0.6;0.5" dur="4s" repeatCount="indefinite" />
        </rect>

        {/* ── Wine glass ── */}
        <g transform="translate(290, 140)">
          {/* Stem */}
          <rect x="8" y="25" width="2" height="20" fill="hsl(0, 0%, 75%)" opacity="0.7" />
          {/* Base */}
          <ellipse cx="9" cy="45" rx="8" ry="2" fill="hsl(0, 0%, 70%)" opacity="0.6" />
          {/* Bowl */}
          <path d="M 0 10 Q 0 25 9 25 Q 18 25 18 10 Q 18 0 9 0 Q 0 0 0 10 Z" fill="hsl(0, 0%, 80%)" opacity="0.25" />
          {/* Wine */}
          <path d="M 2 14 Q 2 24 9 24 Q 16 24 16 14 Q 14 8 9 8 Q 4 8 2 14 Z" fill="url(#wineGrad)" opacity="0.7">
            <animate attributeName="opacity" values="0.7;0.8;0.7" dur="3s" repeatCount="indefinite" />
          </path>
          {/* Glass shimmer */}
          <line x1="3" y1="5" x2="5" y2="18" stroke="white" strokeWidth="0.5" opacity="0.3">
            <animate attributeName="opacity" values="0.2;0.4;0.2" dur="5s" repeatCount="indefinite" />
          </line>
        </g>

        {/* ── Small plate ── */}
        <ellipse cx="120" cy="178" rx="20" ry="5" fill="hsl(0, 0%, 90%)" opacity="0.3" />
        <ellipse cx="120" cy="177" rx="16" ry="4" fill="hsl(0, 0%, 85%)" opacity="0.2" />

        {/* ── Laptop / screen ── */}
        <g transform="translate(160, 130)">
          {/* Screen back */}
          <rect x="0" y="0" width="65" height="45" rx="3" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          {/* Screen */}
          <rect x="3" y="3" width="59" height="35" rx="1" fill="hsl(220, 20%, 12%)">
            <animate attributeName="fill-opacity" values="0.9;1;0.9" dur="2s" repeatCount="indefinite" />
          </rect>
          {/* Screen glow effect */}
          <ellipse cx="32" cy="20" rx="40" ry="30" fill="url(#screenGlow)">
            <animate attributeName="opacity" values="0.4;0.7;0.4" dur="3s" repeatCount="indefinite" />
          </ellipse>

          {/* Code/data lines on screen */}
          <rect x="7" y="8" width="20" height="1.5" rx="0.5" fill="hsl(var(--primary))" opacity="0.7">
            <animate attributeName="width" values="20;25;15;20" dur="4s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="12" width="30" height="1.5" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.5">
            <animate attributeName="width" values="30;20;35;30" dur="3.5s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="16" width="15" height="1.5" rx="0.5" fill="hsl(40, 80%, 60%)" opacity="0.5">
            <animate attributeName="width" values="15;25;10;15" dur="5s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="20" width="25" height="1.5" rx="0.5" fill="hsl(var(--primary))" opacity="0.4">
            <animate attributeName="width" values="25;18;28;25" dur="3s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="24" width="18" height="1.5" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.3">
            <animate attributeName="width" values="18;30;12;18" dur="4.5s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="28" width="35" height="1.5" rx="0.5" fill="hsl(350, 60%, 50%)" opacity="0.4">
            <animate attributeName="width" values="35;15;40;35" dur="3.8s" repeatCount="indefinite" />
          </rect>
          <rect x="7" y="32" width="22" height="1.5" rx="0.5" fill="hsl(var(--primary))" opacity="0.5">
            <animate attributeName="width" values="22;28;18;22" dur="4.2s" repeatCount="indefinite" />
          </rect>

          {/* Keyboard base */}
          <rect x="-5" y="45" width="75" height="8" rx="2" fill="hsl(var(--muted))" opacity="0.5" />
        </g>

        {/* ── The Agent (robot/AI figure) ── */}
        <g transform="translate(170, 55)">
          {/* Body / torso */}
          <rect x="10" y="55" width="40" height="50" rx="8" fill="hsl(var(--muted-foreground))" opacity="0.15" />
          {/* Suit jacket lapels */}
          <path d="M 20 55 L 30 75 L 10 75 Z" fill="hsl(var(--foreground))" opacity="0.08" />
          <path d="M 40 55 L 30 75 L 50 75 Z" fill="hsl(var(--foreground))" opacity="0.08" />
          {/* Tie */}
          <rect x="28" y="58" width="4" height="20" rx="1" fill="hsl(var(--primary))" opacity="0.4" />

          {/* Head */}
          <rect x="14" y="15" width="32" height="38" rx="10" fill="hsl(var(--muted-foreground))" opacity="0.2" />

          {/* Face screen / visor */}
          <rect x="18" y="22" width="24" height="16" rx="5" fill="hsl(220, 20%, 12%)" opacity="0.8" />

          {/* Eyes — two glowing dots */}
          <circle cx="25" cy="30" r="2.5" fill="hsl(var(--primary))" filter="url(#glow)">
            <animate attributeName="r" values="2.5;3;2.5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle cx="37" cy="30" r="2.5" fill="hsl(var(--primary))" filter="url(#glow)">
            <animate attributeName="r" values="2.5;3;2.5" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
          </circle>

          {/* Thinking indicator — scanning line across visor */}
          <rect x="19" y="28" width="22" height="1" rx="0.5" fill="hsl(var(--primary))" opacity="0.4">
            <animate attributeName="y" values="23;36;23" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2.5s" repeatCount="indefinite" />
          </rect>

          {/* Antenna / sensor */}
          <line x1="30" y1="15" x2="30" y2="6" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" opacity="0.3" />
          <circle cx="30" cy="5" r="2" fill="hsl(var(--primary))" opacity="0.6">
            <animate attributeName="opacity" values="0.3;0.8;0.3" dur="1.5s" repeatCount="indefinite" />
          </circle>

          {/* Left arm — resting on table */}
          <path d="M 10 70 Q -5 85 5 100" stroke="hsl(var(--muted-foreground))" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.15" />
          {/* Left hand */}
          <circle cx="5" cy="100" r="4" fill="hsl(var(--muted-foreground))" opacity="0.15" />

          {/* Right arm — on keyboard */}
          <path d="M 50 70 Q 60 85 55 100" stroke="hsl(var(--muted-foreground))" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.15" />
          {/* Right hand — typing animation */}
          <circle cx="55" cy="100" r="4" fill="hsl(var(--muted-foreground))" opacity="0.15">
            <animate attributeName="cy" values="100;98;100" dur="0.4s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* ── Data particles floating from screen to agent ── */}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={i}
            r="1.5"
            fill="hsl(var(--primary))"
            opacity="0.6"
            filter="url(#glow)"
          >
            <animate
              attributeName="cx"
              values="195;190;185;192"
              dur={`${2.5 + i * 0.7}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="cy"
              values={`${170 - i * 6};${140 - i * 4};${120 - i * 3};${170 - i * 6}`}
              dur={`${2.5 + i * 0.7}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.6;0.8;0"
              dur={`${2.5 + i * 0.7}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

        {/* ── Floating analysis symbols ── */}
        {/* Dollar sign */}
        <text x="140" y="100" fill="hsl(var(--primary))" fontSize="10" fontFamily="monospace" opacity="0">
          $
          <animate attributeName="opacity" values="0;0.4;0" dur="4s" begin="0.5s" repeatCount="indefinite" />
          <animate attributeName="y" values="110;90;110" dur="4s" begin="0.5s" repeatCount="indefinite" />
        </text>
        {/* Chart icon */}
        <text x="250" y="110" fill="hsl(150, 60%, 50%)" fontSize="9" fontFamily="monospace" opacity="0">
          |||
          <animate attributeName="opacity" values="0;0.3;0" dur="5s" begin="1s" repeatCount="indefinite" />
          <animate attributeName="y" values="115;95;115" dur="5s" begin="1s" repeatCount="indefinite" />
        </text>
        {/* Check mark */}
        <text x="260" y="125" fill="hsl(150, 60%, 50%)" fontSize="10" opacity="0">
          &#10003;
          <animate attributeName="opacity" values="0;0.5;0" dur="3.5s" begin="2s" repeatCount="indefinite" />
          <animate attributeName="y" values="130;108;130" dur="3.5s" begin="2s" repeatCount="indefinite" />
        </text>
        {/* Percentage */}
        <text x="135" y="120" fill="hsl(40, 80%, 60%)" fontSize="8" fontFamily="monospace" opacity="0">
          87%
          <animate attributeName="opacity" values="0;0.35;0" dur="4.5s" begin="1.5s" repeatCount="indefinite" />
          <animate attributeName="y" values="125;100;125" dur="4.5s" begin="1.5s" repeatCount="indefinite" />
        </text>

        {/* ── Notepad / papers on table ── */}
        <g transform="translate(95, 160)">
          {/* Paper stack */}
          <rect x="2" y="4" width="28" height="20" rx="1" fill="hsl(0, 0%, 95%)" opacity="0.3" transform="rotate(-5 16 14)" />
          <rect x="0" y="2" width="28" height="20" rx="1" fill="hsl(0, 0%, 92%)" opacity="0.4" transform="rotate(2 14 12)" />
          {/* Lines on top paper */}
          <rect x="4" y="6" width="16" height="1" rx="0.5" fill="hsl(var(--primary))" opacity="0.2" />
          <rect x="4" y="9" width="20" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" />
          <rect x="4" y="12" width="12" height="1" rx="0.5" fill="hsl(var(--muted-foreground))" opacity="0.15" />
          <rect x="4" y="15" width="18" height="1" rx="0.5" fill="hsl(150, 60%, 50%)" opacity="0.15" />
        </g>

        {/* ── Pen ── */}
        <line x1="130" y1="172" x2="145" y2="180" stroke="hsl(var(--foreground))" strokeWidth="1.5" opacity="0.2" strokeLinecap="round" />
        <circle cx="145" cy="180" r="1" fill="hsl(var(--primary))" opacity="0.3" />
      </svg>

      {/* Thinking dots overlay */}
      <div className="absolute top-[18%] left-[55%] flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1.2s' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1.2s' }} />
      </div>
    </div>
  );
}
