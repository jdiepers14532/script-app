import { test } from '@playwright/test';

const BASE = 'https://script.serienwerft.studio';

test('line numbers DOM check', async ({ page }) => {
  const res = await page.request.post('https://auth.serienwerft.studio/api/auth/login', {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' }
  });
  const cookies = res.headers()['set-cookie'] || '';
  const match = cookies.match(/access_token=([^;]+)/);
  if (!match) { console.log('Auth failed'); return; }
  const token = match[1];
  await page.context().addCookies([{
    name: 'access_token', value: token,
    domain: '.serienwerft.studio', path: '/'
  }]);

  // Get my productions via DK settings
  const myProds = await page.request.fetch(`${BASE}/api/dk-settings/my-productions`, {
    headers: { Cookie: `access_token=${token}` }
  });
  console.log('My productions status:', myProds.status());
  const prodsData = await myProds.json().catch(() => null);
  console.log('My productions:', JSON.stringify(prodsData)?.substring(0, 500));

  // Navigate to app
  await page.goto(BASE);
  await page.waitForTimeout(3000);

  // Check what's in the header/nav - look for production selector
  const headerText = await page.locator('header, nav, [class*="header"], [class*="topbar"], [class*="appbar"]').first().innerText().catch(() => 'none');
  console.log('Header text:', headerText.substring(0, 200));

  // Look for any dropdown/select for production
  const selects = await page.locator('select').all();
  for (const sel of selects) {
    const options = await sel.locator('option').allTextContents();
    console.log('Select options:', options.slice(0, 5));
  }

  // Try to find the episode/production navigation
  const allButtons = await page.locator('button').allTextContents();
  console.log('Buttons:', allButtons.filter(t => t.trim()).slice(0, 15));

  await page.screenshot({ path: '/tmp/script-state.png' });
});
