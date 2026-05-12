import { test, expect } from '@playwright/test';

test('line number CSS rendering test', async ({ page }) => {
  // Auth
  const res = await page.request.post('https://auth.serienwerft.studio/api/auth/login', {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' }
  });
  const match = (res.headers()['set-cookie'] || '').match(/access_token=([^;]+)/);
  if (!match) { console.log('AUTH FAILED'); return; }
  await page.context().addCookies([{ name: 'access_token', value: match[1], domain: '.serienwerft.studio', path: '/' }]);

  await page.goto('https://script.serienwerft.studio');
  await page.waitForTimeout(2000);

  // Inject a test DOM that mimics the exact hierarchy of PageWrapper + ProseMirror + line numbers
  const result = await page.evaluate(() => {
    // Inject the line number CSS (same as generateLineNumberCSS would produce)
    const style = document.createElement('style');
    style.id = 'ln-test-css';
    style.textContent = `
.pm-ln {
  height: 0;
  line-height: 0;
  overflow: visible;
  margin: 0;
  padding: 0;
  pointer-events: none;
  user-select: none;
  position: static;
}
.pm-ln::after {
  content: attr(data-ln);
  position: absolute;
  left: calc(-1 * 96px + 1cm);
  width: calc(96px - 1cm - 4px);
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 10pt;
  line-height: 1;
  color: #FF0000;
  pointer-events: none;
}`;
    document.head.appendChild(style);

    // Create the DOM hierarchy (mimicking actual editor structure)
    const testArea = document.createElement('div');
    testArea.id = 'ln-test-area';
    testArea.style.cssText = 'position:fixed; top:20px; left:20px; z-index:99999; width:900px; height:600px;';

    // EditorPanel wrapper (overflow:hidden)
    const panelWrapper = document.createElement('div');
    panelWrapper.style.cssText = 'flex:1; overflow:hidden; width:100%; height:100%;';

    // UniversalEditor root
    const ueRoot = document.createElement('div');
    ueRoot.style.cssText = 'display:flex; flex-direction:column; height:100%;';

    // Scroll container
    const scrollContainer = document.createElement('div');
    scrollContainer.style.cssText = 'flex:1; overflow:auto; position:relative;';

    // PageWrapper outer
    const pwOuter = document.createElement('div');
    pwOuter.style.cssText = 'background:#f5f5f5; padding:32px 24px; min-height:100%; overflow-y:auto;';

    // PageWrapper inner (page div) — position:relative is KEY
    const pwInner = document.createElement('div');
    pwInner.className = 'page';
    pwInner.style.cssText = '--page-padding:96px; width:794px; min-height:400px; max-width:100%; margin:0 auto; background:white; box-shadow:0 4px 24px rgba(0,0,0,0.15); border-radius:2px; padding:96px; position:relative;';

    // ProseMirror (position:relative from Tiptap defaults)
    const prosemirror = document.createElement('div');
    prosemirror.className = 'ProseMirror';
    prosemirror.style.cssText = 'position:relative; word-wrap:break-word; white-space:pre-wrap; outline:none; min-height:100%;';
    prosemirror.contentEditable = 'true';

    // Add 15 paragraphs with line number widgets every 5th
    for (let i = 1; i <= 15; i++) {
      if (i % 5 === 0) {
        const ln = document.createElement('div');
        ln.className = 'pm-ln';
        ln.dataset.ln = String(i);
        prosemirror.appendChild(ln);
      }
      const p = document.createElement('p');
      p.style.cssText = 'margin:0; padding:0; font-family:Courier Prime, monospace; font-size:12pt; line-height:1.5;';
      p.textContent = `Zeile ${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;
      prosemirror.appendChild(p);
    }

    pwInner.appendChild(prosemirror);
    pwOuter.appendChild(pwInner);
    scrollContainer.appendChild(pwOuter);
    ueRoot.appendChild(scrollContainer);
    panelWrapper.appendChild(ueRoot);
    testArea.appendChild(panelWrapper);
    document.body.appendChild(testArea);

    // Now check the .pm-ln::after elements
    const lnElements = document.querySelectorAll('#ln-test-area .pm-ln');
    const results: any[] = [];

    lnElements.forEach(el => {
      const afterStyle = getComputedStyle(el, '::after');
      const elRect = el.getBoundingClientRect();
      results.push({
        dataLn: (el as HTMLElement).dataset.ln,
        elRect: { top: Math.round(elRect.top), left: Math.round(elRect.left), width: Math.round(elRect.width), height: Math.round(elRect.height) },
        afterContent: afterStyle.content,
        afterPosition: afterStyle.position,
        afterLeft: afterStyle.left,
        afterColor: afterStyle.color,
        afterFontSize: afterStyle.fontSize,
        afterDisplay: afterStyle.display,
        afterWidth: afterStyle.width,
      });
    });

    return { count: lnElements.length, results };
  });

  console.log('Line number elements found:', result.count);
  result.results.forEach((r: any) => {
    console.log(`  LN ${r.dataLn}: el@(${r.elRect.top},${r.elRect.left}) ${r.elRect.width}x${r.elRect.height} | ::after content=${r.afterContent} pos=${r.afterPosition} left=${r.afterLeft} color=${r.afterColor} display=${r.afterDisplay}`);
  });

  await page.screenshot({ path: '/tmp/script-ln-css-test.png' });
  console.log('Screenshot saved to /tmp/script-ln-css-test.png');

  // Verify at least one ::after has content
  expect(result.count).toBeGreaterThan(0);
  expect(result.results[0].afterContent).toContain('5');
});
