import type { OffersServiceClient } from '../../services/offers.service';
import type {
  OfferGenerationJob,
  OfferOverview,
  OfferTemplate,
} from '../../types/offers.types';

export type OfferStudioBootstrapData = {
  overview: OfferOverview;
  jobs: OfferGenerationJob[];
  templates: OfferTemplate[];
};

export const loadOfferStudioBootstrap = async (
  offersService: OffersServiceClient,
  marketId: string,
): Promise<OfferStudioBootstrapData> => {
  const [overview, jobs] = await Promise.all([
    offersService.getOverview(marketId),
    offersService.getJobs(marketId),
  ]);

  return {
    overview,
    jobs,
    templates: overview.templates || [],
  };
};
