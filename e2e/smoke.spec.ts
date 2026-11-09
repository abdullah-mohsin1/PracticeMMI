import { expect, test } from "@playwright/test";

test("home page renders under the GitHub Pages path and links to questions", async ({ page }) => {
  await page.goto("/PracticeMMI/");
  await expect(page.getByRole("link", { name: "PracticeMMI" })).toBeVisible();
  await page.getByRole("link", { name: "Your questions" }).click();
  await expect(page).toHaveURL(/\/PracticeMMI\/questions\/$/);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("unknown routes return 404", async ({ page }) => {
  const response = await page.goto("/PracticeMMI/does-not-exist/");
  expect(response?.status()).toBe(404);
});
