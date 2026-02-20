/**
 * Explore Restaurant Activity Report leads portal
 * Phase 1: Dump the login page HTML to find exact selectors and API endpoints
 * Phase 2: Try direct API authentication
 * Phase 3: If browser needed, attempt with reCAPTCHA handling
 */
import { chromium, type Page } from 'playwright';
import * as fs from 'fs';

const EMAIL = process.env.RAR_EMAIL!;
const PASSWORD = process.env.RAR_PASSWORD!;
const BASE_URL = 'https://leads.restaurantactivityreport.com';

async function main() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100, // slow down to appear more human
  });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  // Capture ALL network traffic
  const allRequests: { url: string; method: string; headers: Record<string, string>; postData?: string }[] = [];
  const allResponses: { url: string; status: number; headers: Record<string, string>; body?: string }[] = [];

  page.on('request', request => {
    allRequests.push({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      postData: request.postData() || undefined,
    });
  });

  page.on('response', async response => {
    const entry: typeof allResponses[0] = {
      url: response.url(),
      status: response.status(),
      headers: response.headers(),
    };
    try {
      const ct = response.headers()['content-type'] || '';
      if (ct.includes('json') || ct.includes('text')) {
        entry.body = (await response.text()).substring(0, 5000);
      }
    } catch {}
    allResponses.push(entry);
  });

  console.log('Phase 1: Loading login page to discover structure...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000); // let SPA fully render

  console.log('Current URL:', page.url());

  // Dump the full page HTML
  const html = await page.content();
  fs.writeFileSync('scripts/screenshots/login-page.html', html);
  console.log('Saved full HTML to login-page.html');

  // Find all input elements with their full attributes
  const inputDetails = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(input => ({
      tag: input.tagName,
      type: input.type,
      name: input.name,
      id: input.id,
      placeholder: input.placeholder,
      className: input.className,
      ngModel: input.getAttribute('ng-model'),
      formControlName: input.getAttribute('formcontrolname'),
      ariaLabel: input.getAttribute('aria-label'),
      visible: input.offsetParent !== null,
      rect: input.getBoundingClientRect(),
      parentHTML: input.parentElement?.outerHTML?.substring(0, 200) || '',
    }));
  });

  console.log('\n=== ALL INPUT ELEMENTS ===');
  inputDetails.forEach((input, i) => {
    console.log(`Input ${i}:`, JSON.stringify(input, null, 2));
  });

  // Find the form structure
  const formDetails = await page.evaluate(() => {
    const forms = Array.from(document.querySelectorAll('form'));
    return forms.map(form => ({
      id: form.id,
      action: form.action,
      method: form.method,
      className: form.className,
      ngSubmit: form.getAttribute('ng-submit'),
      innerHTML: form.innerHTML.substring(0, 2000),
    }));
  });

  console.log('\n=== FORM ELEMENTS ===');
  formDetails.forEach((form, i) => {
    console.log(`Form ${i}:`, JSON.stringify(form, null, 2));
  });

  // Check for Angular/API configuration in page scripts
  const scriptContent = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    return scripts.map(s => ({
      src: s.src,
      content: s.textContent?.substring(0, 1000) || '',
    })).filter(s => s.src || s.content.length > 10);
  });

  console.log('\n=== SCRIPTS ===');
  scriptContent.forEach((s, i) => {
    if (s.src) console.log(`Script ${i}: src=${s.src}`);
    if (s.content) console.log(`Script ${i}: inline=${s.content.substring(0, 200)}`);
  });

  // Now attempt to fill in the form using various selector strategies
  console.log('\n=== ATTEMPTING LOGIN ===');

  // Strategy 1: Try by ng-model
  let emailFilled = false;
  for (const selector of [
    'input[ng-model*="email"]',
    'input[ng-model*="user"]',
    'input[formcontrolname="email"]',
    'input[type="email"]',
    'input[type="text"]',
    'input[placeholder*="Email" i]',
    'input[placeholder*="email" i]',
    'input[name="email"]',
    'input[name="username"]',
    'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])',
  ]) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click();
        await el.fill(EMAIL);
        console.log(`Email filled with selector: ${selector}`);
        emailFilled = true;
        break;
      }
    } catch {}
  }

  if (!emailFilled) {
    // Try clicking at the position where the Email Address field appeared in the screenshot
    // It was centered horizontally, about 170px from top of form area
    console.log('Trying click-and-type approach for email...');
    try {
      await page.click('text=Email Address');
      await page.waitForTimeout(500);
      await page.keyboard.type(EMAIL, { delay: 50 });
      emailFilled = true;
      console.log('Email filled via text click approach');
    } catch (e) {
      console.log('Text click failed, trying coordinate click...');
      try {
        // Click near the email field position from screenshot
        await page.mouse.click(726, 171);
        await page.waitForTimeout(500);
        await page.keyboard.type(EMAIL, { delay: 50 });
        emailFilled = true;
        console.log('Email filled via coordinate click');
      } catch {}
    }
  }

  // Password
  let passwordFilled = false;
  for (const selector of [
    'input[type="password"]',
    'input[ng-model*="password"]',
    'input[placeholder*="Password" i]',
    'input[name="password"]',
  ]) {
    try {
      const el = page.locator(selector).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.click();
        await el.fill(PASSWORD);
        console.log(`Password filled with selector: ${selector}`);
        passwordFilled = true;
        break;
      }
    } catch {}
  }

  if (!passwordFilled) {
    console.log('Trying click-and-type approach for password...');
    try {
      await page.click('text=Password');
      await page.waitForTimeout(500);
      await page.keyboard.type(PASSWORD, { delay: 50 });
      passwordFilled = true;
      console.log('Password filled via text click approach');
    } catch {}
  }

  await page.screenshot({ path: 'scripts/screenshots/03-credentials-filled.png', fullPage: true });
  console.log(`\nLogin form status: email=${emailFilled}, password=${passwordFilled}`);

  // Handle reCAPTCHA
  console.log('\nAttempting reCAPTCHA...');
  try {
    // reCAPTCHA is in an iframe
    const recaptchaFrame = page.frameLocator('iframe[src*="recaptcha"]');
    const checkbox = recaptchaFrame.locator('.recaptcha-checkbox-border, #recaptcha-anchor');
    if (await checkbox.isVisible({ timeout: 3000 })) {
      await checkbox.click();
      console.log('Clicked reCAPTCHA checkbox');
      await page.waitForTimeout(3000);

      // Check if challenge appeared (image selection)
      const challengeFrame = page.frameLocator('iframe[src*="recaptcha"][title*="challenge"]');
      try {
        const challengeVisible = await challengeFrame.locator('.rc-imageselect-instructions').isVisible({ timeout: 2000 });
        if (challengeVisible) {
          console.log('reCAPTCHA image challenge appeared - cannot solve automatically');
          console.log('Will try to proceed without solving...');
        }
      } catch {
        console.log('No image challenge - reCAPTCHA may have passed!');
      }
    }
  } catch (e) {
    console.log('reCAPTCHA handling failed:', (e as Error).message?.substring(0, 100));
  }

  await page.screenshot({ path: 'scripts/screenshots/04-after-recaptcha.png', fullPage: true });

  // Click Sign In
  console.log('\nClicking Sign In...');
  try {
    const signInBtn = page.locator('button:has-text("Sign"), input[type="submit"], button[type="submit"]').first();
    await signInBtn.click();
    console.log('Clicked Sign In button');
  } catch {
    console.log('Could not find Sign In button via locator, trying text...');
    try {
      await page.click('text=Sign in');
    } catch {
      await page.click('text=Sign In');
    }
  }

  // Wait and see what happens
  await page.waitForTimeout(8000);
  console.log('\nPost-login URL:', page.url());
  await page.screenshot({ path: 'scripts/screenshots/05-post-login.png', fullPage: true });

  // Check if we're logged in (not on login page anymore)
  const isLoggedIn = !page.url().includes('login');
  console.log(`Logged in: ${isLoggedIn}`);

  if (isLoggedIn) {
    await exploreDashboard(page);
  } else {
    console.log('\nLogin did not succeed. Checking for error messages...');
    const errorText = await page.evaluate(() => {
      const errors = document.querySelectorAll('.error, .alert, [class*="error"], [class*="alert"], .text-danger, .text-red');
      return Array.from(errors).map(e => e.textContent?.trim()).filter(Boolean);
    });
    console.log('Error messages:', errorText);

    // Try to find API endpoints from the network log
    console.log('\n=== TRYING DIRECT API APPROACH ===');
    const apiEndpoints = allRequests.filter(r => r.url.includes('api') || r.url.includes('auth') || r.url.includes('login'));
    console.log('Auth-related requests:');
    apiEndpoints.forEach(r => console.log(`  ${r.method} ${r.url}`));

    const apiResponses = allResponses.filter(r => r.url.includes('api') || r.url.includes('auth') || r.url.includes('login'));
    console.log('Auth-related responses:');
    apiResponses.forEach(r => console.log(`  ${r.status} ${r.url} body=${r.body?.substring(0, 200)}`));
  }

  // Save everything
  fs.writeFileSync('scripts/screenshots/network-log.json', JSON.stringify({
    requests: allRequests.map(r => ({ url: r.url, method: r.method, postData: r.postData })),
    responses: allResponses.map(r => ({ url: r.url, status: r.status, body: r.body?.substring(0, 500) })),
  }, null, 2));

  console.log('\nAll data saved. Keeping browser open for 120 seconds for manual inspection...');
  await page.waitForTimeout(120000);
  await browser.close();
}

