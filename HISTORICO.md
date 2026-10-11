# Histórico — FOTOMAC (prototype)

## 2026-10-10 — guia de estudo da estrutura (pedido do Thiago)
- docs/ESTRUTURA-DO-SISTEMA.md → docs/entregaveis/ESTRUTURA-DO-SISTEMA.pdf (21 páginas, 11 figuras), para o Thiago estudar e apresentar. Conteúdo:
  - o que foi feito e o que falta, por fase;
  - as cinco peças, com as analogias balcão/gerente/fichário/almoxarifado/olho;
  - como cada ligação funciona: HTTP/JSON, SQLAlchemy, S3/boto3 e porta/adaptador;
  - o InsightFace por dentro (SCRFD + ArcFace, 512 números, cosseno, limiar 0,30, Teste 1);
  - os fluxos, o banco, o trabalhador, a LGPD com os artigos conferidos na lei;
  - testes, limitações, perguntas prováveis da banca e glossário.
- As figuras são SVG gerados por docs/figuras/gerar.py (só biblioteca padrão; rodar de novo regenera). Só PDF, sem DOCX: é material de estudo dele, não vai ser editado por outra pessoa.
- **Parei em:** Thiago estuda o guia e depois sobe o projeto no GitHub. 4b ainda aguarda o teste dele; depois, a 4c.

## 2026-10-07 — preparação para o GitHub
- README reescrito para quem vai ler no GitHub (orientador e banca): situação por fase da seção 9, arquitetura, decisões de LGPD com o arquivo de cada uma, tecnologias, aviso de licença do buffalo_l (só pesquisa não comercial) e como rodar. O README do frontend, que era o modelo do Expo, virou um índice curto.
- Havia um repositório git dentro de frontend/ (criado pelo create-expo-app, com 1 commit do modelo). O GitHub mostraria a pasta vazia. Movi para o scratchpad da sessão em vez de apagar.
- .gitignore passou a cobrir e2e-screenshots/ (pode mostrar rostos e e-mails) e .DS_Store. O frontend/debug-tmp.mjs, que era resto meu de depuração, saiu.
- Simulação do `git add` (sem criar repositório): 217 arquivos, 2,8 MB, sem senhas, fotos ou e-mails. Únicos dados pessoais: o e-mail acadêmico do Thiago (com a matrícula) neste HISTORICO.md e o caminho local no claude.md. Recomendado: repositório privado.
- Thiago vai conversar com o orientador sobre a primeira banca.
- **Parei em:** Thiago cria o repositório e sobe o projeto. 4b ainda aguarda o teste dele; depois, as dúvidas dele e a 4c.

## 2026-10-04 (3) — limpeza do banco e Etapa 4, parte 4b
- Pedido do Thiago: apagar todas as contas menos a dele, que vira administrador. scripts/dev_keep_only_account.py (só banco local; desliga o gatilho da auditoria numa transação para apagar os registros dessas contas). Ficou só 2313981242@academico.cesmac.edu.br (admin, assinatura "Thiago Nunes", dono do evento da colação). cleanup_e2e.py agora remove também contas, temas e reindexações de teste — rodar após cada e2e.
- Parâmetros (RF026): app/parameters.py com faixa, padrão e ajuda de cada um (limiar, teto, confiança, lado mínimo, buscas/sessão, buscas e downloads por endereço, retenção); busca, indexação e limitadores leem do banco; limiar exige advertência confirmada (também no servidor); histórico inalterável com valor anterior/novo/quem; versão do modelo só leitura. Padrões de fábrica continuam no .env.
- Decisão (registrada no relatório de adequação para validação): reduzir a retenção nunca faz um evento expirar em menos de 30 dias (RF026 n2 × RF006 n5); a tela mostra o impacto antes de salvar.
- LACUNA ACHADA E FECHADA: nada expirava eventos. Agora app/events/expiry.py — aviso 30 dias antes ao responsável e a quem tem fotos publicadas, e no vencimento eliminação consistente (originais, cópias, capa, pacotes, vetores, registros) com auditoria "event.expired" contando o removido. Roda no trabalhador a cada minuto.
- Temas (RF027): criar, renomear, ativar/inativar, excluir só sem uso. Defeito achado e corrigido: editar evento com tema inativado falhava; agora o tema que o evento já tem continua válido e aparece "(inativo)".
- Reindexação (RF028): migração 0007 (reindex_jobs/items), fila própria que só anda com a fila de publicação vazia; vetores novos antes de apagar os antigos; progresso por evento e total; auditoria requested/finished.
- Telas: Temas e Reconhecimento facial (abas Parâmetros e Reindexação) no menu do administrador.
- 125 testes (inclui o efeito real do limiar na busca com foto desfocada, sim. 0,56 medida). e2e/config.e2e.mjs TUDO CERTO (devolve os parâmetros ao valor anterior).
- **Parei em:** 4b pronta para o Thiago testar. Próximo: 4c (solicitações de remoção e registros/uso atípico, RF023/RF024/RNF14).

