---
title: "FOTOMAC — Planejamento após a 1ª banca"
subtitle: "Mudanças pedidas, impacto no sistema e proposta de ordem de execução"
author: "Thiago José Camêlo Nunes"
date: "15 de outubro de 2026 — atualizado com as respostas do Thiago"
lang: pt-BR
---

# 1. O que mudou

A 1ª banca e o cliente aprovaram o FOTOMAC. Na apresentação surgiram pedidos que ampliam
bastante o sistema. Este documento organiza esses pedidos antes de qualquer código: o que cada
um significa no sistema, de que outros depende, quanto trabalho dá e onde encosta na LGPD.

**Partes interessadas a partir de agora:**

- Moacir Barbosa, fotógrafo e cliente principal.
- Centro Universitário CESMAC.
- Equipe de marketing do CESMAC.
- Prof. Mozart Melo, coordenador do curso.

**Decisões já tomadas:**

| Decisão | Quem decidiu | Por quê |
|---|---|---|
| Reconhecimento facial com **YuNet + SFace**; o InsightFace sai | CESMAC | Custo zero: o YuNet (licença MIT) e o SFace (Apache 2.0) são livres para uso comercial. Os modelos do InsightFace só podem ser usados em pesquisa. |
| **Temas/tags** passam a ser mantidos pelo **fotógrafo**, e o administrador continua podendo | Cliente | O fotógrafo quer definir as tags e organizar o acervo do jeito dele. |
| O **administrador calibra o reconhecimento pelo site**: limiar, detecção e indexação, com testes e visualização | Thiago | Calibrar sem mexer em código e enxergar o efeito de cada ajuste. |
| Fotos e **vídeos** no acervo | Coordenação e marketing | Se o vídeo funcionar, a coordenação consegue mais armazenamento. |

**Escala dos tamanhos usados neste documento:**

- **P:** até uma sessão de trabalho.
- **M:** algumas sessões.
- **G:** semanas e prova de conceito antes de prometer.

# 2. Os pedidos, um a um

## 2.1 Reconhecimento facial

**YuNet + SFace como motor único (itens 5 e 14) — M**

- **O que vira no sistema:**
  - um adaptador novo (`sface_engine.py`), na mesma porta que já existe;
  - um índice novo no banco, porque os vetores do SFace têm 128 números e não 512;
  - a reindexação do acervo, com a função que já está pronta (RF028).
- **Cuidado 1:** a nota 89,5 do SFace no Teste 1 **não foi de fábrica**. Saiu com a calibragem do fotomac-lab (foto reduzida a 1920 px, limiar e filtros de detecção ajustados). O sistema tem que reproduzir exatamente essa configuração, senão a nota apresentada à banca não descreve o que está rodando.
- **Cuidado 2:** calibrar o limiar deixa de ser opcional. No Teste 1, o SFace pôs **203 fotos erradas** no topo do ranking, contra 7 do InsightFace. Os melhores pontos medidos:

| Limiar | Desempenho (F1) | Fotos certas achadas | Erros |
|---|---|---|---|
| 0,3741 | 89% | 48 de 59 | 1 |
| 0,45 | 72% | 33 de 59 | 0 |

  Errar aqui entrega ao visitante a foto de outra pessoa. O RF016 (nota 6) manda privilegiar a precisão.
- **Sem modelo de reserva:** com o InsightFace fora, se o reconhecimento falhar vale a **falha segura** (decidida em 11/10): a busca pausa com aviso, a fila de indexação espera sem gastar tentativas e a API sobe mesmo sem o motor. O sistema nunca troca de modelo sozinho.

**Painel do reconhecimento facial, para o administrador (pedido novo) — M/G**

> **Calibrar não é treinar.** O YuNet e o SFace são modelos já treinados pelos autores. O que o
> painel ajusta é **como o sistema os usa**: limiar de semelhança, confiança mínima da detecção,
> tamanho mínimo do rosto, resolução usada na indexação. Ajustar isso e medir o efeito é
> calibrar. **Treinar** seria mudar o próprio modelo usando os rostos do acervo. Isso não entra,
> por três motivos:
>
> - pela LGPD, as fotos foram coletadas para a pessoa se encontrar, e treinar IA com os rostos de
>   todo mundo é uma finalidade que ninguém autorizou (Art. 6º, I);
> - pede GPU e milhares de rostos rotulados;
> - um modelo retreinado deixaria de ser o que foi medido no Teste 1.
>
> Calibrar usando o acervo ativo pode, desde que a pessoa de referência tenha consentido.

