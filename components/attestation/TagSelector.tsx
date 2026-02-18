'use client';

interface TagSelectorProps<T extends string> {
  tags: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (tags: T[]) => void;
  disabled?: boolean;
  categories?: Record<string, T[]>;
  categoryLabels?: Record<string, string>;
  title?: string;
}

export function TagSelector<T extends string>({
  labels,
  selected,
  onChange,
  disabled,
  categories,
  categoryLabels,
  title,
}: TagSelectorProps<T>) {
  const toggle = (tag: T) => {
    if (disabled) return;
    const next = selected.includes(tag)
      ? selected.filter(t => t !== tag)
      : [...selected, tag];
    onChange(next);
  };

  const renderTag = (tag: T) => {
    const isSelected = selected.includes(tag);
    return (
      <button
        key={tag}
        type="button"
        onClick={() => toggle(tag)}
        disabled={disabled}
        className={`
          inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-colors
          ${isSelected
            ? 'bg-brass text-white'
            : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-border'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {labels[tag]}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {title && (
        <label className="text-sm font-medium text-foreground">
          {title}
        </label>
      )}

      {categories && categoryLabels ? (
        // Grouped layout (revenue)
        <div className="space-y-2.5">
          {Object.entries(categories).map(([catKey, catTags]) => (
            <div key={catKey}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                {categoryLabels[catKey] || catKey}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(catTags as T[]).map(renderTag)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat layout (labor)
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(labels).map(tag => renderTag(tag as T))}
        </div>
      )}
    </div>
  );
}