## 2026-10-04 (2) — Etapa 4, parte 4a: contas do administrador
- Etapa 4 dividida em 4a (contas), 4b (temas, parâmetros, reindexação), 4c (remoções e registros/uso atípico), 4d (pessoas institucionais).
- Servidor: app/accounts/service.py + /api/v1/admin/accounts (só administrador; sem DELETE — RF003 nota 4). Cadastro sem senha com link de uso único (RF001), relação com pendentes primeiro e aviso de link vencido, reenvio do link (invalida o anterior), edição de nome/perfil/assinatura (mudança de perfil registrada), situação Ativa/Inativa/Suspensa com e-mail ao titular e sessões cortadas na hora (RF003), desbloqueio pelo administrador (RF002 nota 7).
- Proteções além do requisito: administrador não altera o próprio perfil nem a própria situação; o sistema nunca fica sem administrador ativo; reativar conta que nunca teve senha volta para "Acesso Pendente" e reenvia o link.
- Telas (mesmo layout do painel, sem Figma de admin): menu "Contas" só para administrador; relação com contadores por situação (filtram), busca, filtros, destaque de pendentes; nova conta com aviso de e-mail fora de @cesmac.edu.br e prévia do crédito; detalhe com Acesso (reenviar link, desbloquear, mudar situação com confirmação explicando as consequências) e Dados.
- 15 testes novos (teste de mutação provou que "pendentes primeiro" é coberto); 112 no total. e2e/admin.e2e.mjs: TUDO CERTO.
- Banco de desenvolvimento: 45 contas e2e.* de testes automáticos aparecem na relação; não podem ser apagadas (auditoria inalterável aponta para elas e o RF003 proíbe exclusão). Não há administrador real ainda: Thiago precisa criar o primeiro pelo script.
- Thiago aprovou a 4a e as 3 regras extras (não alterar a si mesmo; nunca ficar sem administrador; reativar sem senha volta a pendente).

## 2026-10-04 — download do visitante preso à sessão (RF019 nota 7)
- Thiago abriu "Mais informações" da foto baixada e viu um link do SeaweedFS (127.0.0.1:8333, bucket, ID da chave). É o "Onde obtido" que o navegador/macOS grava em todo download — o crédito estava certo (Autores e Copyright conferidos com mdls).
- Mas revelou uma falha minha: o link era pré-assinado direto no armazenamento e funcionava para QUALQUER pessoa por 15 min; a v1.6 exige vínculo com a sessão. Agora: POST /public/images/{id}/download-link devolve endereço da própria API com assinatura HMAC (chave = hash da sessão, que só o servidor tem), válida 15 min, só para aquela foto e aquela sessão; GET serve o arquivo original (no-store, nome com acento via filename*).
- Teste novo prova: outra sessão → 403, outra foto → 403, link vencido → 403, sem link → 403. e2e confere que o endereço do download não contém o armazenamento. 96 testes.
- ZIP do painel (pedido do Thiago): POST /packages/{id}/download-link (assinado com a sessão de login, 30 min, só a conta que pediu) + GET que entrega o ZIP em fluxo pela API (StreamingResponse, pedaços de 1 MB — pacote pode passar de 10 GB). Capa no painel também servida pela API.
- "Link direto do armazenamento" (presigned_get_url) REMOVIDO da porta de armazenamento: nenhum arquivo chega ao navegador sem passar pela API. Assinatura comum em app/security/signed_links.py. A porta ganhou stream(). 97 testes; e2e de imagens e painel OK.
- ZIP corrigido.

