import React from 'react';
import { cn } from '../../lib/cn';

interface WorkspaceTopbarProps {
  section: string;
  title: string;
  subtitle: string;
  badges?: React.ReactNode;
  searchSlot?: React.ReactNode;
  actionSlot?: React.ReactNode;
  userName: string;
  userSubtitle: string;
  userInitial: string;
  onToggleSidebar: () => void;
  showMenuToggle?: boolean;
  desktopPinned?: boolean;
  className?: string;
}

const WorkspaceTopbar: React.FC<WorkspaceTopbarProps> = ({
  section,
  title,
  subtitle,
  badges,
  searchSlot,
  actionSlot,
  userName,
  userSubtitle,
  userInitial,
  onToggleSidebar,
  showMenuToggle = true,
  desktopPinned = false,
  className,
}) => {
  const compactMode = !desktopPinned;
  const menuButton = showMenuToggle ? (
    <button
      type="button"
      className="inline-flex h-11 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:-translate-y-px hover:bg-[rgba(255,247,240,0.92)]"
      onClick={onToggleSidebar}
      aria-label="Abrir menu lateral"
    >
      Menu
    </button>
  ) : null;

  const userCard = (
    <div
      className={cn(
        'flex items-center gap-3 rounded-[20px] border border-[rgba(87,51,30,0.12)] bg-white shadow-[0_10px_24px_rgba(44,20,6,0.06)]',
        compactMode ? 'w-auto max-w-full px-3 py-2.5 sm:min-w-[220px] sm:max-w-[320px]' : 'w-full px-4 py-3 sm:w-auto sm:min-w-[270px]',
      )}
    >
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] font-semibold text-white shadow-[0_14px_28px_rgba(255,106,0,0.24)]',
          compactMode ? 'h-10 w-10 text-base' : 'h-12 w-12 text-lg',
        )}
      >
        {userInitial}
      </span>
      <div className="min-w-0">
        <strong className={cn('block truncate font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]', compactMode ? 'text-[0.98rem]' : 'text-base')}>
          {userName}
        </strong>
        <span className={cn('block truncate text-[color:var(--text-muted)]', compactMode ? 'text-[0.9rem]' : 'text-sm')}>{userSubtitle}</span>
      </div>
    </div>
  );

  return (
    <header
      className={cn(
        compactMode
          ? 'rounded-[26px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,252,248,0.92)] p-4 shadow-[0_20px_50px_rgba(44,20,6,0.08)] sm:p-5'
          : 'grid gap-5 rounded-[28px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,252,248,0.92)] p-5 shadow-[0_20px_50px_rgba(44,20,6,0.08)] xl:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] xl:items-start',
        className,
      )}
    >
      {compactMode ? (
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {menuButton}
              </div>
              <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-3">
                {userCard}
                {actionSlot ? <div className="flex flex-wrap justify-end gap-3">{actionSlot}</div> : null}
              </div>
            </div>

            <div className="min-w-0">
              <span className="block text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                {section}
              </span>
              <h2 className="mt-2 max-w-4xl text-[clamp(1.85rem,4vw,2.75rem)] font-semibold leading-[0.94] tracking-[-0.06em] text-[color:var(--text-primary)]">
                {title}
              </h2>
              <span className="mt-3 block max-w-3xl text-[0.95rem] leading-6 text-[color:var(--text-muted)]">
                {subtitle}
              </span>
            </div>

            {badges ? <div className="flex flex-wrap gap-3">{badges}</div> : null}

            {searchSlot ? <div className="w-full">{searchSlot}</div> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4">
              <div className="min-w-0">
                <span className="block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  {section}
                </span>
                <h2 className="mt-2 max-w-4xl text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-[color:var(--text-primary)]">
                  {title}
                </h2>
                <span className="mt-3 block max-w-3xl text-[0.98rem] leading-7 text-[color:var(--text-muted)]">
                  {subtitle}
                </span>
              </div>
            </div>

            {badges ? <div className="flex flex-wrap gap-3">{badges}</div> : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4 xl:min-w-[280px] xl:items-end">
            {searchSlot ? <div className="w-full xl:max-w-[420px]">{searchSlot}</div> : null}
            {userCard}
            {actionSlot ? <div className="flex w-full flex-wrap gap-3 xl:justify-end">{actionSlot}</div> : null}
          </div>
        </>
      )}
    </header>
  );
};

export default WorkspaceTopbar;
