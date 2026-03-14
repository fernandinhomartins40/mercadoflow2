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
  className,
}) => {
  return (
    <header
      className={cn(
        'dashboard-topbar header flex flex-col gap-5 rounded-[28px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,252,248,0.92)] p-5 shadow-[0_20px_50px_rgba(44,20,6,0.08)] xl:flex-row xl:items-start xl:justify-between xl:gap-6',
        className,
      )}
    >
      <div className="dashboard-topbar-main flex min-w-0 flex-1 flex-col gap-4">
        <div className="dashboard-topbar-title-row flex items-start gap-4">
          <button
            type="button"
            className="sidebar-toggle inline-flex h-11 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] lg:hidden"
            onClick={onToggleSidebar}
            aria-label="Abrir menu lateral"
          >
            Menu
          </button>
          <div className="header-copy min-w-0">
            <span className="header-breadcrumb block text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
              {section} / {title}
            </span>
            <h2 className="mt-2 text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-[color:var(--text-primary)]">
              {title}
            </h2>
            <span className="header-subtitle mt-3 block max-w-3xl text-[0.98rem] leading-7 text-[color:var(--text-muted)]">
              {subtitle}
            </span>
          </div>
        </div>

        {badges ? <div className="header-meta-row flex flex-wrap gap-3">{badges}</div> : null}
      </div>

      <div className="header-actions flex w-full flex-col gap-4 xl:w-auto xl:min-w-[320px]">
        {searchSlot}

        <div className="flex items-center gap-3 self-end rounded-[20px] border border-[rgba(87,51,30,0.12)] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(44,20,6,0.06)]">
          <span className="workspace-user-avatar inline-flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] text-lg font-semibold text-white shadow-[0_14px_28px_rgba(255,106,0,0.24)]">
            {userInitial}
          </span>
          <div className="min-w-0">
            <strong className="block truncate text-base font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">{userName}</strong>
            <span className="block truncate text-sm text-[color:var(--text-muted)]">{userSubtitle}</span>
          </div>
        </div>

        {actionSlot ? <div className="flex flex-wrap justify-end gap-3">{actionSlot}</div> : null}
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