## 2026-10-03 (noite, 6) — correção pedida pelo Thiago: resultado não pode persistir
- Thiago testou câmera, upload e download (funcionando) e reprovou: ao sair do evento e voltar, as fotos da busca continuavam na tela. Ele está certo — num computador compartilhado a próxima pessoa veria as fotos (RF014, RS001).
- Duas causas: (1) eu restaurava o resultado guardado na sessão (2 h) ao reabrir a página; (2) "Voltar" usava router.navigate, que empilhava o início por cima e deixava a página do evento viva por baixo.
- Correção: rota POST /public/session/end apaga resultado e ciência; a página do evento encerra a visita ao entrar, ao perder o foco (useFocusEffect, não só ao desmontar) e ao fechar/recarregar a aba (pagehide + keepalive); "Voltar" agora volta de verdade. Imagens do visitante com Cache-Control: no-store. Voltar ao evento pede "Estou ciente" de novo. GET /public/session removida.
- Defeito achado pelo teste: a mesma foto do mesmo fotógrafo em dois eventos gera arquivo idêntico; a remoção pelo arquivo pegava só uma cópia (às vezes a errada). Agora cobre todas as cópias publicadas.
- Testes do e2e deixados determinísticos (descarte e remoção escolhem a foto pelos dados, não pela posição). Eventos de teste agora desempatam pelo mais novo na lista pública.
- 95 testes no servidor; e2e de login, painel, imagens e visitante: todos OK. No evento real do Thiago: 3 pedidos de remoção que ele mesmo testou foram concluídos como "excluída pelo fotógrafo", e-mail de contato apagado.
- **Parei em:** aguardando o Thiago testar de novo o sair/voltar. Próximo: Etapa 4 (administrador).

## 2026-10-03 (noite, 5) — Etapa 3: área do visitante + ajustes pedidos pelo Thiago
- Pedidos do Thiago resolvidos: (1) processamento mostrava só 5 fotos — é a "Amostra de estados" do Figma; agora rotulada, com link "Ver todas as imagens (N)"; (2) miniaturas sumiam/reapareciam ao rolar — a API gerava um link assinado novo a cada pedido e o navegador não reaproveitava; agora serve os bytes com endereço estável + cache privado; (3) botões "Ver imagens" / "Ir para o evento" ao fim do processamento; (4) autor da foto no Mac — o Finder/Spotlight leem XMP, não o EXIF Artist; o arquivo agora leva os dois (Obter Informações → "Autores"/"Copyright").
- Corrigi o Thiago: enviar foto da galeria NÃO é só teste — é requisito (RF016 "selecionada da galeria", nota 2). O que não existe é a aba de teste do fotomac-lab (comparar com o acervo inteiro).
- Servidor (migrações 0005 e 0006): ciência (registro sem vínculo com a pessoa), sessão anônima do visitante em cookie HttpOnly com os ids do resultado, busca facial por evento (pgvector, limiar 0,30, 10 buscas/sessão), rotas de imagem que só servem o que está no resultado da sessão, download por link de 15 min com auditoria, remoção (sai da busca na hora, e-mails, exclusão automática em 72 h pelo trabalhador, e-mail apagado ao concluir), remoção pelo arquivo baixado (SHA-256 do arquivo entregue — 0006), filtro com vários temas, Política de Privacidade com o prazo em vigor. 93 testes.
- Telas (Poppins, como no Figma): início com pesquisa e filtros Tema/Data/Período, "Todos", página do evento, permissão "Estou ciente" ANTES das opções câmera/galeria (o Figma tinha aceite tácito), câmera com o molde oval, conversão da galeria para JPEG no navegador, resultado, vazio, foto ampliada, remoção, Política de Privacidade, remoção por arquivo.
- Navegação: "/" virou o início público; equipe entra por /login (ou menu ⚙ → Acesso da equipe). Proteção do painel saiu do Stack.Protected para o layout do painel, que manda para /login.
- Teste ponta a ponta e2e/visitor.e2e.mjs (InsightFace real, câmera falsa do Chromium): TUDO OK. Achou um defeito real — menus abertos cobriam a página e engoliam o clique; agora fecham ao clicar fora.
- Relatório de adequação ao Figma corrigido (eu tinha dito que o Figma só tinha câmera; o menu com upload existia oculto) e regenerado em PDF/DOCX.
- **Parei em:** Etapa 3 pronta para o Thiago testar. Próximo: Etapa 4 (administrador: contas, temas, parâmetros, reindexação, pessoas institucionais, solicitações de remoção, registros).

