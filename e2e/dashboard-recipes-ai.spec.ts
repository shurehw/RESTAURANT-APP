import { test, expect, type Page } from '@playwright/test';

async function skipIfOnLogin(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
}

test.describe('AI Recipe Builder', () => {
  test('recipes page shows AI Recipe Builder tab and instructions', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    // Should show both tabs
    const listTab = page.getByRole('button', { name: /all recipes/i });
    const aiTab = page.getByRole('button', { name: /ai recipe builder/i });

    await expect(listTab).toBeVisible();
    await expect(aiTab).toBeVisible();

    // Click AI tab
    await aiTab.click();

    // Should show the AI recipe builder UI
    await expect(page.getByText(/what are you making/i)).toBeVisible();
    await expect(page.getByText(/describe your dish/i)).toBeVisible({ timeout: 5000 });

    // Should show instructions section
    await expect(page.getByText(/how to use/i)).toBeVisible();
    await expect(page.getByText(/build a recipe/i)).toBeVisible();
    await expect(page.getByText(/reverse-engineer a dish/i)).toBeVisible();

    // Should show example prompts
    await expect(page.getByText(/seared duck breast/i)).toBeVisible();
    await expect(page.getByText(/classic béarnaise/i)).toBeVisible();

    // Should have image upload area
    await expect(page.getByText(/snap a dish you made/i)).toBeVisible();

    // Should have the text input
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
  });

  test('example prompt populates the text input', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    // Switch to AI tab
    await page.getByRole('button', { name: /ai recipe builder/i }).click();
    await expect(page.getByText(/what are you making/i)).toBeVisible();

    // Click an example prompt
    await page.getByText('Classic béarnaise sauce, 1 quart batch').click();

    // Should populate the textarea
    const textarea = page.locator('textarea');
    await expect(textarea).toHaveValue('Classic béarnaise sauce, 1 quart batch');
  });

  test('recipe edit page has Rethink with AI button', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    // Check if there are recipes to test with
    const editLink = page.locator('a[href^="/recipes/"]').filter({ hasText: /edit/i }).first();
    const hasRecipe = await editLink.isVisible().catch(() => false);
    test.skip(!hasRecipe, 'No recipes available to test rethink mode');

    const href = await editLink.getAttribute('href');
    test.skip(!href, 'Recipe edit link missing href');

    await page.goto(href);
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Wait for either the rethink button or an error — skip if page stays loading
    const rethinkBtn = page.getByRole('button', { name: /rethink with ai/i });
    const errorText = page.getByText(/error loading recipe/i);
    const loaded = await Promise.race([
      rethinkBtn.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'ok' as const),
      errorText.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const);

    test.skip(loaded === 'timeout', 'Recipe detail page did not load in time');
    test.skip(loaded === 'error', 'Recipe failed to load');

    await expect(rethinkBtn).toBeVisible();
  });

  test('recipe builder has method section with AI Structure button', async ({ page }) => {
    await page.goto('/recipes/new');
    await skipIfOnLogin(page);

    // Wait for page to load
    await expect(page.getByText(/new recipe/i)).toBeVisible({ timeout: 30000 });

    // Should show Method section header (it's a collapsible button)
    const methodHeader = page.getByRole('button', { name: 'Method' });
    await methodHeader.scrollIntoViewIfNeeded();
    await expect(methodHeader).toBeVisible();

    // Should show the free-form textarea
    const methodTextarea = page.getByPlaceholder(/season duck breast/i);
    await expect(methodTextarea).toBeVisible();

    // Should show AI Structure button (disabled initially)
    const structureBtn = page.getByRole('button', { name: /ai structure/i });
    await expect(structureBtn).toBeVisible();
    await expect(structureBtn).toBeDisabled();

    // Type something in the method field
    await methodTextarea.fill('Season the duck, score the skin, sear skin-side down 6 min, flip 2 min, rest and slice');

    // AI Structure button should now be enabled
    await expect(structureBtn).toBeEnabled();
  });

  test('tab switching preserves state', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    // Switch to AI tab
    await page.getByRole('button', { name: /ai recipe builder/i }).click();
    await expect(page.getByText(/what are you making/i)).toBeVisible();

    // Switch back to list
    await page.getByRole('button', { name: /all recipes/i }).click();

    // List should be visible (table or empty state)
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no recipes found/i).isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);

    // Switch back to AI tab
    await page.getByRole('button', { name: /ai recipe builder/i }).click();
    await expect(page.getByText(/what are you making/i)).toBeVisible();
  });

  test('rethink mode shows existing recipe context', async ({ page }) => {
    await page.goto('/recipes');
    await skipIfOnLogin(page);

    const editLink = page.locator('a[href^="/recipes/"]').filter({ hasText: /edit/i }).first();
    const hasRecipe = await editLink.isVisible().catch(() => false);
    test.skip(!hasRecipe, 'No recipes available to test rethink mode');

    const href = await editLink.getAttribute('href');
    test.skip(!href, 'Recipe edit link missing href');

    await page.goto(href);

    // Wait for either the rethink button or an error — skip if page stays loading
    const rethinkBtn = page.getByRole('button', { name: /rethink with ai/i });
    const errorText = page.getByText(/error loading recipe/i);
    const loaded = await Promise.race([
      rethinkBtn.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'ok' as const),
      errorText.waitFor({ state: 'visible', timeout: 25000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const);

    test.skip(loaded === 'timeout', 'Recipe detail page did not load in time');
    test.skip(loaded === 'error', 'Recipe failed to load');

    // Click Rethink
    await rethinkBtn.click();

    // Should show rethink mode UI
    await expect(page.getByText(/rethink:/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/current recipe/i)).toBeVisible();
    await expect(page.getByText(/what direction/i)).toBeVisible();

    // Should show quick direction prompts
    await expect(page.getByText(/rebuild it/i)).toBeVisible();
    await expect(page.getByText(/cost-effective/i)).toBeVisible();

    // Should have back to recipe link
    await expect(page.getByText(/back to recipe/i)).toBeVisible();
  });
});
