/**
 * Person detection via Claude Vision on camera snapshots.
 *
 * Sends a snapshot image to Claude with zone polygon descriptions,
 * asks it to count people in each zone and classify occupancy.
 *
 * This is the core of our detection pipeline — we own the detection,
 * UniFi only provides the snapshot.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  TableZone,
  SnapshotAnalysis,
  ZoneDetection,
  PolygonVertex,
} from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

// ══════════════════════════════════════════════════════════════════════════
// MAIN DETECTION FUNCTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Analyze a camera snapshot for person presence in configured zones.
 *
 * Sends the snapshot to Claude Vision with zone polygon descriptions
 * and receives back person counts and confidence for each zone.
 */
export async function detectPersonsInZones(
  snapshot: Buffer,
  contentType: string,
  zones: TableZone[],
  options: {
    model?: string;
    maxTokens?: number;
    cameraConfigId: string;
    snapshotHash: string;
  }
): Promise<SnapshotAnalysis> {
  const model = options.model || 'claude-sonnet-4-5-20250929';
  const maxTokens = options.maxTokens || 1024;
  const detectedAt = new Date().toISOString();

  if (zones.length === 0) {
    return {
      camera_config_id: options.cameraConfigId,
      snapshot_hash: options.snapshotHash,
      detected_at: detectedAt,
      zones: [],
      raw_response: {},
    };
  }

  const prompt = buildDetectionPrompt(zones);

  const mediaType = contentType.includes('png')
    ? 'image/png'
    : contentType.includes('webp')
      ? 'image/webp'
      : 'image/jpeg';

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: snapshot.toString('base64'),
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';

  const parsed = parseDetectionResponse(rawText, zones);

  return {
    camera_config_id: options.cameraConfigId,
    snapshot_hash: options.snapshotHash,
    detected_at: detectedAt,
    zones: parsed,
    raw_response: {
      model,
      input_tokens: response.usage?.input_tokens,
      output_tokens: response.usage?.output_tokens,
      raw_text: rawText,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
// PROMPT CONSTRUCTION
// ══════════════════════════════════════════════════════════════════════════

function buildDetectionPrompt(zones: TableZone[]): string {
  const zoneDescriptions = zones
    .map((z, i) => {
      const polyDesc = describePolygon(z.polygon);
      const typeLabel = z.zone_type === 'seat' ? 'SEATING AREA' : 'SERVER APPROACH PATH';
      return `Zone ${i + 1} (ID: ${z.id}): "${z.label || z.table_name} - ${typeLabel}"
  Location: ${polyDesc}
  Type: ${z.zone_type}
  Table: ${z.table_name}`;
    })
    .join('\n\n');

  return `You are analyzing a restaurant security camera snapshot to detect people in specific zones.

ZONES TO ANALYZE:
${zoneDescriptions}

For each zone, determine:
1. How many people are present within or overlapping that zone area
2. Your confidence level (0.0 to 1.0)
3. Brief description of what you see

IMPORTANT:
- Zone coordinates are normalized (0.0 = left/top edge, 1.0 = right/bottom edge)
- Count any person whose body significantly overlaps the zone polygon
- For "seat" zones: count seated guests
- For "approach" zones: count people standing/walking through (likely staff)
- If you cannot clearly see a zone, report confidence < 0.5

Respond with ONLY valid JSON in this format:
{
  "zones": [
    {
      "zone_id": "the zone ID from above",
      "person_count": 0,
      "confidence": 0.95,
      "description": "brief description"
    }
  ]
}`;
}

function describePolygon(polygon: PolygonVertex[]): string {
  if (polygon.length === 4) {
    const [tl, tr, br, bl] = polygon;
    return `Rectangle from (${pct(tl[0])}, ${pct(tl[1])}) to (${pct(br[0])}, ${pct(br[1])}) of the image`;
  }
  return `Polygon with vertices at: ${polygon.map((v) => `(${pct(v[0])}, ${pct(v[1])})`).join(', ')}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ══════════════════════════════════════════════════════════════════════════
// RESPONSE PARSING
// ══════════════════════════════════════════════════════════════════════════

function parseDetectionResponse(
  rawText: string,
  zones: TableZone[]
): ZoneDetection[] {
  try {
    // Extract JSON from response (may have markdown fences)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackDetections(zones);

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.zones || !Array.isArray(parsed.zones)) {
      return fallbackDetections(zones);
    }

    const zoneMap = new Map(zones.map((z) => [z.id, z]));

    return parsed.zones
      .filter((z: any) => zoneMap.has(z.zone_id))
      .map((z: any) => {
        const zone = zoneMap.get(z.zone_id)!;
        return {
          zone_id: z.zone_id,
          table_name: zone.table_name,
          zone_type: zone.zone_type,
          person_count: Math.max(0, Math.round(z.person_count || 0)),
          confidence: Math.min(1, Math.max(0, z.confidence || 0)),
          description: z.description || '',
        };
      });
  } catch {
    console.error('Failed to parse detection response:', rawText.slice(0, 200));
    return fallbackDetections(zones);
  }
}

/** Return zero-person detections when parsing fails */
function fallbackDetections(zones: TableZone[]): ZoneDetection[] {
  return zones.map((z) => ({
    zone_id: z.id,
    table_name: z.table_name,
    zone_type: z.zone_type,
    person_count: 0,
    confidence: 0,
    description: 'Detection parse failed',
  }));
}
