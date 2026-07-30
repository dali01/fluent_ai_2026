import { expect, test } from "@playwright/test";

test("landing page renders and links to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /the modern crm for print businesses/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
});
