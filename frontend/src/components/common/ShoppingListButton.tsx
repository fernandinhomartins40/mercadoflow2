import React, { useState } from 'react';
import Button from './Button';

interface ShoppingListButtonProps {
  inList?: boolean;
  onAdd: () => Promise<unknown>;
  label?: string;
  className?: string;
  stopPropagation?: boolean;
  /** `subtle` para listas longas, em que um botão verde por linha competiria com o conteúdo. */
  tone?: 'primary' | 'subtle';
}

const ShoppingListButton: React.FC<ShoppingListButtonProps> = ({
  inList = false,
  onAdd,
  label = 'Adicionar à lista',
  className,
  stopPropagation = true,
  tone = 'primary',
}) => {
  const [saving, setSaving] = useState(false);

  const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (saving || inList) {
      return;
    }
    try {
      setSaving(true);
      await onAdd();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      type="button"
      variant={inList || tone === 'subtle' ? 'secondary' : 'primary'}
      className={`shopping-list-button ${inList ? 'is-added' : ''} ${className || ''}`.trim()}
      onClick={handleClick}
      disabled={saving}
    >
      {saving ? 'Salvando...' : inList ? 'Na lista' : label}
    </Button>
  );
};

export default ShoppingListButton;