- **O que vira no sistema:** uma área "Calibração" para o administrador. Ela traz para o produto o que hoje está no fotomac-lab:
  - escolher um conjunto de teste;
  - marcar "está / não está" em cada foto;
  - mover o limiar e os filtros e ver na hora quantas fotos certas e erradas cada valor traria.
- A tela de parâmetros (RF026) já existe e tem histórico de alterações. Falta a parte de teste e de visualização.
- **LGPD:** calibrar é procurar **uma pessoa determinada** no acervo. A pessoa usada como referência precisa consentir (Art. 11, I), como foi com o coordenador no Teste 1. Proposta:
  - o conjunto de calibração usa só pessoas com consentimento registrado no sistema;
  - as marcações ficam fora do acervo público;
  - tudo é apagado quando a calibração termina.

**Reconhecimento facial em vídeo (item 2) — G, prova de conceito primeiro**

- **Como funciona:** o mesmo YuNet + SFace roda em quadros do vídeo, por exemplo 1 ou 2 por segundo. Os rostos repetidos da mesma pessoa no mesmo vídeo são agrupados. A busca devolve o vídeo e **os momentos** em que a pessoa aparece.
- **Custos:**
  - processamento: um vídeo de 5 minutos a 2 quadros por segundo são cerca de 600 quadros por vídeo;
  - mais vetores no banco.
- **Antes de prometer:** uma prova de conceito no fotomac-lab, com um vídeo real de evento, medindo tempo, acerto e quantidade de vetores.

**Segurança contra foto de celular na câmera (item 10) — G, prova de conceito**

- **O risco é real:** a selfie é a "chave" da galeria. Quem mostra à câmera a foto de um colega recebe as fotos dele. Isso é acesso indevido a dado sensível.
- **Decidido (15/10):** o envio de foto pela galeria **sai**. Ele só existe para o Thiago testar, porque ele não aparece nas fotos do acervo. Na v2.0 a busca é **só pela câmera**, e é isso que torna a prova de vida eficaz. Até haver um conjunto de teste com o Thiago nas fotos, o envio pode ficar **só no modo desenvolvimento**, como o botão "Mostrar link", invisível em produção.
- **Técnicas possíveis, a medir na prova de conceito:**
  - **desafio ativo:** pedir para virar o rosto, conferido pelos pontos do rosto que o YuNet já devolve;
  - **modelo passivo antifraude:** um modelo que tenta reconhecer, pela imagem, se é tela ou papel. A licença ainda precisa ser conferida.

## 2.2 Acervo: vídeo e tags

**Vídeo no acervo (item 1) — G**

- **Envio:**
  - formatos de celular e câmera (MP4, MOV);
  - limite de tamanho e de duração por arquivo.
- **Processamento:**
  - tirar os metadados de localização (vídeo de celular grava GPS, como a foto);
  - gerar miniatura;
  - converter para um formato que todo navegador toca (vídeo de iPhone em HEVC, por exemplo, não abre em todos).
  - A conversão provavelmente exige o **FFmpeg** (ferramenta de vídeo, dependência nova; a licença precisa ser conferida antes).