## 2026-10-03 (noite, 4) — Parte 2b-2: imagens, fila facial e download
- Servidor: envio por arquivo (JPEG por assinatura, 25 MB, 1.000/evento, duplicata por SHA-256, GPS removido, crédito gravado no EXIF sem recompressão, miniatura 480 px e prévia 1600 px), descarte/restauração, substituição antes da publicação, exclusão consistente (arquivos → registro), publicação (descartadas apagadas de vez; evento → Em Processamento), fila de indexação no banco (FOR UPDATE SKIP LOCKED, 3 tentativas com intervalo crescente), evento → Publicado ao terminar, reprocessamento (3/24 h), pacote ZIP em segundo plano (pasta única, pacote do colaborador, link 30 min, auditoria, expira em 60 min). Migração 0004. Trabalhador roda dentro da API. 80 testes.
- Telas: Enviar (arrastar/soltar, verificação de duplicata no navegador, advertência de menores, progresso por arquivo, reenvio só das falhas), Conferir (+ visualização com setas do teclado e posição preservada, + diálogo de publicação), Processamento (atualiza sozinho), Imagens (filtros, seleção, exclusão em lote, reprocessar), Imagem (+ diálogo de exclusão), Baixar acervo.
- Prova real: e2e/images.e2e.mjs com o InsightFace de verdade — foto de grupo → 6 vetores; ZIP baixado do SeaweedFS com crédito e sem GPS.
- Armadilha achada: React Compiler + `x!.campo` em função → lê x durante a renderização (tela de download quebrava). Regra registrada na memória.
- cleanup_e2e.py agora apaga também os arquivos das fotos (antes deixaria órfãos no SeaweedFS).
- **Parei em:** 2b-2 pronta para o Thiago testar. Etapa 2 completa (falta só "Pessoas institucionais", que depende do cadastro do administrador — Etapa 4). Próximo: Etapa 3 (visitante).

## 2026-10-03 (noite, 3) — marca corrigida
- Thiago apontou: "FOTOMAC" deveria ter "MAC" destacado e o símbolo estava esticado. Correto: o .fig tem estilos por letra (FOTO Montserrat Regular / MAC Montserrat ExtraBold) e recorte da imagem. Corrigido; dump.py agora mostra RUNS[...] e crop(...). Montaga removida.
- Área do visitante: confirmado que está nos requisitos (§2.1, RF002, RF013–RF019, Fase 2). É a Etapa 3 do plano; depende da 2b-2 (sem fotos publicadas e indexadas não há o que buscar).

