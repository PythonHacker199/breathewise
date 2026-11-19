import type { ReactNode } from 'react';

export function Card({ children, className = '', labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`rounded-2xl border border-haze-200 bg-white p-6 shadow-sm max-sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function CardTitle({ id, children, icon }: { id: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <h2 id={id} className="mb-4 flex items-center gap-2.5 font-display text-xl font-semibold text-ink">
      {icon && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-haze-100 text-leaf-700" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </h2>
  );
}

const CONTROL =
  'w-full rounded-lg border border-haze-200 bg-white px-3 py-2.5 text-base text-ink outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-leaf-600 aria-[invalid=true]:border-red-700';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; className: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}

/** Label, control, hint and error wired together for screen readers. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children({ id, className: CONTROL, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-haze-200 px-3 py-2 text-sm font-medium text-ink hover:bg-haze-50">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-leaf-700" />
      {label}
    </label>
  );
}

export const BUTTON_PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-leaf-700 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-leaf-600 disabled:cursor-progress disabled:opacity-70';
export const BUTTON_SECONDARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-haze-200 bg-white px-5 py-2.5 font-semibold text-ink transition-colors hover:bg-haze-50 disabled:opacity-60';
