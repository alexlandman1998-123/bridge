const { test } = require('@playwright/test');

test('inspect dashboard layout', async ({ page }) => {
  await page.goto('http://localhost:5173/dashboard');
  await page.waitForTimeout(1000);

  const selectors = [
    'header',
    '.ui-main-region',
    '.ui-content-container',
    'section.mt-10',
    'section.mt-10 > div.flex.flex-col.gap-4',
    'section.mt-10.rounded-\\[22px\\]'
  ];

  for (const selector of selectors) {
    const el = page.locator(selector).first();
    const count = await page.locator(selector).count();
    console.log('\nSELECTOR', selector, 'COUNT', count);
    if (!count) continue;
    const info = await el.evaluate((node) => {
      const styles = window.getComputedStyle(node);
      return {
        tag: node.tagName,
        className: node.className,
        display: styles.display,
        position: styles.position,
        width: styles.width,
        height: styles.height,
        padding: styles.padding,
        margin: styles.margin,
        background: styles.background,
        border: styles.border,
        boxShadow: styles.boxShadow,
      };
    });
    console.log(JSON.stringify(info, null, 2));
  }

  const topSection = page.locator('section').filter({ has: page.locator('button:has-text("+ New Development")') }).first();
  console.log('\nTOP SECTION COUNT', await topSection.count());
  if (await topSection.count()) {
    const html = await topSection.evaluate((node) => node.outerHTML.slice(0, 3000));
    console.log(html);
  }
});
