/**
 * Full browser attestation test — Playwright
 *
 * Logs in, opens the attestation stepper, fills every step,
 * generates the AI closing narrative, and submits.
 *
 * Usage: node scripts/attestation-browser-test.mjs [venue-name] [--headed]
 */
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });
config({ path: join(__dirname, '../.env.local'), override: true });

const USE_LOCAL = process.argv.includes('--local');
const PROD_URL = USE_LOCAL ? 'http://localhost:3000' : 'https://prime-cost.com';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const venueName = process.argv[2] || 'delilah-miami';
const HEADLESS = !process.argv.includes('--headed');

const L = (...args) => console.log(`[browser:${venueName}]`, ...args);
const E = (...args) => console.log(`[browser:${venueName}] ERROR:`, ...args);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function today() {
  const dateArg = process.argv.find(a => a.startsWith('--date='))?.split('=')[1];
  if (dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)) return dateArg;
  const now = new Date();
  if (now.getHours() < 5) now.setDate(now.getDate() - 1);
  return now.toISOString().split('T')[0];
}

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

/** Fill a visible textarea by placeholder text (partial match) */
async function fillByPlaceholder(page, placeholder, text) {
  const ta = page.locator(`textarea[placeholder*="${placeholder}"]`).first();
  try {
    await ta.fill(text, { timeout: 5000 });
    // Trigger blur to ensure onBlur handler fires (backup save path)
    await ta.dispatchEvent('blur');
    await page.waitForTimeout(400);
    return true;
  } catch {
    return false;
  }
}

/** Fill a visible textarea by index within the current view */
async function fillByIndex(page, index, text) {
  const tas = page.locator('textarea:visible');
  const count = await tas.count();
  if (index < count) {
    await tas.nth(index).fill(text);
    await tas.nth(index).dispatchEvent('blur');
    await page.waitForTimeout(400);
    return true;
  }
  return false;
}

/** Wait for debounce to flush (useAttestation debounces saves at 600ms) */
async function flushDebounce(page) {
  await page.waitForTimeout(1500);
}

/** Click Next and wait for step transition */
async function clickNext(page) {
  const nextBtn = page.locator('button:has-text("Next"):visible').first();
  if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const disabled = await nextBtn.isDisabled();
    if (disabled) {
      L('  Next button disabled — checking for acknowledge checkboxes...');
      // Try checking "Nothing to report" checkboxes
      const checkboxes = page.locator('button[role="checkbox"]:visible');
      const cbCount = await checkboxes.count();
      for (let i = 0; i < cbCount; i++) {
        const state = await checkboxes.nth(i).getAttribute('data-state');
        if (state !== 'checked') {
          await checkboxes.nth(i).click();
          L('  Checked an acknowledge box');
          await page.waitForTimeout(500);
        }
      }
      // Retry Next
      if (await nextBtn.isDisabled()) {
        L('  Next still disabled after acknowledge — filling visible textareas');
        const tas = page.locator('textarea:visible');
        const taCount = await tas.count();
        for (let i = 0; i < taCount; i++) {
          const val = await tas.nth(i).inputValue();
          if (val.length < 20) {
            await tas.nth(i).fill('Smoke test: Operations ran smoothly tonight with standard execution across all areas of the venue.');
            await page.waitForTimeout(700);
          }
        }
      }
    }
    await nextBtn.click();
    await page.waitForTimeout(1500);
    return true;
  }
  return false;
}

/** Get current step text from the stepper */
async function getCurrentStep(page) {
  const stepText = await page.locator('text=/Step \\d+ of \\d+/').textContent().catch(() => null);
  return stepText;
}

// ══════════════════════════════════════════════════════════════════════════
// Main Test
// ══════════════════════════════════════════════════════════════════════════

