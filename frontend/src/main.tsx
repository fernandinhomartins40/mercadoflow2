import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { DialogHost } from './components/common/Dialogs';
import { AuthProvider } from './context/AuthContext';
import { SuperAdminAuthProvider } from './context/SuperAdminAuthContext';
import './tailwind.css';
import './styles/liquid-glass.css';
import './styles/flow.css';

document.documentElement.lang = 'pt-BR';
document.documentElement.setAttribute('dir', 'ltr');
document.documentElement.setAttribute('data-locale', 'pt-BR');
document.body.setAttribute('data-locale', 'pt-BR');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SuperAdminAuthProvider>
          <App />
          <DialogHost />
        </SuperAdminAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
