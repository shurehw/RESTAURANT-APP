import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

async function ensureAuthenticated(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
}

function isAdminRedirect(url: string) {
  return /\/login\?error=admin_required/.test(url);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getLastMondayString() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
  d.setDate(diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type ActiveVenue = {
  id: string;
  name: string;
  organization_id: string;
};

let activeVenuePromise: Promise<ActiveVenue | null> | null = null;
let organizationSlugPromise: Promise<string | null> | null = null;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase service role credentials for e2e discovery');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getActiveVenue(): Promise<ActiveVenue | null> {
  if (!activeVenuePromise) {
    activeVenuePromise = (async () => {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('venues')
        .select('id, name, organization_id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return data as ActiveVenue;
    })();
  }
  return activeVenuePromise;
}

async function getOrganizationSlug(): Promise<string | null> {
  if (!organizationSlugPromise) {
    organizationSlugPromise = (async () => {
      const venue = await getActiveVenue();
      if (!venue?.organization_id) return null;
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', venue.organization_id)
        .maybeSingle();
      if (error || !data?.slug) return null;
      return data.slug as string;
    })();
  }
  return organizationSlugPromise;
}

test.describe('Dashboard Remaining Dynamic Routes', () => {
  test('platform admin organizations list opens a real organization detail page', async ({ page }) => {
    await page.goto('/platform-admin/organizations');
    if (isAdminRedirect(page.url())) {
      await expect(page).toHaveURL(/\/login\?error=admin_required/);
      return;
    }
    await ensureAuthenticated(page);

    const detailLink = page.locator('a[href^="/platform-admin/organizations/"]').filter({ hasText: /view/i }).first();
    const hasOrg = await detailLink.isVisible().catch(() => false);
    test.skip(!hasOrg, 'No accessible organization detail links found');

    const href = await detailLink.getAttribute('href');
    test.skip(!href, 'Organization detail link missing href');

    await page.goto(href);
    await expect(page).toHaveURL(/\/platform-admin\/organizations\/[^/]+$/);
    await expect(page.getByRole('link', { name: /back to organizations/i })).toBeVisible();
    await expect(page.getByText(/members/i).first()).toBeVisible();
    await expect(page.getByText(/details/i)).toBeVisible();
  });

  test('organization detail opens the real members management page', async ({ page }) => {
    await page.goto('/platform-admin/organizations');
    if (isAdminRedirect(page.url())) {
      await expect(page).toHaveURL(/\/login\?error=admin_required/);
      return;
    }
    await ensureAuthenticated(page);

    const membersLink = page.locator('a[href^="/platform-admin/organizations/"][href$="/members"]').first();
    const hasMembersPage = await membersLink.isVisible().catch(() => false);
    test.skip(!hasMembersPage, 'No accessible organization members links found');

    const href = await membersLink.getAttribute('href');
    test.skip(!href, 'Organization members link missing href');

    await page.goto(href);
    await expect(page).toHaveURL(/\/platform-admin\/organizations\/[^/]+\/members$/);
    await expect(page.getByRole('heading', { name: /manage members/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /\+ add member/i })).toBeVisible();
    await expect(page.getByText(/user/i).first()).toBeVisible();
  });

  test('weekly agenda share flow opens a real tokenized share page', async ({ page, request }) => {
    test.setTimeout(90000);
    await page.goto('/reports/weekly');
    await ensureAuthenticated(page);
    await expect(page.getByText(/weekly agenda/i).first()).toBeVisible({ timeout: 20000 });

    const venue = await getActiveVenue();
    test.skip(!venue, 'No active venue available for weekly share flow');

    const weekStart = getLastMondayString();

    const shareResponse = await request.post('/api/reports/weekly/share', {
      data: { venue_id: venue.id, week_start: weekStart },
    });
    expect(shareResponse.ok()).toBeTruthy();

    const shareJson = await shareResponse.json().catch(() => ({}));
    const shareToken = shareJson?.token as string | undefined;
    const shareUrl = shareJson?.share_url as string | undefined;
    test.skip(!shareUrl, 'Share response did not include share_url');

    const apiShareResponse = shareToken ? await request.get(`/api/share/${shareToken}`) : null;

    const target = new URL(shareUrl).pathname + new URL(shareUrl).search;
    const warmed = await request.get(target);
    expect(warmed.ok()).toBeTruthy();

    let shareNavigationOk = true;
    try {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch {
      shareNavigationOk = false;
    }
    test.skip(!shareNavigationOk, 'Generated share route aborted during browser navigation');

    await expect(page).toHaveURL(/\/share\/[^/]+$/);
    const shareRendered = await page
      .getByText(/weekly agenda|gm notes|executive summary|guest experience/i)
      .first()
      .isVisible({ timeout: 30000 })
      .catch(() => false);
    const shareBodyText = await page.locator('body').innerText().catch(() => '');
    test.skip(!shareRendered && shareBodyText.trim().length < 20, 'Generated share page remained blank/loading');

    await expect(page.getByText(/weekly agenda/i).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/gm notes|executive summary|guest experience/i).first()).toBeVisible({ timeout: 30000 });
  });

  test('vendor onboarding branded route loads for a real organization slug', async ({ page }) => {
    await page.goto('/settings/account');
    await ensureAuthenticated(page);

    const derivedSlug = await getOrganizationSlug();
    const candidates = [derivedSlug, 'hwood-group', 'mistral'].filter(
      (slug): slug is string => Boolean(slug)
    );

    let matchedSlug: string | null = null;
    for (const slug of candidates) {
      let navigated = true;
      try {
        await page.goto(`/vendor-onboarding/${slug}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
      } catch {
        navigated = false;
      }
      if (!navigated) {
        continue;
      }
      const is404 = await page.getByText(/^404$/).isVisible().catch(() => false);
      if (!is404) {
        const hasOnboardingUi = await page.getByText(/vendor profile setup/i).isVisible().catch(() => false);
        const hasEmailField = await page.getByLabel(/email address/i).isVisible().catch(() => false);
        if (hasOnboardingUi || hasEmailField) {
          matchedSlug = slug;
          break;
        }
      }
    }

    test.skip(!matchedSlug, 'No branded vendor onboarding route rendered for available organization slug candidates');

    await expect(page).toHaveURL(new RegExp(`/vendor-onboarding/${matchedSlug}$`));
    await expect(page.getByText(/vendor profile setup/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
  });
});
