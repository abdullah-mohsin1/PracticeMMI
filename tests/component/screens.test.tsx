// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { PracticeSetup } from "@/components/practice/PracticeSetup";
import { RepositoryError, type Question, type QuestionRepository } from "@/lib/contracts";
import { configureServices } from "@/lib/services";
import { resetConnectionForTests } from "@/lib/storage/idb";
import { LOCAL_USER } from "@/lib/storage/local-services";
import { getSession } from "@/lib/storage/sessions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

function memoryRepository(seed: string[] = []): QuestionRepository & { rows: Question[] } {
  const make = (text: string, index: number): Question => ({ id: `q${index}`, ownerId: "local", text, category: null, notes: null, createdAt: "x", updatedAt: "x" });
  const rows = seed.map(make);
  return {
    rows,
    list: async () => [...rows],
    create: async (input) => {
      const row = { ...make(input.text, rows.length), ...input };
      rows.unshift(row);
      return row;
    },
    update: async (id, input) => {
      const row = rows.find((item) => item.id === id)!;
      Object.assign(row, input);
      return row;
    },
    remove: async (id) => {
      rows.splice(rows.findIndex((item) => item.id === id), 1);
    },
  };
}

function useRepository(seed: string[] = []) {
  const questions = memoryRepository(seed);
  configureServices({ questions, auth: { getCurrentUser: () => LOCAL_USER, onUserChanged: () => () => undefined, signOut: async () => undefined } });
  return questions;
}

beforeEach(() => {
  Object.assign(globalThis, { indexedDB: new IDBFactory(), IDBKeyRange });
  resetConnectionForTests();
  push.mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

describe("Dashboard", () => {
  it("shows an empty bank", async () => {
    useRepository();
    render(<Dashboard />);
    expect(await screen.findByText(/question bank is empty/)).toBeTruthy();
  });

  it("adds a question", async () => {
    const repository = useRepository();
    render(<Dashboard />);
    await screen.findByText(/empty/);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Why medicine?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect(await screen.findByText("Why medicine?")).toBeTruthy();
    expect(repository.rows).toHaveLength(1);
  });

  it("will not save an empty question", async () => {
    const repository = useRepository();
    render(<Dashboard />);
    await screen.findByText(/empty/);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a question.");
    expect(repository.rows).toHaveLength(0);
  });

  it("keeps the text when saving fails", async () => {
    const repository = useRepository();
    repository.create = async () => {
      throw new RepositoryError("unavailable", "down");
    };
    render(<Dashboard />);
    await screen.findByText(/empty/);
    fireEvent.click(screen.getByRole("button", { name: "Add question" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Keep me" } });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/still here/);
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe("Keep me");
  });

  it("edits a question", async () => {
    const repository = useRepository(["Old text"]);
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit: Old text" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "New text" } });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect(await screen.findByText("New text")).toBeTruthy();
    expect(repository.rows[0]?.text).toBe("New text");
  });

  it("deletes a question only after confirming", async () => {
    const repository = useRepository(["Remove me"]);
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete: Remove me" }));
    expect(repository.rows).toHaveLength(1);
    const dialog = screen.getByRole("dialog", { name: "Delete this question?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(repository.rows).toHaveLength(0));
  });
});

describe("PracticeSetup", () => {
  const continueButton = () => screen.getByRole("button", { name: "Continue to device check" }) as HTMLButtonElement;

  it("defaults to 8 minutes of speaking with no preparation time", async () => {
    useRepository();
    render(<PracticeSetup />);
    expect(((await screen.findByLabelText("Speaking time minutes")) as HTMLInputElement).value).toBe("8");
    expect(screen.queryByLabelText("Preparation time minutes")).toBeNull();
  });

  it("starts with a one-off question and doesn't add it to the bank", async () => {
    const repository = useRepository();
    render(<PracticeSetup />);
    await screen.findByLabelText("One-off question");
    expect(continueButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("One-off question"), { target: { value: "A one-off" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to this session" }));
    expect(continueButton().disabled).toBe(false);
    fireEvent.click(continueButton());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const id = new URL(push.mock.calls[0]![0] as string, "http://x").searchParams.get("id")!;
    const session = await getSession(id, "local");
    expect(session?.stations).toEqual([{ station: 1, questionId: null, text: "A one-off" }]);
    expect(repository.rows).toHaveLength(0);
  });

  it("requires eight questions for a full mock and can fill them from the bank", async () => {
    useRepository(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    render(<PracticeSetup />);
    fireEvent.click(await screen.findByRole("radio", { name: /Full mock/ }));
    expect(continueButton().disabled).toBe(true);
    expect(screen.getByText("Add 8 more questions.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fill remaining at random" }));
    expect(continueButton().disabled).toBe(false);
    expect(screen.getByText("Total time: 66 min")).toBeTruthy();
  });

  it("selects saved questions and reorders them", async () => {
    useRepository(["Alpha", "Beta"]);
    render(<PracticeSetup />);
    fireEvent.change(await screen.findByLabelText("Stations"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
    fireEvent.click(screen.getByRole("button", { name: "Move station 1 down" }));
    const items = within(screen.getByRole("region", { name: "Session order" })).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("Beta");
    expect(continueButton().disabled).toBe(false);
  });

  it("blocks invalid timings", async () => {
    useRepository();
    render(<PracticeSetup />);
    fireEvent.change(await screen.findByLabelText("Speaking time minutes"), { target: { value: "0" } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/10 seconds/);
  });
});