- **Reprodução:** em pedaços, sem baixar o arquivo inteiro, e sempre passando pela API, como as fotos hoje.
- **Armazenamento:** o servidor previsto tem 300 GB. Vídeo ocupa ordens de grandeza mais que foto, então o aumento prometido pela coordenação vira **pré-requisito**.

  *Medido no acervo atual:* uma foto ocupa **4,26 MB** (original 4,04 + prévia 0,19 + miniatura 0,03). Um evento cheio, de 1.000 fotos, ocupa **≈ 4,3 GB**.

  *Estimativa para 35 vídeos de 5 minutos em 1080p* (10.500 segundos; GB = Mbps × segundos ÷ 8 ÷ 1.000). As taxas são típicas de cada tipo de aparelho e precisam ser confirmadas com um vídeo real do Moacir:

  | Como foi gravado | Taxa típica | Espaço | Equivale a |
  |---|---|---|---|
  | Celular, formato HEVC | ~8 Mbps | **≈ 10,5 GB** | ~2.500 fotos |
  | Celular, formato H.264 | ~16 Mbps | **≈ 21 GB** | ~4.900 fotos |
  | Câmera profissional | ~50 Mbps | **≈ 66 GB** | ~15.400 fotos |
  | Cópia convertida para o navegador | ~6 Mbps | **+ ≈ 8 GB** | guardada junto com o original |

  Ou seja, um evento com 35 vídeos de celular ocupa de **≈ 18 a 29 GB** com a cópia para o navegador, o espaço de **4 a 7 eventos só de fotos**. Com câmera profissional, ≈ 74 GB.
- **LGPD:**
  - vídeo de evento tem plateia, muitas vezes com **menores**: a advertência na tela de envio (RF007) passa a valer também para vídeo, e o Art. 14 exige o melhor interesse do menor;
  - vídeo também tem **voz**, que é dado pessoal;
  - publicação, prazo de retenção, remoção em 72 h e vetores só depois de publicar continuam valendo para vídeo.

**Nova organização por tags, criada pelo fotógrafo (item 7 e decisão) — M**

- **Hoje:** "temas" é uma lista que só o administrador mantém, usada como filtro na página pública.
- **O pedido:** o fotógrafo desenha a organização (quais tags existem e como se agrupam), e o administrador também pode mexer.
- **Precisa de definição:** o que recebe tag (evento, foto, vídeo?), se há grupos ou categorias de tags, se a lista é única para todos os fotógrafos e como a tag vira filtro para o visitante e para o pessoal do marketing.
- **Decidido (15/10):** tag = **filtro do evento**. O fotógrafo cria as tags que quiser ("Colação de jaleco", "Roga DX", ou genéricas como "Tecnologia" e "Esporte"), e o visitante filtra os eventos por elas.
  - Não há grupos de tags.
  - A **lista é única**: todos veem e usam todas as tags.
  - **Cada tag tem dono:** só quem a criou edita ou apaga, para ninguém apagar a tag do outro.
  - Suposição a confirmar: o administrador pode editar qualquer tag, para moderação.
  - Os nomes não se repetem: "Formatura" e "formatura" contam como iguais.

## 2.3 Contas e perfis

**Conta de marketing (itens 3 e 9) — M**

- **O que vira no sistema:** um perfil novo, "Marketing", que envia fotos e vídeos a eventos, como o fotógrafo.
- **Ponto de LGPD que precisa estar claro:** o visitante foi informado de que as imagens existem **só** para a própria pessoa se encontrar e não são usadas para outra finalidade (v1.6, declaração de finalidade única; LGPD Art. 6º, I).
  - **Marketing como quem produz conteúdo:** é compatível.
  - **Marketing usando o acervo para divulgação ou procurando pessoas:** é **finalidade nova**. Exige aviso novo ao visitante e uma base legal própria. A palavra final é do jurídico do CESMAC.
- **Decidido (15/10):** o marketing tem as **mesmas funções do fotógrafo**: cria evento, envia fotos e vídeos, publica e **baixa** o acervo para divulgação. A diferença é a identificação, por exemplo "Criado por Lucas Bezerra — Equipe de marketing". **Não há busca de alunos.**
- **Consequência de LGPD, a resolver na v2.0:** baixar fotos de evento para divulgação institucional é uma finalidade que a v1.6 diz que não existe ("não utilizadas para finalidade diversa"). A v2.0 precisa **declarar essa finalidade** no aviso ao visitante e na política de privacidade, por transparência (Art. 6º, VI). Qual é a base legal, e a questão do direito de imagem, cabem ao jurídico do CESMAC.
- **Fotos repetidas entre fotógrafo e marketing:**
  - o sistema já recusa **arquivo idêntico** no mesmo evento;
  - para não haver dois eventos iguais, o caminho é a **colaboração** (RF025): o marketing entra no evento do fotógrafo em vez de criar outro. O sistema pode avisar quando alguém criar um evento com nome e data parecidos com um que já existe.
  - Foto editada ou recomprimida não é idêntica. Reconhecer "quase iguais" é possível, mas fica para depois.

