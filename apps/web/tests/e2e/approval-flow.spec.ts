import { test, expect } from "@playwright/test";

/**
 * Milestone 6 acceptance flow:
 *   1. Open dashboard
 *   2. Navigate to Recovery Cases
 *   3. Open a case requiring approval
 *   4. Approve the case
 *   5. Confirm the status updates
 *
 * Requires a running API (default http://localhost:4000) with a
 * seeded database that has at least one PENDING_APPROVAL case --
 * `npm run prisma:seed` (see apps/api/src/scripts/seed.ts) creates
 * exactly one via a payment large enough to cross
 * HUMAN_APPROVAL_AMOUNT_THRESHOLD. Re-running this test without
 * reseeding will fail on step 3, since approving that case moves it
 * out of PENDING_APPROVAL -- see tests/e2e/README.md.
 */
test("operator can approve a recovery case awaiting review", async ({ page }) => {
  // 1. Open dashboard
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Revenue at risk")).toBeVisible();

  // 2. Navigate to Recovery Cases
  await page.getByRole("link", { name: "Recovery Cases" }).click();
  await expect(page.getByRole("heading", { name: "Recovery Cases" })).toBeVisible();

  // Filter to cases awaiting approval so the flow is deterministic
  // regardless of how many other demo cases exist.
  await page.getByRole("combobox").first().selectOption({ label: "Needs approval" });

  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByText("Needs approval")).toBeVisible();

  // 3. Open the case
  await firstRow.click();
  await expect(page).toHaveURL(/\/cases\/.+/);
  await expect(page.getByText("This case needs your review")).toBeVisible();

  // 4. Approve the case
  await page.getByRole("button", { name: "Approve recovery" }).click();
  await expect(page.getByRole("heading", { name: "Approve this recovery action?" })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  // 5. Confirm the status updates -- the approval panel disappears
  // and the case overview no longer shows "Needs approval".
  await expect(page.getByText("This case needs your review")).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText("Needs approval")).toHaveCount(0);
});
