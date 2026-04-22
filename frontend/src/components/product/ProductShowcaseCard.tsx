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
      <div className="bg-gray-50 px-[14px] pt-[14px]">
        <div className="flex h-[178px] items-center justify-center rounded-xl border border-gray-100 bg-white p-3">
          <ProductImage src={imageUrl} alt={imageAlt} className="sales-product-media" />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-[14px]">
        {badges ? <div className="flex min-h-7 flex-wrap items-center gap-2">{badges}</div> : null}
        <div className="flex min-h-[5.1rem] flex-col gap-2">
          <h3 className="m-0 line-clamp-2 min-h-[2.3rem] text-base font-semibold leading-[1.15] text-gray-900">{title}</h3>
          {subtitle ? <p className="m-0 line-clamp-2 min-h-[2.35rem] text-[0.86rem] leading-[1.35] text-gray-500">{subtitle}</p> : <div className="min-h-[2.35rem]" />}
        </div>
        {metrics.length > 0 ? (
          <div className="mt-auto grid grid-cols-2 gap-[10px]">
            {metrics.map((metric) => (
              <div key={metric.label} className="border-t border-gray-100 pt-[9px]">
                <span className="block text-[0.74rem] leading-[1.2] text-gray-400">{metric.label}</span>
                <strong className="text-[0.92rem] font-semibold text-gray-900">{metric.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {footer ? <div className="border-t border-gray-100 pt-2 text-[0.78rem] leading-[1.35] text-gray-500">{footer}</div> : null}
      </div>
    </>
  );

  return (
    <article
      className={cn(
        'sales-product-card product-showcase-card flex h-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(0,0,0,0.1)]',
        className,
      )}
    >
      {href ? (
        <Link to={href} className="flex h-full flex-col text-inherit no-underline">
          {content}
        </Link>
      ) : (
        <div className="flex h-full flex-col text-inherit no-underline">{content}</div>
      )}

      {actions ? <div className="mt-auto flex items-stretch justify-end px-[1.1rem] pb-[1.1rem]">{actions}</div> : null}
    </article>
  );
};

export default ProductShowcaseCard;
