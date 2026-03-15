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
  className,
}) => {
  return (
    <header
      className={cn(
        'workspace-topbar-shell grid gap-5 rounded-[28px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,252,248,0.92)] p-5 shadow-[0_20px_50px_rgba(44,20,6,0.08)] xl:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] xl:items-start',
        className,
      )}
    >
      <div className="workspace-topbar-main flex min-w-0 flex-col gap-4">
        <div className="workspace-topbar-title-row grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
          {showMenuToggle ? (
            <button
              type="button"
              className="workspace-menu-toggle inline-flex h-11 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:-translate-y-px hover:bg-[rgba(255,247,240,0.92)]"
              onClick={onToggleSidebar}
              aria-label="Abrir menu lateral"
            >
              Menu
            </button>
          ) : null}

          <div className="workspace-topbar-copy min-w-0">
            <span className="workspace-topbar-breadcrumb block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              {section}
            </span>
            <h2 className="mt-2 max-w-4xl text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-[color:var(--text-primary)]">
              {title}
            </h2>
            <span className="workspace-topbar-subtitle mt-3 block max-w-3xl text-[0.98rem] leading-7 text-[color:var(--text-muted)]">
              {subtitle}
            </span>
          </div>
        </div>

        {badges ? <div className="workspace-topbar-badges flex flex-wrap gap-3">{badges}</div> : null}
      </div>

      <div className="workspace-topbar-side flex min-w-0 flex-col gap-4 xl:min-w-[280px] xl:items-end">
        {searchSlot ? <div className="w-full xl:max-w-[420px]">{searchSlot}</div> : null}

        <div className="workspace-topbar-user flex w-full items-center gap-3 rounded-[20px] border border-[rgba(87,51,30,0.12)] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(44,20,6,0.06)] sm:w-auto sm:min-w-[270px]">
          <span className="workspace-user-avatar inline-flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] text-lg font-semibold text-white shadow-[0_14px_28px_rgba(255,106,0,0.24)]">
            {userInitial}
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-base font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">{userName}</strong>
            <span className="block truncate text-sm text-[color:var(--text-muted)]">{userSubtitle}</span>
          </div>
        </div>

        {actionSlot ? <div className="workspace-topbar-actions flex w-full flex-wrap gap-3 xl:justify-end">{actionSlot}</div> : null}
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