**Conta temporária para fotógrafo contratado (item 4) — M**

- **Decidido (15/10):** o **administrador** cria a conta, que vale **24 horas**, e as fotos enviadas por ela **só são publicadas depois que o administrador aprovar** (para barrar imagem imprópria).
- **O que vira no sistema:** uma conta com **data de validade**, presa a **um evento**. Ela entra pelo mesmo convite por e-mail e só pode enviar fotos àquele evento; a colaboração entre fotógrafos (RF025) já existe e serve de base. Ao vencer, a conta se desativa sozinha. As fotos ficam, com o crédito de quem fotografou.
- **LGPD:** o fotógrafo contratado trata dados pessoais em nome do CESMAC, então é um **operador** (Art. 39: trata "segundo as instruções fornecidas pelo controlador"). O contrato com ele deve dizer isso. Isso é parte da contratação, não do sistema; o sistema contribui limitando o acesso dele a um evento e a um prazo.

**Contas no aplicativo para todos os perfis (item 9):** entra com o aplicativo (seção 2.6).

## 2.4 Pessoas institucionais

**Página de pessoas institucionais com autorização por e-mail (item 11) — M**

- Esta é a etapa 4d, que já estava planejada (RF020 e RF021).
- **Novidade:** a autorização chega por **e-mail**. A pessoa recebe um link, lê o termo e confirma.
- A LGPD aceita consentimento "por escrito ou por outro meio que demonstre a manifestação de vontade" (Art. 8º), e cabe ao CESMAC provar que o obteve (Art. 8º, § 2º). Por isso o sistema guarda **qual texto foi aceito, quando e por qual link**. Rosto é dado sensível, então o consentimento tem de ser específico e destacado (Art. 11, I).
- **Ressalva:** se "assinar" tiver de ser **assinatura eletrônica** com valor legal, isso é decisão do jurídico do CESMAC.

**Busca automática no acervo ao autorizar (item 13) — M**

- **O que vira no sistema:** ao autorizar, o sistema procura a pessoa em **todo o acervo** e marca "pessoa institucional localizada" em cada foto, com o grau de semelhança. O RF021 já prevê a marcação automática na indexação. A busca no acervo inteiro é a única exceção permitida à regra "busca só dentro do evento", justamente por haver autorização.
- **Esclarecido (15/10):** depois que a pessoa autoriza, **toda foto nova** em que o sistema reconhecer o rosto dela é marcada como "pessoa institucional localizada" e entra sozinha na lista de fotos daquela pessoa. É exatamente a marcação automática que o RF021 (nota 3) já prevê.
- **Revogação:** ao revogar a autorização, as marcações e os vetores de referência somem em até 5 dias (RF020, nota 4).

## 2.5 Telas e navegação

| Item | O que fazer | Tamanho |
|---|---|---|
| 18. Voltar fácil | Botão "Voltar" visível em todas as telas internas, além da trilha "Eventos > Evento > Imagens > Imagem" | P |
| 12. Abrir a imagem do resultado | Visualizador em tela cheia com zoom, arrastar e setas para a próxima | P/M |
| 6. Resultado da busca facial | Grade com fotos maiores, que se adapta à largura da tela | M |
| 7. Filtros | Filtros novos do painel para fotógrafo e marketing, ligados às tags | M (depende das tags) |
| 17. Site como aplicativo web | Layout próprio para computador (hoje é o layout de celular esticado), seguindo o padrão do CITEC | G |

## 2.6 Aplicativo e apoio

- **Aplicativo móvel (itens 8 e 9) — G:** a base em Expo já é a mesma, então as regras e a API são reaproveitadas. O trabalho está nas telas no formato do celular (como no Figma), na câmera nativa e no login de todos os perfis.
- **Painel do armazenamento (item 16) — P/M:**
  - **o que mostra:** espaço usado por evento, por tipo (foto, vídeo, miniatura) e os maiores arquivos, lido direto do SeaweedFS;
  - **para quem:** só o administrador;
  - **LGPD:** mostra nomes de evento e tamanhos, **nunca** a imagem.
