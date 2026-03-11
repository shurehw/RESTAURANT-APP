-- Add comp_pattern, culinary, and revenue_insight to the signal_type enum
ALTER TYPE signal_type ADD VALUE IF NOT EXISTS 'comp_pattern';
ALTER TYPE signal_type ADD VALUE IF NOT EXISTS 'culinary';
ALTER TYPE signal_type ADD VALUE IF NOT EXISTS 'revenue_insight';
