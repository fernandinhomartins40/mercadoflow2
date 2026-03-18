import React from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

export interface WorkspaceNavItem {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  exact?: boolean;
}

export interface WorkspaceNavSection {
  title: string;
  items: WorkspaceNavItem[];
}

interface WorkspaceSidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  desktopPinned: boolean;
  brandMark: string;
  brandTitle: string;
  brandSubtitle: string;
  userKicker: string;
  userName: string;
  userEmail: string;
  userChips: Array<{ label: string; subtle?: boolean }>;
  sections: WorkspaceNavSection[];
  supportKicker?: string;
  supportTitle?: string;
  supportText?: string;
  footer?: React.ReactNode;
  desktopWidthClassName?: string;
  collapsed?: boolean;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  mobileOpen,
  onClose,
  desktopPinned,
  brandMark,
  brandTitle,
  brandSubtitle,
  userName,
  userEmail,
  sections,
  footer,
  desktopWidthClassName,
  collapsed = false,
}) => {
  const compactDrawer = !desktopPinned;
  const iconOnlyDesktop = desktopPinned && collapsed;
  const userInitial = (userName || brandMark || '?').trim().charAt(0).toUpperCase();

  return (
    <>
      {!desktopPinned ? (
        <button
          type="button"
          className={cn(
            'fixed inset-0 z-40 bg-[rgba(20,12,8,0.32)] backdrop-blur-[2px] transition duration-200',
            mobileOpen ? 'visible opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={onClose}
          aria-label="Fechar menu lateral"
        />
      ) : null}

      <aside
        className={cn(
          'flex min-w-0 flex-col bg-[rgba(255,253,250,0.98)] text-[color:var(--text-primary)] transition duration-300',
          desktopPinned
            ? cn(
                'fixed inset-y-0 left-0 z-30 h-screen border-r border-[rgba(87,51,30,0.08)] shadow-[8px_0_24px_rgba(44,20,6,0.05)]',
                desktopWidthClassName || (iconOnlyDesktop ? 'w-24' : 'w-64'),
              )
            : cn(
                'fixed inset-y-3 left-3 z-50 w-[min(320px,calc(100vw-24px))] max-w-[calc(100vw-24px)] rounded-[24px] border border-[rgba(87,51,30,0.12)] shadow-[0_24px_60px_rgba(44,20,6,0.18)]',
                mobileOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-[110%] opacity-0',
              ),
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className={cn('flex h-16 items-center justify-between border-b border-[rgba(87,51,30,0.08)]', iconOnlyDesktop ? 'px-3' : 'px-4')}>
            <div className={cn('flex min-w-0 items-center gap-3', iconOnlyDesktop ? 'justify-center' : '')}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] text-sm font-semibold text-white shadow-[0_12px_24px_rgba(255,106,0,0.2)]">
                {brandMark}
              </div>

              {!iconOnlyDesktop ? (
                <div className="min-w-0">
                  <p className="truncate text-[1.02rem] font-semibold tracking-[-0.03em] text-[color:var(--text-primary)]">{brandTitle}</p>
                  <p className="truncate text-xs text-[color:var(--text-muted)]">{brandSubtitle}</p>
                </div>
              ) : null}
            </div>

            {!desktopPinned ? (
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(87,51,30,0.12)] bg-white text-[color:var(--text-primary)] shadow-[0_10px_24px_rgba(44,20,6,0.08)] transition hover:bg-[rgba(255,247,240,0.92)]"
                onClick={onClose}
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            ) : null}
          </div>

          {!desktopPinned && !iconOnlyDesktop ? (
            <div className="border-b border-[rgba(87,51,30,0.08)] px-4 py-4">
              <div className="rounded-[18px] border border-[rgba(255,106,0,0.12)] bg-[rgba(255,247,239,0.8)] p-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(255,106,0,0.12)] text-sm font-semibold text-[color:var(--accent-strong)]">
                    {userInitial}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[color:var(--text-primary)]">{userName}</p>
                    <p className="truncate text-xs text-[color:var(--text-muted)]">{userEmail}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden', iconOnlyDesktop ? 'px-2' : 'px-3')}>
            {sections.map((section) => (
              <section key={section.title} className="mb-5">
                {!iconOnlyDesktop ? (
                  <h3 className="mb-2 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                    {section.title}
                  </h3>
                ) : null}

                <nav className="space-y-1">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      end={item.exact}
                      to={item.to}
                      title={iconOnlyDesktop ? item.label : `${item.label} - ${item.hint}`}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center rounded-[14px] text-sm font-medium transition-colors',
                          iconOnlyDesktop ? 'justify-center px-0 py-3' : 'justify-between px-3 py-2.5',
                          isActive
                            ? 'bg-[rgba(255,106,0,0.1)] text-[color:var(--accent-strong)]'
                            : 'text-[color:var(--text-muted)] hover:bg-[rgba(47,23,11,0.04)] hover:text-[color:var(--text-primary)]',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={cn(
                                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-colors',
                                isActive
                                  ? 'bg-[rgba(255,106,0,0.14)] text-[color:var(--accent-strong)]'
                                  : 'bg-[rgba(47,23,11,0.05)] text-[color:var(--text-muted)] group-hover:bg-[rgba(255,106,0,0.1)] group-hover:text-[color:var(--accent-strong)]',
                              )}
                            >
                              <item.icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                            </span>

                            {!iconOnlyDesktop ? <span className="truncate">{item.label}</span> : null}
                          </div>

                          {!iconOnlyDesktop && isActive ? <span className="h-2 w-2 rounded-full bg-[color:var(--accent-primary)]" /> : null}
                        </>
                      )}
                    </NavLink>
                  ))}
                </nav>
              </section>
            ))}
          </div>

          {footer ? (
            <div className={cn('border-t border-[rgba(87,51,30,0.08)]', iconOnlyDesktop ? 'p-3' : 'p-4')}>
              {footer}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
};

export default WorkspaceSidebar;
