# Histórico — FOTOMAC (prototype)

## 2026-10-21 (3) — RAW volta a desligado; pessoas institucionais (RF020, RF021)
- **RAW:** o Thiago voltou atrás: RAW **desligado de fábrica** (a foto chega sem a edição do fotógrafo); só o admin liga, e o aviso da tela continua. A memória errada foi apagada e substituída por `nao-ligar-raw-por-padrao`. Também apaguei a linha `raw_formats_enabled = 1` do banco dev, resíduo do meu e2e.
- **Pessoas institucionais — servidor:**
  - migração **0024**: `institutional_people`, `_photos`, `_vectors` (gatilho recusa vetor de quem não autorizou) e `_marks`;
  - `app/institutional/` com `term.py` (termo versionado `2026-10-v1`, PROVISÓRIO), `service.py` e `form.py` (PDF);
  - `app/api/institutional.py` com rotas do admin, públicas (link) e de consulta.
- **Fluxo:**
  - O admin cadastra com e-mail institucional e 1 a 5 fotos (guardadas sem metadados, nunca processadas antes da assinatura).
  - Um link de uso único (7 dias) vai por e-mail; em dev o e-mail cai na outbox, e há "Mostrar link" TEMPORÁRIO.
  - A pessoa lê, vê as fotos e **assina desenhando na tela** (canvas), ou recusa (tudo apagado).
  - Fica guardado: texto exato assinado (`signed_term`), hashes das fotos (`signed_photos`), data/hora, IP, navegador e código SHA-256 em UTC (verificável mesmo após revogação).
  - O trabalhador (`refresh_next`) gera os vetores e varre o acervo publicado **sem o teto de 200**; `mark_image` roda a cada indexação e reindexação.
  - A troca de modelo refaz os vetores sozinha (`references_model_version`).
  - Consulta (fotógrafo, marketing, admin; nunca o contratado) com filtros de data e tema; confirmação/rejeição humana, e rejeição não volta.
  - Revogação (pela pessoa ou pelo admin): fotos, vetores e marcações apagados; o termo fica como prova e o PDF mostra "REVOGADA".
  - Cadastro não assinado em 30 dias é eliminado.
- **Parâmetro novo:** "Limiar da marcação institucional" (depende do modelo). O servidor recusa valor abaixo do público e a marcação usa o maior dos dois; mudar o limiar refaz as buscas.
- **PDF oficial** (ReportLab, dependência nova, BSD), sempre em 1 página, testado no pior caso. Usa o símbolo do FOTOMAC até chegar o `app/assets/brand/cesmac.png` oficial do marketing.
- **Site:**
  - menu "Pessoas institucionais";
  - consulta e fotos da pessoa seguindo o Figma 16/17/18;
  - cadastro do admin (lista, nova, detalhe com a **assinatura visível**, PDF, encerrar, refazer busca, excluir não assinado);
  - páginas públicas `/autorizacao` e `/autorizacao/revogar`;
  - "Pessoa institucional localizada" no detalhe da foto.
- **Correções no caminho:**
  - o PDF usaria o texto atual do termo (agora usa o assinado);
  - o código de verificação mudava com o fuso do banco (agora em UTC);
  - fotos apagadas na revogação impediam conferir o código (agora os hashes ficam guardados).
- `scripts/cleanup_e2e.py` agora apaga pessoas institucionais de e-mail `e2e.`.
- Prova:
  - pytest: **215** passam (14 novos em `test_institutional.py`);
  - tsc e lint limpos;
  - **8 e2e todos OK**: auth, admin, panel, images, visitor, config, formats e o novo `institutional.e2e.mjs`, que desenha a assinatura com o mouse;
  - telas e PDF conferidos no olho;
  - banco e armazenamento limpos.
- Docs:
  - requisitos (RF020 notas 7–9 e linhas novas na tabela, RF021 nota 11, Fase 9, 2.5 e RNF26 com ReportLab, pendência 5) com .docx;
  - README e ESTRUTURA (nova 7.4 e pergunta da banca) com PDF.
- **Parei em:** o Thiago testa. Pendentes:
  - e-mail real (fica para outra parte);
  - símbolo oficial do CESMAC;
  - validação jurídica do termo e da assinatura eletrônica (ICP-Brasil?);
  - ele vai subir no GitHub.

## 2026-10-21 (2) — RAW ligado por padrão, com aviso
- O Thiago aprovou todas as decisões da etapa 4. Correção dele: RAW **ligado de fábrica**, sem precisar do administrador. Fotógrafo e marketing sobem direto; a tela avisa e recomenda. Memória `nao-exigir-admin-para-opcao-de-envio` gravada.
- `raw_formats_enabled` com padrão 1; o parâmetro continua para a administração desligar (falta de espaço).
- Apaguei do banco dev a linha `raw_formats_enabled = 0`, resíduo do meu e2e de antes (não era escolha do Thiago). O registro inalterável ficou intacto.
- Tela de envio: aviso "N arquivo(s) RAW selecionado(s)" com o tamanho da seleção e a recomendação (exportar em JPEG editado; o RAW é revelado sem a edição). O envio segue se a pessoa preferir RAW.
- Ele achou que o sistema já aceitava **vídeo**; não aceita (Fase 10). Avisei.
- Requisitos: RF007 (tabela e nota 13), RF026, Fase 12, pendência 15 (agora acompanhar o consumo). .docx regenerado; README, ESTRUTURA e PDF atualizados.
- Prova:
  - pytest: 201 passam (o teste do RAW agora prova "aceito por padrão, recusado só se desligado");
  - tsc e lint limpos;
  - e2e de formatos: TUDO CERTO;
  - dados e2e limpos.
- **Parei em:** começar as pessoas institucionais (RF020/RF021). O Thiago tem ideias novas para contar antes.

## 2026-10-21 — Etapa 4: formatos, marca d'água, aviso de propriedade e download do marketing
- **Pedido:** "faça a parte 4"; o Thiago confirmou que era a etapa 4 do plano (Fase 12 dos requisitos), e não a Fase 9.
- **Dependências novas** (avisadas antes de instalar):
  - pi-heif 1.4.0 (BSD-3, só decodifica, sem o x265 GPL);
  - rawpy 0.27.1 (MIT, LibRaw);
  - ExifTool 13.55 (`brew install exiftool`; programa externo, Artistic/GPL);
  - fonte Montserrat ExtraBold em `backend/app/assets/fonts` (OFL).
  - `requirements.txt` atualizado; as listas continuam batendo com o venv.
- **Formatos (RF007):** `images/formats.py` reconhece pela assinatura JPEG, PNG, WebP, HEIC e RAW (DNG, CR2, CR3, NEF, ARW, ORF, RW2, RAF). TIFF comum é recusado.
  - O original fica em `source_key` (`<id>_original.<ext>`), limpo pelo ExifTool (`images/exiftool.py`): sem GPS em nenhum grupo, sem o XMP/IPTC da câmera, com autor, crédito e aviso.
  - `object_key` segue como a cópia JPEG (q95) de trabalho, com data e dados técnicos copiados; telas, indexação e downloads não mudaram.
  - Transparência de PNG vira branco.
  - Sem ExifTool, o servidor recusa esses formatos (`format_unavailable`): falha fechada, nunca guarda original com GPS.
- **RAW:** parâmetro "Formatos brutos de câmera (RAW)", **desabilitado por padrão**, e "Tamanho máximo de um arquivo RAW" (100 MB). `GET /upload-rules` informa a tela.
- **Metadados (RF019 nota 6):** todo JPEG recebe Artist, Copyright e ImageDescription com o aviso "Imagem do acervo do Centro Universitário CESMAC — Fotografia: X" (texto PROVISÓRIO, pendência 14), XPAuthor/XPComment, XMP (dc, photoshop:Credit, xmpRights:WebStatement = `frontend_url`) e IPTC APP13 (By-line, Credit, Copyright, Caption). O IPTC da câmera sai, porque pode trazer o nome do lugar.
- **Marca d'água (RF019 nota 9):** `images/watermark.py`, "CESMAC" com 4,5% do lado menor, branco translúcido com sombra, no canto do parâmetro "Posição da marca d'água" (padrão: direito). Só na rota pública de download; a foto é endireitada antes (orientação EXIF).
- **Downloads das contas, sem marca:** `POST /images/{id}/download-link` + `GET /images/{id}/download` (link assinado de 15 min, preso à sessão).
  - Pode baixar quem gerencia a foto e o marketing (só publicada e sem remoção pedida).
  - O colaborador **não** baixa foto de outro autor (mesmo princípio do RF012 nota 1).
  - Audit `image.download` com `publicity`.
- **Pacotes:** guarda = originais no formato recebido (HEIC, RAW...); marketing em evento alheio publicado = **pacote de divulgação** com as cópias JPEG ("- divulgação.zip", `package_jobs.publicity`).
  - Correção encontrada no caminho: foto com remoção pedida agora fica fora de todo pacote (RF012 nota 8 não era aplicado).
- **Parâmetros:** `Spec.choices` (escolha em lista na tela, validada no servidor); grupo novo "Fotos e downloads".
- **Banco:** migração **0023** (`images.source_key/format/bytes` com CHECK de consistência, `package_jobs.publicity`). `Image.storage_keys` agora é a lista única de arquivos de uma imagem (exclusão, expiração, scripts).
- **Site:**
  - envio com os formatos das regras do servidor e marcador "HEIC"/"RAW" no lugar da prévia;
  - "Baixar imagem" e "Formato" no detalhe da imagem;
  - "Baixar para divulgação" para o marketing e textos novos na tela do pacote;
  - aviso "Só visualização" atualizado;
  - Política de Privacidade e início público mencionam a marca e o GPS retirado.
- **Testes:** `tests/test_formats_and_downloads.py` (18 testes) com amostras sintéticas em `tests/fixtures/formats` (blocos de cor, GPS falso; o DNG foi gerado com pidng fora do projeto).
  - O teste de arquivo recusado ganhou GIF e TIFF; PNG falso agora é "corrompido".
  - O do visitante confere a cópia marcada.
  - e2e novo `e2e/formats.e2e.mjs`; o `images.e2e` usa `nao-imagem.jpg` no lugar do PNG disfarçado.
