'use client';

import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams as useNextSearchParams, useParams as useNextParams } from 'next/navigation';
import React, { useEffect, useMemo } from 'react';

type SearchParamInit =
  | string
  | string[][]
  | Record<string, string | number | boolean | null | undefined>
  | URLSearchParams;

type NavigateOptions = {
  replace?: boolean;
};

export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
  prefetch?: boolean;
}

interface NavLinkRenderProps {
  isActive: boolean;
}

interface NavLinkProps extends Omit<LinkProps, 'className'> {
  end?: boolean;
  className?: string | ((props: NavLinkRenderProps) => string);
}

interface NavigateProps {
  to: string;
  replace?: boolean;
}

const normalizeTo = (value: string) => {
  try {
    const url = new URL(value, 'http://localhost');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
};

const toSearchParams = (init?: SearchParamInit) => {
  if (!init) {
    return new URLSearchParams();
  }

  if (init instanceof URLSearchParams) {
    return new URLSearchParams(init.toString());
  }

  if (typeof init === 'string' || Array.isArray(init)) {
    return new URLSearchParams(init);
  }

  const params = new URLSearchParams();
  Object.entries(init).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    params.set(key, String(value));
  });
  return params;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { to, replace, prefetch, children, ...props },
  ref,
) {
  return (
    <NextLink href={to} replace={replace} prefetch={prefetch} ref={ref} {...props}>
      {children}
    </NextLink>
  );
});

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink(
  { to, end, className, children, ...props },
  ref,
) {
  const pathname = usePathname() ?? '/';
  const target = normalizeTo(to).split('?')[0] || '/';
  const isActive = end ? pathname === target : pathname === target || pathname.startsWith(`${target}/`);
  const resolvedClassName = typeof className === 'function' ? className({ isActive }) : className;

  return (
    <Link ref={ref} to={to} className={resolvedClassName} {...props}>
      {children}
    </Link>
  );
});

export const Navigate: React.FC<NavigateProps> = ({ to, replace }) => {
  const router = useRouter();

  useEffect(() => {
    if (replace) {
      router.replace(to);
      return;
    }
    router.push(to);
  }, [replace, router, to]);

  return null;
};

export const BrowserRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const Routes: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>;
export const Route: React.FC<{
  path?: string;
  element?: React.ReactNode;
  children?: React.ReactNode;
}> = () => null;

export const useNavigate = () => {
  const router = useRouter();

  return (to: string | number, options?: NavigateOptions) => {
    if (typeof to === 'number') {
      if (to < 0) {
        router.back();
      }
      return;
    }

    if (options?.replace) {
      router.replace(to);
      return;
    }

    router.push(to);
  };
};

export const useLocation = () => {
  const pathname = usePathname() ?? '/';
  const searchParams = useNextSearchParams();
  const search = searchParams?.toString() ?? '';

  return useMemo(
    () => ({
      pathname,
      search: search ? `?${search}` : '',
      hash: '',
      key: `${pathname}?${search}`,
    }),
    [pathname, search],
  );
};

export const useParams = <T extends Record<string, string | string[] | undefined>>() => {
  return useNextParams() as T;
};

export const useSearchParams = (): [
  URLSearchParams,
  (nextInit?: SearchParamInit | ((params: URLSearchParams) => SearchParamInit), options?: NavigateOptions) => void,
] => {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useNextSearchParams();

  const current = useMemo(() => new URLSearchParams(searchParams?.toString() ?? ''), [searchParams]);

  const setSearchParams = (
    nextInit?: SearchParamInit | ((params: URLSearchParams) => SearchParamInit),
    options?: NavigateOptions,
  ) => {
    const nextValue =
      typeof nextInit === 'function'
        ? nextInit(new URLSearchParams(current.toString()))
        : nextInit;

    const next = toSearchParams(nextValue);
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;

    if (options?.replace) {
      router.replace(href);
      return;
    }

    router.push(href);
  };

  return [current, setSearchParams];
};