- **Tutorial por escrito (item 15) — P/M:** um guia por perfil (fotógrafo, administrador, marketing), com prints que não mostrem rostos de terceiros. Fica por último, para descrever as telas finais.

## 2.7 O que continua pendente de antes

- **4b** (temas, parâmetros e reindexação): está pronta e aguarda o seu teste. Vai mudar com as tags e a calibração.
- **4c** (tela de remoções do administrador, alerta de uso atípico, relatório — RF023, RF024, RNF14): **não foi pedida pela banca, mas é requisito**, e é ela que mantém a LGPD em pé (relatório para demonstrar conformidade).
- **Remover o botão temporário "Mostrar link"** antes de implantar.

# 3. Ordem proposta

A ordem segue as dependências. O reconhecimento vem primeiro porque calibração, pessoas
institucionais e vídeo dependem dele. Dentro de cada fase, o que é rápido e visível vem antes.

| Fase | O que entra | Por que nesta posição |
|---|---|---|
| **1. Ajustes rápidos** | Voltar fácil (18), zoom no visualizador (12), grade do resultado (6) | Pequenos, visíveis, e respondem às críticas da banca sobre a visualização |
| **2. Novo reconhecimento** | YuNet + SFace (5), falha segura, reindexação, índice de 128 | Base de tudo o que envolve rosto |
| **3. Calibração** | Área de calibração do administrador, limiar calibrado (14) | Sem calibrar, o SFace mostra fotos de terceiros: tem de vir antes de produção |
| **4. Tags e filtros** | Nova organização por tags, fotógrafo e admin (7) | Depende das decisões da seção 4 |
| **5. Contas** | Perfil marketing (3), conta temporária (4) | Independem do vídeo e preparam o envio de vídeo |
| **6. Pessoas institucionais** | Cadastro, autorização por e-mail, busca automática (11, 13) e a 4c | Já calibrado, a busca no acervo inteiro fica confiável |
| **7. Vídeo** | Prova de conceito → envio, conversão e reprodução (1) → reconhecimento em vídeo (2) | Maior risco técnico e de armazenamento |
| **8. Segurança da selfie** | Decisão sobre a galeria → prova de conceito → prova de vida (10) | Depende da decisão (a)/(b) da seção 2.1 |
| **9. Aplicativo e site** | Site como aplicativo web (17), aplicativo móvel (8, 9) | Quando as telas estiverem estáveis, para não refazer duas vezes |
| **10. Fechamento** | Painel do armazenamento (16), tutorial (15), remoção do botão temporário | Descrevem o sistema pronto |

**Documento de requisitos:** pela quantidade de mudanças (perfis novos, vídeo, reconhecimento
em vídeo, prova de vida, calibração), o documento será a **versão 2.0** (decidido em 15/10). O
documento é reescrito **depois** das respostas da seção 4 e **antes** das fases 4 a 9. As
fases 1 a 3 já estão cobertas pela v1.6 e podem começar logo.

# 4. Decisões que dependiam do Thiago — respondidas em 15/10

1. **Data da 2ª banca:** ainda sem data. Seguimos com calma, e o Thiago avisa quando houver data.
2. **Tags:** filtro de evento, sem grupos, lista única, cada tag editável só pelo dono (seção 2.2).
3. **Item 7:** filtro e tag são a mesma coisa (respondido no item 2).
4. **Item 13:** marcação automática das fotos novas da pessoa autorizada (seção 2.4).
5. **Item 10:** o envio pela galeria sai; a busca é só pela câmera.
6. **Marketing:** mesmas funções do fotógrafo, inclusive baixar para divulgação; a finalidade precisa ser declarada na v2.0.
7. **Conta temporária:** criada pelo administrador, vale 24 h, e as fotos passam por aprovação do administrador.
8. **Vídeo:** sem limites definidos ainda; estimativa de espaço na seção 2.2. O Prof. Mozart consegue mais armazenamento se o vídeo funcionar.
9. **Versão:** **2.0**.
