import { expect, test, type Page } from '@playwright/test';

async function waitForQa(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__YG_QA__?.getLayoutSnapshot().items.length));
}

async function assertResponsiveState(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const snapshot = window.__YG_QA__?.getLayoutSnapshot();
    if (!snapshot) throw new Error('QA layout bridge is unavailable');
    const active = snapshot.items.filter(item => item.visible && item.active && item.critical);
    const outside = active.filter(item => {
      const { x, y, width, height } = item.bounds;
      return x < -1 || y < -1 || x + width > snapshot.viewport.width + 1 || y + height > snapshot.viewport.height + 1;
    });
    const overlaps: string[] = [];
    for (let index = 0; index < active.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < active.length; otherIndex += 1) {
        const left = active[index]!;
        const right = active[otherIndex]!;
        if (!left.mustNotOverlap || !right.mustNotOverlap) continue;
        if (left.overlapGroup && left.overlapGroup === right.overlapGroup) continue;
        const a = left.bounds;
        const b = right.bounds;
        const intersection = Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x)
          && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);
        if (intersection) overlaps.push(`${left.scene}:${left.id}<->${right.scene}:${right.id}`);
      }
    }
    return {
      outside: outside.map(item => `${item.scene}:${item.id}`),
      overlaps,
      scroll: {
        horizontal: document.documentElement.scrollWidth > window.innerWidth + 1,
        vertical: document.documentElement.scrollHeight > window.innerHeight + 1,
        bodyHorizontal: document.body.scrollWidth > window.innerWidth + 1,
        bodyVertical: document.body.scrollHeight > window.innerHeight + 1
      },
      canvas: (() => {
        const rect = document.querySelector('canvas')?.getBoundingClientRect();
        return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
      })()
    };
  });

  expect(result.outside ?? []).toEqual([]);
  expect(result.overlaps ?? []).toEqual([]);
  expect(result.scroll).toEqual({ horizontal: false, vertical: false, bodyHorizontal: false, bodyVertical: false });
  expect(result.canvas).not.toBeNull();
  if (result.canvas) {
    expect(result.canvas.left).toBeGreaterThanOrEqual(-1);
    expect(result.canvas.top).toBeGreaterThanOrEqual(-1);
    expect(result.canvas.right).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1);
    expect(result.canvas.bottom).toBeLessThanOrEqual((await page.evaluate(() => innerHeight)) + 1);
  }
}

test('game surface blocks desktop context menu, selection and drag', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const dispatch = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      canvas.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const style = getComputedStyle(canvas);
    return {
      contextmenu: dispatch('contextmenu'),
      selectstart: dispatch('selectstart'),
      dragstart: dispatch('dragstart'),
      userSelect: style.userSelect,
      webkitTouchCallout: style.getPropertyValue('-webkit-touch-callout')
    };
  });
  expect(result).toMatchObject({ contextmenu: true, selectstart: true, dragstart: true, userSelect: 'none' });
  expect(['', 'none']).toContain(result?.webkitTouchCallout.trim() ?? '');
});

test('mobile long-press protections remain active', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  const result = await page.locator('canvas').evaluate(async canvas => {
    const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true });
    canvas.dispatchEvent(pointerDown);
    await new Promise(resolve => setTimeout(resolve, 650));
    const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(contextMenu);
    const selection = window.getSelection();
    return {
      contextMenuPrevented: contextMenu.defaultPrevented,
      selectionText: selection?.toString() ?? '',
      touchCallout: getComputedStyle(canvas).getPropertyValue('-webkit-touch-callout').trim()
    };
  });
  expect(result.contextMenuPrevented).toBe(true);
  expect(result.selectionText).toBe('');
  expect(['', 'none']).toContain(result.touchCallout);
});

test('layout remains valid through portrait-landscape-portrait transition', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForQa(page);
  await assertResponsiveState(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  await assertResponsiveState(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await assertResponsiveState(page);
});

test('layout remains valid through landscape-portrait-landscape transition', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await waitForQa(page);
  await assertResponsiveState(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await assertResponsiveState(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(150);
  await assertResponsiveState(page);
});

test('language is taken from Yandex SDK environment on startup', async ({ page }) => {
  await page.goto('/?lang=en');
  await waitForQa(page);
  const playLabel = await page.evaluate(() => window.__YG_QA__?.getLayoutSnapshot().items.find(item => item.id === 'menu-play-label')?.text);
  expect(playLabel).toBe('Play');
});
