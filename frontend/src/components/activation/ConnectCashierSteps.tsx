import React from 'react';

/*
 * Os três passos para ligar o caixa, iguais em todas as telas.
 * O texto segue a tela real do programa (pdv2cloud-config, OnboardingWizard):
 * passo "Conectar conta" mostra um QR Code e um código de 8 letras e números,
 * que o dono lê com o celular ou digita em /parear-agente.
 */
export const CONNECT_STEPS: Array<{ title: string; text: string }> = [
  {
    title: 'Baixe no computador do caixa',
    text: 'Use o computador que emite as notas, com Windows 10 ou 11.',
  },
  {
    title: 'Instale e abra o programa',
    text: 'Abra o arquivo e siga as telas. Se o Windows perguntar, clique em "Sim". No fim, o programa abre sozinho: clique em "Próximo".',
  },
  {
    title: 'Digite o código que aparece no programa',
    text: 'O programa mostra um QR Code e um código de 8 letras e números. Leia o QR Code com o celular ou digite o código no botão "Digitar o código". Depois, siga as telas do programa até o fim.',
  },
];

/** Página que recebe o código; funciona logado ou não (pede login se precisar). */
export const PAIRING_PATH = '/parear-agente';

const ConnectCashierSteps: React.FC = () => (
  <ol className="fx-steps-big">
    {CONNECT_STEPS.map((step, i) => (
      <li key={step.title}><b><i>{i + 1}</i>{step.title}</b><p>{step.text}</p></li>
    ))}
  </ol>
);

export default ConnectCashierSteps;
