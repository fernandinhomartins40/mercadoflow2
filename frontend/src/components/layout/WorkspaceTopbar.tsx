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
      className="inline-flex h-11 shrink-0 items-center justify-center rounded-[14px] border border-[rgba(87,51,30,0.12)] bg-white px-4 text-sm font-semibold text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.06)] transition hover:bg-[rgba(255,247,240,0.92)]"
      onClick={onToggleSidebar}
      aria-label="Abrir menu lateral"
    >
      Menu
    </button>
  ) : null;

  const userCard = (
    <div className="flex min-w-0 items-center gap-3 rounded-[18px] border border-[rgba(87,51,30,0.12)] bg-white px-3 py-2.5 shadow-[0_10px_24px_rgba(44,20,6,0.06)]">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] text-sm font-semibold text-white shadow-[0_12px_24px_rgba(255,106,0,0.18)]">
        {userInitial}
      </span>
      <div className="min-w-0">
        <strong className="block truncate text-[0.94rem] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
          {userName}
        </strong>
        <span className="block truncate text-[0.82rem] text-[color:var(--text-muted)]">{userSubtitle}</span>
      </div>
    </div>
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-[rgba(87,51,30,0.08)] bg-[rgba(252,248,243,0.88)] backdrop-blur-xl',
        className,
      )}
    >
      <div
        className={cn(
          'workspace-stage flex w-full min-w-0 flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8',
          compactMode ? '' : 'xl:flex-row xl:items-center xl:justify-between',
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          {menuButton}

          <div className="min-w-0">
            <span className="block text-[0.74rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              {section}
            </span>
            <h2
              className={cn(
                'mt-1 font-semibold leading-[0.96] tracking-[-0.04em] text-[color:var(--text-primary)]',
                compactMode ? 'text-[clamp(1.55rem,4vw,2rem)]' : 'text-[clamp(1.7rem,2.4vw,2.2rem)]',
              )}
            >
              {title}
            </h2>
            <span className="mt-1.5 block max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">{subtitle}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3 xl:max-w-[56rem] xl:items-end">
          {badges ? <div className="flex flex-wrap gap-2 xl:justify-end">{badges}</div> : null}

          <div className="flex min-w-0 flex-col gap-3 xl:w-full xl:items-end">
            <div className="flex min-w-0 flex-col gap-3 xl:w-full xl:flex-row xl:items-center xl:justify-end">
              {searchSlot ? <div className="min-w-0 xl:max-w-[460px] xl:flex-1">{searchSlot}</div> : null}

              <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                {userCard}
                {actionSlot ? <div className="flex flex-wrap gap-3">{actionSlot}</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
