// Regenerates the README screenshots from the production build.
// Usage: npm run build && npx vite preview --port 4180 & node scripts/screenshots.mjs
import { chromium } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4180'
const shots = [
  ['caseworker', 'w-rivera', '/#/cases', { width: 1280, height: 900 }],
  ['case', 'w-rivera', '/#/cases/NC-1037', { width: 1280, height: 1000 }],
  ['supervisor', 's-brooks', '/#/unit', { width: 1280, height: 900 }],
  ['officer', 'p-nguyen', '/#/referrals', { width: 1280, height: 900 }],
  ['matching', 'w-rivera', '/#/cases/NC-1009', { width: 1280, height: 900 }, '#matches'],
  ['results', 's-brooks', '/#/results', { width: 1280, height: 760 }],
  ['inbox', 'w-chen', '/#/inbox', { width: 1280, height: 760 }],
  ['phone', 'w-rivera', '/#/cases', { width: 390, height: 844 }],
]

const browser = await chromium.launch()
for (const [name, actor, path, viewport, anchor] of shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme: 'light' })
  await page.goto(`${BASE}/#/`)
  await page.getByLabel('Viewing as').selectOption(actor)
  await page.goto(`${BASE}${path}`)
  await page.locator('main h1').waitFor()
  if (anchor) await page.locator(anchor).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `docs/screenshots/${name}.png` })
  await page.close()
}
await browser.close()
console.log('screenshots written to docs/screenshots/')
