import { test, expect } from '@playwright/test';

test('line numbers debug — check DOM and visibility', async ({ page }) => {
  // Auth
  const res = await page.request.post('https://auth.serienwerft.studio/api/auth/login', {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' }
  });
  const match = (res.headers()['set-cookie'] || '').match(/access_token=([^;]+)/);
  if (!match) { console.log('AUTH FAILED'); return; }
  await page.context().addCookies([{ name: 'access_token', value: match[1], domain: '.serienwerft.studio', path: '/' }]);

  // Navigate to script app
  await page.goto('https://script.serienwerft.studio');
  await page.waitForTimeout(2000);

  // Enable line numbers
  await page.evaluate(() => {
    const raw = localStorage.getItem('script_tweaks');
    const t = raw ? JSON.parse(raw) : {};
    t.showLineNumbers = true;
    t.lineNumberMarginCm = 1;
    localStorage.setItem('script_tweaks', JSON.stringify(t));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Check if there's a production selector — pick production if needed
  const productionSelect = page.locator('select').first();
  const selectCount = await page.locator('select').count();
  console.log('Select elements:', selectCount);

  // Check page state
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
  console.log('Page text:', bodyText.replace(/\n/g, ' | '));

  // Try clicking on scene list items
  const sceneListItems = await page.locator('[data-scene-id]').count();
  console.log('Scene list items:', sceneListItems);

  // If no scenes, try clicking on scene list entries by text content
  const listItems = await page.locator('.scene-list-item, [class*="scene"], [class*="Scene"]').count();
  console.log('Scene-related elements:', listItems);

  // Check if there's already a ProseMirror editor
  let editorFound = await page.locator('.ProseMirror').count();
  console.log('ProseMirror initially:', editorFound);

  // If no editor, we need to select something - let's look at the DOM
  if (editorFound === 0) {
    // Try to find and click something in the left panel
    const leftPanelItems = await page.evaluate(() => {
      // Find clickable items in the first 300px of the page
      const items: string[] = [];
      document.querySelectorAll('div, li, button, a').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.left < 300 && rect.width > 10 && rect.height > 20 && rect.height < 60) {
          items.push(`${el.tagName}.${el.className?.substring(0, 30)} "${el.textContent?.substring(0, 40)}" at ${Math.round(rect.left)},${Math.round(rect.top)}`);
        }
      });
      return items.slice(0, 20);
    });
    console.log('Left panel items:', leftPanelItems);
  }

  // Screenshot current state
  await page.screenshot({ path: '/tmp/script-ln-debug2.png' });
  console.log('Screenshot 1 saved');

  // Wait and check for editor after any selection
  if (editorFound === 0) {
    // Try to click on the first scene-like item in left panel
    const clicked = await page.evaluate(() => {
      const items = document.querySelectorAll('[data-scene-id], [data-szene-id]');
      if (items.length > 0) {
        (items[0] as HTMLElement).click();
        return `clicked data-scene-id: ${items.length} items`;
      }
      // Try text that looks like scene numbers
      const allDivs = document.querySelectorAll('div');
      for (const d of allDivs) {
        const text = d.textContent?.trim() || '';
        if (/^(SZ|Sz|sz)\s*\d/.test(text) && d.getBoundingClientRect().left < 280) {
          (d as HTMLElement).click();
          return `clicked: "${text.substring(0, 30)}"`;
        }
      }
      return 'nothing to click';
    });
    console.log('Click result:', clicked);
    await page.waitForTimeout(2000);
    editorFound = await page.locator('.ProseMirror').count();
    console.log('ProseMirror after click:', editorFound);
  }

  if (editorFound > 0) {
    const blockCount = await page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      return pm ? pm.children.length : 0;
    });
    console.log('Editor block count:', blockCount);

    const styleTag = await page.evaluate(() => {
      const el = document.getElementById('line-number-css');
      return el ? { found: true, content: el.textContent?.substring(0, 200) } : { found: false };
    });
    console.log('STYLE TAG:', JSON.stringify(styleTag));

    const lnWrapCount = await page.locator('.pm-ln-wrap').count();
    const lnCount = await page.locator('.pm-ln').count();
    console.log('.pm-ln-wrap:', lnWrapCount, '.pm-ln:', lnCount);

    if (lnCount > 0) {
      const texts = await page.locator('.pm-ln').allTextContents();
      console.log('.pm-ln texts:', texts);
    }

    // Check the tweaks state as seen by the component
    const tweakState = await page.evaluate(() => {
      const raw = localStorage.getItem('script_tweaks');
      return raw ? JSON.parse(raw) : null;
    });
    console.log('Tweaks state:', JSON.stringify(tweakState));
  }

  await page.screenshot({ path: '/tmp/script-ln-debug3.png' });
  console.log('Screenshot 2 saved');
});
