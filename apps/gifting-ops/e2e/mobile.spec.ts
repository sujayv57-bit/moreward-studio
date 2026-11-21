import { expect, test } from '@playwright/test';
import { login } from './helpers.ts';

test('phone: warehouse receives goods and sees the packing queue', async ({ page }) => {
  await login(page, 'meera.warehouse@example.com');
  // Navigation is behind the menu button on phones.
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Receiving' })).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Receiving' }).click();
  await expect(page.getByRole('heading', { name: 'Receiving' })).toBeVisible();
  const card = page.locator('section.card').filter({ hasText: 'Clay & Kiln Studio' }).first();
  await card.getByRole('button', { name: 'Receive' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'All' }).first().click();
  await dlg.getByRole('button', { name: 'Record receipt' }).click();
  await expect(page.getByText('Goods receipt recorded')).toBeVisible();
  // No horizontal page scroll on a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Packing' }).click();
  await expect(page.getByRole('heading', { name: 'Packing queue' })).toBeVisible();
  // Tap targets on phones are at least 44px tall.
  for (const el of [page.getByRole('button', { name: 'Open menu' }), page.getByRole('link', { name: /Notifications/ })]) {
    const h = await el.evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  }
});
