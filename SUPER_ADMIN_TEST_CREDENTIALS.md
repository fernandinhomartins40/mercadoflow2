# Credenciais de Teste - Painel Super Admin

## Ambiente local (profile `dev`)
- URL: `http://localhost:5173/super-admin/login`
- Email: `superadmin@demo.com`
- Senha: `superadmin123`

## Ambiente VPS/production (seed padrao)
- URL: `https://mercadoflow.com/super-admin/login`
- Email: `superadmin@mercadoflow.com`
- Senha: `SuperAdmin@2026`

## Observacao
- Essas credenciais sao de seed inicial para testes.
- Em producao, troque a senha apos o primeiro acesso.
- O frontend mostra botoes de autofill locais em `npm run dev`.
- Para expor tambem os botoes de seed da VPS em um build especifico, compile com `VITE_SHOW_TEST_LOGINS=true`.
