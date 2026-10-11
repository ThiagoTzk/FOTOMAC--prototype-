---
title: "FOTOMAC — Adequação das telas do Figma à versão 1.6 dos requisitos"
subtitle: "Relatório de divergências e adaptações aplicadas na implementação"
author: "Thiago José Camêlo Nunes"
date: "03/10/2026"
lang: pt-BR
---

# 1. Objetivo

As telas do arquivo Figma "FOTOMAC", elaboradas pela equipe do CITEC, foram desenhadas a
partir das versões 1.4 e 1.5 do Documento de Requisitos. A versão vigente é a **1.6
(22/09/2026)**, que introduziu, entre outros pontos, a colaboração entre fotógrafos, a
definição de senha por ligação enviada ao e-mail (no lugar da senha provisória) e a
supressão da estimativa automática de faixa etária.

Este relatório registra cada ponto em que o Figma diverge da versão 1.6 e a adaptação
aplicada na implementação. **Critério adotado:** prevalece o requisito v1.6; o estilo
visual do Figma (cores, tipografia, componentes, grade e tipo de layout) é mantido, e
apenas o conteúdo ou a regra é ajustado. Telas ausentes são criadas com os mesmos
componentes do design system existente.

**Pedido ao CITEC:** atualizar o arquivo Figma conforme as seções 3 a 6, para que design e
sistema voltem a coincidir.

# 2. Material analisado

| Página do Figma | Conteúdo | Telas |
|---|---|---|
| Protótipos — Fotomac web (Fotógrafo) | Autenticação e área do fotógrafo, 1440 px | 9 + 19 |
| Protótipos — Fotomac web-app (Visitante) | Área pública, formato celular 402 px | 12 |
| WEB | Rascunhos do painel do fotógrafo | 2 |
| Components / Foundations | Design system: botões, campos, ícones, navegação, modelos, cores, tipografia | — |

Não há telas do **administrador**.

# 3. Autenticação (já implementada)

**Primeiro acesso obrigatório**

- *Divergência:* Campo "Senha atual — senha provisória" e texto "substituir sua senha provisória" (fluxo da v1.4). A v1.6 proíbe senha atribuída pelo sistema: o titular define a senha por ligação de uso único, válida por 24 h (RF001, nota 5).
- *Adaptação:* Tela aberta pela ligação do e-mail, **sem** o campo "Senha atual". Título "Crie sua senha" e texto explicando a ativação da conta. Ligação expirada ou já usada mostra aviso no mesmo card.

**Demais 8 telas**

- Sem divergência.
- *Adaptação:* Implementadas como desenhadas.


# 4. Área do fotógrafo

**01 Visão geral**

- *Divergência:* Pendência "1 solicitação de remoção — Prazo de resposta: 2 dias" sugere que a imagem fica no acervo até o fotógrafo responder. Na v1.6 a exclusão é automática em 72 h, mesmo sem atuação (RF023, notas 5 e 6).
- *Adaptação:* Texto passa a "Exclusão automática em [tempo restante]".

**Barra lateral e cabeçalho (todas as telas)**

- *Divergência:* avatar com foto de perfil; sino com indicador amarelo fixo; em telas estreitas o cabeçalho não cabe.
- *Adaptação:* avatar com as iniciais (a foto de perfil foi suprimida, ver tela 19); o indicador do sino só aparece quando há pendência real (falha de processamento ou pedido de remoção); em telas menores que 1024 px a barra lateral vira menu deslizante e o cabeçalho mostra só as iniciais (RNF08).

**01 Visão geral — "Requer atenção"**

- *Divergência:* o card "2 falhas de upload" não tem dado persistente correspondente: na v1.6 a falha de envio é tratada na própria tela de acompanhamento e registrada em log técnico (RF008, notas 5 e 6).
- *Adaptação:* a seção mostra falhas de processamento e pedidos de remoção; sem pendências, exibe "Nenhuma pendência".

**02 Lista de eventos**

