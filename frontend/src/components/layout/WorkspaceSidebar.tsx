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
            'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition duration-200',
            mobileOpen ? 'visible opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={onClose}
          aria-label="Fechar menu lateral"
        />
      ) : null}

      <aside
        className={cn(
          'lg-bar flex min-w-0 flex-col text-[#1d1d1f] transition duration-300',
          desktopPinned
            ? cn(
                // Lateral flutuante: 12 px das bordas, cantos de 28 px.
                'fixed bottom-3 left-3 top-3 z-30 rounded-[28px]',
                iconOnlyDesktop ? 'w-16' : 'w-[244px]',
              )
            : cn(
                'fixed inset-y-2 left-2 z-50 w-[min(280px,calc(100vw-16px))] max-w-[calc(100vw-16px)] rounded-[28px]',
                mobileOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-[110%] opacity-0',
              ),
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Brand header */}
          <div className={cn('flex h-16 items-center justify-between', iconOnlyDesktop ? 'px-3' : 'px-4')}>
            <div className={cn('flex min-w-0 items-center gap-2.5', iconOnlyDesktop ? 'justify-center' : '')}>
              <div className="lg-tinted flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold">
                {brandMark}
              </div>

              {!iconOnlyDesktop ? (
                <div className="min-w-0">
                  <p className="truncate text-[1.02rem] font-bold tracking-tight">{brandTitle}</p>
                </div>
              ) : null}
            </div>

            {!desktopPinned ? (
              <button
                type="button"
                className="lg-soft inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-600"
                onClick={onClose}
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            ) : null}
          </div>

          {/* User info (mobile drawer) */}
          {!desktopPinned && !iconOnlyDesktop ? (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/55 px-3 py-2.5 ring-1 ring-white/80">
                <span className="lg-tinted inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                  {userInitial}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{userName}</p>
                  <p className="truncate text-xs text-slate-500">{userEmail}</p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Nav */}
          <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden', iconOnlyDesktop ? 'px-2' : 'px-2')}>
            {sections.map((section) => (
              <section key={section.title} className="mb-4">
                {!iconOnlyDesktop ? (
                  <h3 className="mb-1 px-3 text-xs font-semibold text-slate-500">
                    {section.title}
                  </h3>
                ) : null}

                <nav className="space-y-1">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.to}
                      end={item.exact}
                      to={item.to}
                      title={iconOnlyDesktop ? item.label : `${item.label} — ${item.hint}`}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'group flex items-center rounded-2xl text-sm font-medium',
                          iconOnlyDesktop ? 'justify-center p-2' : 'gap-2.5 px-3 py-2',
                          isActive ? 'lg-tab-on' : 'lg-tab text-slate-700',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            className={cn('h-4 w-4 shrink-0', isActive ? 'text-[#0a7a3d]' : 'text-slate-500 group-hover:text-slate-700')}
                            strokeWidth={2}
                          />
                          {!iconOnlyDesktop ? <span className="truncate">{item.label}</span> : null}
                        </>
                      )}
                    </NavLink>
                  ))}
                </nav>
              </section>
            ))}
          </div>

          {footer ? (
            <div className={cn('border-t border-slate-900/10', iconOnlyDesktop ? 'p-2' : 'p-3')}>
              {footer}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
};

export default WorkspaceSidebar;
