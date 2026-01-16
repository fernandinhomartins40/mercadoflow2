import React from 'react';

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }> = ({
  variant = 'primary',
  children,
  ...props
}) => {
  return (
    <button className={`button ${variant === 'secondary' ? 'secondary' : ''}`} {...props}>
      {children}
    </button>
  );
};

export default Button;
