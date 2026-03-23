import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface ModernPaginationProps {
  page: number;
  limit: number;
  totalCount: number;
  onChange: (next: { page: number; limit: number }) => void;
  limitOptions?: number[];
  label?: string;
}

function getPageNumbers(current: number, total: number) {
  const delta = 2;
  const range = [];
  for (let i = Math.max(1, current - delta); i <= Math.min(total, current + delta); i++) {
    range.push(i);
  }
  if (range[0] > 2) {
    range.unshift('...');
  }
  if (range[0] !== 1) {
    range.unshift(1);
  }
  if (range[range.length - 1] < total - 1) {
    range.push('...');
  }
  if (range[range.length - 1] !== total) {
    range.push(total);
  }
  return range;
}

export const CommonPagination: React.FC<ModernPaginationProps> = ({
  page,
  limit,
  totalCount,
  onChange,
  limitOptions = [5, 10, 25, 50],
  label = "Contacts",
}) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const pageNumbers = getPageNumbers(page, totalPages);

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    onChange({ page: p, limit });
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLimit = Number(e.target.value);
    if (!isNaN(newLimit) && newLimit !== limit) {
      onChange({ page: 1, limit: newLimit });
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-8 px-2">
      <div className="text-base text-muted-foreground font-medium">
        Total {totalCount} {label}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="rounded-full p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
          onClick={() => handlePageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        {pageNumbers.map((num, idx) =>
          typeof num === "number" ? (
            <button
              key={num}
              className={`w-9 h-9 rounded-lg font-semibold text-base transition-colors ${
                num === page
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-foreground hover:bg-muted"
              }`}
              onClick={() => handlePageChange(num)}
              aria-current={num === page ? "page" : undefined}
            >
              {num}
            </button>
          ) : (
            <span key={"ellipsis-" + idx} className="px-2 text-lg text-muted-foreground select-none">…</span>
          )
        )}
        <button
          className="rounded-full p-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
          onClick={() => handlePageChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="ml-4">
          <select
            className="rounded-lg border px-3 py-1 text-base bg-background text-foreground focus:border-primary outline-none"
            value={limit}
            onChange={handleLimitChange}
          >
            {limitOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} per page
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