- *Divergência:* Não distingue eventos próprios de eventos com colaboração liberada por outro fotógrafo (RF025, nota 1).
- *Adaptação:* Indicação "Colaboração" na linha do evento e filtro "Meus eventos / Colaborações".

**03 Criar evento**

- *Divergência:* "Local" como lista de seleção. A v1.6 define Local como texto livre (RF004).
- *Adaptação:* Campo de texto.

**04 Editar evento**

- *Divergência:* Aviso genérico de que a expiração será recalculada. A v1.6 exige apresentar a **nova data** antes de confirmar (RF005, nota 3).
- *Adaptação:* O aviso mostra a nova data de expiração calculada.

**05 Detalhes do evento**

- *Divergência:* Não há liberação de colaboração nem relação de colaboradores (RF025). A expiração de exemplo é de 12 meses; a v1.6 fixa 6 meses (RNF12).
- *Adaptação:* Novo card "Colaboração" (liberar/suspender, apenas para o responsável) e relação de colaboradores com quantidade de imagens. Expiração calculada pelo parâmetro vigente.

**05 Detalhes do evento — abas**

- *Adaptação:* abas "Visão geral" e "Colaboração". A aba "Imagens" entra junto com o envio e a conferência das imagens.

**06 Upload de imagens**

- *Divergência:* Falta a **advertência quanto a menores de idade**, que deve ser exibida de forma destacada antes de cada envio (RF007, nota 12).
- *Adaptação:* Aviso destacado acima do botão "Iniciar envio".

**07 Acompanhamento do upload**

- *Divergência:* Falha sem a mensagem padronizada e sem o motivo em linguagem compreensível (RF008, notas 3 e 4).
- *Adaptação:* Card de falha com "Esta imagem não conseguiu ser renderizada ou enviada" e o motivo (formato, tamanho, arquivo corrompido, limite do evento, transmissão).

**08 Conferência das imagens**

- *Divergência:* Filtro "Requer atenção" antes da publicação. A v1.6 não prevê sinalização de atenção nesta fase; a origem provável do filtro é a estimativa automática de faixa etária da v1.5, suprimida na v1.6 (RF007, nota 12; RF009, nota 4). Botão "Publicar" disponível a qualquer fotógrafo.
- *Adaptação:* "Requer atenção" substituído por filtro por **autor** ("Minhas imagens / Todos"). Publicação apenas para o responsável e o administrador (RF009, nota 5); o colaborador vê "Aguardando publicação pelo responsável". O colaborador só descarta as próprias imagens (RF025, nota 5).

**09 Visualização individual**

- Sem divergência.

**10 Confirmação de publicação**

- Sem divergência.

**11 Processamento**

- Sem divergência.

**12 Gerenciamento das imagens**

- *Divergência:* "Baixar acervo" e "Excluir selecionadas" sem restrição por perfil.
- *Adaptação:* Colaborador: "Baixar minhas imagens" (RF012, nota 7) e exclusão apenas das próprias imagens.

**13 Imagem publicada**

- *Divergência:* "Revise e conclua a exclusão dentro do prazo institucional" contradiz a exclusão automática em 72 h. Crédito no formato "Moacir Barbosa / FOTOMAC — CESMAC".
- *Adaptação:* Texto "Será excluída automaticamente em [data e hora], caso não seja excluída antes." Crédito no formato da v1.6: "Fotografia por: [nome] — Centro Universitário CESMAC" (RF018, nota 3).

**13 Imagem publicada — identificação**

- *Divergência:* título "Imagem 109" no caminho de navegação: imagens não têm denominação na v1.6 (RF007, nota 6).
- *Adaptação:* "Imagem"; a própria fotografia identifica o arquivo, com data de envio e crédito.

**14 Confirmação de exclusão**

- Sem divergência.

**10 Confirmação de publicação — eventos já publicados**

