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
  const menuButton = showMenuToggle ? (
    <button
      type="button"
      className="inline-flex h-10 shrink-0 items-center justify-center rounded-[12px] border border-[rgba(87,51,30,0.12)] bg-white px-3 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_8px_18px_rgba(44,20,6,0.06)] transition hover:bg-[rgba(255,247,240,0.92)]"
      onClick={onToggleSidebar}
      aria-label="Abrir menu lateral"
    >
      Menu
    </button>
  ) : null;

  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-[rgba(87,51,30,0.08)] bg-[rgba(252,248,243,0.94)] backdrop-blur-xl',
        className,
      )}
    >
      <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {menuButton}

            <div className="min-w-0">
              <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                {section}
              </span>
              <h2 className="truncate text-[1.1rem] font-semibold tracking-[-0.03em] text-[color:var(--text-primary)]">{title}</h2>
              {!desktopPinned ? <span className="block truncate text-xs text-[color:var(--text-muted)]">{subtitle}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {badges}

            <div className="hidden sm:flex items-center gap-3 rounded-[14px] border border-[rgba(87,51,30,0.12)] bg-white px-3 py-2 shadow-[0_8px_18px_rgba(44,20,6,0.05)]">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] text-sm font-semibold text-white">
                {userInitial}
              </span>
              <div className="min-w-0">
                <strong className="block max-w-[12rem] truncate text-sm font-semibold text-[color:var(--text-primary)]">{userName}</strong>
                <span className="block max-w-[12rem] truncate text-[0.78rem] text-[color:var(--text-muted)]">{userSubtitle}</span>
              </div>
            </div>

            {actionSlot ? <div className="flex flex-wrap items-center gap-3">{actionSlot}</div> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm leading-6 text-[color:var(--text-muted)]">{subtitle}</p>
          {searchSlot ? <div className="min-w-0 w-full sm:w-auto sm:min-w-[320px]">{searchSlot}</div> : null}
        </div>
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
