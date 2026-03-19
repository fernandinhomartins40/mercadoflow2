export type OffersWorkspaceMode = 'admin' | 'super-admin';

export const OFFERS_APP_ROOT = '/ofertas';
export const OFFERS_WORKSPACE_QUERY_KEY = 'workspace';

export const isOffersAppPath = (pathname: string) =>
  pathname === OFFERS_APP_ROOT || pathname.startsWith(`${OFFERS_APP_ROOT}/`);

export const resolveOffersWorkspace = (search: string): OffersWorkspaceMode => {
  const params = new URLSearchParams(search);
  return params.get(OFFERS_WORKSPACE_QUERY_KEY) === 'super-admin' ? 'super-admin' : 'admin';
};

export const buildOffersUrl = (
  pathname: string,
  workspace: OffersWorkspaceMode,
  search?: string,
) => {
  const params = new URLSearchParams(search || '');
  params.set(OFFERS_WORKSPACE_QUERY_KEY, workspace);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

export const getOffersWorkspaceHomeRoute = (workspace: OffersWorkspaceMode) =>
  workspace === 'super-admin' ? '/super-admin' : '/app';

export const getOffersWorkspaceLoginRoute = (search: string) =>
  resolveOffersWorkspace(search) === 'super-admin' ? '/super-admin/login' : '/login';