- *Esclarecimento:* imagens acrescentadas a um evento já publicado (RF005, nota 4) não tiram o evento do ar: ele continua público e as novas imagens passam a ser encontradas assim que forem indexadas. Só um evento ainda "Em edição" passa por "Em processamento" (RF006, nota 2).

**15 Download do acervo**

- *Divergência:* "O link de download expira em 24 horas." A v1.6 fixa no máximo 30 minutos (RF012, nota 5). "Fotos aprovadas" (termo da v1.3).
- *Adaptação:* Validade de 30 minutos; termo "fotos publicadas".

**16 a 18 Pessoas institucionais**

- *Divergência:* Botão "Confirmar seleção" sem correspondente na v1.6.
- *Adaptação:* Mantido o aviso de conferência humana (RF021, nota 7); ação substituída por abrir e baixar a imagem individualmente.

**19 Meu perfil**

- *Divergência:* "Alterar foto" (foto de perfil): dado pessoal sem finalidade prevista (LGPD, Art. 6º, III). Assinatura no formato "Moacir Barbosa / FOTOMAC — CESMAC"; a v1.6 guarda só o nome profissional, combinado automaticamente com a instituição (RF001, nota 4). "Senha institucional" sugere integração que ainda não existe (RF001, nota 9).
- *Adaptação:* Sem foto: avatar com iniciais, como no painel. Assinatura só com o nome, com prévia do crédito final. Nome e e-mail apenas para leitura (definidos pelo administrador). "Senha do FOTOMAC".


# 5. Área pública (visitante)

As telas do visitante foram desenhadas para celular (402 px). A plataforma web deve se
adaptar a telas de qualquer dimensão (RNF08): no computador, o mesmo layout é aplicado
numa coluna central de até 760 px e a lista de eventos passa a duas colunas.

**Início e busca de eventos**

- *Divergência:* O filtro "Tema" aparece como escolha única; a v1.6 exige combinar mais de um tema na mesma consulta (RF013, nota 4). Os filtros "Data" e "Período" não têm o formato definido.
- *Adaptação:* "Tema" abre uma lista com várias seleções; "Data" aceita um dia exato (dd/mm/aaaa); "Período" aceita de um mês a outro (ex.: Junho a Agosto de 2026). Os três se combinam e consideram a data do evento (nota 5). A pesquisa por nome tolera acentos e erros simples de digitação (nota 1).
- *Formato da data:* eventos de dia exato seguem o Figma ("Sábado - 21.12.2026"); eventos de mês ou intervalo de meses mostram a precisão cadastrada (nota 3).

**Evento (galeria privada)**

- *Divergência:* "Ao prosseguir, você aceita nossa política de privacidade e o uso da sua imagem" junto do botão "Buscar minhas fotos" configura **aceite tácito**, vedado pela LGPD (Art. 8º, § 1º) e pelo RF015 (nota 5). Falta o aviso destacado com título, conteúdo mínimo, advertência sobre menores e ação "Estou ciente".
- *Adaptação:* "Buscar minhas fotos" abre primeiro o aviso **"Permissão para uso de imagem"**, com o texto de referência do RF015 (nota 3), a advertência do Art. 14 sobre menores, o prazo de retenção em vigor, a ligação para a Política de Privacidade e o botão "Estou ciente" (sem caixa pré-marcada). Só depois aparecem as opções "Tirar foto" e "Realizar upload" do Figma. Sem ciência, a câmera não abre e o servidor recusa a busca. O texto tácito foi trocado por uma nota que explica isso.

**Evento**

- *Divergência:* Falta o aviso permanente de uso responsável (RF014, nota 6; RF022). O crédito mostra um fotógrafo; com colaboração podem ser vários (RF014, nota 3).
- *Adaptação:* Aviso de uso responsável fixo na página, com ligação para a solicitação de remoção. Crédito com todos os fotógrafos do evento e a instituição. Data até a qual as fotos ficam disponíveis (RF022, nota 5).

**Captura de foto e envio da galeria**

