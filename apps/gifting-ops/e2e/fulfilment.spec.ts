import { expect, test } from '@playwright/test';
import { login } from './helpers.ts';

test('packing check by a second person, then partial dispatch does not complete the order', async ({ page }) => {
  await login(page, 'suresh.warehouse@example.com');
  await page.goto('/fulfilment/packing');
  await page.locator('section.card').filter({ hasText: 'ORD-26-0002' }).getByRole('link', { name: /Open packing/ }).click();
  await page.getByRole('button', { name: 'Pass check' }).click();
  await expect(page.getByText('Batch checked')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await login(page, 'imran.dispatch@example.com');
  await page.goto('/fulfilment/dispatch');
  await page.getByRole('row').filter({ hasText: 'ORD-26-0002' }).getByRole('link', { name: 'Shipments' }).click();
  await expect(page.getByText('No courier integration is configured')).toBeVisible();
  await page.getByRole('button', { name: 'Plan shipment' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Plan' }).click();
  await page.getByRole('button', { name: 'Dispatch' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByLabel('Courier').fill('BlueDart');
  await dlg.getByLabel('Tracking / docket number').fill('BD55511');
  await dlg.getByRole('button', { name: 'Dispatch' }).click();
  await expect(page.locator('.stages li[aria-current=step]')).toHaveText(/Dispatch/);
  await page.getByRole('button', { name: 'Confirm delivery' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Confirm' }).click();
  await expect(dlg.getByText('Record who received it or attach the proof of delivery')).toBeVisible();
  await dlg.getByLabel('Received by').fill('Reception, Kochi');
  await dlg.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Delivery confirmed')).toBeVisible();
  // 35 of 40 delivered → still in dispatch, not delivered.
  await expect(page.locator('.stages li[aria-current=step]')).toHaveText(/Dispatch/);
});

