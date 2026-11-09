import type { ReactNode } from "react";

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="placeholder" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div className="placeholder-line" key={index} />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