- Prova:
  - pytest: **201** passam;
  - tsc e lint limpos;
  - e2e auth, admin, panel, images, visitor, config e **formats**: todos OK (o limitador de links pede reiniciar a API entre as rodadas, como já sabido);
  - marca d'água conferida no olho;
  - dados e2e limpos, armazenamento vazio, parâmetros nos valores de fábrica.
- Docs: requisitos (2.5 com pi-heif/rawpy/ExifTool, RNF26 com as licenças confirmadas, RF007 nota 13, RF019 nota 9, RF026, Fase 12 concluída) com .docx regenerado; README; ESTRUTURA + figura 03 + PDF.
- **Parei em:** o Thiago testa a etapa 4. Pendentes dele: R1 (tela antiga de conferência), commit, validar texto do aviso e marca com marketing/jurídico, medir o RAW da câmera do Moacir antes de habilitar, resposta oficial sobre crianças.

## 2026-10-19 — Tudo sobre crianças e idade retirado; dúvidas levadas ao orientador
- **Decisão do Thiago:** retirar TODA a parte de crianças e de idade até a resposta oficial do orientador e da coordenação.
- **Cópia antes de apagar:** `backups/criancas-2026-10-19/` (33 arquivos originais, mesma estrutura de pastas). O repositório só tem o commit inicial, então era o único jeito de recuperar o código se a resposta pedir o borrão ou a autorização de volta.
- **Servidor:**
  - migração **0022** apaga `events.has_minors`, `minors_authorization_ref/_by/_at`, `images.minors_reviewed_at` e `faces_blurred` (dev e test em 0022);
  - saíram as rotas `/events/{id}/minors-authorization`, `/images/{id}/faces`, `/images/{id}/blur`, `/images/{id}/minors-check`, o bloqueio de publicação de evento com menores, `blur_regions` e o `locate()` dos motores (só servia para achar rosto a borrar);
  - aviso ao visitante sem o parágrafo de menores de 18 → **versão do aviso `2026-10-v3`**;
  - `test_events_with_minors.py` apagado (6 testes).
- **Site:** saíram `menores.tsx`, `MinorsCard`, `BlurEditor`, a caixa "menores de 18" do formulário, o botão "Borrar rostos", o link "Criança por acaso?", a advertência no envio, a nota no aviso de permissão e a seção "Crianças e adolescentes" da Política de Privacidade. Os e2e agora conferem que esses avisos **sumiram**.
- **Documentos:**
  - requisitos v2.0: RF032/RF033 e RS031/RS032 marcados "Retirado" (IDs mantidos), notas afetadas viraram "Retirada em 19/10/2026", pendência 10 reescrita, seção 11 renumerada (tinha três "12.");
  - PF 1.108 → **1.059** (a frase antiga "dez novos somam 294" estava errada: somavam 299);
  - .docx regenerado e validado; ESTRUTURA (+ figura 03 + PDF) e README atualizados.
- **Dúvidas para o orientador:** `docs/DUVIDAS-CRIANCAS-2026-10-19.md` → `docs/entregaveis/DUVIDAS-CRIANCAS-2026-10-19.pdf` e `.docx`. São 5 perguntas (eventos para crianças, criança por acaso, adolescentes de 12 a 17, visitante menor na busca, jurídico), cada uma com opções e sugestão técnica, e folha de resposta para assinar. O Thiago precisa trazer uma **resposta oficial**.
- Prova:
  - pytest: 181 passam (187 − 6 de menores);
  - tsc e lint limpos;
  - e2e images, visitor e panel: todos OK, com fotos sintéticas (amostra `t1` do InsightFace);
  - dados e2e limpos (só o admin no banco).
- **Achado, sem mexer:** `test_a_photo_held_to_the_camera_fails_the_liveness_check` falha ~1 vez em 24. O "replay" usa a ordem invertida do sorteio anterior, e às vezes o sorteio novo cai nela. O defeito é do teste, não da prova de vida.
- **Parei em:** aguardando a resposta oficial. Até lá, nenhuma foto de evento com crianças entra no sistema.

## 2026-10-17 (8) — Correções da auditoria aprovadas pelo Thiago
- **A1:** trocar o arquivo de uma foto aprovada do contratado a devolve para "Aguardando aprovação" e apaga quem aprovou (`replace_file`); fica registrado no audit (`approval_reset`).
- **M3:** middleware `refuse_foreign_writes` em `main.py` recusa POST/PUT/PATCH/DELETE com `Origin` fora de `cors_origins` (CSRF entre `*.cesmac.edu.br`). Pedidos sem Origin (app, scripts, testes) seguem.
- **M4:** `_refuse_while_deleting` no servidor: editar evento, colaboração e autorização de menores são recusados durante a exclusão agendada.
- **M7:** teste de idade removido por inteiro (face/age.py, minors/, api/minors.py, AgeTest.tsx, api/minors.ts, aba "Menores (idade)", fila do trabalhador). A migração 0021 apaga as 3 tabelas; dev e test em 0021.
- **A3:** `requirements.txt` só com produção (44 pacotes); `requirements-dev.txt` com testes e a régua InsightFace (o OpenCV duplicado vem dela). As duas listas batem com o venv, e um venv limpo só com a de produção sobe a API com o YuNet+SFace.
- **Sino:** `GET /notifications` (`events/notifications.py`) calcula os avisos a cada chamada, sem tabela; somem quando resolvidos.
  - Tipos: remoção, exclusão agendada, aprovação (admin), falhas, expiração em 30 dias, prontas para publicar, processamento; contratado: validade e imagens pendentes.
  - Contador só dos urgentes. `NotificationBell.tsx` no cabeçalho; o cartão "Avisos e pendências" da Visão geral usa a mesma fonte.
- **D1:** `EventProgress.tsx`: "Andamento do evento" em 4 etapas no lugar da pilha de avisos (retenção e download entraram na etapa "No site").
- **D2:** admin com indicadores do sistema (eventos ativos, aguardando aprovação, remoções, falhas) e "Eventos recentes".
- **D4:** `StatusPill` mostra "Exclusão agendada".
- **D5:** o envio termina em Imagens (`filtro=in_review`); "Descartar/Desfazer descarte" e "Substituir arquivo" foram para o detalhe da imagem. A tela antiga `conferencia.tsx` ficou sem link (R1, ainda não aprovado).
- **Vocabulário:** "imagem" no painel (tabela, contadores).
- **Temas:** confirmado que um evento aceita vários temas e o filtro público acha por qualquer um (testado).
- **Docs:**
  - requisitos: RF031 nota 3, RF038 nota 8, **RNF31** (avisos), **RS039** (risco residual da prova de vida, M2), **RS040** (CSRF), matriz de risco, fase 8 concluída; .docx regenerado e validado;
  - README e ESTRUTURA-DO-SISTEMA reescritos para a v2.0 (captura guiada, perfis, 13 fases, nova seção 6.7 sobre a prova de vida, limites, perguntas da banca); figuras 02, 03, 05, 09 e 10 regeneradas; PDF da ESTRUTURA gerado.
  - O e2e de configuração esperava o limiar do InsightFace (0,30); passou a aceitar qualquer valor anterior.
- Prova:
  - pytest: 187 passam;
  - tsc e lint limpos;
  - e2e auth, admin, config, panel, images e visitor: todos OK;
  - roteiro visual etapa 6 (andamento, envio → Imagens, descartar, A1 pela tela, sino, D2, dois temas, D4): "TUDO OK";
  - dados e2e limpos (só o admin no banco).
- **Parei em:** o Thiago testa. Pendentes de decisão: R1 (apagar a tela antiga de conferência), A2 (e-mail real, fim do projeto), commit (ele faz).

## 2026-10-17 (7) — Varredura completa e banco zerado
- **Banco zerado** a pedido do Thiago (`dev_keep_only_event.py --all` + `dev_keep_only_account.py`): ficou só a conta de administrador dele. Restam 0 eventos, 0 imagens, 0 vetores e o armazenamento vazio. Os 18 registros de ciência de visitante ficaram sem evento, de propósito, como prova do aceite.
- **Teto de 200:** o Thiago perguntou se o YuNet+SFace "só reconhece 200 fotos". Não: o 200 é o teto de resultados por busca do visitante. Ele apontou que a pessoa institucional (RF021) não pode usar esse teto. Memória gravada; entra na fase 9.
- **Varredura completa**, sem alterar código: relatório em `docs/AUDITORIA-2026-10-17.md` → `docs/entregaveis/AUDITORIA-2026-10-17.pdf`. Principais achados:
  - **A1:** o contratado pode trocar o arquivo depois da aprovação;
  - **A2:** não há e-mail real, e o link de demonstração depende do modo "outbox";
  - **A3:** `requirements.txt` não reproduz o venv (17 pacotes, OpenCV duplicado);
  - **A4:** nenhum commit desde o inicial;
  - M1–M7, B1–B10, R1–R5 e sugestões de design D1–D5.
- **Parei em:** aguardando o Thiago escolher quais itens do relatório fazer. Ordem sugerida: A4 → A1 → A3 → M4/M3 → R1/R2/D → M7 → M6.

## 2026-10-17 (6) — Segunda rodada de ajustes do Thiago
- A busca com o rosto do Thiago **funcionou** depois da correção da prova de vida. Ele ainda vai testar com o coordenador, que aparece em muito mais fotos.
- **Limite:** o Thiago pediu "500 por evento", mas o evento já aceitava 1.000; o que o travou foi o limite de 300 por envio. Decisão dele: 1.000 por evento e **500 por envio** (`MAX_PER_BATCH`). "Imagem" vale para foto e vídeo, sem renomear para "arquivo".
- **Página do evento:**
  - a visão geral ficou só com Editar e Excluir;
  - "Enviar imagens" foi para a aba Imagens;
  - as abas Visão geral · Imagens · Colaboração (`EventTabs.tsx`) aparecem nas duas telas, com a aba guardada na URL (`?aba=`);
  - os avisos de "Próxima ação" levam para Imagens.
- **Publicar em Imagens:**
  - barra "N imagens prontas para publicação", com "Selecionar para publicar" e "Publicar todas";
  - backend: `publish(..., ids)` e filtro `ready` (em conferência e não aguardando aprovação).
  - Resolve as fotos aprovadas do contratado que ficavam paradas em conferência sem botão.
- **Excluir/desfazer (decisão do Thiago, mudou o RF038):**
  - excluir despublica na hora (imagens voltam para a conferência, evento "Em edição");
  - desfazer deixa o evento despublicado, com o aviso "Exclusão desfeita — o evento não está publicado" e o botão "Conferir e publicar";
  - a reindexação só acontece ao republicar.
  - Diagnóstico do relato dele: o evento não tinha travado. A reindexação levou ~2 min e ele voltou sozinho, mas a tela não avisava nada.
