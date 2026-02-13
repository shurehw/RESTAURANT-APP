/**
 * UniFi Protect Cloud Connector Client
 *
 * Pulls camera snapshots via the Cloud Connector REST proxy.
 * All requests go through: https://api.ui.com/v1/connector/consoles/{hostId}/proxy/protect/integration/v1/...
 *
 * We only use this for snapshots. All detection logic lives in our own pipeline.
 */

import crypto from 'crypto';
import type { UnifiProtectConfig, ProtectCamera } from '@/lib/cv/types';

const CLOUD_CONNECTOR_BASE = 'https://api.ui.com/v1/connector/consoles';
const REQUEST_TIMEOUT_MS = 15_000;

// ══════════════════════════════════════════════════════════════════════════
// CORE API FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * List all cameras on this Protect controller via Cloud Connector.
 */
export async function listCameras(
  config: UnifiProtectConfig
): Promise<ProtectCamera[]> {
  const url = buildUrl(config, '/v1/cameras');
  const res = await protectFetch(url, config.apiKey);
  return res as ProtectCamera[];
}

/**
 * Fetch a JPEG snapshot from a specific camera.
 * Returns the raw image buffer and a content hash for scene-change detection.
 */
export async function getCameraSnapshot(
  config: UnifiProtectConfig,
  cameraId: string,
  highQuality = true
): Promise<{ buffer: Buffer; hash: string; contentType: string }> {
  const url = buildUrl(
    config,
    `/v1/cameras/${cameraId}/snapshot?highQuality=${highQuality}`
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Snapshot failed: ${res.status} ${res.statusText} - ${text}`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const contentType = res.headers.get('content-type') || 'image/jpeg';

    return { buffer, hash, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get details for a single camera.
 */
export async function getCamera(
  config: UnifiProtectConfig,
  cameraId: string
): Promise<ProtectCamera> {
  const url = buildUrl(config, `/v1/cameras/${cameraId}`);
  const res = await protectFetch(url, config.apiKey);
  return res as ProtectCamera;
}

// ══════════════════════════════════════════════════════════════════════════
// SCENE CHANGE DETECTION
// ══════════════════════════════════════════════════════════════════════════

/**
 * Compare two snapshot hashes. Returns true if the scene has changed enough
 * to warrant re-analysis. Uses simple hash comparison — if hashes differ at
 * all, the scene changed (JPEG compression means even minor changes produce
 * different hashes).
 *
 * For more nuanced comparison, the caller can use perceptual hashing or
 * pixel-diff, but for MVP, hash inequality = changed.
 */
export function hasSceneChanged(
  previousHash: string | null,
  currentHash: string
): boolean {
  if (!previousHash) return true;
  return previousHash !== currentHash;
}

// ══════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════

function buildUrl(config: UnifiProtectConfig, path: string): string {
  return `${CLOUD_CONNECTOR_BASE}/${config.hostId}/proxy/protect/integration${path}`;
}

async function protectFetch(url: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Protect API error: ${res.status} ${res.statusText} - ${text}`);
    }

    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}
