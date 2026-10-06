import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpFromLine, Download, FlaskConical, KeyRound, ShieldOff } from 'lucide-react';
import { Card, Chip, ExplainStrip, PanelTitle } from '../components/flow/Flow';
import { publicPartners } from '../services/integrations.service';

/**
 * Documentação pública para quem faz ERP: o que entra, o que sai, como
 * autenticar e testar. A referência completa é o openapi.yaml servido pela API.
 */

const API = `${typeof window !== 'undefined' ? window.location.origin : 'https://mercadoflow.com'}/api/v1/partner`;

const Code: React.FC<{ children: string }> = ({ children }) => (
  <pre style={{ margin: '10px 0 0', padding: 14, borderRadius: 12, background: '#13241b', color: '#e7f3ea', fontSize: 13, lineHeight: 1.55, overflowX: 'auto', whiteSpace: 'pre' }}>
    {children}
  </pre>
);

const STEPS: { title: string; text: string; code: string }[] = [
  {
    title: 'Peça as credenciais',
    text: 'O cadastro de parceiro é gratuito. Você recebe um client_id e um segredo; o segredo aparece uma única vez.',
    code: `curl -X POST ${API}/oauth/token \\
  -d grant_type=client_credentials \\
  -d client_id=mfc_... \\
  -d client_secret=mfs_...
# { "access_token": "mfp_...", "token_type": "Bearer", "expires_in": 3600 }`,
  },
  {
    title: 'O lojista autoriza o seu ERP',
    text: 'Em Integrações, no painel da loja, ele escolhe o que o seu ERP pode enviar e receber. /me lista as lojas que autorizaram.',
    code: `curl ${API}/me -H "Authorization: Bearer mfp_..."`,
  },
  {
    title: 'Teste sem gravar',
    text: 'Todo envio aceita ?dryRun=true: valida item a item e diz o que faria. Um item recusado não impede os outros.',
    code: `curl -X POST "${API}/markets/{marketId}/stock?dryRun=true" \\
  -H "Authorization: Bearer mfp_..." -H "Content-Type: application/json" \\
  -d '{"items":[{"gtin":"7891000100103","units":48}]}'`,
  },
  {
    title: 'Envie estoque, preço e custo',
    text: 'Lotes de até 1000 itens, identificados pelo GTIN. Use Idempotency-Key para repetir com segurança.',
    code: `curl -X POST ${API}/markets/{marketId}/prices \\
  -H "Authorization: Bearer mfp_..." -H "Idempotency-Key: precos-2026-10-06" \\
  -H "Content-Type: application/json" \\
  -d '{"items":[{"gtin":"7891000100103","price":6.99,"promoPrice":5.99,"promoStart":"2026-10-07","promoEnd":"2026-10-13"}]}'`,
  },
  {
    title: 'Receba a entrada de mercadoria pronta',
    text: 'Enquanto o seu ERP envia estoque e preços da loja ao menos uma vez a cada 7 dias, você recebe o cadastro e as entradas lidas das notas de entrada, já com embalagem, conversão para unidade de venda, lote, validade e o que foi conferido.',
    code: `curl "${API}/markets/{marketId}/inbound-receipts?since=2026-10-01T00:00:00" \\
  -H "Authorization: Bearer mfp_..."
# 409 = troca em atraso: envie /stock e /prices desta loja`,
  },
  {
    title: 'Avisos do que o lojista aprovou',
    text: 'Configure um endereço https e receba order.sent (pedido ao fornecedor) e price.approved (preço novo), assinados com HMAC-SHA256.',
    code: `curl -X PUT ${API}/webhook -H "Authorization: Bearer mfp_..." \\
  -H "Content-Type: application/json" -d '{"url":"https://seu-erp.com.br/mercadoflow"}'
# confira: X-MercadoFlow-Signature: sha256=hex(HMAC_SHA256(segredo, corpo))`,
  },
];

const Developers: React.FC = () => {
  const [partners, setPartners] = useState<{ name: string; website: string | null }[]>([]);
  useEffect(() => { publicPartners().then(setPartners).catch(() => undefined); }, []);

  return (
    <div className="fx-app" style={{ minHeight: '100vh' }}>
      <header className="fx-top">
        <Link to="/" className="fx-brand" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="fx-logo" aria-hidden="true">MF</span><span className="fx-brandname">MercadoFlow para desenvolvedores</span>
        </Link>
        <a className="fx-btn dark small" href={`${API}/openapi.yaml`} download><Download aria-hidden="true" />openapi.yaml</a>
      </header>
      <main style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <section>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-.03em', lineHeight: 1.08 }}>
            Integre o seu ERP e entregue entrada de nota pronta aos seus clientes.
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: 17, lineHeight: 1.55, maxWidth: 70 + 'ch', color: 'var(--fx-ink-2)' }}>
            Os supermercados que usam o MercadoFlow conferem as notas de entrada no Confere. Com a integração, o seu ERP recebe o
            cadastro dos produtos e a entrada já conferida, sem ninguém digitar. Em troca, envia estoque, custo e preço da loja.
          </p>
        </section>

        <ExplainStrip items={[
          { icon: ArrowDownToLine, title: 'Você envia', text: 'Produtos, fornecedores, custo, preço, estoque e notas lançadas no ERP.' },
          { icon: ArrowUpFromLine, title: 'Você recebe', text: 'Cadastro e entrada prontos das notas, pedidos enviados e preços aprovados pelo lojista.' },
          { icon: ShieldOff, title: 'Não sai', text: 'Giro, tração, sazonalidade, previsão e recomendações: são do lojista, dentro do MercadoFlow.' },
        ]} />

        <Card>
          <PanelTitle icon={KeyRound} title="Regras" />
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, lineHeight: 1.7, listStyle: 'disc' }}>
            <li>Acesso por loja e por permissão: o lojista autoriza e revoga quando quiser (403 sem autorização).</li>
            <li>Troca obrigatória: entrada pronta só enquanto estoque e preços da loja chegam a cada 7 dias (409 se atrasar).</li>
            <li>Token de 1 hora (OAuth2 client credentials), 120 requisições por minuto (429 ao passar), 1000 itens por lote.</li>
            <li>Produtos pelo GTIN com dígito verificador válido; envie o produto antes de custo, preço, estoque ou nota.</li>
            <li>Tudo o que o seu ERP envia e recebe aparece para o lojista em Integrações.</li>
          </ul>
        </Card>

        {STEPS.map((s, i) => (
          <Card key={s.title}>
            <PanelTitle icon={i === 2 ? FlaskConical : undefined} title={`${i + 1}. ${s.title}`} sub={s.text} />
            <Code>{s.code}</Code>
          </Card>
        ))}

        <Card>
          <PanelTitle title="Homologação" sub="Depois de passar pelo roteiro, o seu ERP aparece na lista que os lojistas veem" />
          <p style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
            O roteiro é medido na própria API: teste com dryRun, envie produtos, estoque, preços e custos, use Idempotency-Key,
            consuma as entradas prontas e receba um aviso no seu endereço.
          </p>
          {partners.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {partners.map((p) => <Chip key={p.name} tone="lime">{p.name}</Chip>)}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Developers;
