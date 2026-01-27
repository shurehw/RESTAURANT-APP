/**
 * Backfill item_pack_configurations from existing vendor_item_aliases.
 *
 * Why: mapping historically only saved vendor_item_aliases.pack_size (string),
 * but Products "PACK CONFIGS" comes from item_pack_configurations.
 *
 * Usage:
 *   npx tsx scripts/backfill-pack-configs-from-vendor-aliases.ts            # dry run
 *   npx tsx scripts/backfill-pack-configs-from-vendor-aliases.ts --apply   # writes inserts
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type PackType = 'case' | 'bottle' | 'bag' | 'box' | 'each' | 'keg' | 'pail' | 'drum';

function parsePackConfigFromDescription(desc: string): null | {
  pack_type: PackType;
  units_per_pack: number;
  unit_size: number;
  unit_size_uom: string;
} {
  const raw = desc || '';
  const lower = raw.toLowerCase();

  const normalizeUom = (uom: string) => {
    const u = uom.toLowerCase();
    if (u === 'ml') return 'mL';
    if (u === 'l' || u === 'lt' || u === 'ltr') return 'L';
    if (u === 'gal') return 'gal';
    if (u === 'qt') return 'qt';
    if (u === 'pt') return 'pt';
    if (u === 'oz') return 'oz';
    if (u === 'lb') return 'lb';
    if (u === 'kg') return 'kg';
    if (u === 'g') return 'g';
    return uom;
  };

  // Pattern A: "CS/12" + size elsewhere like "750ML"
  const csCount = lower.match(/\bcs\s*\/\s*(\d+)\b/i);
  const size = lower.match(/\b(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
  if (csCount && size) {
    const units = Number(csCount[1]);
    const unitSize = Number(size[1]);
    const uom = normalizeUom(size[3]);
    if (Number.isFinite(units) && units > 0 && Number.isFinite(unitSize) && unitSize > 0) {
      return { pack_type: 'case', units_per_pack: units, unit_size: unitSize, unit_size_uom: uom };
    }
  }

  // Pattern B: "12/750ML"
  const casePattern = lower.match(/\b(\d+)\s*\/\s*(\d+(\.\d+)?)\s*(ml|mL|l|lt|ltr|oz|lb|gal|qt|pt|kg|g)\b/i);
  if (casePattern) {
    const units = Number(casePattern[1]);
    const unitSize = Number(casePattern[2]);
    const uom = normalizeUom(casePattern[4]);
    if (Number.isFinite(units) && units > 0 && Number.isFinite(unitSize) && unitSize > 0) {
      return { pack_type: 'case', units_per_pack: units, unit_size: unitSize, unit_size_uom: uom };
    }
  }

  // Pattern C: single size like "750ML" => bottle
  if (size) {
    const unitSize = Number(size[1]);
    const uom = normalizeUom(size[3]);
    if (Number.isFinite(unitSize) && unitSize > 0) {
      const pack_type =
        uom === 'mL' || uom === 'L' || uom === 'oz' ? 'bottle' :
        uom === 'lb' || uom === 'kg' || uom === 'g' ? 'bag' :
        'each';
      return { pack_type, units_per_pack: 1, unit_size: unitSize, unit_size_uom: uom };
    }
  }

  return null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`🔧 Backfill pack configs from vendor aliases (${apply ? 'APPLY' : 'DRY RUN'})`);

  const { data: aliases, error } = await supabase
    .from('vendor_item_aliases')
    .select('id, vendor_id, item_id, vendor_item_code, vendor_description, pack_size, is_active')
    .eq('is_active', true)
    .not('vendor_item_code', 'is', null)
    .limit(10000);

  if (error) {
    console.error('❌ Failed to load vendor_item_aliases:', error);
    process.exit(1);
  }

  console.log(`Loaded ${aliases?.length || 0} active vendor aliases`);

  let parsed = 0;
  let inserted = 0;
  let skippedExisting = 0;
  let skippedUnparseable = 0;

  // De-dupe by (item_id, vendor_id, vendor_item_code) so we don't do redundant checks.
  const seen = new Set<string>();

  for (const a of aliases || []) {
    const key = `${a.item_id}::${a.vendor_id}::${a.vendor_item_code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const desc = (a.vendor_description || '').toString();
    const packConfig = parsePackConfigFromDescription(desc) || (a.pack_size ? parsePackConfigFromDescription(String(a.pack_size)) : null);

    if (!packConfig) {
      skippedUnparseable++;
      continue;
    }
    parsed++;

    // Skip if we already have any active vendor-specific pack config for this exact vendor code
    const { data: existing, error: existingErr } = await supabase
      .from('item_pack_configurations')
      .select('id')
      .eq('item_id', a.item_id)
      .eq('vendor_id', a.vendor_id)
      .eq('vendor_item_code', a.vendor_item_code)
      .eq('is_active', true)
      .limit(1);

    if (existingErr) {
      console.warn('⚠️  Failed to check existing pack config:', existingErr.message);
      continue;
    }

    if (existing && existing.length > 0) {
      skippedExisting++;
      continue;
    }

    if (apply) {
      const ins = await supabase
        .from('item_pack_configurations')
        .insert({
          item_id: a.item_id,
          pack_type: packConfig.pack_type,
          units_per_pack: packConfig.units_per_pack,
          unit_size: packConfig.unit_size,
          unit_size_uom: packConfig.unit_size_uom,
          vendor_id: a.vendor_id,
          vendor_item_code: a.vendor_item_code,
          is_active: true,
        });

      if (ins.error) {
        console.warn('⚠️  Insert failed:', ins.error.message);
        continue;
      }
      inserted++;
    } else {
      console.log(
        `[DRY] Would insert pack config for vendor_code=${a.vendor_item_code}: ${packConfig.units_per_pack}/${packConfig.unit_size}${packConfig.unit_size_uom} (${packConfig.pack_type})`
      );
      inserted++;
    }
  }

  console.log('\n✅ Backfill complete');
  console.log(`- Parsed configs: ${parsed}`);
  console.log(`- ${apply ? 'Inserted' : 'Would insert'}: ${inserted}`);
  console.log(`- Skipped existing: ${skippedExisting}`);
  console.log(`- Skipped unparseable: ${skippedUnparseable}`);
}

main().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});

