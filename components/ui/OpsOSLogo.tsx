/**
 * OpsOSLogo — Typographic brand mark
 * Matches the marketing site treatment: "Ops" bold + "OS" dimmed in JetBrains Mono
 */

interface OpsOSLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'dark' | 'light';
  className?: string;
}

const sizeMap = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
  xl: 'text-4xl',
} as const;

export function OpsOSLogo({ size = 'md', variant = 'dark', className = '' }: OpsOSLogoProps) {
  const textColor = variant === 'dark' ? 'text-opsos-slate' : 'text-white';
  const dimOpacity = 'opacity-50';

  return (
    <span
      className={`font-mono tracking-[0.08em] leading-none select-none ${sizeMap[size]} ${textColor} ${className}`}
      aria-label="OpsOS"
    >
      <span className="font-bold">Ops</span>
      <span className={`font-normal tracking-[0.12em] ${dimOpacity}`}>OS</span>
    </span>
  );
}