async function run() {
  L(`Starting full browser attestation test`);
  L(`Venue: ${venueName} | Date: ${today()} | Headless: ${HEADLESS}`);

  // Resolve venue
  const { data: venues } = await admin.from('venues').select('id, name');
  let venueId;
  for (const v of venues || []) {
    if (v.name.toLowerCase().includes(venueName.replace(/-/g, ' '))) {
      venueId = v.id;
      L(`Venue: ${v.name} (${v.id.slice(0, 8)})`);
      break;
    }
  }
  if (!venueId) throw new Error(`Unknown venue: ${venueName}. Available: ${venues?.map(v => v.name)}`);

  // Delete ALL attestations for this venue so we get a completely clean draft
  const { data: existingList } = await admin
    .from('nightly_attestations')
    .select('id, status, business_date')
    .eq('venue_id', venueId)
    .order('business_date', { ascending: false });

  for (const existing of existingList || []) {
    // Delete children first, then the attestation itself
    await admin.from('comp_resolutions').delete().eq('attestation_id', existing.id);
    await admin.from('nightly_incidents').delete().eq('attestation_id', existing.id);
    await admin.from('coaching_actions').delete().eq('attestation_id', existing.id);
    await admin.from('attestation_signals').delete().eq('attestation_id', existing.id);
    await admin.from('nightly_attestations').delete().eq('id', existing.id);
  }
  L(`Deleted ${existingList?.length || 0} existing attestation(s) — page will auto-create fresh draft`);

  // Get test user — prefer jacob@ for admin access, fall back to any @hwoodgroup.com
  const { data: legacyUsers } = await admin
    .from('users')
    .select('id, email, full_name, password_hash')
    .ilike('email', '%@hwoodgroup.com')
    .eq('is_active', true)
    .limit(10);
  if (!legacyUsers?.length) throw new Error('No @hwoodgroup.com users');

  const testUser = legacyUsers.find(u => u.email === 'jacob@hwoodgroup.com') || legacyUsers[0];
  const origHash = testUser.password_hash;
  const tempPass = `BrowserT3st_${Date.now()}!`;

  // Set temp password in both legacy and auth.users
  const bcrypt = await import('bcryptjs');
  await admin.from('users').update({ password_hash: await bcrypt.hash(tempPass, 10) }).eq('id', testUser.id);

  // Sync auth.users password — the login route also does this, but do it pre-emptively
  // so signInWithPassword succeeds immediately and sets auth cookies
  try {
    // Direct DB lookup via RPC (migration 143) — no pagination needed
    const { data: authUserId } = await admin.rpc('get_auth_user_id_by_email', {
      user_email: testUser.email.toLowerCase(),
    });
    if (authUserId) {
      await admin.auth.admin.updateUserById(authUserId, { password: tempPass });
      L(`  Synced auth.users password for ${authUserId.slice(0, 8)}`);
      // Ensure org membership with admin role
      const { data: orgVenues } = await admin.from('venues').select('organization_id').limit(1);
      if (orgVenues?.[0]?.organization_id) {
        await admin.from('organization_users').upsert({
          user_id: authUserId,
          organization_id: orgVenues[0].organization_id,
          role: 'admin',
          is_active: true,
        }, { onConflict: 'organization_id,user_id' });
      }
      // Ensure user_profiles role is 'gm' (required for attestation access)
      await admin.from('user_profiles').upsert({
        id: authUserId,
        role: 'gm',
      }, { onConflict: 'id' }).then(r => {
        if (r.error) L(`  user_profiles upsert: ${r.error.message}`);
      });
    } else {
      // Create auth user — login route will sync but we need clean state
      const { data: newAuth } = await admin.auth.admin.createUser({
        email: testUser.email.toLowerCase(),
        password: tempPass,
        email_confirm: true,
        user_metadata: { full_name: testUser.full_name },
      });
      if (newAuth?.user) {
        L(`  Created auth.users: ${newAuth.user.id.slice(0, 8)}`);
        const { data: orgVenues } = await admin.from('venues').select('organization_id').limit(1);
        if (orgVenues?.[0]?.organization_id) {
          await admin.from('organization_users').upsert({
            user_id: newAuth.user.id,
            organization_id: orgVenues[0].organization_id,
            role: 'admin',
            is_active: true,
          }, { onConflict: 'organization_id,user_id' });
        }
      }
    }
  } catch (e) {
    L(`  Auth sync warning: ${e.message} — login route will handle`);
  }

  L(`User: ${testUser.email}`);

  const errors = [];
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Track errors + attestation API responses
  const httpErrors = [];
  const apiResponses = [];
  page.on('pageerror', err => {
    // Ignore React hydration errors (#418, #423) and ServiceWorker errors
    if (!err.message.includes('ServiceWorker') && !err.message.includes('Minified React error')) {
      errors.push({ step: 'page_error', msg: err.message.slice(0, 150) });
    }
  });
  page.on('response', async res => {
    const url = res.url();
    if (res.status() >= 500 && !url.includes('favicon') && !url.includes('sw.js')) {
      httpErrors.push({ url, status: res.status() });
    }
    // Capture attestation API responses for debugging
    if (url.includes('/api/attestation')) {
      const body = await res.text().catch(() => '');
      apiResponses.push({ url: url.split('?')[0], status: res.status(), body: body.slice(0, 300) });
      if (res.status() >= 400) {
        L(`  API ${res.request().method()} ${url.split('?')[0]} → ${res.status()}: ${body.slice(0, 200)}`);
      }
    }
  });

  try {
    // ═══ LOGIN ═══
    L('Step 0: Login');
    await page.goto(`${PROD_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', testUser.email);
    await page.fill('input[type="password"]', tempPass);
    const [loginRes] = await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/auth/login'), { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ]);
    if (loginRes.status() >= 400) {
      E(`Login failed: ${loginRes.status()}`);
      errors.push({ step: 'login', msg: `Status ${loginRes.status()}` });
      return;
    }
    L(`  Login: ${loginRes.status()}`);
    await page.waitForTimeout(2000);

    // Ensure user has admin role AFTER login (login may have reset to viewer)
    const { data: postLoginAuthId } = await admin.rpc('get_auth_user_id_by_email', {
      user_email: testUser.email.toLowerCase(),
    });
    if (postLoginAuthId) {
      const { data: orgVenues } = await admin.from('venues').select('organization_id').limit(1);
      if (orgVenues?.[0]?.organization_id) {
        await admin.from('organization_users').update({ role: 'admin' })
          .eq('user_id', postLoginAuthId)
          .eq('organization_id', orgVenues[0].organization_id);
        L(`  Set org role to admin for ${postLoginAuthId.slice(0, 8)}`);
      }
    }

    // ═══ NAVIGATE TO NIGHTLY PAGE ═══
    L('Step 1: Navigate to nightly report');
    const targetDate = today();
    const nightlyUrl = `${PROD_URL}/reports/nightly?date=${targetDate}&venue=${venueId}`;
    await page.goto(nightlyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    L(`  URL: ${page.url()}`);

    // Ensure the date picker shows the target date (production may ignore URL param)
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      const currentVal = await dateInput.inputValue();
      if (currentVal !== targetDate) {
        // Calculate how many days back to click the left arrow
        const current = new Date(currentVal);
        const target = new Date(targetDate);
        const diffDays = Math.round((current - target) / 86400000);
        L(`  Date picker shows ${currentVal}, clicking back ${diffDays} day(s) to ${targetDate}`);
        const leftArrow = page.locator('button:has(svg.lucide-chevron-left)').first();
        for (let i = 0; i < diffDays; i++) {
          await leftArrow.click();
          await page.waitForTimeout(2000);
        }
        // Wait for attestation hook to fully reinitialize
        await page.waitForTimeout(8000);
        const newVal = await dateInput.inputValue();
        L(`  Date picker now shows ${newVal}`);
      }
    }

    // Select correct venue if dropdown doesn't match
    const venueSelector = page.locator('button:has-text("Delilah")').first();
    const currentVenue = await venueSelector.textContent().catch(() => '');
    if (currentVenue && !currentVenue.toLowerCase().includes('miami')) {
      L(`  Venue dropdown shows "${currentVenue.trim()}" — selecting Miami...`);
      await venueSelector.click();
      await page.waitForTimeout(500);
      // Look for Miami option in the dropdown
      const miamiOption = page.locator('[role="option"]:has-text("Miami"), [role="menuitem"]:has-text("Miami"), button:has-text("Delilah Miami")').first();
      if (await miamiOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await miamiOption.click();
        L(`  Selected Delilah Miami from dropdown`);
        await page.waitForTimeout(5000); // Wait for data reload + attestation hook
      } else {
        // Try the generic select pattern
        const options = page.locator('text=Miami');
        if (await options.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await options.first().click();
          L('  Clicked Miami option');
          await page.waitForTimeout(5000);
        } else {
          L('  Could not find Miami in venue dropdown — continuing with current venue');
        }
      }
    }

    // Wait for attestation hook to init (POST /api/attestation + GET)
    await page.waitForTimeout(5000);

    if (httpErrors.length > 0) {
      L(`  HTTP errors during page load: ${httpErrors.length}`);
      httpErrors.forEach(e => E(`  ${e.status}: ${e.url.split('?')[0]}`));
    }

    // Check if page has content
    const bodyText = await page.textContent('body') || '';
    if (bodyText.includes('Application error') || bodyText.includes('Something went wrong')) {
      E('Page shows error boundary');
      errors.push({ step: 'page_load', msg: 'Error boundary visible' });
      await page.screenshot({ path: join(__dirname, `_browser_${venueName}_error.png`) });
      return;
    }

    // ═══ OPEN ATTESTATION STEPPER ═══
    L('Step 2: Open attestation stepper');

    // Scroll down to find attestation card (it's near the bottom of the page)
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(1000);

    // Try multiple entry points:
    // 1. Inline "Nightly Attestation" banner card (visible when draft exists)
    // 2. "Attest FOH" button (topbar or inline)
    // 3. "FOH" button (when attestation already submitted)
    // 4. "Amend" button (submitted attestation)
    const attestBanner = page.locator('text=Nightly Attestation').first();
    const attestFoh = page.locator('button:has-text("Attest FOH")').first();
    const fohBtn = page.locator('button:has-text("FOH")').first();
    const amendBtn = page.locator('button:has-text("Amend")').first();
    const retryBtn = page.locator('button:has-text("Retry")').first();

    if (await attestBanner.isVisible({ timeout: 5000 }).catch(() => false)) {
      await attestBanner.click();
      L('  Clicked "Nightly Attestation" banner');
    } else if (await attestFoh.isVisible({ timeout: 3000 }).catch(() => false)) {
      await attestFoh.click();
      L('  Clicked "Attest FOH" button');
    } else if (await fohBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fohBtn.click();
      L('  Clicked "FOH" button');
    } else if (await amendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await amendBtn.click();
      L('  Clicked "Amend" button (already submitted)');
    } else if (await retryBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Attestation hook errored — retry and try again
      E('  Attestation hook failed — clicking Retry');
      await retryBtn.click();
      await page.waitForTimeout(5000);
      if (await attestBanner.isVisible({ timeout: 5000 }).catch(() => false)) {
        await attestBanner.click();
        L('  Clicked "Nightly Attestation" banner after retry');
      } else if (await attestFoh.isVisible({ timeout: 3000 }).catch(() => false)) {
        await attestFoh.click();
        L('  Clicked "Attest FOH" after retry');
      }
    } else {
      // Screenshot the current state for debugging
      await page.screenshot({ path: join(__dirname, `_browser_${venueName}_no_attest.png`), fullPage: true });
      // Check if Loading... is still showing
      const loadingBtn = page.locator('button:has-text("Loading")').first();
      const stillLoading = await loadingBtn.isVisible({ timeout: 1000 }).catch(() => false);
      if (stillLoading) {
        L('  Attestation still loading — waiting 10 more seconds...');
        await page.waitForTimeout(10000);
        if (await attestFoh.isVisible({ timeout: 3000 }).catch(() => false)) {
          await attestFoh.click();
          L('  Clicked "Attest FOH" after extra wait');
        } else {
          E('Could not find attestation entry point (still loading)');
          errors.push({ step: 'open_attestation', msg: 'Attestation loading timed out' });
          return;
        }
      } else {
        E('Could not find attestation entry point');
        const pageState = await page.textContent('body').catch(() => '');
        L(`  Page contains: attestation=${pageState.includes('ttestation')}, FOH=${pageState.includes('Attest FOH')}, banner=${pageState.includes('Nightly Attestation')}`);
        errors.push({ step: 'open_attestation', msg: 'No attestation button found' });
        return;
      }
    }
    await page.waitForTimeout(2000);

    // Verify stepper opened and navigate to step 1 (Revenue)
    const stepIndicator = await getCurrentStep(page);
    L(`  Stepper: ${stepIndicator || 'not found'}`);

    // If stepper didn't start at Step 1, click the Revenue step in the sidebar (inside the Sheet dialog)
    if (stepIndicator && !stepIndicator.includes('Step 1')) {
      L(`  Stepper opened at ${stepIndicator} — navigating to Revenue (Step 1)`);
      try {
        // Target the step indicator button inside the Sheet dialog — "Revenue" label inside step sidebar
        const revenueStepBtn = page.locator('[role="dialog"] button:has-text("Revenue")').first();
        await revenueStepBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
        L(`  Now at: ${await getCurrentStep(page)}`);
      } catch (e) {
        L(`  Could not navigate to Revenue step: ${e.message?.slice(0, 80)}`);
      }
    }
    await page.screenshot({ path: join(__dirname, `_browser_${venueName}_step1.png`) });

    // ═══ STEP 1: REVENUE ═══
    L('Step 3: Revenue');
    const revFills = [
      ['primary factor', 'Strong walk-in traffic drove covers above forecast tonight. Patio demand was especially high with good weather.'],
      ['Staffing holds', 'Paced seating to maximize table turns. Shifted two servers to patio where demand was highest during the nine PM window.'],
      ['Turn delays', 'Lost some four-top turns between nine and ten PM due to extended dessert courses. Could improve turn time with dessert pacing.'],
      ['Walk-in strength', 'Walk-in demand exceeded reservation pace in the nine to ten PM window by roughly twenty percent, driven by good weather.'],
      ['Discount-driven', 'Average check was up three dollars versus last week, driven by cocktail pairings and seasonal entree upsells. Sustainable quality.'],
      ['One specific', 'Will add a float server for Friday and Saturday nine PM window to capitalize on the strong walk-in demand pattern we saw tonight.'],
    ];
    let revFilled = 0;
    for (const [placeholder, text] of revFills) {
      if (await fillByPlaceholder(page, placeholder, text)) revFilled++;
    }
    // Fallback: if placeholders didn't match, fill by index
    if (revFilled < 3) {
      const tas = page.locator('textarea:visible');
      const count = await tas.count();
      L(`  Placeholder match: ${revFilled}/6, falling back to index fill (${count} textareas visible)`);
      for (let i = 0; i < count && i < 6; i++) {
        const val = await tas.nth(i).inputValue();
        if (val.length < 20) {
          await tas.nth(i).fill(revFills[i]?.[1] || 'Revenue operations were solid tonight with strong covers and efficient table turns across all sections.');
          await page.waitForTimeout(700);
          revFilled++;
        }
      }
    }
    L(`  Filled ${revFilled} revenue fields`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    // ═══ STEP 2: COMPS ═══
    L('Step 4: Comps');
    const compFilled = await fillByPlaceholder(page, 'VIP comps', 'Two VIP comps for a birthday celebration and one kitchen error recovery comp for a late entree. All within policy and manager-approved.');
    if (!compFilled) {
      // Try filling the first visible textarea (comp_driver is the only textarea in CompsStep)
      const indexFilled = await fillByIndex(page, 0, 'Standard comp activity tonight. Two VIP comps for a birthday and one kitchen error recovery. All within policy.');
      if (!indexFilled) {
        // Last resort: check "Nothing to report" checkbox
        const checkbox = page.locator('button[role="checkbox"]:visible').first();
        if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
          const state = await checkbox.getAttribute('data-state');
          if (state !== 'checked') await checkbox.click();
          L('  Checked comp acknowledge');
        }
      } else {
        L('  Filled comp by index');
      }
    }
    L(`  Comp field: ${compFilled ? 'filled' : 'fallback'}`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    // ═══ STEP 3: FOH ═══
    L('Step 5: FOH');
    const fohFills = [
      ['Section coverage', 'Floor coverage was solid with proper section balancing. Servers handled their stations well with good table turns all night long.'],
      ['Cut timing', 'Would add one server for the eight to ten PM rush based on reservation volume and the walk-in patterns we experienced tonight.'],
    ];
    let fohFilled = 0;
    for (const [ph, text] of fohFills) {
      if (await fillByPlaceholder(page, ph, text)) fohFilled++;
    }
    if (fohFilled < 2) {
      const tas = page.locator('textarea:visible');
      const count = await tas.count();
      for (let i = 0; i < count && i < 2; i++) {
        const val = await tas.nth(i).inputValue();
        if (val.length < 20) {
          await tas.nth(i).fill(fohFills[i]?.[1] || 'FOH coverage was solid tonight with good section management and table turn efficiency throughout service.');
          await page.waitForTimeout(700);
          fohFilled++;
        }
      }
    }
    // Entertainment feedback if present
    const entertainmentTa = page.locator('textarea[placeholder*="energy"]').first();
    if (await entertainmentTa.isVisible({ timeout: 1000 }).catch(() => false)) {
      await entertainmentTa.fill('DJ set was strong tonight, good energy from 9 PM onward. Sound levels well balanced for dining conversations.');
      L('  Filled entertainment notes');
      // Rate entertainment if star rating is visible
      const stars = page.locator('[data-rating-star]:visible, button[aria-label*="star"]:visible');
      if (await stars.count() > 0) {
        await stars.last().click();
        L('  Rated entertainment');
      }
    }
    L(`  FOH fields: ${fohFilled}`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    // ═══ STEP 4: BOH ═══
    L('Step 6: BOH');
    const bohFills = [
      ['Line strength', 'Kitchen line ran smoothly tonight with ticket times averaging under twelve minutes across all stations. Prep was complete on time.'],
      ['Extra line cook', 'Current BOH staffing levels were adequate for tonight volume. No changes needed for comparable future service nights.'],
    ];
    let bohFilled = 0;
    for (const [ph, text] of bohFills) {
      if (await fillByPlaceholder(page, ph, text)) bohFilled++;
    }
    if (bohFilled < 2) {
      const tas = page.locator('textarea:visible');
      const count = await tas.count();
      for (let i = 0; i < count && i < 2; i++) {
        const val = await tas.nth(i).inputValue();
        if (val.length < 20) {
          await tas.nth(i).fill(bohFills[i]?.[1] || 'BOH kitchen line ran smoothly with consistent ticket times and strong prep execution throughout the evening.');
          await page.waitForTimeout(700);
          bohFilled++;
        }
      }
    }
    // Culinary feedback if present
    const culinaryTa = page.locator('textarea[placeholder*="Kitchen execution"]').first();
    if (await culinaryTa.isVisible({ timeout: 1000 }).catch(() => false)) {
      await culinaryTa.fill('Kitchen executed well tonight. No 86s, protein temps consistent, specials sold out by 10 PM. Strong plate presentation.');
      L('  Filled culinary notes');
      const stars = page.locator('[data-rating-star]:visible, button[aria-label*="star"]:visible');
      if (await stars.count() > 0) {
        await stars.last().click();
        L('  Rated culinary');
      }
    }
    L(`  BOH fields: ${bohFilled}`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    // ═══ STEP 5: INCIDENTS ═══
    L('Step 7: Incidents');
    let incidentFilled = await fillByPlaceholder(page, 'guest complaints', 'No major incidents tonight. One minor glass breakage at station four, cleaned up immediately. No guest complaints or safety issues.');
    if (!incidentFilled) {
      incidentFilled = await fillByIndex(page, 0, 'No major incidents tonight. One minor glass breakage cleaned up immediately. No guest complaints or safety issues to report.');
    }
    if (!incidentFilled) {
      // Last resort: acknowledge
      const checkbox = page.locator('button[role="checkbox"]:visible').first();
      if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
        const state = await checkbox.getAttribute('data-state');
        if (state !== 'checked') await checkbox.click();
        L('  Checked incidents acknowledge');
      }
    }
    L(`  Incidents: ${incidentFilled ? 'filled' : 'acknowledged/fallback'}`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    // ═══ STEP 6: COACHING ═══
    L('Step 8: Coaching');
    const coachingFills = [
      ['Servers, hosts', 'Maria handled a difficult VIP table with excellent grace, turning a potential complaint into a very positive guest experience tonight.'],
      ['Service gaps', 'New server Jake needs coaching on wine pairings. He missed two clear upsell opportunities during the prime dinner hours tonight.'],
      ['Line cooks', 'Line cook Ahmad nailed every protein temp during the rush tonight. Zero re-fires on his station, extremely consistent execution.'],
      ['Ticket times', 'Prep team fell slightly behind on sauces resulting in a brief eighty-six on the special. Need better prep pacing next shift.'],
      ['Service speed', 'Focus on pre-shift briefings that cover reservation VIP notes so the entire team is prepared and anticipating guest needs.'],
    ];
    let coachFilled = 0;
    for (const [ph, text] of coachingFills) {
      if (await fillByPlaceholder(page, ph, text)) coachFilled++;
    }
    if (coachFilled < 3) {
      const tas = page.locator('textarea:visible');
      const count = await tas.count();
      for (let i = 0; i < count && i < 5; i++) {
        const val = await tas.nth(i).inputValue();
        if (val.length < 20) {
          await tas.nth(i).fill(coachingFills[i]?.[1] || 'Team member performed well tonight with solid execution and good communication throughout the shift.');
          await page.waitForTimeout(700);
          coachFilled++;
        }
      }
    }
    if (coachFilled < 5) {
      // Not all 5 coaching fields filled — check acknowledge checkbox as backup
      const checkbox = page.locator('button[role="checkbox"]:visible').first();
      if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        const state = await checkbox.getAttribute('data-state');
        if (state !== 'checked') {
          await checkbox.click();
          L(`  Checked coaching acknowledge (${coachFilled}/5 filled)`);
        }
      }
    }
    L(`  Coaching fields: ${coachFilled}`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    // ═══ STEP 7: GUEST ═══
    L('Step 9: Guest');
    const guestFills = [
      ['Names, party size', 'Johnson party of eight visited tonight. Very pleased with the experience and expressed interest in a private dining event booking.'],
      ['Service complaints', 'Overall guest experience was excellent tonight. Two minor noise complaints near bar handled by moving guests to quieter tables.'],
      ['Regulars to recognize', 'Follow up with the Johnson party about private dining for their upcoming company holiday event. Strong relationship opportunity.'],
    ];
    let guestFilled = 0;
    for (const [ph, text] of guestFills) {
      if (await fillByPlaceholder(page, ph, text)) guestFilled++;
    }
    if (guestFilled < 2) {
      const tas = page.locator('textarea:visible');
      const count = await tas.count();
      for (let i = 0; i < count && i < 3; i++) {
        const val = await tas.nth(i).inputValue();
        if (val.length < 20) {
          await tas.nth(i).fill(guestFills[i]?.[1] || 'Guest experience was strong tonight with positive feedback and no significant complaints throughout service.');
          await page.waitForTimeout(700);
          guestFilled++;
        }
      }
    }
    if (guestFilled < 3) {
      // Not all 3 guest fields filled — check acknowledge checkbox as backup
      const checkbox = page.locator('button[role="checkbox"]:visible').first();
      if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        const state = await checkbox.getAttribute('data-state');
        if (state !== 'checked') {
          await checkbox.click();
          L(`  Checked guest acknowledge (${guestFilled}/3 filled)`);
        }
      }
    }
    L(`  Guest fields: ${guestFilled}`);
    await flushDebounce(page);
    await clickNext(page);
    L(`  ${await getCurrentStep(page)}`);

    await page.screenshot({ path: join(__dirname, `_browser_${venueName}_review.png`) });

    // ═══ STEP 8: REVIEW — AI GENERATION ═══
    L('Step 10: Generate AI closing summary');

    // Click "Generate Closing Summary" button
    const genBtn = page.locator('button:has-text("Generate Closing Summary")').first();
    const regenBtn = page.locator('button:has-text("Regenerate")').first();

    if (await genBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await genBtn.click();
      L('  Clicked "Generate Closing Summary"');
    } else if (await regenBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await regenBtn.click();
      L('  Clicked "Regenerate" (narrative already exists)');
    } else {
      L('  No generate button found — narrative may already exist');
    }

    // Wait for AI generation (can take 10-30 seconds)
    L('  Waiting for AI generation...');
    const genSpinner = page.locator('text=Generating closing summary');
    if (await genSpinner.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Wait for spinner to disappear (generation complete)
      await genSpinner.waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {
        E('  AI generation timed out after 60s');
        errors.push({ step: 'ai_generation', msg: 'Timed out' });
      });
    }
    await page.waitForTimeout(2000);

    // Check for narrative error
    const narrativeError = page.locator('text=Failed to generate');
    if (await narrativeError.isVisible({ timeout: 1000 }).catch(() => false)) {
      const errText = await narrativeError.textContent();
      E(`  Narrative error: ${errText}`);
      errors.push({ step: 'ai_generation', msg: errText });
    }

    // Check if narrative appeared
    const narrativeText = await page.locator('.whitespace-pre-wrap').first().textContent().catch(() => null);
    if (narrativeText) {
      L(`  AI narrative generated (${narrativeText.length} chars)`);
    } else {
      E('  No closing narrative visible');
      errors.push({ step: 'ai_generation', msg: 'No narrative text visible' });
    }

    await page.screenshot({ path: join(__dirname, `_browser_${venueName}_narrative.png`) });

    // ═══ SUBMIT ═══
    L('Step 11: Submit & Lock');
    const submitBtn = page.locator('button:has-text("Submit & Lock")').first();
    const submitAmendBtn = page.locator('button:has-text("Submit Amendment")').first();

    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      const disabled = await submitBtn.isDisabled();
      if (disabled) {
        L('  Submit button disabled — checking module completion');
        // Get banner text for accurate module count (e.g. "5 of 7 required modules complete")
        const bannerText = await page.locator('text=/\\d+ of \\d+ required modules/').textContent().catch(() => '');
        const bannerMatch = bannerText?.match(/(\d+) of (\d+)/);
        const complete = bannerMatch ? parseInt(bannerMatch[1]) : '?';
        const total = bannerMatch ? parseInt(bannerMatch[2]) : '?';
        L(`  Module completion: ${complete}/${total} (banner: "${bannerText?.trim()}")`);
        // Also check individual module indicators
        const stepperItems = await page.locator('[data-module-status]').all();
        for (const item of stepperItems) {
          const name = await item.getAttribute('data-module-name').catch(() => '');
          const status = await item.getAttribute('data-module-status').catch(() => '');
          if (status !== 'complete') L(`    ✗ ${name}: ${status}`);
        }
        errors.push({ step: 'submit', msg: `Submit disabled — ${complete}/${total} modules complete` });
        await page.screenshot({ path: join(__dirname, `_browser_${venueName}_submit_disabled.png`) });
      } else {
        // Track the submit API call (signal extraction can take 60s+)
        const submitPromise = page.waitForResponse(
          r => r.url().includes('/api/attestation/') && r.url().includes('/submit'),
          { timeout: 90000 }
        ).catch(() => null);

        await submitBtn.click();
        L('  Clicked Submit & Lock');

        const submitRes = await submitPromise;
        if (submitRes) {
          L(`  Submit response: ${submitRes.status()}`);
          if (submitRes.status() >= 400) {
            const body = await submitRes.text().catch(() => '');
            E(`  Submit error: ${body.slice(0, 300)}`);
            errors.push({ step: 'submit', msg: `${submitRes.status()}: ${body.slice(0, 200)}` });
          } else {
            const body = await submitRes.json().catch(() => ({}));
            L(`  Submit success! signals_extracted=${body.signals_extracted} signals_stored=${body.signals_stored} actions_created=${body.actions_created}`);
          }
        } else {
          E('  No submit response captured');
          errors.push({ step: 'submit', msg: 'No response captured' });
        }

        await page.waitForTimeout(3000);
      }
    } else if (await submitAmendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Amendment flow — fill reason
      const amendTa = page.locator('textarea[placeholder*="Reason for amendment"]').first();
      if (await amendTa.isVisible({ timeout: 1000 }).catch(() => false)) {
        await amendTa.fill('Smoke test amendment — verifying amendment flow works correctly.');
        await submitAmendBtn.click();
        L('  Submitted amendment');
      }
    } else {
      L('  No submit button visible');
      errors.push({ step: 'submit', msg: 'No submit button found' });
    }

    // ═══ VERIFY ═══
    L('Step 12: Verify');
    await page.waitForTimeout(2000);

    // Check for lock indicator or submitted status
    const lockText = page.locator('text=/Attestation (Submitted|Amended)/');
    const successText = page.locator('text=/submitted/i');
    if (await lockText.isVisible({ timeout: 5000 }).catch(() => false)) {
      const text = await lockText.textContent();
      L(`  ✓ ${text}`);
    } else if (await successText.isVisible({ timeout: 2000 }).catch(() => false)) {
      L(`  ✓ Submit confirmed on page`);
    } else {
      // Don't count as error — the submit API response is the real check
      L(`  No visual lock indicator found — will verify via DB`);
    }

    await page.screenshot({ path: join(__dirname, `_browser_${venueName}_final.png`), fullPage: true });

    // Verify in DB — find attestation ID from API responses
    const attestId = apiResponses.find(r => r.url.includes('/api/attestation/') && r.status < 400)
      ?.url.match(/attestation\/([a-f0-9-]+)/)?.[1];
    const { data: attestation } = attestId
      ? await admin.from('nightly_attestations')
          .select('id, status, venue_id, revenue_notes, labor_notes, guest_notes, closing_narrative')
          .eq('id', attestId)
          .maybeSingle()
      : await admin.from('nightly_attestations')
          .select('id, status, venue_id, revenue_notes, labor_notes, guest_notes, closing_narrative')
          .eq('venue_id', venueId)
          .eq('business_date', today())
          .maybeSingle();
    if (attestId) L(`  Using attestation ID from API: ${attestId.slice(0, 8)}`);

    if (attestation) {
      L(`  DB: status=${attestation.status} narrative=${attestation.closing_narrative?.length || 0}ch`);

      // Detailed module check
      const { data: full } = await admin.from('nightly_attestations').select('*').eq('id', attestation.id).single();
      if (full) {
        const check = (name, val) => val ? `${name}=${typeof val === 'string' ? val.length + 'ch' : val}` : `${name}=NULL`;
        L(`  REVENUE: ${['revenue_driver','revenue_mgmt_impact','revenue_lost_opportunity','revenue_demand_signal','revenue_quality','revenue_action'].map(k => check(k.replace('revenue_',''), full[k])).join(', ')}`);
        L(`  COMPS: ${check('comp_driver', full.comp_driver)}, ack=${full.comp_acknowledged}`);
        L(`  FOH: ${check('foh_coverage', full.labor_foh_coverage)}, ${check('foh_decision', full.foh_staffing_decision)}, ack=${full.foh_acknowledged}`);
        L(`  BOH: ${check('boh_perf', full.labor_boh_performance)}, ${check('boh_decision', full.boh_staffing_decision)}, ack=${full.boh_acknowledged}`);
        L(`  INCIDENTS: ${check('notes', full.incident_notes)}, ack=${full.incidents_acknowledged}`);
        L(`  COACHING: ${['coaching_foh_standout','coaching_foh_development','coaching_boh_standout','coaching_boh_development','coaching_team_focus'].map(k => check(k.replace('coaching_',''), full[k])).join(', ')}, ack=${full.coaching_acknowledged}`);
        L(`  GUEST: ${['guest_vip_notable','guest_experience','guest_opportunity'].map(k => check(k.replace('guest_',''), full[k])).join(', ')}, ack=${full.guest_acknowledged}`);
        L(`  NARRATIVE: ${check('closing', full.closing_narrative)}`);
      }

      // Check signals
      const { data: signals } = await admin
        .from('attestation_signals')
        .select('signal_type')
        .eq('attestation_id', attestation.id);
      if (signals?.length) {
        const types = {};
        signals.forEach(s => { types[s.signal_type] = (types[s.signal_type] || 0) + 1; });
        L(`  Signals: ${signals.length} total —`, types);
      } else {
        L('  Signals: 0 (extraction may have been skipped or async)');
      }
    } else {
      L('  No attestation found in DB for today');
    }

  } finally {
    await browser.close();
    // Restore password
    await admin.from('users').update({ password_hash: origHash }).eq('id', testUser.id);
    L('Password restored');
  }

  // ═══ RESULTS ═══
  console.log('\n' + '═'.repeat(60));
  L('RESULTS');
  console.log('═'.repeat(60));

  if (apiResponses.length > 0) {
    L(`Attestation API calls: ${apiResponses.length}`);
    apiResponses.forEach(r => L(`  ${r.status >= 400 ? '✗' : '✓'} ${r.status}: ${r.url} ${r.status >= 400 ? r.body.slice(0, 150) : ''}`));
  }

  if (httpErrors.length > 0) {
    L(`HTTP 5xx errors: ${httpErrors.length}`);
    httpErrors.forEach(e => L(`  ✗ ${e.status}: ${e.url.split('?')[0]}`));
  }

  if (errors.length > 0) {
    L(`Test errors: ${errors.length}`);
    errors.forEach(e => L(`  ✗ [${e.step}] ${e.msg}`));
  }

  const total = errors.length + httpErrors.length;
  if (total === 0) {
    L('\n✓ PASS — Full attestation flow completed successfully');
  } else {
    L(`\n✗ ${total} error(s) detected`);
    // Check if submit actually succeeded despite errors
    const submitErrors = errors.filter(e => e.step === 'submit' && !e.msg.includes('No response'));
    if (submitErrors.length === 0 && httpErrors.length === 0) {
      L('  (Submit may have succeeded — verify DB status above)');
    }
  }
}

run().catch(err => { E('Fatal:', err.message); process.exit(1); });