## 2026-10-03 (noite, 2) — Parte 2a aprovada; Parte 2b-1 (painel e eventos)
- Thiago aprovou a 2a (login): tudo funcionou, inclusive aviso de bloqueio e telas estreitas.
- Marca: cartões de login no Figma usam só texto (mantido); barra lateral usa símbolo (imagem extraída do .fig) + "FOTOMAC" em Montaga.
- Ícones do painel: Lucide (mesma biblioteca do designer), traço 1,6 px.
- Servidor: eventos (criar/editar/listar/detalhar), três formas de data, expiração por parâmetro (system_parameters, 6 meses), temas iniciais, colaboração (RF025), capa sem GPS (piexif, sem recompressão), busca sem acento (unaccent), resumo do painel, perfil (assinatura) e troca de senha logado. Migração 0003. 64 testes.
- Telas: moldura (barra lateral + cabeçalho, vira gaveta < 1024 px), Visão geral, Eventos, Novo, Detalhes (+ aba Colaboração), Editar (mostra nova expiração antes de salvar), Meu perfil (sem foto; assinatura com prévia do crédito).
- Defeitos achados pelo teste e corrigidos: menu de Temas abria por baixo da seção Data; cabeçalho estourava no celular; erros do formulário não sumiam ao corrigir.
- e2e/panel.e2e.mjs: fluxo completo no Chromium. Limitação: os limitadores de tentativas ficam na memória da API; rodar o e2e várias vezes seguidas bate no limite (comportamento correto).
- Temas iniciais (Ciência, Confraternização, Cultura, Educação, Esporte, Inovação, Saúde, Tecnologia) são provisórios — pendência 7 do documento.
- **Parei em:** 2b-1 pronta para o Thiago testar. Próximo: 2b-2 (envio, conferência, publicação, indexação facial, gerenciamento, download).

## 2026-10-03 (noite) — teste do Thiago no Safari
- Conta real criada: 2313981242@academico.cesmac.edu.br (a thiago@cesmac.edu.br, criada por engano a partir do meu exemplo, foi apagada direto no banco de dev — nunca usada).
- Thiago achou que o bloqueio não funcionava. Funcionava (auditoria: bloqueada 17:49:33), mas era invisível. Corrigido: aviso a partir da 3ª tentativa errada, contado na tela, para qualquer e-mail (não revela se a conta existe). Coberto no e2e (passo 7b).
- outbox/ passa a nomear os .eml no horário local.
- Armadilha: `CI=1 npx expo start` desliga a recarga do código. Não usar.
- **Parei em:** Thiago testando o login no Safari; depois, Parte 2b.

## 2026-10-03 (madrugada) — Figma offline e adequação à v1.6
- Regra do Thiago: telas do Figma são da v1.4/v1.5; o que divergir da v1.6 é adaptado no mesmo estilo, sem perguntar.
- Limite do MCP do Figma no Starter = 20 chamadas/mês (doc oficial). Contornado: tools/figma/ lê o .fig baixado (decode.mjs + dump.py), com textos, cores, auto-layout e instâncias. Sem limite.
- Comparadas as 40 telas com a v1.6: docs/ADEQUACAO-FIGMA-V1.6.md (+ PDF/DOCX em docs/entregaveis/) para o CITEC.
- Principais adaptações: aviso "Estou ciente" antes da câmera (o Figma tem aceite tácito, vedado pelo Art. 8º §1º), advertência de menores no upload, colaboração (RF025), remoção automática 72 h, link de download 30 min, crédito "Fotografia por: … — Centro Universitário CESMAC", sem foto de perfil, 8 telas de administrador a criar.
- Sombra do card corrigida para blur 8 (lido do .fig).
- **Parei em:** começar a Parte 2b (telas do fotógrafo) usando tools/figma/dump.py e o relatório de adequação.

