import React from 'react';

type OfferStudioShellProps = {
  builderMode?: boolean;
  panelCollapsed?: boolean;
  rail: React.ReactNode;
  panel: React.ReactNode;
  workspace: React.ReactNode;
};

const OfferStudioShell: React.FC<OfferStudioShellProps> = ({
  builderMode = false,
  panelCollapsed = false,
  rail,
  panel,
  workspace,
}) => (
  <div
    className={[
      'offer-studio-shell w-full',
      builderMode ? 'is-template-builder' : '',
      panelCollapsed ? 'is-panel-collapsed' : '',
    ].filter(Boolean).join(' ')}
  >
    {rail}
    {panel}
    {workspace}
  </div>
);

export default OfferStudioShell;
