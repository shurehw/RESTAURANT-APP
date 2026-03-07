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
  const PAD = 3; // % padding around bounding box
  const minX = Math.max(0, Math.min(...sectionTables.map((t) => t.pos_x)) - PAD);
  const minY = Math.max(0, Math.min(...sectionTables.map((t) => t.pos_y)) - PAD);
  const maxX = Math.min(100, Math.max(...sectionTables.map((t) => t.pos_x + t.width)) + PAD);
  const maxY = Math.min(100, Math.max(...sectionTables.map((t) => t.pos_y + t.height)) + PAD);

  return (
    <div
      className="absolute rounded-lg border-2 border-dashed pointer-events-none"
      style={{
        left: `${minX}%`,
        top: `${minY}%`,
        width: `${maxX - minX}%`,
        height: `${maxY - minY}%`,
        backgroundColor: `${section.color}18`,
        borderColor: `${section.color}60`,
        zIndex: 1,
      }}
    >
      <span
        className="absolute -top-5 left-1 text-[10px] font-semibold px-1 rounded"
        style={{ color: section.color, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
      >
        {section.name}
      </span>
    </div>
  );
}
