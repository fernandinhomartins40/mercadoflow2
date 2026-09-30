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
      className="lg-soft inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition"
      onClick={onToggleSidebar}
      aria-label="Abrir menu lateral"
    >
      <Menu className="h-4 w-4" strokeWidth={2} />
    </button>
  ) : null;

  return (
    // Topo de vidro em pílula, colado ao rolar.
    <header className={cn('sticky top-0 z-20 px-3 pt-3 sm:px-6', className)}>
      <div className="lg-bar flex min-h-14 items-center justify-between gap-4 rounded-full py-2 pl-3 pr-2 sm:pl-5">
        <div className="flex min-w-0 items-center gap-3">
          {menuButton}

          <div className="min-w-0">
            <span className="block text-xs font-semibold" style={{ color: 'var(--lg-ink3)' }}>
              {section}
            </span>
            <h2 className="truncate text-[1.05rem] font-bold tracking-tight" style={{ color: 'var(--lg-ink)' }}>{title}</h2>
          </div>
        </div>

        {actionSlot ? <div className="flex shrink-0 items-center gap-2">{actionSlot}</div> : null}
      </div>
    </header>
  );
};

export default WorkspaceTopbar;
