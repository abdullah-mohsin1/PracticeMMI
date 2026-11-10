"use client";

import { useId, useRef, type ReactNode } from "react";
import { CATEGORIES, type Category } from "@/lib/questions/schema";

export const CATEGORY_SHORT_LABELS: Record<Category, string> = {
  ethical: "Ethical",
  critical_thinking: "Critical thinking",
  problem_solving: "Problem solving",
  communication: "Communication",
  policy: "Policy",
  personal: "Personal",
};

/** A short label for a stored category, or the raw value when it isn't one we know. */
export function categoryShortLabel(value: string | null): string | null {
  if (!value) return null;
  return (CATEGORY_SHORT_LABELS as Record<string, string>)[value] ?? value;
}

interface QuestionFiltersProps {
  search: string;
  onSearch: (term: string) => void;
  /** An empty string means every category. */
  category: string;
  onCategory: (category: string) => void;
  /** For example "Showing 3 of 10". */
  status: string;
  /** Any further filters, shown under the categories. */
  children?: ReactNode;
}

/** Search box and one-tap category filters. Results update as you type; Search confirms. */
export function QuestionFilters({ search, onSearch, category, onCategory, status, children }: QuestionFiltersProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="filter-panel">
      <form
        role="search"
        className="search-row"
        onSubmit={(event) => {
          event.preventDefault();
          // Applying is instant, so this just puts the keyboard away on phones.
          inputRef.current?.blur();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Search questions
        </label>
        <input ref={inputRef} id={inputId} type="search" placeholder="Search for a question" value={search} onChange={(event) => onSearch(event.target.value)} />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>
      <div className="chip-row" role="group" aria-label="Filter by category">
        <button type="button" className="btn filter-chip" aria-pressed={category === ""} onClick={() => onCategory("")}>
          All
        </button>
        {CATEGORIES.map((value) => (
          <button key={value} type="button" className="btn filter-chip" aria-pressed={category === value} onClick={() => onCategory(value)}>
            {CATEGORY_SHORT_LABELS[value]}
          </button>
        ))}
      </div>
      {children}
      <p className="hint" role="status">
        {status}
      </p>
    </div>
  );
}
