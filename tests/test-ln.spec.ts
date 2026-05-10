import { test } from '@playwright/test';

test('line numbers CSS in real app context', async ({ page }) => {
  // Login
  const res = await page.request.post('https://auth.serienwerft.studio/api/auth/login', {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' }
  });
  const cookies = res.headers()['set-cookie'] || '';
  const match = cookies.match(/access_token=([^;]+)/);
  if (!match) { console.log('Auth failed'); return; }
  await page.context().addCookies([{
    name: 'access_token', value: match[1],
    domain: '.serienwerft.studio', path: '/'
  }]);

  // Load real app to get all CSS
  await page.goto('https://script.serienwerft.studio');
  await page.waitForTimeout(3000);

  // Inject test content into page to test CSS in the real app's context
  const result = await page.evaluate(() => {
    // Check if gutter-css style exists
    const gutterStyle = document.getElementById('gutter-css');
    const gutterContent = gutterStyle?.textContent || 'NOT FOUND';

    // Check all stylesheets for has-line-numbers rules
    const allRules: string[] = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          const text = rule.cssText || '';
          if (text.includes('has-line-numbers') || text.includes('line-number')) {
            allRules.push(text.substring(0, 200));
          }
        }
      } catch {}
    }

    // Create test editor in-page
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed; top:50px; left:50px; z-index:99999; width:600px; background:white; border:2px solid red;';
    
    const editor = document.createElement('div');
    editor.className = 'ProseMirror has-line-numbers';
    editor.style.cssText = 'outline:none;';
    editor.contentEditable = 'true';
    
    for (let i = 1; i <= 12; i++) {
      const p = document.createElement('p');
      p.className = 'absatz-node';
      p.setAttribute('data-format-id', 'test');
      p.textContent = `Zeile ${i}: Lorem ipsum dolor sit amet consectetur`;
      editor.appendChild(p);
    }
    
    container.appendChild(editor);
    document.body.appendChild(container);

    // Check computed styles
    const el5 = editor.children[4] as HTMLElement;
    const cs5 = getComputedStyle(el5);
    const cs5After = getComputedStyle(el5, '::after');
    
    const el1 = editor.children[0] as HTMLElement;
    const cs1 = getComputedStyle(el1);

    return {
      gutterCssExists: !!gutterStyle,
      gutterContent: gutterContent.substring(0, 500),
      matchingRules: allRules,
      editorPaddingLeft: getComputedStyle(editor).paddingLeft,
      editorClasses: editor.className,
      child1: {
        tag: el1.tagName,
        class: el1.className,
        position: cs1.position,
        overflow: cs1.overflow,
      },
      child5: {
        tag: el5.tagName,
        class: el5.className,
        position: cs5.position,
        overflow: cs5.overflow,
      },
      child5After: {
        content: cs5After.content,
        display: cs5After.display,
        position: cs5After.position,
        left: cs5After.left,
        top: cs5After.top,
        color: cs5After.color,
        width: cs5After.width,
        height: cs5After.height,
        visibility: cs5After.visibility,
      }
    };
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  await page.screenshot({ path: '/tmp/script-injected.png' });
});
