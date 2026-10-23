import React from 'react';
import Header from './landing/Header';
import Hero from './landing/Hero';
import IndustryBanner from './landing/IndustryBanner';
import Features from './landing/Features';
import Alerts from './landing/Alerts';
import HowItWorks from './landing/HowItWorks';
import WhyUs from './landing/WhyUs';
import Plans from './landing/Plans';
import FinalCta from './landing/FinalCta';
import Footer from './landing/Footer';
import { LANDING } from './landing/theme';

/**
 * Landing pública (redesenho de 22/10/2026, a partir da referência aprovada
 * pelo dono). Cada seção fica em screens/landing/; os planos vêm do catálogo
 * real (GET /api/v1/plans), nunca de valores fixos.
 */
const Landing: React.FC = () => (
  <div className="min-h-screen" style={{ background: LANDING.surface, color: LANDING.text }}>
    {/* Fora de contêiner com overflow-hidden: o cabeçalho é sticky. */}
    <Header />
    <main className="overflow-x-clip">
      <Hero />
      <IndustryBanner />
      <Features />
      <Alerts />
      <HowItWorks />
      <WhyUs />
      <Plans />
      <FinalCta />
    </main>
    <Footer />
  </div>
);

export default Landing;
