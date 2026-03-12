# 🔑 Credenciais de Acesso - MercadoFlow

## 🌐 Produção

### Acesso ao Sistema

**URL:** https://mercadoflow.com

**Credenciais Padrão (Primeiro Deploy):**
```
Email:    admin@mercadoflow.com
Senha:    MercadoFlow@2026
Perfil:   ADMIN
Nome:     Administrador
Mercado:  MercadoFlow Admin (Plano ADVANCED)
CNPJ:     00000000000000
```

### ⚠️ IMPORTANTE - Segurança
1. **ALTERE A SENHA IMEDIATAMENTE** após o primeiro login
2. Estas credenciais são criadas automaticamente apenas se o banco estiver vazio
3. Para alterar as credenciais padrão, configure as variáveis de ambiente no workflow:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_NAME`

## 🧪 Desenvolvimento Local

**Credenciais de Teste:**
```
Email:    admin@demo.com
Senha:    admin123
Perfil:   ADMIN
Nome:     Admin Demo
Mercado:  Mercado Demo (Plano BASIC)
```

**Observação:** O DevSeeder só executa no perfil `dev` e apenas se o banco estiver vazio.

## 🔒 Segurança

- As senhas são criptografadas com BCrypt antes de serem armazenadas
- O ProductionSeeder só executa se o banco estiver vazio (primeiro deploy)
- Logs mostram as credenciais criadas para facilitar o primeiro acesso

## 📝 Como Funciona

### Ambiente de Produção (profile: production)
1. **Primeiro Deploy:** ProductionSeeder cria automaticamente:
   - Mercado padrão: "MercadoFlow Admin" (Plano ADVANCED, CNPJ: 00000000000000)
   - Usuário admin: Administrador (admin@mercadoflow.com)

2. **Deploys Subsequentes:** Seeder detecta que já existem usuários e **não cria novos**

3. **Reset Completo:** Para recriar o admin, você precisa:
   - Remover o volume PostgreSQL: `docker volume rm mercadoflow_postgres_data`
   - Fazer novo deploy

### Ambiente de Desenvolvimento (profile: dev)
1. **Primeiro Startup:** DevSeeder cria automaticamente:
   - Mercado demo: "Mercado Demo" (Plano BASIC)
   - Usuário admin: Admin Demo (admin@demo.com)

2. **Startups Subsequentes:** Seeder detecta que já existem usuários e **não cria novos**

## 🔐 Banco de Dados PostgreSQL

**Credenciais do PostgreSQL:**
```
Host:     mercadoflow-postgres
Port:     5432
Database: pdv2cloud
User:     pdv2cloud
Password: (gerada automaticamente em .db_secret no servidor)
```

⚠️ A senha do PostgreSQL é gerada automaticamente durante o deploy e salva em `/root/mercadoflow-web/.db_secret`

## 📞 Suporte

Para problemas de acesso, verifique:
1. Logs do backend: `docker logs mercadoflow-backend`
2. Status do PostgreSQL: `docker logs mercadoflow-postgres`
3. Arquivo .env no servidor: `/root/mercadoflow-web/.env`
