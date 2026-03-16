import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
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
}) => {
  const compactDrawer = !desktopPinned;

  return (
    <>
      {!desktopPinned ? (
        <button
          type="button"
          className={cn(
            'fixed inset-0 z-40 bg-[rgba(15,10,8,0.45)] transition duration-200',
            mobileOpen ? 'visible opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={onClose}
          aria-label="Fechar menu lateral"
        />
      ) : null}

      <aside
        className={cn(
          'flex min-w-0 flex-col overflow-hidden rounded-[30px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,#2b1a12_0%,#1b1411_100%)] text-white shadow-[0_28px_80px_rgba(10,6,4,0.34)] transition duration-300',
          desktopPinned
            ? cn('sticky top-7 z-10 h-[calc(100dvh-56px)] shrink-0 translate-x-0 opacity-100', desktopWidthClassName || 'w-[304px]')
            : 'fixed inset-y-4 left-4 z-50 w-[min(332px,calc(100vw-32px))] max-w-[calc(100vw-32px)] ' + (mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-[115%] opacity-0 pointer-events-none'),
        )}
      >
        <div className={cn('flex h-full min-h-0 flex-col', compactDrawer ? 'gap-3' : 'gap-4')}>
          <div className={cn('flex items-start justify-between gap-4', compactDrawer ? 'px-4 pb-1 pt-4' : 'px-5 pb-1 pt-5')}>
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn(
                'inline-flex shrink-0 items-center justify-center bg-[linear-gradient(180deg,#ff8b37_0%,#ff6a00_100%)] font-semibold tracking-[-0.03em] text-white shadow-[0_14px_28px_rgba(255,106,0,0.25)]',
                compactDrawer ? 'h-11 w-11 rounded-[16px] text-base' : 'h-13 w-13 rounded-[18px] text-lg',
              )}>
                {brandMark}
              </div>
              <div className="min-w-0">
                <h1 className={cn('truncate font-semibold tracking-[-0.03em] text-white', compactDrawer ? 'text-[1.06rem]' : 'text-[1.15rem]')}>{brandTitle}</h1>
                <p className={cn('mt-1 leading-5 text-[rgba(255,235,220,0.72)]', compactDrawer ? 'text-[0.9rem]' : 'text-sm')}>{brandSubtitle}</p>
              </div>
            </div>

            {!desktopPinned ? (
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)] text-base font-semibold text-white transition hover:bg-[rgba(255,255,255,0.12)]"
                onClick={onClose}
                aria-label="Fechar menu"
              >
                ×
              </button>
            ) : null}
          </div>

          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
              compactDrawer ? 'gap-3 px-3 pb-3' : 'gap-4 px-4 pb-4',
            )}
          >
            <div className={cn(
              'min-w-0 border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
              compactDrawer ? 'rounded-[20px] p-3' : 'rounded-[24px] p-4',
            )}>
              <span className="text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[rgba(255,220,196,0.78)]">{userKicker}</span>
              <strong className={cn('block font-semibold tracking-[-0.03em] text-white', compactDrawer ? 'mt-2 text-[0.96rem]' : 'mt-3 text-[1.02rem]')}>{userName}</strong>
              <span className={cn('block text-[rgba(255,235,220,0.72)]', compactDrawer ? 'mt-0.5 text-[0.92rem] leading-5' : 'mt-1 text-sm')}>{userEmail}</span>
              {!compactDrawer ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {userChips.map((chip) => (
                    <span
                      key={chip.label}
                      className={cn(
                        'inline-flex min-h-8 items-center justify-center rounded-full px-3 text-xs font-semibold',
                        chip.subtle
                          ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,235,220,0.78)]'
                          : 'bg-[rgba(255,138,54,0.18)] text-[rgba(255,225,205,0.96)]',
                      )}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={cn('grid min-w-0', compactDrawer ? 'gap-3' : 'gap-4')}>
              {sections.map((section) => (
                <section key={section.title} className="grid min-w-0 gap-2">
                  <span className="px-1 text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[rgba(255,220,196,0.72)]">
                    {section.title}
                  </span>
                  <nav className="grid min-w-0 gap-2">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        end={item.exact}
                        to={item.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'group grid min-w-0 grid-cols-[40px_minmax(0,1fr)_16px] items-center gap-3 border transition',
                            compactDrawer ? 'min-h-[52px] rounded-[18px] px-3 py-2.5' : 'min-h-[54px] rounded-[20px] px-3 py-3',
                            isActive
                              ? 'border-[rgba(255,138,54,0.32)] bg-[linear-gradient(180deg,rgba(138,73,22,0.95)_0%,rgba(101,51,14,0.92)_100%)] shadow-[0_16px_32px_rgba(0,0,0,0.18)]'
                              : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,138,54,0.14)] hover:bg-[rgba(255,255,255,0.06)]',
                          )
                        }
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(255,255,255,0.08)] text-[rgba(255,230,214,0.92)]">
                          <item.icon className="h-[18px] w-[18px]" strokeWidth={2.15} />
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-[0.98rem] font-semibold tracking-[-0.02em] text-white">
                            {item.label}
                          </strong>
                          {desktopPinned ? (
                            <span className="mt-0.5 block text-[0.8rem] leading-5 text-[rgba(255,235,220,0.68)]">
                              {item.hint}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-sm font-semibold text-[rgba(255,225,205,0.88)] transition group-hover:translate-x-0.5">›</span>
                      </NavLink>
                    ))}
                  </nav>
                </section>
              ))}
            </div>

            {supportTitle && desktopPinned ? (
              <div className="mt-auto rounded-[24px] border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.04)] p-4">
                {supportKicker ? (
                  <span className="text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[rgba(255,220,196,0.72)]">
                    {supportKicker}
                  </span>
                ) : null}
                <strong className="mt-3 block text-base font-semibold leading-6 tracking-[-0.03em] text-white">{supportTitle}</strong>
                {supportText ? <p className="mt-2 text-sm leading-6 text-[rgba(255,235,220,0.72)]">{supportText}</p> : null}
              </div>
            ) : null}
          </div>

          {footer ? <div className={cn('min-w-0 overflow-x-hidden', compactDrawer ? 'px-3 pb-3 pt-0' : 'px-4 pb-4 pt-1')}>{footer}</div> : null}
        </div>
      </aside>
    </>
  );
};

export default WorkspaceSidebar;
