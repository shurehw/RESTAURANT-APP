'use client';

/**
 * Ledger Stripe Component
 * Signature OpsOS visual motif: 1px accent rule under section headers
 * Creates clean, operational aesthetic
 */

interface LedgerStripeProps {
  className?: string;
  thickness?: 'thin' | 'base' | 'thick';
}

export function LedgerStripe({ className = '', thickness = 'base' }: LedgerStripeProps) {
  const thicknessMap = {
    thin: 'h-px',
    base: 'h-0.5',
    thick: 'h-1',
  };

  return (
    <div
      className={`w-full ${thicknessMap[thickness]} bg-[var(--ledger-gold)] ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Section Header with Ledger Stripe
 * Complete header component with automatic stripe
 */

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`mb-6 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ letterSpacing: '0.01em' }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
      <LedgerStripe />
    </div>
  );
}
