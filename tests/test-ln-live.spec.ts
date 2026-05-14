import { test, expect } from '@playwright/test'

test('live editor line number diagnostic', async ({ page }) => {
  // Auth
  const res = await page.request.post('https://auth.serienwerft.studio/api/auth/login', {
    data: { email: 'noreply@serienwerft.studio', password: 'Claude2026' }
  })
  const match = (res.headers()['set-cookie'] || '').match(/access_token=([^;]+)/)
  if (!match) { console.log('AUTH FAILED'); return }
  await page.context().addCookies([{ name: 'access_token', value: match[1], domain: '.serienwerft.studio', path: '/' }])

  await page.goto('https://script.serienwerft.studio')
  await page.waitForTimeout(3000)

  // Check what's on the page
  const pageInfo = await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror')
    const pmLn = document.querySelectorAll('.pm-ln')
    const styleTag = document.getElementById('line-number-css')
    const pageDiv = document.querySelector('.page, [style*="--page-padding"]')
    return {
      hasPM: !!pm,
      pmChildCount: pm?.children.length ?? 0,
      pmLnCount: pmLn.length,
      hasStyleTag: !!styleTag,
      styleContent: styleTag?.textContent?.substring(0, 200) ?? 'N/A',
      hasPageDiv: !!pageDiv,
      pmSnippet: pm?.innerHTML?.substring(0, 300) ?? 'no PM',
      bodyText: document.body.innerText.substring(0, 500),
    }
  })
  console.log('=== LIVE DIAGNOSTIC ===')
  console.log('ProseMirror found:', pageInfo.hasPM)
  console.log('PM children:', pageInfo.pmChildCount)
  console.log('.pm-ln count:', pageInfo.pmLnCount)
  console.log('Style tag:', pageInfo.hasStyleTag)
  console.log('Style content:', pageInfo.styleContent)
  console.log('Page div:', pageInfo.hasPageDiv)
  console.log('PM snippet:', pageInfo.pmSnippet)
  console.log('Body text:', pageInfo.bodyText.substring(0, 300))

  await page.screenshot({ path: '/tmp/script-ln-live.png', fullPage: true })
  console.log('Screenshot saved')
})