- Requisitos: RF007 (500 por lote; 1.000 mídias somando foto e vídeo), RF009 (publicação por seleção na tela das mídias), RF038 (desfazer = despublicado), 1.4 e histórico 2.0. .docx regenerado e validado.
- Prova:
  - pytest: 186 passam;
  - tsc e lint limpos;
  - e2e de painel e imagens: "TUDO CERTO";
  - roteiro visual (abas, envio em Imagens, publicar selecionadas, excluir → desfazer → republicar): "TUDO OK";
  - dados e2e limpos.
- **Parei em:** o Thiago testa de novo (o "evento teste" tem 178 fotos aprovadas do contratado prontas para publicar pela aba Imagens). Próximo: etapa 4 (formatos + marca d'água só no download público).

## 2026-10-17 (5) — Ajustes do teste do Thiago nas etapas 1–3
- **Prova de vida reprovava o rosto real 2×.** O log de diagnóstico mostrou que esquerda/direita dão sinal forte (0,25–0,46), mas cima/baixo ficam no nível do ruído (0,03–0,10), e um giro emendava no outro.
  - Correção: só esquerda e direita decidem (`poses.REQUIRED`); cima e baixo continuam pedidos e viram pose de busca, sem reprovar.
  - O navegador pede "Volte para o centro" (1 s) entre os movimentos.
- **Aprovação das fotos do contratado:**
  - indicador na Visão geral ("N fotos aguardam aprovação") e pílula "N a aprovar" na lista de eventos;
  - aprovação em lote (selecionar as pendentes → aprovar/rejeitar, com confirmação na rejeição);
  - na foto, Anterior/Próxima, teclas ← → e salto automático para a próxima pendente depois de decidir;
  - migração 0019: `approved_by`/`approved_at` na própria foto ("Enviada por" + "Revisada e aprovada por"). Lote não é exigência de segurança; o registro é o que garante a responsabilização.
- **E-mail:** institucional (cesmac.edu.br ou subdomínio) obrigatório, exceto para o contratado; vale na tela, no servidor e no script.
- **Excluir evento (RF038 novo):** migração 0020 + `events/deletion.py`.
  - O evento sai do site e os vetores são apagados na hora (dado sensível); as fotos esperam 7 dias (parâmetro `event_deletion_days`), quando dá para desfazer (reindexa).
  - Depois disso o trabalhador elimina tudo; os aceites ficam sem o evento.
- **Banco zerado** a pedido do Thiago (`dev_keep_only_event.py --all`): sem eventos, fotos, vetores nem testes de reconhecimento.
- **Marca d'água (decisão nova):** só no download público (visitante). Contas da equipe, inclusive marketing e contratado, baixam sem marca. Memória gravada.
- **Requisitos v2.0:**
  - marca d'água; RF001 nota 2 (e-mail); RF031 (lote + registro + indicadores); RF036 nota 4 (giros laterais); RF006 nota 9; RF026 (2 parâmetros); RF038 novo;
  - rastreabilidade; PF 1.108; fases 5/7/8 atualizadas;
  - .docx regenerado e validado.
- Prova:
  - pytest: 185 passam;
  - e2e visitante: "TUDO OK";
  - roteiro visual da aprovação e da exclusão no navegador: "TUDO OK";
  - dados e2e limpos.
- **Parei em:** o Thiago precisa retestar a busca com o rosto real (recriar o evento Colação de Grau) e os fluxos de aprovação e exclusão. Próximo: etapa 4 (formatos + marca d'água só no download público + metadados).

## 2026-10-17 (4) — Etapa 3: perfil Marketing e conta temporária (RF030, RF031)
- Decisões do Thiago: CPF e nascimento criptografados com **pgcrypto** (chave `FOTOMAC_IDENTITY_KEY` só no `.env`) e guarda provisória de **36 meses** (parâmetro "Guarda do CPF e do nascimento", a definir pelo jurídico). Por bom senso, o download para divulgação do marketing fica para a etapa 4, junto com a marca d'água.
- Migração 0018:
  - perfis `marketing` e `contractor`, situação `expired`;
  - campos do contratado (evento, contrato, CPF e nascimento criptografados, `valid_until`, `media_gone_at`, `identity_erased_at`) e `images.approval`;
  - regras no banco: assinatura obrigatória para quem envia fotos; contratado ativo sempre com identificação; campos de contratado só em contratado.
- **Marketing:**
  - faz o mesmo que o fotógrafo;
  - aparece como "Criado por X — Equipe de marketing";
  - vê os eventos PUBLICADOS de outras pessoas como "viewer", só com as fotos publicadas e sem pedido de remoção (nunca as em conferência), sem enviar nem publicar.
- **Contratado:**
  - o administrador cria a conta com evento e nº do contrato;
  - no primeiro acesso ele informa CPF (dígitos conferidos) e nascimento, e as 24 h começam;
  - vê só o evento vinculado e só as próprias fotos, que entram "aguardando aprovação";
  - a publicação pula as fotos pendentes; o administrador aprova (entram na próxima publicação) ou rejeita (foto apagada, nunca gera vetor);
  - ao vencer, a conta vira "Expirada" na hora (inclusive no meio da sessão) e nunca é reativada nem apagada;
  - não há recuperação de senha para ela;
  - o trabalhador expira as contas e apaga CPF e nascimento quando as fotos saem do acervo e passa o prazo; o nome fica nos registros.
- Política de privacidade: declara a finalidade de divulgação institucional (base legal em validação pelo jurídico).
- Tela:
  - formulário de contas com os perfis novos;
  - cartão "Conta temporária" com CPF mascarado;
  - primeiro acesso com identificação;
  - avisos de validade e de aprovação;
  - etiquetas "Só visualização"/"Contratado"/"Aguardando aprovação";
  - aprovar/rejeitar na foto;
  - menu e rótulos por perfil.
- Prova:
  - pytest: 179 passam, entre eles 7 novos (`test_profiles_v2.py`) e 3 regras de banco;
  - e2e de admin, imagens, painel e visitante: "TUDO OK";
  - roteiro visual da etapa 3 no navegador: "TUDO OK";
  - dados e2e limpos.
- Os e2e de imagens e painel dependem de fotos fora do repositório (foto de grupo com 6 rostos, capa `capa-teste.jpg`).
- **Parei em:** etapas 1–3 entregues, aguardando o teste do Thiago. OBR ainda no banco (remoção barrada pelo bloqueio de permissões).

## 2026-10-17 (3) — Etapas 1 e 2 da produção v2.0
- **Etapa 1 (RF029):** a aba virou "Teste de precisão" e a bancada só aceita fotos publicadas (`calibration/service._photos` e o resumo da API). O teste antigo "funciona com fotos não publicadas" virou "recusa fotos não publicadas". Textos do catálogo de motores, README e ESTRUTURA atualizados.
- **Etapa 2 (RF016, RF017, RF036):** a busca do visitante passou a ser só pela câmera, com captura guiada e prova de vida.
  - O SERVIDOR sorteia a ordem dos 4 movimentos (`POST /public/events/{id}/capture`), guardada na sessão (migração 0017), válida por 2 min e usada uma vez. Se o navegador sorteasse, um vídeo pré-gravado poderia escolher a ordem que lhe convém.
  - `POST /search` recebe só quadros (até 40, ≤ 2 MB cada, JPEG) com o passo de cada um. O servidor detecta cada quadro uma vez e confere:
    - a prova de vida (`poses.select_guided`);
    - que é a mesma pessoa em todas as poses (similaridade ≥ 0,30 com a pose de frente; impede girar a própria cabeça mostrando a foto de outra pessoa de frente);
    - e busca com cada pose: a foto volta se QUALQUER pose passar do limiar.
  - O vídeo nunca sai do aparelho.
  - Aviso de permissão na versão 2026-10-v2, com o texto do RF015 nota 3.
  - A rota da foto avulsa (galeria) não existe mais. Saíram `Camera(.web).tsx` e `photo(.web).ts`. O SearchCard ficou só com "Buscar minhas fotos".
  - `GuidedCapture` ganhou `getOrder`, `variant` e `aside` (dicas ao lado).
  - Diagnóstico de desenvolvimento: `FOTOMAC_DIAGNOSTICS_LOG=true` no `.env` local grava no log da API só os NÚMEROS de cada passo (movimento, limite, mesma pessoa), sem imagem nem vetor. Desligado por padrão.
- Testes:
  - `PosedEngine` (tests/support.py) = SFace real + pontos do rosto deslocados conforme uma faixa no quadro, para simular a cabeça virando;
  - testes novos: ordem usada uma vez, foto parada, ordem trocada, outra pessoa, foto avulsa, log só com números;
  - pytest: 163 passam;
  - `e2e/visitor.e2e.mjs` reescrito (ele ainda usava a página de remoção por arquivo, removida em 16/10) e passa ("TUDO OK"); dados e2e limpos.
- OBR: o Thiago mandou apagar. O bloqueio de permissões barrou a remoção (é irreversível) e o teste de idade "Teste Crianças" ainda está aberto; ficou para ele autorizar.
- **Parei em:** etapa 3 (perfil Marketing e conta temporária).

## 2026-10-17 (2) — Eventos com crianças suspensos no documento
- Apontei que exigir o termo como condição de participação pode ferir o Art. 14, § 4º. O Thiago decidiu: eventos destinados a crianças saem da v2.0 e ficam como pendência (RF032 "Suspenso", fora de escopo item 25, pendência 10 com as alternativas A/B/C). O código não muda até ele falar com o orientador e o coordenador. O borrão de criança que aparece por acaso (RF033) continua.
- `.docx` gerado de novo e validado.
- Atenção: no banco de desenvolvimento, "OBR - 2026" continua publicado (has_minors, 113 fotos, 853 vetores, incluindo crianças). Recomendei despublicar; aguardo a decisão do Thiago.
- **Parei em:** plano de produção apresentado; aguardando o OK do Thiago para começar pela etapa 1.

## 2026-10-17 — Requisitos v2.0 no modelo da v1.6
- Correção do Thiago (memória `nao-usar-formatacao-propria-nos-requisitos`): todo documento de requisitos do FOTOMAC segue o modelo da v1.6. Ele exporta o PDF pelo Google Docs (o PDF da v1.6 veio de lá).
- Novo gerador `docs/gerar_requisitos_docx.py` (só a biblioteca padrão): copia o pacote da v1.6 (estilos, fontes) e reconstrói o corpo a partir de `docs/REQUISITOS-FOTOMAC-v2.0.md`, no mesmo XML do modelo:
  - uma tabela única de RF com notas em sobrescrito;
  - RNF e RS em tabela;
  - matriz de rastreabilidade em grade, em página deitada;
  - sumário já preenchido (na v1.6 ele saía vazio no Google Docs).
- Saída: `docs/entregaveis/Requisitos FOTOMAC - v2.0.docx`, que passou no validador da skill de Word. Apaguei o PDF/DOCX de ontem, que estavam no formato errado.
- Respostas do Thiago incorporadas:
  - nome FOTOMAC definitivo, sem "denominação provisória";
  - marca d'água "CESMAC" e aviso de propriedade nos metadados dos downloads do visitante e do marketing; o pacote de guarda fica sem marca;
  - RNF18 com revocação mínima de 80%;
  - conta temporária: 24 h a partir da senha; nome, CPF, data de nascimento e nº do contrato; conta nunca apagada, só desativada; CPF e nascimento guardados por prazo definido pelo jurídico;
  - tudo também no aplicativo para fotógrafo, marketing e contratado;
  - novos formatos de foto (PNG, HEIC, WebP, RAW experimental);
  - bancada renomeada para "teste de precisão" e restrita a fotos publicadas;
  - novo RS038.
  - Pontos de função: 1.090.
- **Parei em:**
  - o Thiago abre o .docx no Google Docs, confere e exporta o PDF;
  - pendente no CÓDIGO: renomear a aba "Teste de qualidade" e restringir a bancada a eventos publicados;
  - lembrar o Thiago de refazer os testes do modelo e rever a meta do RNF18.

## 2026-10-16 (11) — Requisitos v2.0 (primeira versão completa)
- `docs/REQUISITOS-FOTOMAC-v2.0.md` → `docs/entregaveis/REQUISITOS-FOTOMAC-v2.0.pdf` (71 p.) + `.docx`.
- Revisão integral da v1.6, com a mesma estrutura. Os IDs da v1.6 foram mantidos (só o conteúdo mudou) para não quebrar referências. Os requisitos novos vão de RF029 a RF037: teste de qualidade, marketing, conta temporária, evento com menores, borrão, vídeo, reconhecimento em vídeo, captura guiada e painel do armazenamento. Também há RNF26–30 e RS028–037. Pontos de função: 791 → 1.079.
- Formato: RNF e RS viraram blocos, e as tabelas longas viraram listas, porque o gerador (pandoc → typst) não quebra tabela entre páginas.
- Revisão LGPD acrescentou duas coisas:
  - pendência nº 1, herdada da v1.6: a base legal para gerar o vetor das pessoas fotografadas;
  - criptografia em repouso no RS008.
- **Parei em:** o Thiago precisa responder às incongruências levantadas (Art. 14 §4 na regra dos menores, escopo do download do marketing, meta de 85% × 81% do SFace, "limiar mais baixo", exceção do RNF13 na bancada, validade da conta temporária). Depois ajusto e gero de novo.

## 2026-10-16 (10) — Evento PARA crianças × criança que aparece por acaso
- Correção do Thiago (vira memória `nao-tratar-borrao-como-excecao-de-autorizacao`): em evento com crianças, a ESCOLA coleta o termo assinado, e participar exige o termo. Então não existe "criança sem autorização" ali e não se borra nada. O desfoque é para evento que NÃO é para crianças, onde uma aparece por acaso.
- Card do evento infantil: só a autorização (obrigatória), coletada pela escola como condição de participação. Saiu a oferta de desfoque. A declaração do modal fala de escola/organização.
- Evento comum, com fotos: aviso "Apareceu uma criança por acaso em alguma foto?" → "Borrar rostos" → página renomeada "Borrar rostos de crianças que aparecem por acaso".
- Formulário: a marcação de menores explica que é para eventos PARA crianças, e que criança por acaso em outro evento não se marca ali.
- Verificado: pytest ok; navegador nos dois casos (evento infantil sem desfoque; evento comum com o aviso que leva à ferramenta). Dados de teste removidos.
- **Parei em:** requisitos 2.0. O Thiago confirma a regra com o orientador e o coordenador.

## 2026-10-16 (9) — Autorização prévia OBRIGATÓRIA para evento com menores
- Decisão do Thiago (a confirmar com orientador e coordenador): evento com crianças TEM que ter autorização prévia dos responsáveis. O desfoque "não faz sozinho", então fica como ferramenta manual de um humano, para casos pontuais (criança sem autorização). Não é alternativa à autorização.
- Servidor: evento com `has_minors` só publica com a autorização registrada. Conferir ou borrar as fotos não libera mais a publicação.
- Textos ajustados: formulário do evento; card "Participantes menores de idade" ("Obrigatório: autorização prévia" / "Opcional: borrar rostos manualmente… Não substitui a autorização"); página de conferência.
- Testes reescritos para a regra: borrar ou conferir todas as fotos NÃO publica; com a autorização, publica. pytest todo ok, tipos e lint ok, card conferido no navegador.
- **Parei em:** seguir para os requisitos 2.0 (com calma, "fechadinhos"), levando as decisões do dia: YuNet+SFace com a bancada, InsightFace como régua, busca por vídeo guiado com prova de pessoa viva, menores com autorização obrigatória + desfoque manual, temas do fotógrafo.

## 2026-10-16 (8) — Eventos com menores: caminho A (autorização) e caminho B (desfoque no arquivo)
- Decisão do Thiago: fazer os dois. Se o desfoque não funcionar bem na prática, a tarefa fica com o fotógrafo, reforçando que imagem de menor é dado altamente sensível.
- Migração 0016:
  - `events.has_minors` + `minors_authorization_ref/by/at`;
  - `images.minors_reviewed_at` + `faces_blurred`.
- **Cadastro:** marcação "Este evento tem participantes menores de 18 anos" no formulário (com texto LGPD Art. 14).
- **Publicação:** evento com menores só publica com (A) autorização registrada ou (B) todas as fotos conferidas. A regra fica no servidor.
- **A:** "Registrar autorização": declaração (Art. 14 §1, cada menor, pelo menos um responsável) + ONDE os termos estão arquivados. O FOTOMAC não guarda os termos. Revogável, auditado.
- **B:** página `/eventos/[id]/menores`, foto a foto, com o `BlurEditor`. A porta ganhou `locate()`, que só detecta (YuNet/SCRFD) e NÃO calcula vetor (RNF13).
  - clicar seleciona um rosto; arrastar desenha um rosto não detectado;
  - "Borrar e substituir o original" (grade de 6 blocos + desfoque, `imaging.blur_regions`) ou "Sem menores nesta foto";
  - o arquivo original é sobrescrito e as cópias de tela são refeitas;
  - foto já publicada: vetores apagados + reindexação.
  - **Teste prova que o rosto borrado não gera vetor (3 rostos → 2 vetores).**
- Também na tela da foto: botão "Borrar rostos".
- Visitante: num evento com menores, o aviso de ciência diz "para buscar as fotos de um menor, você declara ser o responsável legal".
- Bugs pegos pelos testes:
  - `Event.owner` ficou ambíguo com a 2ª FK para contas (corrigido com `foreign_keys`);
  - a rota `/images/{id}/faces` era engolida por `/images/{id}/{variant}` (ordem de registro corrigida).
- Verificado: pytest todo ok; navegador como fotógrafo (marcação, card, bloqueio, 3 rostos detectados, clique + caixa desenhada, desfoque no arquivo, publicação liberada, autorização registrada). Dados de teste removidos.
- **Para limpar a OBR (já publicada):** editar o evento → marcar "tem menores" → Conferir fotos → borrar as crianças. Cada foto é reindexada sem elas.
- **Parei em:** o Thiago testa o desfoque na OBR. Se não funcionar bem → delegar ao fotógrafo (triagem fora do sistema, como na v1.6).

## 2026-10-16 (7) — Idade descartada; rolagem corrigida; bancada aceita fotos não publicadas
- **Veredito do Thiago, depois do teste real na OBR:** a estimativa de idade do InsightFace é péssima (criança saía com ~54 anos). Conferi se era erro meu: na foto oficial do InsightFace (t1) dá idades plausíveis de adulto (25–41), e mudar a resolução não melhora a NASA. O modelo é o limite. **Não serve para proteger criança** e não sustenta a compra da licença (o argumento continua sendo a qualidade do reconhecimento: 97,6 contra 89,5).
- Bug corrigido na revisão de menores: a lista de rostos não rolava em foto com muitas crianças. Agora rola, os botões ficam fixos, e há "Todos são menores" / "Limpar marcações". Verificado com uma foto artificial de 48 rostos.
- **OBR - 2026 foi PUBLICADA:** 113 fotos e 856 vetores, incluindo crianças, sem autorização dos responsáveis. Só local, 0 buscas. **Decisão do Thiago: manter publicado por enquanto.** Ressalva registrada: contraria o RF009 e a LGPD Art. 14; despublicar quando ele pedir.
- **Decisão do Thiago:** o Teste de qualidade passa a aceitar fotos NÃO publicadas (em conferência). A rodada já calculava vetores em memória, então testar não exige mais publicar. Teste novo garante que nada é indexado.
- **Caminho para menores (2.0, proposta do Thiago + meu desenho):** evento marcado "com menores" no cadastro → não indexa por padrão. (A) a organização coleta a autorização assinada dos responsáveis (imagem + busca facial, Art. 14 §1) e só então publica; (B) sem autorização → desfoque manual na conferência (o YuNet acha os rostos, o fotógrafo clica nos de criança, o arquivo é trocado antes de publicar — RF009 nota 7). Jurídico decide.
- pytest ok.
- **Parei em:** o Thiago testa o próprio rosto na OBR pela bancada; depois os requisitos 2.0.

## 2026-10-16 (6) — Tema criado no formulário do evento + teste de menores (idade, InsightFace)
- **Temas no evento:** botão "+ Novo tema" (nome + símbolo) no formulário de evento, para fotógrafo e admin. O tema já entra selecionado. Rota `POST /themes` (qualquer conta logada); o tema guarda `created_by` (migração 0014), base do "cada tag é do dono" da 2.0. Duplicata recusada, ícone validado, auditado. Verificado no navegador como fotógrafo.
- **Teste de menores** (aba "Menores (idade)"): o Thiago quer usar a estimativa de idade do InsightFace como argumento para comprar a licença (borrar crianças automaticamente).
  - Porta nova `app/face/age.py` (catálogo de estimadores) + `InsightFaceAgeEstimator` (detection + genderage). **O palpite de gênero é descartado na fonte.**
  - Roda nas fotos em conferência ou publicadas do evento, na fila em segundo plano. Recomendação na tela: usar evento NÃO publicado, para não gerar vetor de criança.
  - O admin marca os rostos de menores (ou "ignorar") e confirma "Foto conferida"; rosto não marcado em foto conferida conta como adulto.
  - Resultado por corte de idade: menores protegidos, **menores que ESCAPARIAM**, adultos borrados à toa, corte seguro (nenhum menor escapa) e o custo dele, AUC, histograma.
  - Prévia de como ficaria borrado (grade de 6 blocos + desfoque, em memória).
  - Encerrar apaga idades e marcações e fica só o agregado. Migração 0015.
- **Sinal inicial:** na foto da NASA o modelo SUPERESTIMOU as idades (38–39 → 46/50/69; 42 → 58). Superestimar é o erro perigoso para criança. O teste real com a OBR decide.
- **Alternativas sem licença paga:** não achei modelo de idade livre e bom. faceage-onnx tem pesos Apache, mas a base é DINOv3 (licença da Meta, a ler) e é grande. Os outros são não comerciais. O catálogo já aceita um segundo estimador.
- **Regra:** a v1.6 tirou a estimativa de idade (RF007 nota 12). Mesmo com licença, ela só AJUDA a triagem humana. A decisão é dos requisitos 2.0 e do jurídico.
- Verificado: pytest ok; navegador (criar, estimar, marcar, conferir, números, desfoque, encerrar); desfoque conferido visualmente. Dados de teste removidos.
- **Parei em:** o Thiago cria o evento da OBR (sem publicar), roda o teste de menores e o teste de qualidade com o próprio rosto.

## 2026-10-16 (5) — Gravação guiada com bonequinho + prova de pessoa viva (na bancada)
- Pedido do Thiago: a tela de pedir o vídeo, para ele testar sozinho e gravar o Mozart.
- `frontend/src/components/capture/GuidedCapture.web.tsx` é reaproveitável na busca do visitante (2.0). Tem:
  - câmera num círculo espelhado, com anel de progresso;
  - bonequinho animado (SVG) virando para o lado pedido, com seta e instrução grande;
  - contagem 3-2-1;
  - ordem dos 4 movimentos sorteada a cada gravação;
  - 6 quadros por etapa, cada um marcado com o movimento pedido. NENHUM vídeo é gravado.
- Servidor: `poses.select_guided` escolhe um quadro por movimento e faz a **prova de pessoa viva**: em cada etapa, a cabeça foi para o lado pedido acima do limite? Também diagnostica o "sentido invertido". Fica em `query_liveness` (migração 0013) e aparece num card no teste.
- Convenção de sentido (geometria): quadro real, não espelhado; esquerda da pessoa → nariz vai para a direita da imagem (yaw +); cima → pitch −. **Confirmar com o vídeo real do Thiago.** Se vier "sentido invertido", é só trocar o sinal.
- Verificado no Chromium com uma câmera falsa mostrando a selfie PARADA (como uma foto na frente da webcam): 30 quadros, ordem sorteada, "Prova de pessoa viva: não passou" (0,00 em todos os movimentos).
- **Bug real encontrado e corrigido:** descartar o teste enquanto a fila iniciava a rodada causava deadlock. O arquivo foi apagado, mas o banco cancelou o descarte e sobrou um teste sem foto. Agora fechar/descartar trava as rodadas primeiro, na mesma ordem da fila. Prova: 8 descartes no meio de rodadas reais, todos 204, sem órfãos. Há teste de regressão.
- **Crianças (pergunta do Thiago, evento da OBR):**
  - os modelos não distinguem criança de adulto;
  - a v1.6 SUPRIMIU de propósito a estimativa de idade (RF007 nota 12, RF009);
  - menores = triagem humana do fotógrafo + supressão do rosto NO ARQUIVO antes do envio (RF009 nota 7);
  - LGPD Art. 14 §1 exige consentimento de um dos pais.
  - Recomendado NÃO publicar fotos da OBR com rostos de crianças sem supressão. Decisão pendente para os requisitos 2.0.
- pytest ok (incluindo os novos testes de prova de vida e de concorrência).
- **Parei em:** o Thiago grava o próprio vídeo guiado, depois o do Mozart.

## 2026-10-16 (4) — Bancada: consulta por vídeo curto / várias fotos (poses)
- Ideia do Thiago (o Mozart adorou): em vez de uma selfie, um vídeo curto virando o rosto. **Passo 1 = medir antes de construir**, na bancada.
- O navegador extrai 40 quadros do vídeo (`frontend/src/components/panel/videoFrames.ts`); o **vídeo nunca vai ao servidor**. O servidor escolhe até 5 quadros, um por pose (frente, lado 1, lado 2, cima, baixo), em `app/calibration/poses.py`. A pose vem dos 5 pontos do rosto, que agora são expostos pela porta (`DetectedFace.landmarks`) e preenchidos pelos dois adaptadores. Os quadros não escolhidos são descartados na hora.
- Cada rodada calcula três formas de busca no mesmo gabarito: 1 quadro de frente (como uma selfie), a pose mais parecida (máximo) e o rosto médio das poses. A tela mostra uma linha para cada forma e as poses guardadas, para conferir. Migração 0012 (`query_poses`; `view` em `recognition_run_scores`).
- **Bug pego e corrigido:** num vídeo parado, a virada lida oscila entre 0,055 e 0,131 (ruído + o "frente" de cada um não é 0), e o limite absoluto de 0,12 inventava um "lado 2". Agora a pose é medida em relação ao quadro de frente da pessoa, com limites acima do ruído (virada 0,20; inclinação 0,08). Teste com esses números → só "frente".
- Verificação:
  - pytest 143 ok;
  - Playwright: vídeo WebM gerado no navegador → 40 quadros → poses escolhidas → rodada → descarte, sem vídeo enviado;
  - as três formas de busca foram provadas no pytest com poses controladas. **Falta o teste real com o rosto virando (o Thiago grava).**
- **Decisão do Thiago para a 2.0 (visitante):** busca por vídeo guiado, que também serve como prova de pessoa viva (uma foto parada não passa), com um bonequinho animado estilo Apple mostrando para onde virar e o aviso de ciência + termos LGPD antes. Ressalva já dita: para barrar também um vídeo gravado de outra pessoa, a ordem dos movimentos precisa ser sorteada a cada busca.
- **Parei em:** o Thiago testa com o próprio rosto (vídeo), depois com o do Mozart. O "teste 1" antigo continua aberto com uma foto guardada (decisão dele).

## 2026-10-16 (3) — Teste de qualidade no painel (Teste 1 do lab dentro do sistema) + InsightFace de volta como régua
- Pedido do Thiago: a mesma bancada do fotomac-lab no acervo atual, com nota de 0 a 100, para buscar mais de 89,5 e ajustar o limiar. No meio do pedido: trazer o InsightFace de volta para comparar e aproximar o YuNet dele.
- **Correções ditas a ele antes de implementar:**
  - o limiar NÃO muda a nota (a nota é 100 × o *melhor* F1; o limiar só escolhe o ponto de operação);
  - nota de outro acervo ou de outra pessoa não se compara direto com 89,5: o certo é comparar os modelos dentro do mesmo teste.
- **InsightFace volta só como régua** (`reference_only`). O builder e o switch recusam ativá-lo, por causa da licença e da decisão do CESMAC. Foi reinstalado (insightface 1.0.1 + onnxruntime); ele exige o opencv-python, que volta a ficar duplicado com o headless (mesma versão, funciona). Os pesos ficam em ~/.insightface (são do lab).
- **Variantes no builder:** `sface-2560` e `sface-3840` (o mesmo modelo detectando numa foto maior; cada uma tem a sua model_version). Medido no acervo: SFace 0,14 s/foto, InsightFace 0,20 s/foto; a variante 3840 levou 60 s para as 184 fotos.
- **Bancada** (`app/calibration/`, migração 0011, rotas `/admin/quality-tests`, aba "Teste de qualidade"):
  - um teste = um evento + uma foto de consulta COM CONSENTIMENTO (Art. 11, I: checkbox obrigatório, conferido no servidor);
  - marcação "está / não está" feita uma vez e compartilhada por todos os modelos;
  - "rosto errado" marcado por rodada;
  - rodadas na fila em segundo plano, de 3 em 3 fotos, só quando não há publicação nem reindexação esperando; os vetores são calculados em memória, sem tocar nos de produção;
  - métricas iguais às do lab: nota, nota produto, melhor limiar, mAP, AUC, intrusos e perdidas na detecção;
  - explorador de limiar com histograma e o botão "usar no sistema" (com advertência);
  - revisão em tela cheia com S/N/E e setas.
- **Métricas validadas contra os CSVs do Teste 1:** as 5 tecnologias batem exatamente (SFace 89,5/87,0, InsightFace 97,6/96,0, mAP, AUC e intrusos iguais).
- **Achado:** no gabarito final do Teste 1, o melhor limiar do SFace é **0,3764**. O 0,3741 em uso veio da marcação de 23/09. Decidir depois do teste no acervo atual.
- **LGPD:**
  - encerrar o teste guarda só os agregados e apaga a foto, as marcações e as notas por foto;
  - teste esquecido é encerrado sozinho em 30 dias;
  - apagar uma foto ou um evento leva junto as linhas do teste;
  - tudo fica auditado.
- **Verificação:**
  - pytest 140 ok (9 novos);
  - Playwright: criar, rodar SFace + InsightFace + 3840, marcar, nota, revisão por teclado, bloqueio sem consentimento e descarte;
  - consertado um "botão dentro de botão" na tabela de rodadas;
  - depois do descarte, zero linhas no banco e zero arquivos em calibration/; conta e2e removida.
- **Parei em:** o Thiago roda o teste de verdade (foto de uma pessoa que consentiu + conferir as 184 fotos) e compara SFace × variantes × InsightFace. Depois, a produção da 2.0.

## 2026-10-16 (2) — InsightFace removido; YuNet + SFace no lugar, com troca de modelo pelo painel
- Pedido do Thiago: tirar o InsightFace/buffalo_l de tudo, usar o YuNet + SFace com o parâmetro do teste, usar o builder para trocas e poder mexer pelo painel do admin.
- **Adaptador** `backend/app/face/sface_engine.py`:
  - configuração EXATA do Teste 1 (1920 px, confiança 0,50, NMS 0,3, top_k 5000, rosto ≥ 10 px, alignCrop, vetor normalizado);
  - confere o SHA-256 dos .onnx (iguais aos oficiais do opencv_zoo e aos do lab);
  - usa trava, porque o detector guarda estado entre threads.
  - **Paridade provada:** 302 rostos de 15 fotos do acervo deram vetores idênticos aos do lab (cosseno 1,000000), na mesma contagem.
- **Builder** `factory.py`: catálogo `ENGINES` (cada modelo com licença e o seu limiar calibrado). O modelo em uso fica no banco (`system_parameters.face_engine`), e o `.env` só vale para instalação nova. A falha segura é `FaceEngineUnavailable`: a busca devolve 503 com aviso neutro, a fila espera sem gastar tentativas, a API sobe mesmo assim, e nunca há troca automática.
- **Troca** `switch.py` + `PUT /admin/face-engine`, em quatro passos:
  1. carrega o modelo novo ANTES;
  2. grava a escolha e audita (`face_engine.changed`);
  3. volta o limiar ao calibrado do modelo novo;
  4. põe todo o acervo publicado na reindexação.
- **Painel**, card "Modelo de reconhecimento":
  - versão, licença e limiar calibrado com a origem;
  - aviso quando há fotos com vetores de outro modelo, com botão para a reindexação;
  - seletor + modal de consequências.
  - O limiar agora aparece com 4 casas (0,3741).
- **Limiar padrão = 0,3741** (Teste 1, melhor F1: 48 de 59 fotos com 1 erro, precisão de 98%).
- **Bug pego no caminho:** o banco dev guardava limiar 0,30 de 04/10 (valor do InsightFace, gravado por um e2e que "voltava ao padrão"). No SFace isso entregaria fotos de terceiros. A migração 0010 apaga esse valor e registra na auditoria. As migrações 0009 (índice HNSW de 128, sem o de 512) e 0010 foram aplicadas no dev e no test.
- **Banco dev:** reindexado pelo painel em 42 s. As 184 fotos agora têm 3.426 vetores do SFace e nenhum do InsightFace. A busca real com a selfie de teste achou 39 fotos (com o InsightFace eram 55): queda esperada de revocação.
- **Dependências:** saíram insightface, onnx, onnxruntime, scikit-image, scipy, opencv-python (duplicado) e mais 10 órfãos. requirements.txt foi regenerado (ganhou argon2-cffi e piexif, que faltavam).
- **Testes:** usam fotos da NASA em domínio público (tests/fixtures, com as fontes), nunca do CESMAC. Ao todo 131 ok. Novos testes cobrem: configuração do Teste 1, caixas na escala original, arquivo adulterado recusado, troca completa, modelo quebrado que nunca vira o modelo em uso e falha segura com 503.
- `infra/setup_local.sh` baixa os modelos e confere o SHA-256 (testado, inclusive com arquivo adulterado). Os .onnx ficam fora do git.
- README, ESTRUTURA-DO-SISTEMA (+ PDF) e figuras foram atualizados. O Teste 1 continua citado como história, com a decisão de licença do CESMAC.
- **Fora (de propósito):** apresentações, PLANEJAMENTO e HISTORICO antigos (são registro do que era verdade na época). `~/.insightface/models` pertence ao fotomac-lab e não foi tocado.
- **Parei em:** Thiago testa. Próximos: calibragem com mais pessoas (a margem do SFace é menor: 203 intrusos contra 7) e os requisitos 2.0.

## 2026-10-16 — sai a página "Solicitar remoção"; dicas de uso na câmera
- Decisão do Thiago: a remoção é pedida só pela foto no resultado da busca, que já aponta a imagem exata. Pedir por arquivo baixado obrigaria a procurar a imagem no acervo.
- Removido:
  - página /remocao;
  - links no menu do topo, no menu do celular, no rodapé e na política;
  - `requestRemovalByFile` no front;
  - rota pública `POST /public/removal` e `request_removal_by_file` no backend.
  - Motivo da rota: uma rota pública que recebe arquivo e ninguém usa é só superfície de ataque (Art. 46).
  - A coluna `images.delivered_sha256` ficou (tirar exigiria migração; avaliar nos requisitos 2.0).
- Testes: saíram os 2 testes da rota. Entrou `test_no_public_route_receives_a_file_for_removal`, que garante que a rota não volta sem ninguém perceber. Ao todo, 126 ok. API reiniciada: a rota agora responde 404.
- LGPD (Art. 18 §3, lido na lei): o pedido pode vir do titular OU do representante legal, e a busca facial só acha a própria pessoa. Para não fechar esse direito, "Seus direitos" na Política agora manda ao encarregado quem a busca não acha (aparece de longe ou de perfil) e o representante legal. O aviso de uso responsável agora diz "abra a foto no resultado e toque em Solicitar remoção". **Pendente da instituição: nomear o encarregado (dpo ainda é None).**
- Ao abrir a câmera aparecem "Dicas para encontrar suas fotos" (components/visitor/SearchTips.tsx): luz de frente, rosto inteiro, nada cobrindo (óculos/máscara/boné), só você na foto (com vários rostos vale o MAIOR, face/selection.py), câmera parada. Também aparece o aviso "semelhança visual, não identidade" (RF016 nota 5), agora antes da busca e não só no resultado. No computador as dicas ficam ao lado da câmera; no celular, entre a câmera e o botão.
- Verificado com Playwright + câmera falsa do Chromium (1440 e 402 px): 26 checagens ok.
- Requisitos 2.0: RF022 nota 6 e RF023 nota 1 (remoção por arquivo) mudam com esta decisão.
- **Parei em:** Thiago olha depois de descansar.

## 2026-10-15 (6) — visual "100% web" aplicado ao site do visitante + ícone escolhido por tema
- Thiago aprovou o simulado com ajustes: símbolo da câmera + FOTOMAC no topo; sem "— sem precisar folhear o álbum inteiro"; faixa de temas que não quebre com muitos temas; cada tema com um símbolo escolhido por quem o cria. "Faça o resto e implemente."
- **Cópia do visual antigo:** backups/visual-antigo-2026-10-15/ (src inteiro + LEIAME.md com o comando para voltar). Se o cliente/banca não gostar, é só restaurar.
- **Ícone por tema (backend):** migração 0008 (`themes.icon`, padrão "tag", só `[a-z0-9-]`, máx. 40). Os 8 temas atuais ganharam ícones iniciais. Criar e editar tema aceitam o ícone, e a troca fica na auditoria (`theme.icon_changed`). O ícone sai nas rotas públicas. Testes: 127 ok.
- **Ícone por tema (front):**
  - catálogo de ~57 ícones lucide em 7 grupos: components/icons/themeIcons.tsx (`ThemeIcon`);
  - seletor: components/panel/IconPicker.tsx;
  - tela Temas: botão de ícone ao criar, "Editar" com nome + ícone (a grade rola sozinha, então o Salvar fica sempre visível) e ícone na tabela.
- **Site no computador (≥ 1024 px), em components/visitor/web/:**
  - Site.tsx tem o topo (marca grande, menu, "Acesso da equipe"), o rodapé em colunas e a `PageBand` (faixa de título com trilha "Início › …", e cada nível é link).
  - Home.tsx tem o destaque com a busca grande, a faixa de temas rolável com setas, os cartões em 4 colunas, "Como funciona" e a faixa de privacidade.
  - As páginas início, explorar, evento, privacidade e remoção agora têm versão web. O celular continua no Figma, com o mesmo código antigo.
  - Página do evento: capa e dados na faixa azul; busca e "Sobre o evento" lado a lado; resultado embaixo, e a página rola até ele. Toda a lógica de privacidade ficou igual: o resultado some ao sair, a selfie só fica na memória e o consentimento vem antes.
- Bug achado no teste e corrigido: o rodapé cobria o menu "Tirar foto / Realizar upload" quando ele abria perto do fim da página. O conteúdo da página agora fica acima do rodapé (zIndex).
- Verificação: Playwright em 1440, 1100 e 402 px, com 35 checagens ok (temas filtram, trilha volta, busca → resultado → visualizador, resultado some ao sair, privacidade, remoção, ícone trocado no painel aparece no site e foi restaurado). Tipos e lint limpos. Conta e2e removida, e o banco ficou só com as contas do Thiago e testefotografo.
- **Parei em:** Thiago testa o visual novo. Depois vêm os requisitos 2.0 (com calma). O aviso "baixe o aplicativo" no celular fica para depois.

## 2026-10-15 (5) — simulado da página inicial "100% web" (referência: Fotop)
- Retorno do Thiago sobre a fase 1: o visualizador de fotos ficou "muito melhor", mas o site ainda parece celular (uma página no meio, com duas faixas brancas dos lados). Ele quer o site 100% web. O aviso "baixe o aplicativo" para quem abre o site no celular fica para depois.
- Referências: fotop.com analisado por captura (topo com menu, faixa de destaque com busca grande, faixa de categorias com ícones, grade de 4 cartões verticais, "Ver mais eventos", faixa institucional escura, rodapé em colunas). www.focoradical.com.br BLOQUEIA acesso automatizado (Cloudflare); não contornei e pedi um print ao Thiago.
- Simulado: docs/design/simulado-home/index.html, gerado de template.html por docs/design/gerar_simulado.mjs. Ícones lucide e fonte Poppins tirados do próprio projeto, então abre sem internet. Faixas de ponta a ponta com conteúdo em 1200 px:
  1. topo branco com menu e "Acesso da equipe";
  2. faixa de destaque azul da marca, SEM rosto (só a moldura de reconhecimento), com busca grande e filtros;
  3. faixa de temas/tags com ícones;
  4. grade de 4 cartões (capa, contagem de fotos, data, local, tags);
  5. "Como funciona" em 3 passos;
  6. faixa escura de privacidade (galeria privada, selfie nunca guardada, busca só no evento, remoção em 72 h);
  7. rodapé.
  - Só a Colação é real; os outros 7 eventos são exemplos, avisados numa faixa amarela.
- A capa real usada no simulado (com pessoas) fica fora do git: regra docs/design/**/capa-*.jpg no .gitignore.
- **Parei em:** Thiago avalia o simulado (e manda o print do Foco Radical, se quiser). Aprovado, passa para o app (só em ≥ 1024 px; o celular continua no Figma), depois a página do evento no mesmo padrão, e então os requisitos 2.0.

## 2026-10-15 (4) — FASE 1 (visual): site com cara de site, foto grande com zoom, Voltar no painel
- Decisões novas do Thiago:
  - o admin edita todas as tags, mas de preferência não mexe;
  - as fotos da conta temporária levam o crédito do fotógrafo contratado;
  - o Moacir só fotografa, e o vídeo vem do marketing (celular, vídeos curtos);
  - calibrar o SFace "o melhor possível", com mais testes.
- Ordem combinada: fase 1 (visual) → requisitos 2.0 (com calma, "fechadinhos") → resto da produção.
- Limpeza de demonstração: scripts/dev_keep_only_event.py (novo, só banco local). Ficou só a COLAÇÃO DE GRAU (184 fotos). Saíram 5 eventos de teste (429 fotos, 1.292 arquivos, 1 pedido de remoção, 4 registros de ciência). Banco × armazenamento: 553 × 553. A conta testefotografo continua.
- Visitante no computador (≥ 1024 px):
  - coluna de 760 → 1200 px (tokens visitor.wideFrom/columnWide; Column aceita `narrow` para privacidade e remoção, por legibilidade);
  - lista de eventos com 3 por linha;
  - grade do resultado com 4 colunas: miniatura de ~130 → 287 px.
  - O celular continua igual ao Figma.
- Foto aberta (PhotoViewer) em tela cheia: área de 490×550 → 1424×758 px no computador. Fundo sólido, setas grandes, ← → e Esc, arrastar para o lado no celular, crédito, data, "Solicitar remoção" e "Baixar" na barra de baixo.
- Zoom novo, components/ui/ZoomImage.web.tsx (DOM puro, porque os gestos do React Native não pegam roda/pinça no navegador): roda do mouse, duplo clique, pinça, arrastar, botões − % + e "ver inteira", teclas + − 0. Versão do app (ZoomImage.tsx) sem zoom por enquanto. Usado também na foto do painel.
- Painel: botão "← Voltar" antes da trilha em todas as telas internas. Vai para o nível de cima (Imagem → Imagens → Evento → Eventos), não para o histórico do navegador. O primeiro nível não tem o botão.
- Verificado no Chromium, computador e celular: roda/duplo clique/botões/setas/Esc/arrastar OK; Voltar do painel em 3 níveis OK; nenhum erro de página. Typecheck e lint (regras do React Compiler) limpos. A foto do coordenador foi usada só localmente; as capturas ficaram fora do repositório.
- Limitação: o zoom usa a prévia de 1600 px, então acima de ~250% fica um pouco suave. Uma cópia maior para visualização é decisão para os requisitos 2.0.
- **Parei em:** Thiago testa a fase 1. Depois: requisitos 2.0.

## 2026-10-15 — 1ª banca aprovada; mudanças decididas (início da v1.7)
- Banca e cliente aprovaram. Stakeholders agora: Moacir Barbosa (fotógrafo, cliente), CESMAC, equipe de marketing do CESMAC e Prof. Mozart Melo (coordenador).
- **Temas → fotógrafo:** o cliente quer criar as próprias tags de filtro. Hoje a manutenção de temas (RF027) é só do administrador (rotas /admin/themes em app/api/admin_config.py; tela "Temas" no menu do admin).
- **Reconhecimento facial → YuNet + SFace** (decisão do CESMAC: custo zero; YuNet MIT, SFace Apache 2.0). O InsightFace sai. Impacto levantado:
  - o adaptador SFace passa a ser o motor principal; a troca reindexa o acervo (RF028, pronto);
  - não há mais modelo de reserva: fica só a falha segura (busca pausa, fila espera, API sobe sem motor);
  - a nota 89,5 do Teste 1 saiu com a calibragem do lab (de_fabrica: False em fotomac-lab/modelos.py: foto reduzida a 1920 px, limiar e filtros ajustados). Produção tem que reproduzir essa configuração;
  - índice HNSW só existe para 512 dimensões (migração 0001); o SFace gera 128 → índice novo;
  - calibrar o limiar vira obrigatório antes de produção: 203 intrusos no topo contra 7. No lab, limiar 0,3741 → F1 89% (48/59, 1 erro); 0,45 → F1 72% (33/59, 0 erro);
  - slides, README e requisitos que citam o InsightFace precisam ser atualizados.
- Requisitos v1.7 ("quase 2.0"): falta receber o feedback da banca e as ideias extras.
- **Parei em:** aguardando a lista de feedback da banca e das ideias extras para montar o planejamento e a v1.7. Nada de código mexido nesta entrada.

## 2026-10-15 (2) — planejamento pós-banca (18 itens + tags + calibração pelo admin)
- docs/PLANEJAMENTO-POS-BANCA1.md → docs/entregaveis/PLANEJAMENTO-POS-BANCA1.pdf/.docx (8 páginas): cada pedido com o que vira no sistema, tamanho (P/M/G), dependências e LGPD; ordem em 10 fases; 9 decisões pendentes do Thiago.
- Correções e alertas levantados:
  - prova de vida na câmera (item 10) é inútil enquanto existir o envio pela galeria (RF016 nota 2): decidir antes;
  - marketing usando o acervo = finalidade nova (Art. 6º, I), o que exige jurídico; proposta: marketing só produz conteúdo;
  - calibração pelo admin procura pessoa determinada → só com consentimento (Art. 11, I);
  - fotógrafo contratado = operador (Art. 39);
  - vídeo: menores (Art. 14), voz, GPS nos metadados, FFmpeg (dependência nova, licença a conferir), armazenamento como pré-requisito;
  - "retirar das pesquisas" (item 13) é ambíguo.
- Recomendação: requisitos como versão 2.0, reescritos depois das respostas e antes das fases 4–9. As fases 1–3 (ajustes de tela, SFace, calibração) estão cobertas pela v1.6 e podem começar.
- **Parei em:** Thiago responde as 9 decisões da seção 4 do planejamento e aprova a ordem. Próximo passo sugerido: fase 1 (voltar fácil, zoom, grade do resultado).

## 2026-10-15 (3) — respostas do Thiago incorporadas ao planejamento
- Decisões:
  - envio pela galeria SAI (só existia para teste; v2.0 = busca só pela câmera + prova de vida);
  - marketing = mesmas funções do fotógrafo, inclusive baixar para divulgação, identificado como "Equipe de marketing", sem busca de alunos → a v2.0 precisa declarar essa finalidade ao visitante (jurídico define a base);
  - tags = filtro de evento, lista única, sem grupos, cada tag só editável pelo dono (admin modera: suposição a confirmar);
  - item 13 = marcação automática das fotos novas da pessoa autorizada (RF021 nota 3);
  - conta temporária: admin cria, vale 24 h, fotos só publicam com aprovação do admin;
  - versão dos requisitos: 2.0; 2ª banca sem data.
- Correção levantada: "treinar" o YuNet/SFace com o acervo NÃO entra (finalidade não autorizada, Art. 6º I; GPU; deixaria de ser o modelo medido). O painel do admin CALIBRA (limiar, detecção, tamanho mínimo, resolução) usando o acervo, com pessoa de referência que consentiu.
- Armazenamento medido: 4,26 MB por foto (original + prévia + miniatura); 1.000 fotos ≈ 4,3 GB. Estimativa para 35 vídeos de 5 min em 1080p: HEVC ≈ 10,5 GB, H.264 ≈ 21 GB, câmera ≈ 66 GB, + ≈ 8 GB de cópia para o navegador.
- Memória de correção: nao-tratar-upload-de-teste-como-recurso.
- Conferido: banco × armazenamento 1.845 × 1.845, nenhum órfão. Há 5 eventos de teste PUBLICADOS da demonstração (visíveis na página pública).
- **Parei em:** decidir se começa pelos requisitos 2.0 ou pela fase 1 (ajustes de tela).

## 2026-10-14 (2) — link de senha visível para demonstração (TEMPORÁRIO)
- Thiago criou a conta testefotografo@cesmac.edu.br (fotógrafo, pendente) para mostrar ao fotógrafo e não tinha como abrir o link de senha. Passei o link tirado de backend/outbox.
- A pedido dele: botão "Mostrar link" na tela da conta (Contas → conta pendente), ao lado do aviso "Reenviar link". Gera link novo (invalida o anterior), registra na auditoria (account.activation_link_shown_dev) e mostra o endereço com botão Copiar.
- Proteção que acrescentei: só funciona em desenvolvimento (FOTOMAC_EMAIL_SENDER=outbox). Com e-mail de verdade a rota responde 404 e o botão não aparece. Em produção, mostrar o link ao administrador deixaria qualquer administrador tomar uma conta pendente (RF001 nota 5).
- **TEMPORÁRIO — REMOVER ANTES DA IMPLANTAÇÃO.** Trechos marcados com "TEMPORÁRIO": app/accounts/service.py (dev_activation_link), app/api/accounts.py (rota /activation-link/dev e campo dev_link_available), tests/test_accounts.py (teste próprio), frontend/src/api/accounts.ts e frontend/src/app/(painel)/contas/[id].tsx.
- 126 testes; typecheck e lint OK; conferido no navegador com contas temporárias e2e (removidas depois). A API continua sem --reload.

## 2026-10-14 — sistema no ar para o vídeo + revisão final
- Sistema ligado para a gravação e a demonstração ao orientador/stakeholder: Postgres, SeaweedFS, API e site em segundo plano, com `caffeinate -di` impedindo o repouso do Mac. A API foi iniciada SEM `--reload`, para correções no código não reiniciarem o servidor no meio do vídeo.
- Revisão: 125 testes do servidor passando; typecheck e lint do site OK; site e login abrindo no navegador; armazenamento × banco batendo (565 arquivos, nenhum órfão); biometria só de foto publicada, no evento certo, de um único modelo; números do código conferidos com a v1.6.
- **Inconsistência achada e corrigida:** 15 pedidos de remoção órfãos ("Recebida", sem foto e sem evento, ainda com e-mail de contato, prazo vencido em 07/10). Eram restos dos testes e2e (e-mails @exemplo.com, nenhuma pessoa real): o scripts/cleanup_e2e.py apagava os eventos de teste e deixava os pedidos para trás (ON DELETE SET NULL). O script agora apaga também esses pedidos; os 15 foram removidos. Os 3 pedidos legítimos do evento real ficaram, sem e-mail. O sistema em si não tinha esse caminho: eventos não são apagados, só expiram, e a expiração conclui os pedidos.
- O prazo de 72 h estava duplicado (app/public/service.py e app/api/images.py). Agora uma constante só, mesmo comportamento.
- Não é erro, fica como sugestão: sessões de login vencidas e links de senha vencidos não são apagados. Guardam só hash, conta e datas.
- O Chromium do Playwright tinha sumido do cache e o baixador dele não segue o redirecionamento nesta rede. Baixei com curl para ~/Library/Caches/ms-playwright (chromium-1243 e chromium_headless_shell-1243).
- **Parei em:** Thiago grava o vídeo e mostra ao orientador. Os e2e ficam para depois da gravação, porque criam eventos de teste que apareceriam na tela; depois rodar scripts/cleanup_e2e.py --apply. Próximos de código: 4b (teste dele), plano B (A + B), 4c, 4d.

## 2026-10-11 (5) — apresentação no modelo oficial do CESMAC
- Thiago achou o modelo obrigatório: docs/entregaveis/MODELO - APRESENTAÇÃO REGISTRO.pptx. É 4:3; a logo do CESMAC e a faixa ficam no molde; títulos em Segoe UI Semibold 44, tópicos em Segoe UI 28 com marcador roxo, capa e ficha em Arial. Seções: Capa → Roteiro → Introdução → Informações do Software → Metodologia e Desenvolvimento → Vídeo → Resultados Parciais (só na pré-banca) → Conclusão (só na banca final) → Referências em ABNT, só do que for citado.
- Decisão (Thiago escolheu): montar a partir do próprio arquivo do modelo com python-pptx (instalado só na .venv da skill apresentacoes), em vez de editar pelo conector do Canva. O conector não escolhe fonte, e o redimensionamento de 16:9 para 4:3 rearruma tudo sem controle.
- docs/apresentacao/gerar_modelo.py → docs/entregaveis/FOTOMAC-apresentacao-modelo.pptx (17 slides, com notas) + FOTOMAC-apresentacao-modelo-reserva.pdf. Os slides do modelo são editados no lugar; os novos clonam a caixa de título e a de tópicos do modelo. Caixas azuis de instrução removidas. O slide "Vídeo" de tutorial e o de Conclusão saíram (pré-banca).
- Capa: AUTOR Thiago José Camêlo Nunes; COLABORADOR Pedro Rosa; ORIENTADOR Prof. Me. Wagner de Oliveira Lima Palmeira de Araujo; STAKEHOLDERS Prof. Me. Wagner, Moacir Barbosa (fotógrafo) e CESMAC.
- 14 referências ABNT (NBR 6023), conferidas: LGPD, ArcFace (CVPR 2019, p. 4690-4699), SCRFD (ICLR 2022), InsightFace, OpenCV Zoo, Expo, FastAPI, PostgreSQL, pgvector, SeaweedFS, WILL IT RUN AI, Montala/ResourceSpace e dois documentos do Thiago (requisitos v1.6, fotomac-lab).
- Achado: "Metodologia e Desenvolvimento" não cabe em 44 pt com Segoe UI. O modelo só parece caber porque a prévia do Mac troca a fonte por Times. O gerador reduz o título até caber.
- O design 16:9 no Canva (DAHXvYS-Dmg) virou versão antiga.
- **Parei em:** Thiago importa o .pptx novo no Canva (Criar design → Importar arquivo). Eu confiro pelo conector, inclusive como o Canva tratou a Segoe UI. O vídeo da demonstração entra no slide 12.

## 2026-10-11 (4) — decisão: plano B do reconhecimento facial (NÃO implementado ainda)
- Thiago propôs dois modelos com troca automática (InsightFace principal; YuNet + SFace se quebrar ou se a licença não sair). Recomendei contra a troca automática, e ele aceitou:
  - os vetores não são comparáveis (512 × 128 números, escalas diferentes). Trocar na hora exigiria indexar o acervo nos dois modelos o tempo todo: biometria em dobro para uso eventual, o que fere a necessidade (LGPD Art. 6º, III);
  - o SFace sem calibragem pôs 203 fotos erradas no topo no Teste 1, contra 7 do InsightFace. Trocar sozinho mostraria fotos de terceiros ao visitante (Art. 46);
  - licença não é falha: é troca planejada (configuração + reindexação, que já existe na 4b).
- **Decidido (A + B), para os próximos passos:**
  - **A. Adaptador YuNet + SFace** em app/face/sface_engine.py + uma linha em ENGINES (factory.py). Troca = FOTOMAC_FACE_ENGINE=sface + reindexação pela tela. Usar a MESMA configuração do Teste 1 (ver ~/fotomac-lab/modelos.py, entrada "sface", e os .onnx em ~/fotomac-lab/models/), de fábrica, sem ajuste meu. Limiar próprio do SFace: calibrar depois, como etapa separada. Teste: vetores iguais aos da API oficial, como o test_face_engine.py faz com o InsightFace.
  - **B. Falha segura.** Se o motor não carregar ou der erro, a busca do visitante responde "Busca facial temporariamente indisponível" (hoje um erro inesperado em engine.detect, em app/public/service.py, vira erro genérico). O resto segue: as publicações esperam na fila sem gastar as 3 tentativas e são indexadas quando o motor voltar. A API precisa subir mesmo sem o motor (hoje main.py chama get_face_engine na inicialização). Nunca troca de modelo sozinho.
- Ressalva honesta: o slide 8 diz "o adaptador troca o modelo sem reescrever o sistema". A estrutura (porta, fábrica, model_version, reindexação, colunas de vetor sem dimensão fixa) existe, mas o adaptador do SFace ainda não. Com o A feito, a frase fica inteiramente verdadeira.
- **Parei em:** Thiago revisa o Canva. Próximo de código: 4b (teste dele), depois A + B do plano B, 4c, 4d.

## 2026-10-11 (3) — apresentação no Canva: licença, situação detalhada, reserva
- Thiago importou o .pptx no Canva (design "FOTOMAC-apresentacao.pptx", id DAHXvYS-Dmg). A primeira tentativa usou o PDF de reserva, que é feito de imagens e virou um "borrão".
- **O Canva passou a ser a fonte da apresentação.** Editei direto pelo conector. O docs/apresentacao/gerar.js e o .pptx local ficaram com a versão antiga dos slides 8 e 10 e não têm o 11 nem o 13.
- Slide 8 "Livre para pesquisar, licenciado para operar": print do site + código MIT / modelos só pesquisa / operar exige licença + plano B (YuNet MIT + SFace Apache 2.0, nota 89,5). Conferido no README do deepinsight/insightface e no opencv_zoo. Corrigido o texto sugerido por outro Claude, que dizia "YuNet + SFace (Apache 2.0)": o YuNet é MIT.
- Slide 10 "Seis etapas feitas, duas pela frente": tabela 1, 2a, 2b, 3, 4a prontas; 4b em teste; 4c, 4d a fazer.
- Slide 11 novo "O que ainda falta": 4c (RF023/RF024/RNF14), 4d (RF020/RF021, LGPD Art. 11) e calibrar o limiar; depois, app móvel, implantação no CESMAC e licença do modelo.
- Slide 13 novo, reserva após o vídeo: print do contato, recognition-oss-pack@insightface.ai, preço sob consulta, precedente da Montala/ResourceSpace (conferido) e o que acontece se a licença não sair.
- **Parei em:** Thiago revisa no Canva. Os textos novos estão com a fonte padrão do Canva, não Arial (o conector não escolhe fonte). Para unificar: selecionar um texto novo → Arial → "Alterar tudo".

## 2026-10-11 (2) — apresentação: "por que não IA generativa" e licença
- Deck passou de 9 para 11 slides (~5,5 min). Slide 7: comparação IA generativa × InsightFace (máquina, resposta, busca, privacidade). Slide 8: espaço aberto para o Thiago pôr a imagem do site do InsightFace e explicar a licença no Canva.
- Título trocado de "Por que não usar IA?" para "Por que não uma IA generativa?": o InsightFace também é IA, e a banca pegaria isso.
- Números do slide 7 medidos no backend (CPU, só detecção + reconhecimento do buffalo_l, M5 Pro): ~1 GB de RAM no pico, 0,13 s por foto (imagem de 1280 px, 6 rostos). Os 11 a 22 GB de GPU do Llama 3.2 Vision 11B são estimativa do willitrunai.com, citada no rodapé. A nota sobre nuvem cita o Art. 33 da LGPD (conferido na lei).
- Conector do Canva não importa .pptx local (ver skill apresentacoes). Thiago importa manualmente.
- **Parei em:** Thiago importa o .pptx no Canva e completa o slide 8. Depois eu confiro o design pelo conector.

## 2026-10-11 — apresentação da 1ª banca + skill "apresentacoes"
- Nova skill do agente: ~/Agente/skills/apresentacoes, ligada em ~/.claude/skills.
  - Gera .pptx com pptxgenjs; dependências instaladas só dentro dela (node_modules e .venv).
  - Conferência visual com scripts/preview.py: usa o Quick Look do macOS, que só renderiza o 1º slide, por isso o deck é separado em um arquivo por slide. Ele também monta um PDF de reserva.
  - Canva só pelo conector, que não apareceu nesta sessão.
- docs/apresentacao/gerar.js → docs/entregaveis/FOTOMAC-apresentacao.pptx (9 slides, ~4,5 min, com notas do apresentador) + FOTOMAC-apresentacao-reserva.pdf.
  - Símbolo extraído do .fig em alta resolução.
  - Nome FOTOMAC renderizado com a Montserrat do projeto (marca.py).
  - Gráfico do Teste 1 desenhado com formas, porque o gráfico nativo não aparece no Quick Look.
- **Parei em:** Thiago revisa a apresentação e grava o vídeo da demonstração. Lembrei a ele o cuidado de LGPD no vídeo: não mostrar fotos reais de terceiros.

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
