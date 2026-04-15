import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveOffersWorkspace } from '../lib/offersApp';
import { createOffersService } from '../services/offers.service';

export const useOffersService = () => {
  const location = useLocation();
  const workspace = resolveOffersWorkspace(location.search);

  return useMemo(() => createOffersService(workspace), [workspace]);
};
