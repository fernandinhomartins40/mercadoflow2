import React from 'react';
import { cn } from '../../lib/cn';

interface WorkspaceTopbarProps {
  section: string;
  title: string;
  actionSlot?: React.ReactNode;
  onToggleSidebar: () => void;
  showMenuToggle?: boolean;
  className?: string;
}

const WorkspaceTopbar: React.FC<WorkspaceTopbarProps> = ({
  section,
  title,
  actionSlot,
  onToggleSidebar,
  showMenuToggle = true,
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
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          {menuButton}

          <div className="min-w-0">
            <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              {section}
            </span>
            <h2 className="truncate text-[1.1rem] font-semibold tracking-[-0.03em] text-[color:var(--text-primary)]">{title}</h2>
          </div>
        </div>

        {actionSlot ? <div className="flex shrink-0 items-center gap-3">{actionSlot}</div> : null}
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
