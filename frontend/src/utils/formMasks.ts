/**
 * Máscaras e validações de formulário.
 *
 * As máscaras formatam durante a digitação e guardam apenas os dígitos ao
 * enviar: o backend normaliza CNPJ com regex, mas gravar o valor mascarado
 * deixaria a base inconsistente entre cadastros feitos por telas diferentes.
 */

/* ─── CNPJ ─── */

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

/** 12.345.678/0001-95 — aplica progressivamente conforme o usuário digita. */
export const maskCnpj = (value: string): string => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

/**
 * Valida o CNPJ pelos dígitos verificadores.
 *
 * Checar só o tamanho deixaria passar 00.000.000/0000-00 e qualquer sequência
 * inventada, poluindo a base e quebrando a detecção de rede por CNPJ raiz.
 */
export const isValidCnpj = (value: string): boolean => {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  // Todos iguais passam no cálculo dos dígitos, mas não são CNPJ válidos.
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (base: string, weights: number[]): number => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = checkDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(digits[12])) return false;

  const second = checkDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return second === Number(digits[13]);
};

/* ─── Telefone ─── */

/** (11) 98765-4321 ou (11) 3456-7890, conforme o número de dígitos. */
export const maskPhone = (value: string): string => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

export const isValidPhone = (value: string): boolean => {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
};

/* ─── Força da senha ─── */

export interface PasswordRule {
  id: string;
  label: string;
  satisfied: boolean;
}

export interface PasswordStrength {
  /** 0-4: quantos requisitos obrigatórios foram atendidos. */
  score: number;
  /** 0-100, para a barra. */
  percent: number;
  label: string;
  color: string;
  rules: PasswordRule[];
  /** True quando todos os requisitos obrigatórios estão satisfeitos. */
  valid: boolean;
}

/**
 * Avalia a senha contra os mesmos requisitos validados no backend.
 *
 * Manter a regra idêntica nos dois lados é o que evita o pior caso de
 * usabilidade: a barra dizer "forte" e o servidor recusar o cadastro.
 */
export const evaluatePassword = (password: string): PasswordStrength => {
  const rules: PasswordRule[] = [
    { id: 'length', label: 'Pelo menos 8 caracteres', satisfied: password.length >= 8 },
    { id: 'upper', label: 'Uma letra maiúscula', satisfied: /[A-Z]/.test(password) },
    { id: 'lower', label: 'Uma letra minúscula', satisfied: /[a-z]/.test(password) },
    { id: 'number', label: 'Um número', satisfied: /\d/.test(password) },
    { id: 'special', label: 'Um caractere especial (!@#$…)', satisfied: /[^A-Za-z0-9]/.test(password) },
  ];

  const satisfied = rules.filter((rule) => rule.satisfied).length;
  const valid = satisfied === rules.length;

  // Bônus por comprimento: uma senha de 16 caracteres que cumpre tudo é
  // materialmente mais segura que uma de 8, e a barra deve refletir isso.
  let percent = (satisfied / rules.length) * 100;
  if (valid && password.length >= 12) percent = 100;
  else if (valid) percent = 85;

  let label: string;
  let color: string;
  if (!password) {
    label = '';
    color = 'transparent';
  } else if (satisfied <= 2) {
    label = 'Fraca';
    color = '#dc2626';
  } else if (satisfied <= 3) {
    label = 'Razoável';
    color = '#d97706';
  } else if (!valid) {
    label = 'Quase lá';
    color = '#ca8a04';
  } else if (password.length >= 12) {
    label = 'Muito forte';
    color = '#15803d';
  } else {
    label = 'Forte';
    color = '#16a34a';
  }

  return { score: satisfied, percent, label, color, rules, valid };
};
