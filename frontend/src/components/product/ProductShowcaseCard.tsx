import React from 'react';
import { Link } from 'react-router-dom';
import ProductImage from './ProductImage';

interface ProductMetric {
  label: string;
  value: React.ReactNode;
}

interface ProductShowcaseCardProps {
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  imageAlt: string;
  href?: string;
  badges?: React.ReactNode;
  metrics?: ProductMetric[];
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const ProductShowcaseCard: React.FC<ProductShowcaseCardProps> = ({
  title,
  subtitle,
  imageUrl,
  imageAlt,
  href,
  badges,
  metrics = [],
  footer,
  actions,
  className,
}) => {
  const Wrapper = href ? Link : 'div';
  const wrapperProps = href ? { to: href } : {};

  return (
    <article className={['sales-product-card', 'product-showcase-card', className || ''].filter(Boolean).join(' ')}>
      <Wrapper className="sales-card-link-wrap" {...wrapperProps}>
        <div className="sales-product-media-shell">
          <div className="sales-product-media-frame">
            <ProductImage src={imageUrl} alt={imageAlt} className="sales-product-media" />
          </div>
        </div>

        <div className="sales-product-body">
          {badges ? <div className="sales-product-badges">{badges}</div> : null}
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
          {metrics.length > 0 ? (
            <div className="sales-product-stats compact">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
          {footer ? <div className="sales-card-foot">{footer}</div> : null}
        </div>
      </Wrapper>

      {actions ? <div className="sales-card-action-row">{actions}</div> : null}
    </article>
  );
};

export default ProductShowcaseCard;
