import { test } from '@playwright/test';

test('verify line number rendering', async ({ page }) => {
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

  await page.goto('https://script.serienwerft.studio');
  await page.waitForTimeout(3000);

  // Inject the EXACT same CSS that the app uses + create test editor
  await page.evaluate(() => {
    // Inject gutter CSS
    const style = document.createElement('style');
    style.id = 'test-gutter-css';
    style.textContent = `
.ProseMirror.has-line-numbers {
  padding-left: 52px !important;
}
.line-number-gutter {
  height: 0 !important;
  overflow: visible !important;
  position: relative !important;
  pointer-events: none;
  user-select: none;
}
.line-number-gutter::after {
  content: attr(data-ln);
  position: absolute;
  left: -52px;
  bottom: 0;
  width: 28px;
  text-align: right;
  font-family: 'Courier Prime', 'Courier New', monospace;
  font-size: 10px;
  line-height: 1;
  color: var(--text-secondary);
}
    `;
    document.head.appendChild(style);

    // Simulate the real editor structure inside PageWrapper
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:fixed;top:20px;left:20px;z-index:99999;width:800px;background:#F5F5F5;padding:32px 24px;';
    
    const page = document.createElement('div');
    page.style.cssText = 'width:700px;margin:0 auto;background:white;padding:96px;position:relative;box-shadow:0 4px 24px rgba(0,0,0,0.15);';
    
    const editor = document.createElement('div');
    editor.className = 'tiptap ProseMirror has-line-numbers';
    editor.contentEditable = 'true';
    editor.style.cssText = 'outline:none;';
    
    // Simulate the structure: interleave content <p> with widget <div>
    for (let i = 1; i <= 15; i++) {
      // Every 5th line: insert widget div BEFORE the <p>
      if (i % 5 === 0) {
        const widget = document.createElement('div');
        widget.className = 'line-number-gutter';
        widget.setAttribute('data-ln', String(i));
        widget.textContent = String(i);
        editor.appendChild(widget);
      }
      const p = document.createElement('p');
      p.className = 'absatz-node';
      p.style.cssText = 'margin:0;padding:0;white-space:pre-wrap;font-family:Courier Prime,monospace;font-size:12pt;line-height:1.5;';
      p.textContent = `Zeile ${i}: Lorem ipsum dolor sit amet consectetur adipiscing`;
      editor.appendChild(p);
    }
    
    page.appendChild(editor);
    wrapper.appendChild(page);
    document.body.appendChild(wrapper);
  });

  await page.waitForTimeout(500);

  // Check the widget div and its ::after
  const info = await page.evaluate(() => {
    const widget = document.querySelector('.line-number-gutter') as HTMLElement;
    if (!widget) return { error: 'no widget found' };
    
    const wcs = getComputedStyle(widget);
    const acs = getComputedStyle(widget, '::after');
    
    // Check bounding rect
    const wRect = widget.getBoundingClientRect();
    
    return {
      widget: {
        tag: widget.tagName,
        className: widget.className,
        textContent: widget.textContent,
        dataLn: widget.getAttribute('data-ln'),
        rect: { top: wRect.top, left: wRect.left, width: wRect.width, height: wRect.height },
        height: wcs.height,
        overflow: wcs.overflow,
        position: wcs.position,
        display: wcs.display,
      },
      after: {
        content: acs.content,
        position: acs.position,
        left: acs.left,
        bottom: acs.bottom,
        top: acs.top,
        width: acs.width,
        height: acs.height,
        color: acs.color,
        display: acs.display,
        visibility: acs.visibility,
        opacity: acs.opacity,
        fontSize: acs.fontSize,
      },
      // Check if the number is visible by looking at the pixel color
      editorPaddingLeft: getComputedStyle(document.querySelector('.ProseMirror.has-line-numbers')!).paddingLeft,
    };
  });

  console.log('Widget + ::after info:', JSON.stringify(info, null, 2));
  await page.screenshot({ path: '/tmp/script-ln-test.png' });
});
