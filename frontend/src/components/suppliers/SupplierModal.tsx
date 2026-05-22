import React, { useEffect, useRef, useState } from 'react';
import { Building2, Loader2, Search, X, Trash2, CheckCircle2, AlertTriangle, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { marketService } from '../../services/market.service';
import { Supplier } from '../../types/analytics.types';
import { useSuppliers } from '../../hooks/useSuppliers';

/* ─── helpers ─── */
const fmtCnpj = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

interface CnpjData {
  razao_social?: string;
  nome_fantasia?: string;
  email?: string;
  ddd_telefone_1?: string;
  logradouro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  porte?: string;
  descricao_porte?: string;
  // ReceitaWS compat
  nome?: string;
  fantasia?: string;
  situacao?: string;
  telefone?: string;
  bairro?: string;
}

function parseCnpjData(data: CnpjData, cnpj: string): Omit<Supplier, 'id'> {
  // BrasilAPI usa razao_social; ReceitaWS usa nome
  const razaoSocial = (data.razao_social || data.nome || '').trim();
  const nomeFantasia = (data.nome_fantasia || data.fantasia || '').trim() || undefined;
  const telefone = (data.ddd_telefone_1 || data.telefone || '').replace(/\D/g, '') || undefined;
  const situacao = (data.descricao_situacao_cadastral || data.situacao || '').trim() || undefined;
  const cnae = data.cnae_fiscal ? String(data.cnae_fiscal) : undefined;
  const descCnae = (data.cnae_fiscal_descricao || '').trim() || undefined;
  const porte = (data.descricao_porte || data.porte || '').trim() || undefined;
  const cep = (data.cep || '').replace(/\D/g, '') || undefined;

  return {
    cnpj: cnpj.replace(/\D/g, ''),
    razaoSocial,
    nomeFantasia,
    email: data.email?.trim() || undefined,
    telefone,
    logradouro: data.logradouro?.trim() || undefined,
    municipio: data.municipio?.trim() || undefined,
    uf: data.uf?.trim() || undefined,
    cep,
    situacaoCadastral: situacao,
    cnaePrincipal: cnae,
    descricaoCnae: descCnae,
    porte,
  };
}

/* ─── Linha de fornecedor cadastrado ─── */
const SupplierRow: React.FC<{
  s: Supplier;
  onSelect: (s: Supplier) => void;
  onDelete: (id: string) => void;
}> = ({ s, onSelect, onDelete }) => (
  <div
    className="flex items-center justify-between gap-2 rounded-xl px-4 py-3 cursor-pointer transition hover:opacity-80"
    style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-soft)' }}
    onClick={() => onSelect(s)}
  >
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
        {s.nomeFantasia || s.razaoSocial}
      </p>
      {s.nomeFantasia && (
        <p className="text-xs truncate" style={{ color: 'var(--text-soft)' }}>{s.razaoSocial}</p>
      )}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {fmtCnpj(s.cnpj)}{s.municipio ? ` · ${s.municipio}/${s.uf}` : ''}
      </p>
    </div>
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
      className="rounded-lg p-1.5 transition hover:opacity-70 shrink-0"
      style={{ color: 'var(--text-muted)' }}
      title="Remover fornecedor"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
);

