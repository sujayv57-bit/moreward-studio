import { expect, type Page } from '@playwright/test';
export const PW = 'demo-password-2026';
export async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('main#main')).toBeVisible();
}
