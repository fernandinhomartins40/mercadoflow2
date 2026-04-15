import React from 'react';
import { Sparkles } from 'lucide-react';
import { StudioToolButton, type StudioToolOption } from './StudioPrimitives';

type OfferStudioRailProps = {
  tools: StudioToolOption[];
  activeTool: string;
  onSelectTool: (toolKey: string) => void;
};

const OfferStudioRail: React.FC<OfferStudioRailProps> = ({
  tools,
  activeTool,
  onSelectTool,
}) => (
  <aside className="offer-studio-rail">
    <div className="offer-studio-rail-brand">
      <span className="offer-studio-rail-badge">
        <Sparkles className="offer-studio-rail-brand-icon" strokeWidth={2.1} />
      </span>
      <div>
        <strong>Designer de ofertas</strong>
        <small>Automacao visual nativa do MercadoFlow</small>
      </div>
    </div>
    <div className="offer-studio-rail-nav">
      {tools.map((tool) => (
        <StudioToolButton
          key={tool.key}
          icon={tool.icon}
          label={tool.label}
          active={activeTool === tool.key}
          onClick={() => onSelectTool(tool.key)}
        />
      ))}
    </div>
  </aside>
);

export default OfferStudioRail;