- *Situação:* O Figma já prevê as duas origens no menu do botão ("Tirar foto" / "Realizar upload"), conforme o RF016. As duas recebem tratamento idêntico no servidor (nota 2).
- *Adaptação:* Fotos da galeria em outros formatos (PNG, capturas de tela) são convertidas para JPEG no próprio navegador, que também as reduz e descarta os metadados (GPS, aparelho) antes do envio. A câmera é desligada ao fechar a janela ou capturar a foto.

**Resultado positivo**

- *Divergência:* Falta o aviso de uso responsável e a explicação de que o resultado indica similaridade visual, não identidade (RF016, nota 5; RF022).
- *Adaptação:* Os dois avisos aparecem abaixo da grade de resultados. A foto circular acima da grade (a própria foto de busca) existe só na memória da página; o servidor não a guarda.

**Nenhuma foto encontrada**

- Sem divergência relevante.
- *Adaptação:* Texto complementado: a ausência de resultado pode significar que a pessoa não foi fotografada (RF018, nota 7).

**Foto ampliada**

- *Divergência:* O botão amarelo de remoção tem só um ícone; como a exclusão é irreversível (RF023, nota 1), a ação precisa ser inequívoca.
- *Adaptação:* O botão recebe o texto "Solicitar remoção". As setas também funcionam pelo teclado no computador.

**Solicitar remoção**

- *Situação:* Conforme a v1.6 (motivo opcional, e-mail obrigatório, aviso de 72 h).
- *Adaptação:* Informa que o e-mail é usado só para avisar a conclusão e depois é apagado (RF023, nota 3).

**Todas**

- *Divergência:* Política de Privacidade acessível de qualquer tela e canal de remoção acessível a qualquer pessoa, inclusive quem nunca usou a busca (RF022, notas 2 e 6; RF023, nota 1).
- *Adaptação:* O ícone de configurações do cabeçalho do Figma abre um menu com "Política de Privacidade", "Solicitar remoção de imagem" e "Acesso da equipe". A página de remoção permite identificar a foto pelo envio do arquivo baixado do FOTOMAC (só uma cópia exata é aceita, para que a exclusão nunca recaia sobre outra imagem).


# 6. Telas que não existem no Figma

Criadas com os componentes de "Configurações Templates", "Navegation" e "Card" do design
system e com o mesmo layout da área do fotógrafo (barra lateral de 240 px, área de
conteúdo de 1200 px):

| Tela | Requisitos |
|---|---|
| Política de Privacidade e informações sobre a LGPD (criada) | RF015, RF022 |
| Solicitar remoção de imagem pelo arquivo (criada) | RF022, RF023 |
| Administrador — Contas: relação, cadastro, reemissão da ligação, situação, desbloqueio (criada) | RF001, RF002, RF003 |
| Administrador — Temas de evento (criada) | RF027 |
| Administrador — Parâmetros do reconhecimento facial, com histórico de alterações (criada) | RF026 |
| Administrador — Reindexação do acervo, com progresso (criada) | RF028 |
| Administrador — Cadastro de pessoas institucionais | RF020 |
| Administrador — Solicitações de remoção | RF023 |
| Administrador — Registros de operações e relatório | RF024, RNF14 |

# 7. Pendências que não dependem do design

- Identificação do encarregado pelo tratamento de dados (Art. 41 da LGPD) a ser exibida na
  Política de Privacidade: pendência institucional (seção 11, item 5, do documento de
  requisitos).
- Validação do texto da Política de Privacidade e do aviso de permissão pela área jurídica
  do CESMAC antes da implantação.
- Decisão de implementação a validar: quando o administrador **reduz** o prazo de retenção, o
  RF026 (nota 2) manda aplicar a mudança na hora, e o RF006 (nota 5) exige aviso aos fotógrafos
  com pelo menos 30 dias de antecedência da eliminação. Para cumprir os dois, nenhum evento
  passa a expirar em menos de 30 dias a partir da mudança; a tela mostra esse impacto antes de
  salvar.
