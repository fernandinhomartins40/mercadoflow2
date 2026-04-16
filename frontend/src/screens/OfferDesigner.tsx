import React from 'react';
import OfferStudioScreen from '../features/offers-studio/OfferStudioScreen';
import { useOfferStudioController } from '../features/offers-studio/useOfferStudioController';

const OfferDesigner: React.FC = () => {
  const controller = useOfferStudioController();
  return <OfferStudioScreen context={controller} />;
};

export default OfferDesigner;
