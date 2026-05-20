import React from 'react';
import { Menu } from 'lucide-react';
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition"
      style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)', color: 'var(--text-muted)' }}
      onClick={onToggleSidebar}
      aria-label="Abrir menu lateral"
    >
      <Menu className="h-4 w-4" strokeWidth={2} />
    </button>
  ) : null;

  return (
    <header
      className={cn('sticky top-0 z-20', className)}
      style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-base)' }}
    >
      <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {menuButton}

          <div className="min-w-0">
            <span className="block text-[0.65rem] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-soft)' }}>
              {section}
            </span>
            <h2 className="truncate text-[1rem] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h2>
          </div>
        </div>

        {actionSlot ? <div className="flex shrink-0 items-center gap-2">{actionSlot}</div> : null}
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
