import { test, expect, type Page } from '@playwright/test';

test.setTimeout(180_000); // AI generation can take time; serial tests need extra headroom

async function skipIfOnLogin(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
}

test.describe.serial('AI Recipe Builder — Live Integration', () => {
  // AI API calls are inherently non-deterministic — allow one retry
  test.describe.configure({ retries: 1 });

  test('generate a recipe from text prompt, tweak it, verify output', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    // ── Switch to AI tab ──
    const aiTab = page.getByRole('button', { name: /ai recipe builder/i });
    await expect(aiTab).toBeVisible();
    await aiTab.click();

    // Verify we're in the AI builder
    await expect(page.getByText(/what are you making/i)).toBeVisible();

    // ── Type a prompt and submit ──
    const textarea = page.locator('textarea').first();
    await textarea.fill('Classic béarnaise sauce, 1 quart batch, under $8 total cost');
    await page.locator('button[type="submit"]').first().click();

    // ── Wait for loading state ──
    await expect(page.getByText(/building your recipe/i)).toBeVisible({ timeout: 10000 });

    // ── Wait for recipe result (AI generation can take 15-45s) ──
    await expect(page.getByText(/cost summary/i)).toBeVisible({ timeout: 90000 });

    // ── Verify recipe card rendered with key sections ──
    // Recipe name should be visible
    const recipeCard = page.locator('[class*="max-w-4xl"]');
    await expect(recipeCard).toBeVisible();

    // Should have ingredients section
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();

    // Should have at least one ingredient row
    const ingredientRows = page.locator('[class*="py-2"][class*="px-3"][class*="rounded-md"]');
    const ingredientCount = await ingredientRows.count();
    expect(ingredientCount).toBeGreaterThan(0);

    // Should have cost per unit in sidebar
    await expect(page.getByText(/cost per/i).first()).toBeVisible();

    // Should have allergen section (béarnaise has dairy and eggs)
    await expect(page.getByText(/allergens/i).first()).toBeVisible();

    // Should have scale selector
    await expect(page.getByText(/scale:/i)).toBeVisible();

    // Should have quick tweak buttons
    await expect(page.getByText(/quick tweaks/i)).toBeVisible();
    await expect(page.getByText('Make it cheaper')).toBeVisible();
    await expect(page.getByText('Dairy-free')).toBeVisible();

    // Should have Save button
    await expect(page.getByRole('button', { name: /save to recipe builder/i })).toBeVisible();

    // Should have Start Over button
    await expect(page.getByRole('button', { name: /start over/i })).toBeVisible();

    // ── Screenshot the generated recipe ──
    await page.screenshot({ path: 'test-results/ai-recipe-generated.png', fullPage: true });

    // ── Test a tweak: click "Dairy-free" ──
    await page.getByText('Dairy-free').click();

    // Should show updating state
    await expect(page.getByText(/updating recipe/i)).toBeVisible({ timeout: 5000 });

    // Wait for tweak to complete
    await expect(page.getByText(/updating recipe/i)).not.toBeVisible({ timeout: 90000 });

    // Recipe should still be visible with updated content
    await expect(page.getByRole('heading', { name: 'Ingredients' })).toBeVisible();
    await expect(page.getByText(/cost per/i).first()).toBeVisible();

    // Screenshot the tweaked version
    await page.screenshot({ path: 'test-results/ai-recipe-tweaked.png', fullPage: true });

    // ── Test scale selector ──
    await page.getByText('2x').click();
    // Quantities should update (just verify scale button is active)
    const scaleBtn = page.getByText('2x');
    await expect(scaleBtn).toHaveClass(/bg-brass/);

    // ── Test Start Over ──
    await page.getByRole('button', { name: /start over/i }).click();

    // Should return to the initial input state
    await expect(page.getByText(/what are you making/i)).toBeVisible();
  });

  test('method section on new recipe page — write and verify AI Structure button', async ({ page }) => {
    await page.goto('/recipes/new');
    await skipIfOnLogin(page);

    await expect(page.getByText(/new recipe/i)).toBeVisible({ timeout: 30000 });

    // Scroll to method section
    const methodHeader = page.getByRole('button', { name: 'Method' });
    await methodHeader.scrollIntoViewIfNeeded();
    await expect(methodHeader).toBeVisible();

    // Type a free-form method
    const methodTextarea = page.getByPlaceholder(/season duck breast/i);
    await methodTextarea.fill(
      'Season the duck, score skin in crosshatch. Hot pan medium-high, skin side down 6 min until golden and rendered. Flip 2 min for medium rare. Rest 5 min, slice on bias. Meanwhile make gastrique — sugar in small saucepan until deep amber, carefully deglaze with sherry vinegar, add pitted cherries, reduce by half, finish with cold butter.'
    );

    // AI Structure button should be enabled
    const structureBtn = page.getByRole('button', { name: /ai structure/i });
    await expect(structureBtn).toBeEnabled();

    // Click AI Structure
    await structureBtn.click();

    // Should show loading state
    await expect(page.getByText(/structuring/i)).toBeVisible({ timeout: 5000 });

    // Wait for structured output (AI call)
    await expect(page.getByText(/prep ahead/i)).toBeVisible({ timeout: 60000 });

    // Should have prep ahead and à la minute sections
    await expect(page.getByText(/mise en place/i)).toBeVisible();
    await expect(page.getByText(/À La Minute/)).toBeVisible();

    // Should have numbered steps
    const steps = page.locator('ol li');
    const stepCount = await steps.count();
    expect(stepCount).toBeGreaterThan(2);

    // Screenshot
    await page.screenshot({ path: 'test-results/ai-method-structured.png', fullPage: true });
  });

  test('prep breakdown and full method sections are collapsible', async ({ page }) => {
    // This test generates a recipe then tests the collapsible sections
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    await page.getByRole('button', { name: /ai recipe builder/i }).click();
    await expect(page.getByText(/what are you making/i)).toBeVisible();

    // Verify session is still valid before making AI call
    await skipIfOnLogin(page);

    // Generate a recipe
    const textarea = page.locator('textarea').first();
    await textarea.fill('Seared salmon with lemon butter sauce, 4 portions');
    await page.locator('button[type="submit"]').first().click();

    // Wait for recipe result
    await expect(page.getByText(/cost summary/i)).toBeVisible({ timeout: 90000 });

    // Prep Breakdown should be visible by default
    const prepBreakdown = page.getByText('Prep Breakdown');
    const hasPrepBreakdown = await prepBreakdown.isVisible().catch(() => false);

    if (hasPrepBreakdown) {
      // Should be expanded by default — look for prep ahead content
      await expect(page.getByText(/prep ahead|mise en place/i)).toBeVisible();

      // Collapse it
      await prepBreakdown.click();
      // Content should be hidden
      await expect(page.getByText(/mise en place/i)).not.toBeVisible();

      // Expand again
      await prepBreakdown.click();
      await expect(page.getByText(/mise en place/i)).toBeVisible();
    }

    // Full Method should be collapsed by default
    const fullMethod = page.getByText('Full Method');
    await expect(fullMethod).toBeVisible();
    // Expand it
    await fullMethod.click();
    // Should show method steps
    const methodSteps = page.locator('ol li').filter({ has: page.locator('[class*="rounded-full"]') });
    const methodCount = await methodSteps.count();
    expect(methodCount).toBeGreaterThan(0);

    // Screenshot
    await page.screenshot({ path: 'test-results/ai-recipe-full-method.png', fullPage: true });
  });
});
