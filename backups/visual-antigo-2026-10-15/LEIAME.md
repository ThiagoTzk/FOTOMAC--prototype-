# Visual antigo do site (antes do redesign "100% web") — 15/10/2026

Cópia de `frontend/src` feita antes de implementar o novo modelo de página inicial
(simulado em `docs/design/simulado-home/`). Já inclui a fase 1: foto em tela cheia com zoom
e botão Voltar no painel.

## Para voltar ao visual antigo

```bash
cd "FOTOMAC (prototype)"
mv frontend/src frontend/src-redesign        # guarda o novo, por precaução
cp -R backups/visual-antigo-2026-10-15/src frontend/src
```

O servidor (backend) não precisa voltar. Se a coluna `themes.icon` (ícone das tags) já existir
no banco, o visual antigo simplesmente a ignora.