## 2026-10-03 — Etapa 2, Parte 2a: login completo (web)
- Expo SDK 57 criado em frontend/ (monorepo, RNF22). Node 26 instalado.
- Servidor: login/logout/me, primeiro acesso por link de e-mail (24 h), recuperação (30 min), Argon2id, sessão em cookie HttpOnly + tabela de sessões (revogável), bloqueio após 5 erros (15 min), limite por IP, auditoria. Migração 0002.
- E-mail por adaptador: "outbox" grava .eml em backend/outbox/ até existir o servidor de e-mail do CESMAC.
- Telas: as 9 de autenticação do Figma (login, validação, recuperação ±sucesso, redefinição ±validação ±sucesso, primeiro acesso ±sucesso). Tokens em src/theme/tokens.ts; ícones do Figma via scripts/build-icons.mjs.
- **Divergência Figma × requisito:** tela "Primeiro acesso" do Figma pede "senha atual (provisória)" — fluxo da v1.4. Segui a v1.6 (RF001 nota 5: link de uso único, nunca senha atribuída). CITEC precisa atualizar o Figma.
- 47 testes no servidor + teste ponta a ponta no Chromium (Playwright) com fotos de cada tela, celular 390 px e console limpo.
- Avisos "non-boolean attribute accessible" e "shadow* deprecated" vêm do navegador do Expo Router (aparecem com tela vazia); só no modo dev, somem no build de produção.
- **Limite do Figma (plano Starter) atingido em 03/10** depois de ~25 chamadas. Telas de login e ícones já estão salvos; o resto depende de nova cota/plano.
- **Parei em:** Parte 2a entregue, aguardando aprovação. Próximo: Parte 2b (19 telas do fotógrafo) — depende de decidir como contornar o limite do Figma. /painel atual é provisório.

## 2026-10-01 (tarde) — Etapa 1: base pronta
- Stack decidida: Expo (web agora, mobile depois) → API REST FastAPI → PostgreSQL 17 + pgvector, InsightFace buffalo_l, SeaweedFS (S3).
- Figma inteiro mapeado via use_figma: 28 telas fotógrafo/login, 12 do visitante (402px, página "Protótipos"), design system. Sem telas de admin.
- Adaptador facial (pedido do professor, RNF22): app/face/port.py + insightface_engine.py + factory.py. Mesmo padrão no armazenamento (app/storage).
- InsightFace fixado em 1.0.1 (versão do Teste 1); só detecção+reconhecimento carregados (sem idade/gênero) — teste prova vetores idênticos ao padrão.
- Banco: 8 tabelas; vetores segregados; trigger recusa vetor de foto não publicada (RNF13); auditoria append-only (RF024); índice HNSW por dimensão.
- SeaweedFS local com credencial, só 127.0.0.1, vacuum a 1% (exclusão física para RF023).
- 29 testes passando; teste de mutação confirmou que os testes de privacidade falham sem o trigger.
- Limiar padrão 0.30 (Teste 1: pior foto errada 0.2783). Lado mínimo do rosto de consulta 40px — suposição minha, ajustável (RF026).
- **Parei em:** Etapa 1 entregue, aguardando aprovação do Thiago. Próximo: Etapa 2 (login + telas do fotógrafo no Expo, puxando o Figma).

## 2026-10-01 (manhã)
- Lidos os requisitos v1.6 inteiros (RF001–RF028, RNF01–RNF25, RS001–RS021, fases, pendências).
- Conexão com o Figma testada: funciona, mas o arquivo "FOTOMAC (Copy)" só tem a página Capa (logo). Sem telas.
- Constatado: o docx não define stack; React Native + Expo + SeaweedFS ainda não estavam decididos.
- Feita análise de viabilidade de RN + Expo (web) + SeaweedFS; recomendação entregue ao Thiago.
- Link certo do Figma recebido (nó 5049:5109): 28 telas web — 9 de autenticação e 19 do fotógrafo. Sem telas do visitante nem do administrador.
- **Parei em:** aguardando (1) decisão da stack, (2) saber se existem telas do visitante e do administrador. Nenhum código escrito ainda.
