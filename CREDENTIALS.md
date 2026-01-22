# 🔑 Credenciais de Acesso - MercadoFlow

## 🌐 Produção

### Acesso ao Sistema

**URL:** https://mercadoflow.com

**Credenciais Padrão (Primeiro Deploy):**
```
Email:    admin@mercadoflow.com
Senha:    MercadoFlow@2026
Perfil:   ADMIN
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
```

## 🔒 Segurança

- As senhas são criptografadas com BCrypt antes de serem armazenadas
- O ProductionSeeder só executa se o banco estiver vazio (primeiro deploy)
- Logs mostram as credenciais criadas para facilitar o primeiro acesso

## 📝 Como Funciona

1. **Primeiro Deploy:** ProductionSeeder cria automaticamente:
   - Mercado padrão: "MercadoFlow Admin" (Plano Advanced)
   - Usuário admin com as credenciais acima

2. **Deploys Subsequentes:** Seeder detecta que já existem usuários e **não cria novos**

3. **Reset Completo:** Para recriar o admin, você precisa:
   - Remover o volume PostgreSQL: `docker volume rm mercadoflow_postgres_data`
   - Fazer novo deploy

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
