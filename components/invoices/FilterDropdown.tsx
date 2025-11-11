'use client';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label: string;
  param: string;
  options: FilterOption[];
  currentValue: string;
}

export function FilterDropdown({ label, param, options, currentValue }: FilterDropdownProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const url = new URL(window.location.href);
    if (e.target.value) {
      url.searchParams.set(param, e.target.value);
    } else {
      url.searchParams.delete(param);
    }
    window.location.href = url.toString();
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium">{label}</label>
      <select
        value={currentValue}
        onChange={handleChange}
        className="border rounded px-3 py-2 bg-white"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
