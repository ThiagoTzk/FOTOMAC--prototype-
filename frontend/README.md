# FOTOMAC — interface (Expo)

Telas do FOTOMAC, feitas em Expo (React Native + React Native Web) com Expo Router. Por enquanto
o projeto roda só na web; o aplicativo móvel vem depois.

A instalação, a forma de rodar e os testes estão no [README principal](../README.md).

- `src/app/`: rotas e telas. O visitante fica em `/`, a equipe em `/login` e no grupo `(painel)`.
- `src/api/`: chamadas à API (`http://localhost:8000/api/v1`), com cookie de sessão.
- `src/components/`: componentes do painel (`panel/`), do visitante (`visitor/`) e do
  administrador (`admin/`).
- `src/theme/`: cores e fontes extraídas do Figma.
- `e2e/`: testes de ponta a ponta com Playwright.
