import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const viewAs = async (page: Page, actorId: string) => {
  await page.getByLabel('Viewing as').selectOption(actorId)
}
/** A titled panel, found by its heading id. */
const panel = (page: Page, headingId: string) => page.locator('section', { has: page.locator(`#${headingId}`) })

test('the whole loop: officer refers, supervisor assigns, caseworker visits, officer sees it', async ({ page }) => {
  await page.goto('/#/')
  await viewAs(page, 'p-nguyen')
  await page.getByRole('link', { name: 'New referral' }).first().click()

  await page.getByLabel('When it happened').fill('2026-10-20T19:30')
  await page.getByLabel('Address', { exact: true }).fill('88 Test Lane')
  await page.getByLabel('First name').first().fill('Riley')
  await page.getByLabel('Last name').first().fill('Testcase')
  await page.getByLabel('Date of birth').first().fill('2019-05-05')
  await page.getByLabel('Child under 4 in the home').check()
  await page.getByLabel('Child has a visible injury').check()
  await page.getByLabel('In your own words').fill('Neighbor called about a child crying for hours; bruise on cheek seen on arrival.')
  await page.getByRole('button', { name: 'Send to CPS' }).click()

  await expect(page.getByRole('status')).toContainText('sent to Northfield County CPS')
  const card = page.getByRole('listitem').filter({ hasText: 'Riley T.' })
  await expect(card).toContainText('Waiting for: Opened by CPS')
  const caseId = (await card.locator('.case-id').textContent())!.trim()

  // Supervisor sees it in the intake queue and assigns it.
  await viewAs(page, 's-brooks')
  const row = panel(page, 'intake').getByRole('listitem').filter({ hasText: caseId })
  await expect(row).toContainText('not opened yet')
  await row.getByLabel(`Assign ${caseId} to`).selectOption('w-okafor')
  await row.getByRole('button', { name: 'Assign' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: caseId }).first()).toContainText('Dana Okafor')

  // Caseworker finds it in her list and logs a home visit.
  await viewAs(page, 'w-okafor')
  await page.getByRole('link', { name: new RegExp(caseId) }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(caseId)
  await page.getByRole('button', { name: 'Log a contact' }).click()
  await page.getByLabel('With whom').fill('Riley and grandmother')
  await page.getByRole('button', { name: 'Save contact' }).click()
  await expect(page.getByText(/Logged\. The full note is due by/)).toBeVisible()
  await expect(page.locator('.clock-row').first()).toContainText('Done')

  // Officer sees the loop move, with no case details.
  await viewAs(page, 'p-nguyen')
  const done = page.getByRole('listitem').filter({ hasText: 'Riley T.' })
  await expect(done).toContainText('Waiting for: Safety assessment done')
  await expect(done).not.toContainText('grandmother')
  await expect(done).not.toContainText('Okafor')
})

test('a supervisor approval reaches the caseworker, with a trail', async ({ page }) => {
  await page.goto('/#/cases/NC-1037')
  await expect(page.getByText(/Safety assessment sent 2 days ago/)).toBeVisible()

  await viewAs(page, 's-brooks')
  const waiting = panel(page, 'approvals')
  await waiting.getByRole('listitem').filter({ hasText: 'NC-1037' }).getByRole('button', { name: 'Approve' }).click()
  await expect(waiting).toContainText('Nothing waiting on you')

  await viewAs(page, 'w-rivera')
  await page.goto('/#/cases/NC-1037')
  await expect(page.getByText(/Safety assessment approved/)).toBeVisible()
  await expect(page.locator('.trail')).toContainText('Lena Brooks approved the safety assessment')
})

test('an officer sees status only, and nothing from other sources', async ({ page }) => {
  await page.goto('/#/')
  await viewAs(page, 'p-nguyen')
  await page.goto('/#/cases/NC-1037')
  await expect(page.getByRole('heading', { name: 'Where this referral is' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('firearm secured') // the caseworker's note
  await expect(page.locator('main')).not.toContainText('Maria Rivera')

  await page.goto('/#/cases/NC-1033') // came from the hotline
  await expect(page.getByRole('heading', { level: 1 })).toContainText('You do not have access')

  await viewAs(page, 's-brooks')
  await page.getByRole('link', { name: 'Access log' }).click()
  await expect(page.locator('table')).toContainText('Officer Tran Nguyen')
  await expect(page.locator('table')).toContainText('Status only')
})

test('the referral form explains what is missing', async ({ page }) => {
  await page.goto('/#/')
  await viewAs(page, 'p-nguyen')
  await page.goto('/#/referrals/new')
  await page.getByRole('button', { name: 'Send to CPS' }).click()
  await expect(page.getByRole('alert')).toContainText('before sending')
  await expect(page.getByRole('textbox', { name: 'Address', exact: true })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Enter when it happened')).toBeVisible()
})

test('skipping a day moves the deadlines', async ({ page }) => {
  await page.goto('/#/cases')
  const dueSoon = panel(page, 'g-due-soon')
  await expect(dueSoon).toContainText('NC-1037')
  await page.getByRole('button', { name: 'Skip ahead 1 day' }).click()
  await expect(panel(page, 'g-overdue')).toContainText('NC-1037')
})

const PAGES: [string, string][] = [
  ['w-rivera', '/#/'],
  ['w-rivera', '/#/cases'],
  ['w-rivera', '/#/cases/NC-1009'],
  ['s-brooks', '/#/unit'],
  ['s-brooks', '/#/cases/NC-1037'],
  ['s-brooks', '/#/access-log'],
  ['p-nguyen', '/#/referrals'],
  ['p-nguyen', '/#/referrals/new'],
  ['p-nguyen', '/#/cases/NC-1030'],
]

for (const [who, path] of PAGES) {
  test(`no accessibility violations (WCAG 2.1 AA): ${path} as ${who}`, async ({ page }) => {
    await page.goto('/#/')
    await viewAs(page, who)
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`)).toEqual([])
  })
}

test('works on a phone without sideways scrolling @phone', async ({ page }) => {
  for (const path of ['/#/', '/#/cases', '/#/cases/NC-1033']) {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(0)
  }
})