/* ─── Formulário de novo fornecedor via CNPJ ─── */
const NewSupplierForm: React.FC<{
  marketId: string;
  onSaved: (s: Supplier) => void;
  onCancel: () => void;
}> = ({ marketId, onSaved, onCancel }) => {
  const [cnpj, setCnpj] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Supplier, 'id'> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleCnpjChange = (v: string) => {
    setCnpj(fmtCnpj(v));
    setDraft(null);
    setFetchError(null);
  };

  const handleSearch = async () => {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) { setFetchError('CNPJ deve ter 14 dígitos'); return; }
    setFetching(true);
    setFetchError(null);
    setDraft(null);
    try {
      const data = await marketService.lookupCnpj(marketId, digits);
      if (data?.error) { setFetchError(data.error); return; }
      setDraft(parseCnpjData(data, digits));
    } catch {
      setFetchError('Não foi possível consultar o CNPJ. Verifique e tente novamente.');
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await marketService.saveSupplier(marketId, draft);
      onSaved(saved);
    } catch {
      setSaveError('Erro ao salvar fornecedor. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Busca CNPJ */}
      <div>
        <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          CNPJ do fornecedor
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder="00.000.000/0001-00"
            maxLength={18}
            className="h-10 flex-1 rounded-lg px-3 text-sm outline-none"
            style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
            value={cnpj}
            onChange={(e) => handleCnpjChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={fetching || cnpj.replace(/\D/g, '').length !== 14}
            className="flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50"
            style={{ background: 'var(--brand-600)', color: '#fff' }}
          >
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>
        </div>
        {fetchError && (
          <p className="mt-1.5 flex items-center gap-1 text-xs" style={{ color: '#dc2626' }}>
            <AlertTriangle className="h-3 w-3" /> {fetchError}
          </p>
        )}
      </div>

      {/* Dados retornados */}
      {draft && (
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface-soft)', border: '1px solid var(--border-soft)' }}>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#16a34a' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {draft.nomeFantasia || draft.razaoSocial}
              </p>
              {draft.nomeFantasia && (
                <p className="text-xs" style={{ color: 'var(--text-soft)' }}>{draft.razaoSocial}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-soft)' }}>
            {draft.situacaoCadastral && (
              <p><span style={{ color: 'var(--text-muted)' }}>Situação: </span>
                <span className="font-medium" style={{ color: draft.situacaoCadastral.toLowerCase().includes('ativa') ? '#16a34a' : '#dc2626' }}>
                  {draft.situacaoCadastral}
                </span>
              </p>
            )}
            {draft.municipio && <p><span style={{ color: 'var(--text-muted)' }}>Cidade: </span>{draft.municipio}/{draft.uf}</p>}
            {draft.email && <p className="col-span-2 truncate"><span style={{ color: 'var(--text-muted)' }}>E-mail: </span>{draft.email}</p>}
            {draft.telefone && <p><span style={{ color: 'var(--text-muted)' }}>Telefone: </span>{draft.telefone}</p>}
            {draft.descricaoCnae && <p className="col-span-2 truncate"><span style={{ color: 'var(--text-muted)' }}>Atividade: </span>{draft.descricaoCnae}</p>}
            {draft.porte && <p><span style={{ color: 'var(--text-muted)' }}>Porte: </span>{draft.porte}</p>}
          </div>

          {/* Campos editáveis */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t" style={{ borderColor: 'var(--border-soft)' }}>
            {[
              { label: 'Razão social', key: 'razaoSocial' as const, span: 2 },
              { label: 'Nome fantasia', key: 'nomeFantasia' as const, span: 2 },
              { label: 'E-mail', key: 'email' as const, span: 2 },
              { label: 'Telefone', key: 'telefone' as const, span: 1 },
            ].map(({ label, key, span }) => (
              <div key={key} className={span === 2 ? 'col-span-2' : ''}>
                <label className="mb-1 block text-[0.65rem]" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <input
                  type="text"
                  value={(draft as any)[key] ?? ''}
                  onChange={(e) => setDraft(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                  className="h-8 w-full rounded-lg px-2.5 text-xs outline-none"
                  style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                />
              </div>
            ))}
          </div>

          {saveError && (
            <p className="text-xs" style={{ color: '#dc2626' }}>{saveError}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-9 rounded-lg text-sm font-medium transition hover:opacity-70"
              style={{ border: '1px solid var(--border-strong)', color: 'var(--text-soft)' }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !draft.razaoSocial}
              className="flex-1 h-9 rounded-lg text-sm font-medium transition disabled:opacity-50"
              style={{ background: 'var(--brand-600)', color: '#fff' }}
            >
              {saving ? 'Salvando...' : 'Cadastrar fornecedor'}
            </button>
          </div>
        </div>
      )}

      {!draft && (
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg text-sm font-medium transition hover:opacity-70"
          style={{ border: '1px solid var(--border-strong)', color: 'var(--text-soft)' }}
        >
          Cancelar
        </button>
      )}
    </div>
  );
};

/* ─── Modal principal ─── */
interface SupplierModalProps {
  marketId: string;
  onClose: () => void;
  onSelect: (supplier: Supplier) => void;
}

const SupplierModal: React.FC<SupplierModalProps> = ({ marketId, onClose, onSelect }) => {
  const { suppliers, loading, save, remove } = useSuppliers(marketId);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase();
    return (
      s.razaoSocial.toLowerCase().includes(q) ||
      (s.nomeFantasia || '').toLowerCase().includes(q) ||
      s.cnpj.includes(q.replace(/\D/g, ''))
    );
  });

  const handleSaved = (s: Supplier) => {
    setAdding(false);
    onSelect(s);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex w-full max-w-md flex-col gap-0 overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--surface-base)', border: '1px solid var(--border-soft)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-5" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" style={{ color: 'var(--brand-600)' }} />
            <p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Fornecedores</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 transition hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {adding ? (
            <NewSupplierForm
              marketId={marketId}
              onSaved={handleSaved}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <>
              {/* Barra de busca + botão novo */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou CNPJ..."
                    className="h-9 w-full rounded-lg pl-8 pr-3 text-sm outline-none"
                    style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)', background: 'var(--surface-base)' }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition hover:opacity-80 shrink-0"
                  style={{ background: 'var(--brand-600)', color: '#fff' }}
                >
                  <Plus className="h-4 w-4" />
                  Novo
                </button>
              </div>

              {/* Lista */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-600)' }} />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Building2 className="h-8 w-8 opacity-30" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-soft)' }}>
                    {search ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
                  </p>
                  {!search && (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="mt-1 text-sm font-medium underline"
                      style={{ color: 'var(--brand-600)' }}
                    >
                      Cadastrar o primeiro fornecedor
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map(s => (
                    <SupplierRow
                      key={s.id}
                      s={s}
                      onSelect={(sup) => { onSelect(sup); onClose(); }}
                      onDelete={remove}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupplierModal;
