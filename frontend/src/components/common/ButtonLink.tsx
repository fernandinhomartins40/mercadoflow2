import React from 'react';
import { Link, LinkProps } from 'react-router-dom';

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary';
  className?: string;
}

const ButtonLink: React.FC<ButtonLinkProps> = ({ variant = 'primary', className, children, ...props }) => {
  const classes = ['button', variant === 'secondary' ? 'secondary' : '', className || ''].filter(Boolean).join(' ');
  return (
    <Link className={classes} {...props}>
      {children}
    </Link>
  );
};

export default ButtonLink;
