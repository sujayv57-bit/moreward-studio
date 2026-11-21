import { expect, test } from '@playwright/test';
import { login } from './helpers.ts';

test('keyboard: skip link, global search with / and arrow keys, tabs with arrow keys', async ({ page }) => {
  await login(page, 'founder@example.com');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.locator('body').click({ position: { x: 600, y: 300 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.keyboard.type('Kestrel');
  await expect(page.getByRole('option').first()).toBeVisible();
  const orderOpt = page.getByRole('option', { name: /Order.*ORD-26-0004/ });
  await expect(orderOpt).toBeVisible();
  const idx = await page.getByRole('option').evaluateAll((els) => els.findIndex((e) => /ORD-26-0004/.test(e.textContent ?? '')));
  for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ORD-26-0004');
  // ARIA tabs: arrow keys move between sections.
  await page.getByRole('tab', { name: 'Overview' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Requirements' })).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/tab=requirements/);
});

test('order stage gate shows exactly what is missing', async ({ page }) => {
  await login(page, 'founder@example.com');
  await page.goto('/orders?stage=confirmed');
  await page.getByRole('link', { name: 'ORD-26-0005' }).click();
  await expect(page.getByText('Before this stage, fix:')).toBeVisible();
  await expect(page.getByText(/has no components in its bill of materials/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to Procurement' })).toBeDisabled();
  await page.getByRole('button', { name: 'Go to Contents' }).first().click();
  await expect(page.getByRole('tab', { name: 'Box contents' })).toHaveAttribute('aria-selected', 'true');
  // Add a component through the UI and the gate clears.
  await page.getByRole('button', { name: 'Add component' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Component').fill('Insulated bottle 750ml');
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: /Insulated bottle 750ml/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page.getByText('Everything required is in place.')).toBeVisible();
  await page.getByRole('button', { name: 'Move to Procurement' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move stage' }).click();
  await expect(page.locator('.stages li[aria-current=step]')).toHaveText(/Procurement/);
});

test('sales executive: lead → duplicate warning → qualify gaps → convert → request feasibility', async ({ page }) => {
  await login(page, 'rohan.sales@example.com');
  await page.getByRole('link', { name: 'Leads' }).click();
  await page.getByRole('button', { name: 'New lead' }).click();
  let dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Create lead' }).click();
  await expect(dlg.getByText('Company is required')).toBeVisible(); // client-side validation
  await dlg.getByLabel('Company').fill('Peak Motors Pvt Ltd');
  await dlg.getByLabel('Lead source').selectOption('Referral');
  await dlg.getByLabel('Contact name').fill('Asha Verma');
  await dlg.getByRole('button', { name: 'Create lead' }).click();
  await expect(dlg.getByText(/looks like an existing lead/)).toBeVisible(); // server duplicate detection
  await dlg.getByRole('button', { name: 'It is new — save anyway' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Peak Motors Pvt Ltd');
  await page.getByRole('button', { name: 'Qualify' }).click();
  await expect(page.getByText('Approximate quantity is missing')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Approximate quantity').fill('150');
  await dlg.getByLabel('Total budget').fill('1,50,000');
  await dlg.getByLabel('Required delivery date').fill('2027-01-20');
  await dlg.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Lead saved')).toBeVisible();
  await page.getByLabel('What was discussed').fill('Called Asha: 150 boxes for dealer meet');
  await page.getByRole('button', { name: 'Log activity' }).click();
  await expect(page.getByRole('region', { name: 'Calls, meetings and notes' })).toContainText('Called Asha');
  await page.getByRole('button', { name: 'Qualify' }).click();
  await page.getByRole('button', { name: 'Convert to opportunity' }).click();
  await expect(page).toHaveURL(/\/sales\/opportunities\/\d+/);
  await expect(page.getByRole('region', { name: 'Calls, meetings and notes' })).toContainText('Called Asha: 150 boxes for dealer meet'); // lead activity carried over
  await page.getByRole('button', { name: 'Request feasibility' }).click();
  dlg = page.getByRole('dialog');
  await dlg.getByLabel('Procurement person').selectOption({ label: 'Anjali Desai' });
  await dlg.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Waiting for Anjali Desai')).toBeVisible();
  // Sales executives see no finance or settings controls.
  await expect(page.getByRole('link', { name: 'Finance' })).toHaveCount(0);
});

test('restricted roles: no finance, no bank details, friendly no-access state', async ({ page }) => {
  await login(page, 'meera.warehouse@example.com');
  await expect(page.getByRole('link', { name: 'Finance' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Leads' })).toHaveCount(0);
  await page.goto('/finance');
  await expect(page.getByText("You don't have access to this").first()).toBeVisible();
  await page.goto('/procurement/vendors');
  await page.getByRole('link', { name: 'Kaju Kraft Foods' }).click();
  await page.getByRole('tab', { name: 'Bank details' }).click();
  await expect(page.getByText('Bank details are visible only to finance and the founder.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('HDFC0001234');
  await page.goto('/orders');
  await expect(page.locator('main')).not.toContainText('₹');
});

test('finance: balances and CSV export download', async ({ page }) => {
  await login(page, 'kavya.finance@example.com');
  await page.getByRole('link', { name: 'Finance' }).click();
  await expect(page.getByText('Open customer balances')).toBeVisible();
  await page.getByRole('tab', { name: 'Exports' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download CSV' }).first().click()]);
  expect(dl.suggestedFilename()).toMatch(/^receivables-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('approvals inbox: sales manager approves a low-margin quotation', async ({ page }) => {
  await login(page, 'priya.sales@example.com');
  await page.getByRole('link', { name: 'Approvals' }).click();
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Nothing waiting for a decision')).toBeVisible();
});

// Runs after the approvals test above approved the Meridian quotation's margin.
test('sales executive cannot send a quotation without supporting feasibility', async ({ page }) => {
  await login(page, 'sneha.sales@example.com');
  await page.goto('/sales/opportunities?stage=');
  await page.getByRole('link', { name: /Meridian/ }).click();
  await page.getByRole('link', { name: /Q-26-/ }).click();
  await expect(page.getByText('A firm commitment is not yet supported by procurement')).toBeVisible();
  await page.getByRole('button', { name: 'Record as sent' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Only a sales manager or the founder can override.')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Record as sent' })).toBeDisabled(); // the server also refuses (API test, scenario 2)
});
