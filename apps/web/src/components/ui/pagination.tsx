import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button.js';
import { Select, toOptions } from './select.js';

const PAGE_SIZES = ['5', '10', '25', '50'];

/** Paginação client-side reutilizável. */
export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return {
    pageItems,
    page: current,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
  };
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  pageItems?: unknown;
  label?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  setPage,
  setPageSize,
  label = 'itens',
}: PaginationProps) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-4 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <p className="text-xs text-fg-muted">
        <span className="font-mono text-fg">{from}</span>–<span className="font-mono text-fg">{to}</span>{' '}
        de <span className="font-mono text-fg">{total}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        <Select
          size="sm"
          className="w-[110px]"
          value={String(pageSize)}
          onChange={(v) => setPageSize(Number(v))}
          options={toOptions(PAGE_SIZES).map((o) => ({ ...o, label: `${o.label} / pág` }))}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={15} />
        </Button>
        <span className="min-w-[56px] text-center font-mono text-xs text-fg-muted">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
}
