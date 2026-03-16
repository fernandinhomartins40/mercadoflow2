import React from 'react';
import {
  Activity,
  Bell,
  Building2,
  CalendarDays,
  Check,
  Database,
  Download,
  FileText,
  Filter,
  Image,
  KeyRound,
  LayoutTemplate,
  PackageSearch,
  Receipt,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  TriangleAlert,
  TrendingUp,
  Users,
  Boxes,
  Link2,
} from 'lucide-react';
import Card from '../common/Card';
import { cn } from '../../lib/cn';

interface MetricsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger';
  caption?: string;
  className?: string;
}

const iconMap = {
  'R$': TrendingUp,
  TM: Receipt,
  NF: FileText,
  PD: PackageSearch,
  CT: Building2,
  US: Users,
  VX: CalendarDays,
  ON: Check,
  AT: TriangleAlert,
  MD: LayoutTemplate,
  LT: Boxes,
  Q: Boxes,
  SG: Sparkles,
  AK: KeyRound,
  RV: TriangleAlert,
  HB: Activity,
  EXE: Download,
  MK: Store,
  RUN: Activity,
  IMP: Download,
  LC: ShoppingCart,
  OK: Check,
  RP: ShoppingCart,
  SR: Link2,
  NS: TriangleAlert,
  DB: Database,
  PG: FileText,
  IM: Image,
  BR: Tags,
  AL: Bell,
  NV: Bell,
  HP: TriangleAlert,
  FL: Filter,
  PR: Link2,
  PX: TrendingUp,
} as const;

const renderIcon = (icon?: React.ReactNode) => {
  if (!icon) return null;
  if (typeof icon === 'string') {
    const Icon = iconMap[icon as keyof typeof iconMap];
    if (Icon) {
      return <Icon className="h-4 w-4" strokeWidth={2.15} />;
    }
    return <span>{icon}</span>;
  }
  return icon;
};

const MetricsCard: React.FC<MetricsCardProps> = ({ title, value, icon, variant = 'default', caption, className }) => {
  const tone = variant === 'warning' ? 'warning' : variant === 'danger' ? 'danger' : 'default';
  const toneClassName =
    tone === 'warning'
      ? 'bg-[linear-gradient(180deg,rgba(255,250,246,0.98)_0%,rgba(255,243,232,0.95)_100%)]'
      : tone === 'danger'
        ? 'bg-[linear-gradient(180deg,rgba(255,247,243,0.98)_0%,rgba(255,236,231,0.95)_100%)]'
        : 'bg-[linear-gradient(180deg,rgba(255,252,248,0.98)_0%,rgba(255,249,244,0.95)_100%)]';

  return (
    <Card className={cn('metric-card reveal flex flex-col gap-3 p-5 sm:p-6', `metric-card-${tone}`, toneClassName, className)}>
      <div className="metric-card-top flex items-start justify-between gap-3">
        <span className="metric-card-title text-[0.76rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{title}</span>
        {icon ? (
          <span className="metric-card-icon inline-flex min-h-9 min-w-9 items-center justify-center rounded-full bg-[rgba(255,106,0,0.1)] px-2 text-[0.75rem] font-bold text-[color:var(--accent-strong)] [&_svg]:h-4 [&_svg]:w-4">
            {renderIcon(icon)}
          </span>
        ) : null}
      </div>
      <strong className="metric-card-value text-[clamp(1.6rem,3vw,2.3rem)] font-semibold leading-none tracking-[-0.04em] text-[color:var(--text-primary)]">
        {value}
      </strong>
      {caption ? (
        <div className="metric-card-bottom">
          <span className="metric-card-meta text-sm leading-5 text-[color:var(--text-muted)]">{caption}</span>
        </div>
      ) : null}
    </Card>
  );
};

export default MetricsCard;
