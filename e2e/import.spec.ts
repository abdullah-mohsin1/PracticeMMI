import { expect, test, type Page } from "@playwright/test";
import { buildQuestionBank } from "./helpers/pdf";

const MULTI_LINE = "A neighbour asks you to keep a secret that may harm someone else. What would you do?";
const CROSS_PAGE =
  "A classmate copies your lab report and asks you to stay quiet about what happened during the term, and this question continues across the page break. How do you respond?";
const RELATIVE = "Explain a difficult decision to an upset relative.";
const UNSORTED = "Describe a question with no matching category.";

async function signIn(page: Page, email: string) {
  await page.goto("/PracticeMMI/questions/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.getByRole("button", { name: /add new account/i }).click();
  await popup.locator("#email-input").fill(email);
  await popup.locator("#display-name-input").fill(email.split("@")[0]);
  await popup.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();
}

async function openPreview(page: Page) {
  await page.getByRole("link", { name: "Import questions from a PDF" }).click();
  await expect(page.getByRole("heading", { name: "Import questions" })).toBeVisible();
  const input = page.getByLabel("PDF file");
  await expect(input).toBeEnabled();
  await input.setInputFiles({ name: "bank.pdf", mimeType: "application/pdf", buffer: await buildQuestionBank() });
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
}

async function viewLibrary(page: Page) {
  await page.getByRole("link", { name: "View your questions" }).click();
  await expect(page.getByRole("heading", { name: "Your questions" })).toBeVisible();
}

const row = (page: Page, index: number) => page.getByTestId(`row-${index}`);
const importButton = (page: Page) => page.getByRole("button", { name: /^Import \d+ questions$/ });

test("previews, corrects and imports a PDF, then finds the questions alongside manual ones", async ({ page }) => {
  await signIn(page, "importer@example.test");
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("A question I typed myself");
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "A question I typed myself" })).toBeVisible();

  await openPreview(page);

  await expect(page.getByText("5 found in bank.pdf. 3 ready, 1 duplicates, 1 need attention.")).toBeVisible();
  await expect(row(page, 0).getByLabel("Question text")).toHaveValue(MULTI_LINE);
  await expect(row(page, 0).getByLabel("Follow-up prompts (one per line)")).toHaveValue("Would your answer change for a family member?");
  await expect(row(page, 1).getByLabel("Question text")).toHaveValue(CROSS_PAGE);
  await expect(row(page, 0).getByRole("combobox")).toHaveValue("ethical");
  await expect(row(page, 2).getByRole("combobox")).toHaveValue("communication");
  await expect(row(page, 3)).toContainText("Skipped: same as question 1 in this file");
  await expect(row(page, 4)).toContainText("Choose a category.");

  await row(page, 2).getByLabel("Question text").fill(`${RELATIVE} Corrected.`);
  await row(page, 4).getByRole("combobox").selectOption("critical_thinking");
  await row(page, 1).getByRole("checkbox").uncheck();
  await expect(row(page, 1)).toContainText("Won't be imported");

  await expect(importButton(page)).toHaveText("Import 3 questions");
  await importButton(page).click();
  await expect(page.getByText("Import complete. 3 saved.")).toBeVisible();

  await viewLibrary(page);
  await expect(page.getByRole("listitem").filter({ hasText: MULTI_LINE })).toContainText("Ethical decision-making · Medium · Imported");
  await expect(page.getByText("Would your answer change for a family member?")).toBeVisible();
  await expect(page.getByText(`${RELATIVE} Corrected.`)).toBeVisible();
  await expect(page.getByText(CROSS_PAGE)).toHaveCount(0);

  await page.getByLabel("Filter by source").selectOption("pdf_import");
  await expect(page.getByText("A question I typed myself")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing 3 of 3");
  await page.getByLabel("Filter by category").selectOption("critical_thinking");
  await expect(page.getByText(UNSORTED)).toBeVisible();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing 1 of 1");
  await page.getByLabel("Filter by source").selectOption("manual");
  await expect(page.getByText("No questions match these filters.")).toBeVisible();

  await page.getByLabel("Filter by source").selectOption("");
  await page.getByLabel("Filter by category").selectOption("");
  await page.getByLabel("Search").fill("typed myself");
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing 1 of 1");
});

