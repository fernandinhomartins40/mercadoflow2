export interface RememberedLoginState {
  email: string;
  password: string;
  rememberMe: boolean;
  keepConnected: boolean;
}

interface LoadRememberedLoginOptions {
  legacyEmailKey?: string;
  defaultKeepConnected?: boolean;
}

const FALLBACK_STATE: RememberedLoginState = {
  email: '',
  password: '',
  rememberMe: false,
  keepConnected: false,
};

export const loadRememberedLogin = (
  storageKey: string,
  options: LoadRememberedLoginOptions = {}
): RememberedLoginState => {
  const { legacyEmailKey, defaultKeepConnected = false } = options;

  try {
    const rawValue = localStorage.getItem(storageKey);
    if (rawValue) {
      const parsed = JSON.parse(rawValue);
      return {
        email: typeof parsed?.email === 'string' ? parsed.email : '',
        password: typeof parsed?.password === 'string' ? parsed.password : '',
        rememberMe: Boolean(parsed?.rememberMe),
        keepConnected:
          typeof parsed?.keepConnected === 'boolean'
            ? parsed.keepConnected
            : defaultKeepConnected,
      };
    }

    if (legacyEmailKey) {
      const legacyEmail = localStorage.getItem(legacyEmailKey) || '';
      if (legacyEmail.trim()) {
        return {
          email: legacyEmail,
          password: '',
          rememberMe: true,
          keepConnected: defaultKeepConnected,
        };
      }
    }
  } catch {
    return { ...FALLBACK_STATE, keepConnected: defaultKeepConnected };
  }

  return { ...FALLBACK_STATE, keepConnected: defaultKeepConnected };
};

export const persistRememberedLogin = (storageKey: string, state: RememberedLoginState) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore persistence errors
  }
};

export const clearRememberedLogin = (storageKey: string, legacyEmailKey?: string) => {
  try {
    localStorage.removeItem(storageKey);
    if (legacyEmailKey) {
      localStorage.removeItem(legacyEmailKey);
    }
  } catch {
    // ignore persistence errors
  }
};
