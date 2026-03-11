'use client';

import type { VenueSection, VenueTable } from '@/lib/database/floor-plan';

interface SectionOverlayProps {
  section: VenueSection;
  tables: VenueTable[];
}

export function SectionOverlay({ section, tables }: SectionOverlayProps) {
  const sectionTables = tables.filter((t) => t.section_id === section.id);
  if (sectionTables.length === 0) return null;

  // Compute bounding box from table positions (with padding)
  const PAD = 2;
  const minX = Math.max(0, Math.min(...sectionTables.map((t) => t.pos_x)) - PAD);
  const minY = Math.max(0, Math.min(...sectionTables.map((t) => t.pos_y)) - PAD);
  const maxX = Math.min(100, Math.max(...sectionTables.map((t) => t.pos_x + t.width)) + PAD);
  const maxY = Math.min(100, Math.max(...sectionTables.map((t) => t.pos_y + t.height)) + PAD);

  return (
    <div
      className="absolute rounded-lg pointer-events-none"
      style={{
        left: `${minX}%`,
        top: `${minY}%`,
        width: `${maxX - minX}%`,
        height: `${maxY - minY}%`,
        border: `1px solid ${section.color}15`,
        zIndex: 1,
      }}
    >
      <span
        className="absolute -top-3.5 left-1.5 text-[8px] font-medium tracking-wider uppercase px-1"
        style={{ color: `${section.color}60` }}
      >
        {section.name}
      </span>
    </div>
  );
}