test("importing the same PDF again creates no duplicates", async ({ page }) => {
  await signIn(page, "repeat@example.test");
  await openPreview(page);
  await row(page, 4).getByRole("combobox").selectOption("policy");
  await importButton(page).click();
  await expect(page.getByText("Import complete. 4 saved.")).toBeVisible();

  await viewLibrary(page);
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing 4 of 4");

  await openPreview(page);
  await expect(page.getByText("5 found in bank.pdf. 0 ready, 4 duplicates, 1 need attention.")).toBeVisible();
  await expect(row(page, 0)).toContainText("Skipped: already in your library");
  await row(page, 0).getByText("Review the existing question").click();
  await expect(row(page, 0).locator("details p")).toHaveText(MULTI_LINE);
  await expect(importButton(page)).toBeDisabled();
});

test("an imported question can be edited and deleted like any other", async ({ page }) => {
  await signIn(page, "editor@example.test");
  await openPreview(page);
  for (const index of [1, 2, 3, 4]) await row(page, index).getByRole("checkbox").uncheck();
  await importButton(page).click();
  await expect(page.getByText("Import complete. 1 saved.")).toBeVisible();
  await viewLibrary(page);

  const item = page.getByRole("list").first().getByRole("listitem").filter({ hasText: MULTI_LINE });
  await item.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Edited import");
  await page.getByRole("button", { name: "Save changes" }).click();
  const edited = page.getByRole("list").first().getByRole("listitem").filter({ hasText: "Edited import" });
  await expect(edited).toContainText("Imported");
  await edited.getByRole("button", { name: "Delete" }).click();
  await edited.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("You haven't added any questions yet.")).toBeVisible();
});

test("a failed save can be retried without losing or duplicating questions", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, "flaky@example.test");
  await openPreview(page);
  await row(page, 4).getByRole("combobox").selectOption("policy");

  await page.route("**/google.firestore.v1.Firestore/Write/**", (route) => route.abort());
  await importButton(page).click();
  const failure = page.getByRole("main").getByRole("alert");
  await expect(failure).toContainText("4 couldn't be saved", { timeout: 40_000 });
  await expect(page.getByLabel("Question text").first()).toHaveValue(MULTI_LINE);

  await page.unroute("**/google.firestore.v1.Firestore/Write/**");
  await failure.getByRole("button", { name: "Retry 4 remaining" }).click();
  await expect(page.getByText(/Import complete\./)).toBeVisible({ timeout: 30_000 });

  await viewLibrary(page);
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing 4 of 4");
  await page.reload();
  await expect(page.getByRole("main").getByRole("status")).toHaveText("Showing 4 of 4");
});

test("rejects a file that isn't a real PDF", async ({ page }) => {
  await signIn(page, "badfile@example.test");
  await page.getByRole("link", { name: "Import questions from a PDF" }).click();
  const input = page.getByLabel("PDF file");
  await expect(input).toBeEnabled();
  await input.setInputFiles({ name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await expect(page.getByRole("main").getByRole("alert")).toContainText("couldn't be read as a PDF");
});

test("one person's imports are invisible to another", async ({ page }) => {
  await signIn(page, "owner-a@example.test");
  await openPreview(page);
  await row(page, 4).getByRole("combobox").selectOption("policy");
  await importButton(page).click();
  await expect(page.getByText("Import complete. 4 saved.")).toBeVisible();
  await viewLibrary(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

  await signIn(page, "owner-b@example.test");
  await expect(page.getByText("You haven't added any questions yet.")).toBeVisible();
  await expect(page.getByText(MULTI_LINE)).toHaveCount(0);
});
