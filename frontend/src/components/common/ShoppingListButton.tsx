import React, { useState } from 'react';
import Button from './Button';

interface ShoppingListButtonProps {
  inList?: boolean;
  onAdd: () => Promise<void>;
  label?: string;
  className?: string;
  stopPropagation?: boolean;
}

const ShoppingListButton: React.FC<ShoppingListButtonProps> = ({
  inList = false,
  onAdd,
  label = 'Adicionar a lista',
  className,
  stopPropagation = true,
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
      variant={inList ? 'secondary' : 'primary'}
      className={`shopping-list-button ${inList ? 'is-added' : ''} ${className || ''}`.trim()}
      onClick={handleClick}
      disabled={saving}
    >
      {saving ? 'Salvando...' : inList ? 'Na lista' : label}
    </Button>
  );
};

export default ShoppingListButton;
