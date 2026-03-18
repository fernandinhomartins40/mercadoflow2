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
  userKicker,
  userName,
  userEmail,
  userChips,
  sections,
  supportKicker,
  supportTitle,
  supportText,
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
          'flex min-w-0 flex-col text-[color:var(--text-primary)] transition duration-300',
          desktopPinned
            ? cn(
                'fixed inset-y-0 left-0 z-30 h-screen shrink-0 border-r border-[rgba(87,51,30,0.08)] bg-[rgba(255,253,250,0.96)] shadow-[10px_0_34px_rgba(44,20,6,0.05)] backdrop-blur-xl',
                desktopWidthClassName || (iconOnlyDesktop ? 'w-[96px]' : 'w-[304px]'),
              )
            : cn(
                'fixed inset-y-3 left-3 z-50 w-[min(320px,calc(100vw-24px))] max-w-[calc(100vw-24px)] rounded-[28px] border border-[rgba(87,51,30,0.12)] bg-[rgba(255,253,250,0.98)] shadow-[0_24px_60px_rgba(44,20,6,0.18)] backdrop-blur-xl',
                mobileOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-[110%] opacity-0',
              ),
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div
            className={cn(
              'border-b border-[rgba(87,51,30,0.08)]',
              compactDrawer ? 'px-4 py-4' : iconOnlyDesktop ? 'px-3 py-5' : 'px-6 py-6',
            )}
          >
            <div className={cn('flex items-start justify-between gap-3', iconOnlyDesktop ? 'justify-center' : '')}>
              <div className={cn('flex min-w-0 items-center gap-3', iconOnlyDesktop ? 'justify-center' : '')}>
                <div
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] font-semibold tracking-[-0.03em] text-white shadow-[0_14px_26px_rgba(255,106,0,0.22)]',
                    compactDrawer ? 'h-11 w-11 text-base' : iconOnlyDesktop ? 'h-12 w-12 text-lg' : 'h-12 w-12 text-lg',
                  )}
                  title={brandTitle}
                >
                  {brandMark}
                </div>

                {!iconOnlyDesktop ? (
                  <div className="min-w-0">
                    <h1 className="truncate text-[1.12rem] font-semibold tracking-[-0.03em] text-[color:var(--text-primary)]">
                      {brandTitle}
                    </h1>
                    <p className="mt-1 text-sm leading-5 text-[color:var(--text-muted)]">{brandSubtitle}</p>
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

            {!iconOnlyDesktop ? (
              <div className="mt-5 rounded-[22px] border border-[rgba(255,106,0,0.12)] bg-[linear-gradient(180deg,rgba(255,246,237,0.92)_0%,rgba(255,255,255,0.9)_100%)] p-4">
                <span className="text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--accent-strong)]">
                  {userKicker}
                </span>

                <div className="mt-3 flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(255,106,0,0.12)] text-sm font-semibold text-[color:var(--accent-strong)]">
                    {userInitial}
                  </span>

                  <div className="min-w-0">
                    <strong className="block truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">
                      {userName}
                    </strong>
                    <span className="mt-0.5 block truncate text-sm text-[color:var(--text-muted)]">{userEmail}</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {userChips.map((chip) => (
                    <span
                      key={chip.label}
                      className={cn(
                        'inline-flex min-h-8 items-center justify-center rounded-full px-3 text-xs font-semibold',
                        chip.subtle
                          ? 'bg-[rgba(47,23,11,0.05)] text-[color:var(--text-muted)]'
                          : 'bg-[rgba(255,106,0,0.12)] text-[color:var(--accent-strong)]',
                      )}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
              compactDrawer ? 'gap-5 px-3 py-4' : iconOnlyDesktop ? 'gap-5 px-3 py-5' : 'gap-6 px-4 py-5',
            )}
          >
            <div className={cn('grid min-w-0', compactDrawer ? 'gap-5' : iconOnlyDesktop ? 'gap-5' : 'gap-6')}>
              {sections.map((section) => (
                <section key={section.title} className="grid min-w-0 gap-2">
                  {!iconOnlyDesktop ? (
                    <span className="px-3 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                      {section.title}
                    </span>
                  ) : null}

                  <nav className="grid min-w-0 gap-1.5">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        end={item.exact}
                        to={item.to}
                        title={iconOnlyDesktop ? item.label : `${item.label} - ${item.hint}`}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'group border transition',
                            iconOnlyDesktop
                              ? 'grid h-12 place-items-center rounded-[18px]'
                              : 'grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-[18px] px-3 py-2.5',
                            isActive
                              ? 'border-[rgba(255,106,0,0.16)] bg-[rgba(255,106,0,0.1)] text-[color:var(--accent-strong)] shadow-[0_10px_18px_rgba(255,106,0,0.08)]'
                              : 'border-transparent text-[color:var(--text-muted)] hover:border-[rgba(87,51,30,0.08)] hover:bg-[rgba(47,23,11,0.04)] hover:text-[color:var(--text-primary)]',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] transition',
                                isActive
                                  ? 'bg-[rgba(255,106,0,0.14)] text-[color:var(--accent-strong)]'
                                  : 'bg-[rgba(47,23,11,0.05)] text-[color:var(--text-muted)] group-hover:bg-[rgba(255,106,0,0.1)] group-hover:text-[color:var(--accent-strong)]',
                              )}
                            >
                              <item.icon className="h-[18px] w-[18px]" strokeWidth={2.1} />
                            </span>

                            {!iconOnlyDesktop ? (
                              <span className="min-w-0">
                                <strong className="block truncate text-[0.96rem] font-semibold tracking-[-0.02em]">
                                  {item.label}
                                </strong>
                                {compactDrawer ? (
                                  <span className="mt-0.5 block text-[0.8rem] leading-5 text-[color:var(--text-muted)]">
                                    {item.hint}
                                  </span>
                                ) : null}
                              </span>
                            ) : null}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </nav>
                </section>
              ))}
            </div>

            {supportTitle && !iconOnlyDesktop ? (
              <div className="mt-auto rounded-[24px] border border-[rgba(255,106,0,0.12)] bg-[linear-gradient(180deg,rgba(255,247,239,0.96)_0%,rgba(255,255,255,0.92)_100%)] p-4">
                {supportKicker ? (
                  <span className="text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--accent-strong)]">
                    {supportKicker}
                  </span>
                ) : null}
                <strong className="mt-3 block text-[1rem] font-semibold leading-6 tracking-[-0.03em] text-[color:var(--text-primary)]">
                  {supportTitle}
                </strong>
                {supportText ? <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{supportText}</p> : null}
              </div>
            ) : null}
          </div>

          {footer ? (
            <div
              className={cn(
                'border-t border-[rgba(87,51,30,0.08)]',
                compactDrawer ? 'px-3 py-3' : iconOnlyDesktop ? 'px-3 py-4' : 'px-4 py-4',
              )}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
};

export default WorkspaceSidebar;
