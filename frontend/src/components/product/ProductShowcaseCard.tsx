import React from 'react';
import { Link } from 'react-router-dom';
import ProductImage from './ProductImage';
import { cn } from '../../lib/cn';

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
  const content = (
    <>
      <div className="sales-product-media-shell bg-[linear-gradient(180deg,rgba(255,111,0,0.08)_0%,rgba(255,247,240,0.82)_100%)] px-[14px] pt-[14px]">
        <div className="sales-product-media-frame flex h-[178px] items-center justify-center rounded-[18px] border border-[rgba(48,24,12,0.08)] bg-white p-3">
          <ProductImage src={imageUrl} alt={imageAlt} className="sales-product-media" />
        </div>
      </div>

      <div className="sales-product-body flex flex-1 flex-col gap-3 p-[14px]">
        {badges ? <div className="sales-product-badges flex min-h-7 flex-wrap items-center gap-2">{badges}</div> : null}
        <div className="sales-product-copy flex min-h-[5.1rem] flex-col gap-2">
          <h3 className="m-0 line-clamp-2 min-h-[2.3rem] text-base font-semibold leading-[1.15] text-[color:var(--text-primary)]">{title}</h3>
          {subtitle ? <p className="m-0 line-clamp-2 min-h-[2.35rem] text-[0.86rem] leading-[1.35] text-[color:var(--text-muted)]">{subtitle}</p> : <div className="min-h-[2.35rem]" />}
        </div>
        {metrics.length > 0 ? (
          <div className="sales-product-stats compact mt-auto grid grid-cols-2 gap-[10px]">
            {metrics.map((metric) => (
              <div key={metric.label} className="border-t border-[rgba(48,24,12,0.08)] pt-[9px]">
                <span className="block text-[0.74rem] leading-[1.2] text-[color:var(--text-muted)]">{metric.label}</span>
                <strong className="text-[0.92rem] font-semibold text-[color:var(--text-primary)]">{metric.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {footer ? <div className="sales-card-foot border-t border-[rgba(48,24,12,0.08)] pt-2 text-[0.78rem] leading-[1.35] text-[color:var(--text-muted)]">{footer}</div> : null}
      </div>
    </>
  );

  return (
    <article
      className={cn(
        'sales-product-card product-showcase-card flex h-full flex-col overflow-hidden rounded-[22px] border border-[rgba(48,24,12,0.08)] bg-[rgba(255,252,249,0.96)] shadow-[0_16px_36px_rgba(36,18,8,0.07)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_rgba(36,18,8,0.12)]',
        className,
      )}
    >
      {href ? (
        <Link to={href} className="sales-card-link-wrap flex h-full flex-col text-inherit no-underline">
          {content}
        </Link>
      ) : (
        <div className="sales-card-link-wrap flex h-full flex-col text-inherit no-underline">{content}</div>
      )}

      {actions ? <div className="sales-card-action-row mt-auto flex items-stretch justify-end px-[1.1rem] pb-[1.1rem]">{actions}</div> : null}
    </article>
  );
};

export default ProductShowcaseCard;
