import React, { useId, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { evaluatePassword } from '../../utils/formMasks';

/**
 * Campo de senha com alternância de visibilidade e, opcionalmente, medidor de
 * força com os requisitos listados.
 *
 * Os requisitos ficam visíveis enquanto o usuário digita, em vez de aparecerem
 * como erro depois do envio: mostrar a regra só quando ela é violada obriga a
 * adivinhar o que falta.
 */

interface Props {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  /** Exibe barra de força e checklist de requisitos. */
  showStrength?: boolean;
  /** Mensagem de erro externa (ex.: confirmação que não confere). */
  error?: string | null;
  autoFocus?: boolean;
}

const PasswordField: React.FC<Props> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete = 'current-password',
  required,
  showStrength = false,
  error,
  autoFocus,
}) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  const strength = showStrength ? evaluatePassword(value) : null;

  return (
    <div className="form-group">
      <label htmlFor={fieldId}>{label}</label>

      <div className="input-with-icon">
        <input
          id={fieldId}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          autoFocus={autoFocus}
          aria-describedby={showStrength ? `${fieldId}-strength` : undefined}
          aria-invalid={error ? true : undefined}
        />
        <button
          type="button"
          className="input-icon-button"
          onClick={() => setVisible((v) => !v)}
          // Sem rótulo acessível, o botão é lido apenas como "botão" por
          // leitores de tela, e o usuário não sabe o que ele faz.
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
          tabIndex={-1}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {error && (
        <p className="mt-1 text-xs font-medium" style={{ color: '#dc2626' }}>
          {error}
        </p>
      )}

      {strength && value.length > 0 && (
        <div id={`${fieldId}-strength`} className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full"
              style={{ background: 'var(--surface-soft, #e2e8f0)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{ width: `${strength.percent}%`, background: strength.color }}
              />
            </div>
            <span className="text-xs font-bold" style={{ color: strength.color }}>
              {strength.label}
            </span>
          </div>

          <ul className="flex flex-col gap-0.5">
            {strength.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center gap-1.5 text-[11px]"
                style={{ color: rule.satisfied ? '#15803d' : 'var(--text-muted, #64748b)' }}
              >
                {rule.satisfied ? <Check size={11} /> : <X size={11} />}
                {rule.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PasswordField;