async function exploreDashboard(page: Page) {
  console.log('\n=== EXPLORING DASHBOARD ===\n');

  const structure = await page.evaluate(() => {
    const result: Record<string, any> = {};

    // Navigation
    const links = Array.from(document.querySelectorAll('a'));
    result.navigation = links.map(el => ({
      text: el.textContent?.trim(),
      href: el.href,
    })).filter(l => l.text);

    // Tables
    const tables = Array.from(document.querySelectorAll('table'));
    result.tables = tables.map((table, i) => {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(row =>
        Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim())
      );
      return { index: i, headers, rowCount: rows.length, sampleRows: rows.slice(0, 5) };
    });

    // Cards / data panels
    const panels = Array.from(document.querySelectorAll('.panel, .card, [class*="panel"], [class*="card"]'));
    result.panels = panels.map(p => ({
      className: p.className,
      text: p.textContent?.trim()?.substring(0, 200),
    }));

    // All visible text
    result.bodyText = document.body?.innerText?.substring(0, 5000);

    // Headings
    result.headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5')).map(h => h.textContent?.trim());

    return result;
  });

  console.log(JSON.stringify(structure, null, 2));

  // Navigate to each main section
  const navLinks = await page.locator('a, [ui-sref]').all();
  const visitedUrls = new Set<string>();

  for (const link of navLinks) {
    try {
      const text = (await link.textContent())?.trim() || '';
      const href = (await link.getAttribute('href')) || '';
      if (!text || visitedUrls.has(href) || text.length > 50) continue;
      if (/lead|report|restaurant|database|search|list|data|download|export/i.test(text)) {
        visitedUrls.add(href);
        console.log(`\nNavigating to: "${text}" (${href})`);
        await link.click();
        await page.waitForTimeout(3000);
        console.log('URL:', page.url());

        const safeName = text.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 30);
        await page.screenshot({ path: `scripts/screenshots/nav-${safeName}.png`, fullPage: true });

        // Extract table data
        const tableData = await page.evaluate(() => {
          const tables = Array.from(document.querySelectorAll('table'));
          return tables.map((table) => {
            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent?.trim());
            const rows = Array.from(table.querySelectorAll('tbody tr')).map(row =>
              Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim())
            );
            return { headers, rows };
          });
        });

        if (tableData.length > 0) {
          tableData.forEach((t, i) => {
            console.log(`  Table ${i}: ${t.headers?.join(', ')} (${t.rows.length} rows)`);
            t.rows.slice(0, 3).forEach((row, j) => console.log(`    Row ${j}: ${row.join(' | ')}`));
          });

          // Save table data
          fs.writeFileSync(`scripts/screenshots/data-${safeName}.json`, JSON.stringify(tableData, null, 2));
        }
      }
    } catch {}
  }
}

main().catch(console.error);
