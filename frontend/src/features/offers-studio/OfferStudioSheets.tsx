import React from 'react';
import { Copy, Eye, ImageIcon, SendHorizontal, Trash2 } from 'lucide-react';
import Button from '../../components/common/Button';
import OfferProductImage from '../../components/offers/OfferProductImage';
import type { OfferGenerationJob, OfferRenderOutput } from '../../types/offers.types';
import {
  StudioSideSheet,
  formatDateTime,
  getCampaignState,
  parseStringList,
} from './StudioPrimitives';

export type OfferStudioMediaEntry = {
  job: OfferGenerationJob;
  output: OfferRenderOutput;
};

type OfferStudioCampaignsSheetProps = {
  open: boolean;
  onClose: () => void;
  jobs: OfferGenerationJob[];
  draftCampaignCount: number;
  readyMediaCount: number;
  saving: boolean;
  onOpenJob: (job: OfferGenerationJob) => void;
  onPublishJob: (job: OfferGenerationJob) => void;
  onCloneJob: (job: OfferGenerationJob) => void;
  onDeleteJob: (job: OfferGenerationJob) => void;
};

export const OfferStudioCampaignsSheet: React.FC<OfferStudioCampaignsSheetProps> = ({
  open,
  onClose,
  jobs,
  draftCampaignCount,
  readyMediaCount,
  saving,
  onOpenJob,
  onPublishJob,
  onCloneJob,
  onDeleteJob,
}) => (
  <StudioSideSheet
    open={open}
    title="Campanhas"
    subtitle="Minhas campanhas"
    onClose={onClose}
  >
    <div className="offer-studio-summary-card">
      <strong>{jobs.length} campanha(s)</strong>
      <span>{draftCampaignCount} rascunho(s)</span>
      <span>{readyMediaCount} mídia(s) pronta(s)</span>
    </div>
    {jobs.length ? (
      jobs.map((job) => {
        const state = getCampaignState(job);
        const targets = parseStringList(job.publishTargetsJson, ['DOWNLOAD']);
        return (
          <div key={job.id} className="rounded-[24px] border border-[rgba(87,51,30,0.1)] bg-white/90 p-5 shadow-[0_16px_36px_rgba(44,20,6,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`sales-pill ${state.pillClass}`}>{state.label}</span>
                <h3 className="mt-3 text-lg font-semibold text-[color:var(--text-primary)]">{job.name || 'Campanha sem nome'}</h3>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{job.templateName || 'Sem template'} · {job.productCount || 0} produtos · {job.pageCount || 0} página(s)</p>
              </div>
              <div className="text-right text-xs text-[color:var(--text-secondary)]">
                <div>Atualizado em</div>
                <strong className="text-sm text-[color:var(--text-primary)]">{formatDateTime(job.updatedAt || job.createdAt)}</strong>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {targets.map((target) => (
                <span key={`${job.id}-${target}`} className="sales-pill soft">{target}</span>
              ))}
              <span className="sales-pill soft">{job.outputType || 'PNG'}</span>
              <span className="sales-pill soft">{job.generationMode || 'CATALOG'}</span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button type="button" onClick={() => onOpenJob(job)}>
                <Eye size={16} strokeWidth={2.1} />
                Abrir
              </Button>
              <Button type="button" variant="secondary" onClick={() => onPublishJob(job)} disabled={saving}>
                <SendHorizontal size={16} strokeWidth={2.1} />
                Publicar
              </Button>
              <Button type="button" variant="secondary" onClick={() => onCloneJob(job)} disabled={saving}>
                <Copy size={16} strokeWidth={2.1} />
                Clonar
              </Button>
              <Button type="button" variant="secondary" onClick={() => onDeleteJob(job)} disabled={saving}>
                <Trash2 size={16} strokeWidth={2.1} />
                Excluir
              </Button>
            </div>
          </div>
        );
      })
    ) : (
      <div className="offer-studio-empty-card">Nenhuma campanha salva ainda. Monte o encarte e salve para aparecer aqui.</div>
    )}
  </StudioSideSheet>
);

type OfferStudioMediaSheetProps = {
  open: boolean;
  onClose: () => void;
  mediaEntries: OfferStudioMediaEntry[];
  readyMediaCount: number;
  onOpenJob: (job: OfferGenerationJob) => void;
};

export const OfferStudioMediaSheet: React.FC<OfferStudioMediaSheetProps> = ({
  open,
  onClose,
  mediaEntries,
  readyMediaCount,
  onOpenJob,
}) => (
  <StudioSideSheet
    open={open}
    title="Mídias"
    subtitle="Gerenciador de mídias"
    onClose={onClose}
  >
    <div className="offer-studio-summary-card">
      <strong>{mediaEntries.length} item(ns)</strong>
      <span>{readyMediaCount} pronto(s)</span>
      <span>{mediaEntries.filter(({ output }) => String(output.status || '').toUpperCase() === 'FAILED').length} falha(s)</span>
    </div>
    {mediaEntries.length ? (
      mediaEntries.map(({ job, output }) => {
        const outputReady = String(output.status || '').toUpperCase() === 'READY';
        const previewUrl = output.previewImageUrl || output.fileUrl || '';
        return (
          <div key={output.id} className="rounded-[24px] border border-[rgba(87,51,30,0.1)] bg-white/90 p-5 shadow-[0_16px_36px_rgba(44,20,6,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`sales-pill ${outputReady ? 'positive' : String(output.status || '').toUpperCase() === 'FAILED' ? 'negative' : 'soft'}`}>{output.status || 'PROCESSING'}</span>
                <h3 className="mt-3 text-lg font-semibold text-[color:var(--text-primary)]">{job.name || 'Campanha sem nome'}</h3>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{output.outputType || 'PNG'} · {output.publishTarget || 'DOWNLOAD'} · {formatDateTime(output.updatedAt || output.createdAt)}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => onOpenJob(job)}>
                <Eye size={16} strokeWidth={2.1} />
                Abrir campanha
              </Button>
            </div>
            {previewUrl ? (
              <div className="mt-4 overflow-hidden rounded-[20px] border border-[rgba(87,51,30,0.08)] bg-[rgba(255,247,240,0.55)]">
                <OfferProductImage src={previewUrl} alt={job.name || 'Mídia da campanha'} className="h-48 w-full object-contain p-3" />
              </div>
            ) : null}
            {output.errorMessage ? (
              <div className="mt-4 rounded-[18px] border border-[rgba(160,32,28,0.14)] bg-[rgba(255,240,238,0.9)] px-4 py-3 text-sm text-[color:#8f2b20]">
                {output.errorMessage}
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {output.fileUrl ? (
                <Button type="button" onClick={() => window.open(output.fileUrl || '', '_blank', 'noopener,noreferrer')}>
                  <Eye size={16} strokeWidth={2.1} />
                  Abrir arquivo
                </Button>
              ) : null}
              {output.previewImageUrl && output.previewImageUrl !== output.fileUrl ? (
                <Button type="button" variant="secondary" onClick={() => window.open(output.previewImageUrl || '', '_blank', 'noopener,noreferrer')}>
                  <ImageIcon size={16} strokeWidth={2.1} />
                  Abrir prévia
                </Button>
              ) : null}
            </div>
          </div>
        );
      })
    ) : (
      <div className="offer-studio-empty-card">Nenhuma mídia gerada ainda. Publique uma campanha para acompanhar os arquivos aqui.</div>
    )}
  </StudioSideSheet>
);
