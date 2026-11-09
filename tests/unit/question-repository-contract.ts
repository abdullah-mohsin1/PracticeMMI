// The behaviour any QuestionRepository must have. Terminal 1 can run this
// against the Firestore emulator by passing in its own factory.
import { beforeEach, describe, expect, it } from "vitest";
import { RepositoryError, type QuestionRepository } from "@/lib/contracts";

const input = { text: "  Why medicine?  ", category: " Motivation ", notes: "" };

export function describeQuestionRepository(name: string, create: (owner: string) => QuestionRepository | Promise<QuestionRepository>) {
  describe(`QuestionRepository: ${name}`, () => {
    let repository: QuestionRepository;
    beforeEach(async () => {
      repository = await create("owner-a");
    });

    it("creates a trimmed question", async () => {
      expect(await repository.create(input)).toMatchObject({ text: "Why medicine?", category: "Motivation", notes: null, ownerId: "owner-a" });
    });

    it("lists newest first", async () => {
      const first = await repository.create({ ...input, text: "First" });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await repository.create({ ...input, text: "Second" });
      expect((await repository.list()).map((question) => question.id)).toEqual([second.id, first.id]);
    });

    it("updates a question", async () => {
      const created = await repository.create(input);
      const updated = await repository.update(created.id, { text: "Changed", category: null, notes: "N" });
      expect(updated).toMatchObject({ id: created.id, text: "Changed", category: null, notes: "N", createdAt: created.createdAt });
      expect((await repository.list())[0]?.text).toBe("Changed");
    });

    it("rejects an empty question with code invalid", async () => {
      await expect(repository.create({ text: "   ", category: null, notes: null })).rejects.toMatchObject({ code: "invalid" });
    });

    it("rejects updating a missing question with code not_found", async () => {
      const failure = await repository.update("missing", input).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(RepositoryError);
      expect(failure).toMatchObject({ code: "not_found" });
    });

    it("removes a question, and removing it again succeeds", async () => {
      const created = await repository.create(input);
      await repository.remove(created.id);
      await repository.remove(created.id);
      expect(await repository.list()).toEqual([]);
    });

    it("keeps each owner's questions private", async () => {
      const mine = await repository.create(input);
      const other = await create("owner-b");
      expect(await other.list()).toEqual([]);
      await expect(other.update(mine.id, input)).rejects.toMatchObject({ code: "not_found" });
      await other.remove(mine.id);
      expect(await repository.list()).toHaveLength(1);
    });
  });
}
