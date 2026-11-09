import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  await page.goto("/PracticeMMI/questions/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  const existing = popup.getByText(email, { exact: true });
  if (await existing.count()) {
    await existing.click();
  } else {
    await popup.getByRole("button", { name: /add new account/i }).click();
    await popup.locator("#email-input").fill(email);
    await popup.locator("#display-name-input").fill(email.split("@")[0]);
    await popup.getByRole("button", { name: /sign in/i }).click();
  }
}

const question = (page: Page, text: string) => page.getByRole("listitem").filter({ hasText: text });

test("a signed-in person can create, read, edit and delete questions that persist", async ({ page }) => {
  await signIn(page, "alice@example.test");
  await expect(page.getByText("Signed in as alice@example.test.")).toBeVisible();
  await expect(page.getByText("You haven't added any questions yet.")).toBeVisible();

  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Should organ donation be opt-out?");
  await page.getByLabel("Category").selectOption("policy");
  await page.getByLabel("Topics (comma separated)").fill("donation, consent");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(question(page, "Should organ donation be opt-out?")).toContainText("Policy · Medium · donation · consent");

  await page.reload();
  await expect(question(page, "Should organ donation be opt-out?")).toBeVisible();

  await question(page, "Should organ donation be opt-out?").getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Should organ donation be opt-in?");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(question(page, "Should organ donation be opt-in?")).toBeVisible();
  await expect(page.getByText("opt-out")).toHaveCount(0);

  await question(page, "opt-in").getByRole("button", { name: "Delete" }).click();
  await question(page, "opt-in").getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("You haven't added any questions yet.")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
});

test("two accounts have separate libraries and never see each other's questions", async ({ page }) => {
  const signOut = async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  };
  const add = async (text: string) => {
    await page.getByRole("textbox", { name: "Question", exact: true }).fill(text);
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(question(page, text)).toBeVisible();
  };

  await signIn(page, "carol@example.test");
  await add("Carol's private question");
  await signOut();

  await signIn(page, "dave@example.test");
  await expect(page.getByText("You haven't added any questions yet.")).toBeVisible();
  await expect(page.getByText("Carol's private question")).toHaveCount(0);
  await add("Dave's private question");
  await signOut();

  await signIn(page, "carol@example.test");
  await expect(question(page, "Carol's private question")).toBeVisible();
  await expect(page.getByText("Dave's private question")).toHaveCount(0);
});

test("invalid input is reported without saving", async ({ page }) => {
  await signIn(page, "erin@example.test");
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("   ");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Enter a question.");
  await expect(page.getByText("You haven't added any questions yet.")).toBeVisible();
});
