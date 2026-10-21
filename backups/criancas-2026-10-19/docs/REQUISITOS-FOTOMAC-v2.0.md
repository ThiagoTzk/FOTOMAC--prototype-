---
title: "Documento de Requisitos — FOTOMAC"
subtitle: "Plataforma de acervo fotográfico e audiovisual de eventos com busca por reconhecimento facial — Versão 2.0"
author: "Thiago José Camêlo Nunes"
date: "17 de outubro de 2026"
lang: pt-BR
---

**Centro Universitário CESMAC** — Bacharelado em Sistemas de Informação — Trabalho de Conclusão de Curso

| | |
|:----------------------------|:---------------------------------------------------|
| **Autor** | Thiago José Camêlo Nunes |
| **Orientador** | Prof. Wagner de Oliveira Lima Palmeira de Araujo |
| **Coordenador do Curso** | Prof. Mozart Melo |
| **Versão** | 2.0 — 17/10/2026 |
| **Local** | Maceió – AL, 2026 |

# 1. Introdução

Este documento especifica os requisitos do sistema ***FOTOMAC***. O FOTOMAC é uma plataforma web e móvel para publicar o acervo de fotografias e vídeos dos eventos do Centro Universitário CESMAC. Ele permite que a própria pessoa retratada recupere, por reconhecimento facial, as imagens em que aparece. Permite também que a equipe de marketing da instituição reúna e utilize esse acervo na divulgação institucional. O documento fornece aos desenvolvedores as informações necessárias para o projeto, a implementação, os testes e a homologação do sistema.

A versão 2.0 consolida as alterações decorrentes da primeira banca de avaliação e das reuniões posteriores com as partes interessadas. As principais são:

- a entrada da equipe de marketing e do fotógrafo contratado;
- o vídeo no acervo;
- a captura guiada com prova de vida na busca;
- a adoção definitiva do reconhecimento facial YuNet + SFace;
- a calibração pelo próprio sistema;
- o tratamento de eventos com crianças e adolescentes.

A seção 1.4 resume cada alteração. Nos requisitos, os marcadores **[Novo na v2.0]** e **[Alterado na v2.0]** indicam o que mudou em relação à versão 1.6.

## 1.1 Visão geral do documento

Além desta seção introdutória, as seções seguintes estão organizadas como descrito abaixo.

1. **Seção 2 – Descrição geral do sistema**: caracteriza o escopo, as partes interessadas, os usuários, o que não integra esta versão e as dependências técnicas.
2. **Seção 3 – Requisitos funcionais (casos de uso)**: especifica os casos de uso, com os campos, as regras de preenchimento, os atores, as entradas e as saídas de cada um.
3. **Seção 4 – Requisitos não funcionais**: especifica os requisitos de usabilidade, desempenho, confiabilidade, segurança, acurácia, armazenamento, conformidade legal, licenciamento e adequação a padrões.
4. **Seção 5 – Requisitos de segurança**: identifica os perigos relacionados aos requisitos e a solução correspondente.
5. **Seção 6 – Matriz de avaliação de risco**: classifica os perigos por probabilidade e severidade.
6. **Seção 7 – Matriz de rastreabilidade**: registra as dependências entre os requisitos funcionais.
7. **Seção 8 – Ponto de função**: mede o tamanho funcional do software.
8. **Seção 9 – Fases de entrega**: propõe o sequenciamento da construção e registra a situação de cada fase.
9. **Seção 10 – Métricas e critérios de aceite**: define os indicadores que verificam o atendimento dos requisitos.
10. **Seção 11 – Pendências abertas**: relaciona as decisões ainda não tomadas que condicionam a implementação.
11. **Seção 12 – Referências**: relaciona os documentos utilizados na confecção deste documento.

## 1.2 Convenções, termos e abreviações

### 1.2.1 Identificação dos requisitos

Por convenção, a referência a um requisito é feita pelo nome da subseção em que ele está descrito, seguido do seu identificador: *[nome da subseção. identificador do requisito]*. Por exemplo, o requisito funcional [Busca de Imagens por Reconhecimento Facial no Evento. RF016] está descrito na subseção de mesmo nome, no bloco identificado por [RF016]. Os requisitos não funcionais são identificados por [RNFnn] e os de segurança por [RSnnn].

Cada requisito tem identificador único. A numeração começa em [RF001], [RNF01] e [RS001] e é incrementada à medida que surgem novos requisitos. **Os identificadores da versão 1.6 foram preservados**, ainda que o conteúdo tenha mudado, para não romper as referências cruzadas e os documentos que já os citam. Os requisitos novos recebem os números seguintes.

### 1.2.2 Prioridades dos requisitos

Para estabelecer a prioridade dos requisitos, na seção 4, foram adotadas as denominações "essencial", "importante" e "desejável".

1. **Essencial** é o requisito sem o qual o sistema não entra em funcionamento. Requisitos essenciais são imprescindíveis e têm que ser implementados impreterivelmente.
2. **Importante** é o requisito sem o qual o sistema entra em funcionamento, mas de forma não satisfatória. Requisitos importantes devem ser implementados; se não forem, o sistema poderá ser implantado e usado mesmo assim.
3. **Desejável** é o requisito que não compromete as funcionalidades básicas do sistema. Requisitos desejáveis podem ser deixados para versões posteriores, caso não haja tempo hábil para implementá-los na versão especificada.

### 1.2.3 Termos específicos do domínio

1. **Evento**: registro institucional de um acontecimento, tal como semana acadêmica, formatura, competição ou apresentação cultural, ao qual se vincula um conjunto de mídias. É a unidade de organização do acervo e o único escopo possível da busca pública.
2. **Mídia** *(novo)*: designação comum às fotografias e aos vídeos do acervo. Toda mídia está obrigatoriamente vinculada a um evento.
3. **Imagem**: arquivo fotográfico do acervo, obrigatoriamente vinculado a um evento. Não recebe denominação individual.
4. **Vídeo** *(novo)*: arquivo audiovisual do acervo, obrigatoriamente vinculado a um evento, sujeito às mesmas regras de publicação, retenção e remoção aplicáveis às imagens.
4. **Formato bruto (RAW)** *(novo)*: arquivo de câmera não revelado (DNG, CR2, CR3, NEF, ARW e similares), aceito como original quando habilitado pelo administrador. Dele o sistema gera uma cópia em JPEG para exibição, indexação e download.
4. **Marca d'água institucional** *(novo)*: identificação "CESMAC" aplicada no canto inferior das fotografias baixadas pelo visitante, isto é, por quem baixa fora de uma conta do sistema. Os downloads feitos pelas contas (administrador, fotógrafo, marketing e fotógrafo contratado) não recebem marca, por serem de pessoas a serviço do CESMAC. O original guardado no acervo não recebe marca.
5. **Visitante**: pessoa que acessa a área pública do sistema para localizar as mídias em que aparece, sem possuir conta ou cadastro.
6. **Galeria privada**: característica da página do evento pela qual as mídias não são exibidas ao visitante antes da conclusão da busca por reconhecimento facial.
7. **Captura guiada** *(novo)*: forma de captura da referência do visitante na busca. A câmera do dispositivo registra uma sequência curta em que a pessoa olha para a frente e executa, em ordem sorteada, os movimentos indicados por uma figura animada. Do registro são extraídos apenas alguns quadros; a sequência completa não é enviada nem armazenada.
8. **Prova de vida** *(novo)*: verificação, feita no servidor sobre os quadros da captura guiada, de que o rosto executou os movimentos pedidos na ordem sorteada. Impede que uma fotografia impressa ou exibida em tela seja usada no lugar de uma pessoa real.
9. **Imagem de referência (autorretrato)** *(alterado)*: conjunto de quadros obtidos pela captura guiada e usado como critério da busca. Não pode ser selecionada da galeria do dispositivo. É descartada ao término do processamento.
10. **Vetor de características (embedding)**: representação numérica de dimensão fixa extraída de uma face detectada, utilizada exclusivamente para o cálculo de similaridade entre faces. É dado pessoal sensível de natureza biométrica, nos termos do Art. 5º, inciso II, da Lei nº 13.709/2018.
11. **Motor de reconhecimento facial** *(novo)*: conjunto formado pelo modelo de detecção de faces e pelo modelo de geração de vetores, com a respectiva configuração. Nesta versão, o motor de produção é o YuNet (detecção) com o SFace (vetores).
12. **Correspondência**: resultado que associa a referência do visitante a uma mídia indexada do acervo, acompanhado do grau de similaridade.
13. **Limiar de similaridade**: valor mínimo de semelhança entre dois vetores para que o sistema os considere da mesma pessoa. **Quanto mais alto o limiar, mais exigente é a comparação**: menos fotografias de terceiros são entregues e, em contrapartida, mais fotografias da própria pessoa deixam de ser encontradas.
14. **Falso positivo**: mídia retornada na qual a pessoa consultada não está presente.
15. **Falso negativo**: mídia na qual a pessoa consultada está presente, mas que não foi retornada.
16. **Calibração** *(novo)*: ajuste dos parâmetros com que o sistema usa o motor de reconhecimento facial — limiar, filtros de detecção e resolução —, medido por teste com pessoa de referência que consentiu. **Calibrar não é treinar**: os modelos não são alterados nem aprendem com os rostos do acervo.
17. **Teste de precisão do reconhecimento facial** *(novo)*: execução controlada da busca de uma pessoa de referência sobre um evento publicado, comparada com a marcação humana de onde ela realmente aparece, da qual resulta uma nota de 0 a 100 e as métricas de acerto. É o instrumento da calibração. Mede o acerto do reconhecimento, e não a qualidade ou a resolução das imagens.
18. **Crédito do autor**: assinatura ou identificação de quem capturou a mídia, exibida junto a toda mídia aberta.
19. **Titular**: pessoa natural a quem se referem os dados pessoais tratados, nos termos da Lei nº 13.709/2018. Neste sistema, são as pessoas retratadas nas mídias do acervo, o visitante que realiza a captura guiada e as pessoas institucionais cadastradas.
20. **Pessoa institucional**: pessoa em função de representação da instituição — coordenador, diretor ou servidor equivalente — que autorizou expressamente o uso da sua imagem e integra o cadastro restrito previsto no [RF020].
21. **Conferência**: exame do conjunto de mídias enviadas, no qual quem as enviou descarta pontualmente as que não devam integrar o acervo, antes da publicação.
22. **Responsável pelo evento** *(alterado)*: conta de fotógrafo ou de marketing que cadastrou o evento. É única por evento e detém as prerrogativas exclusivas previstas no [RF025]. Substitui a expressão "fotógrafo responsável" da versão 1.6.
23. **Colaborador**: conta de fotógrafo ou de marketing que, mediante liberação do responsável, envia mídias a evento cadastrado por outrem. Mantém o crédito individual e gerencia exclusivamente as mídias que enviou.
24. **Colaboração**: condição do evento pela qual contas diversas da do responsável ficam autorizadas a enviar mídias.
25. **Equipe de marketing** *(novo)*: setor do Centro Universitário CESMAC que produz fotografias e vídeos de eventos e utiliza o acervo publicado na divulgação institucional. Atua no sistema pelo perfil "Marketing".
26. **Fotógrafo contratado** *(novo)*: profissional sem vínculo com a instituição, contratado para cobrir determinado evento. Atua no sistema por conta temporária, nos termos do [RF031].
27. **Conta temporária** *(novo)*: conta com prazo de validade, vinculada a um único evento, criada pelo administrador para o fotógrafo contratado.
28. **Tema (tag)** *(alterado)*: rótulo com nome e ícone, criado por conta autenticada e atribuído aos eventos, que funciona como filtro na pesquisa pública. Os termos "tema", "tag" e "filtro" designam o mesmo elemento.
29. **Evento com menores de 18 anos** *(novo)*: evento destinado à participação de crianças ou adolescentes, tal como competição escolar ou visita de colégio. Depende do registro prévio da autorização dos responsáveis legais, nos termos do [RF032].
30. **Menor incidental** *(novo)*: criança ou adolescente que aparece em mídia de evento não destinado a menores, sem ser participante dele.
31. **Supressão de rosto (borrão)** *(novo)*: desfoque aplicado sobre o rosto no próprio arquivo, substituindo o original, de modo que o rosto não seja recuperável nem gere vetor de características.
32. **Marcação automática** *(alterado)*: assinalação, feita pelo sistema, de que uma pessoa institucional foi localizada em determinada imagem, com o respectivo grau de similaridade.
33. **Falha segura** *(novo)*: comportamento do sistema quando o motor de reconhecimento facial está indisponível. A busca é pausada com aviso, a fila de indexação aguarda sem consumir tentativas e as demais funções continuam operando. O sistema nunca troca de motor por conta própria.
34. **LGPD**: Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais.

## 1.3 Histórico de versões

| Versão | Data | Responsável | Alterações |
|:--:|:---|:---|:---|
| **1.0** | 10/04/2026 | Pedro Rosa | Documento de requisitos do produto (PRD) elaborado pelo responsável anterior pelo projeto. |
| **1.1** | 19/08/2026 | Thiago José Camêlo Nunes | Revisão integral. Denominação FotoMac; quatro perfis institucionais com conta; busca facial no acervo global e agrupada por evento. |
| **1.2** | 26/08/2026 | Thiago José Camêlo Nunes | Reformulação do modelo de acesso. Acesso público sem conta; galeria privada; busca restrita a um único evento; supressão da denominação individual das imagens; aviso obrigatório de permissão para uso de imagem. |
| **1.3** | 31/08/2026 | Thiago José Camêlo Nunes | Revisão decorrente de reunião de validação com o cliente. Cadastro de contas por convite; revisão e aprovação individual das imagens antes da indexação; envio direto da estação de trabalho; formato restrito a JPEG; limite de 1.000 imagens por evento; temas com seleção múltipla e filtros de data e período; créditos em tela e nos metadados; remoção em 72 horas com exclusão automática; cadastro e consulta de pessoas institucionais. |
| **1.4** | 31/08/2026 | Thiago José Camêlo Nunes | Senha provisória atribuída pelo administrador; armazenamento em serviço de objetos compatível com S3 na infraestrutura da instituição; avaliação comparativa de soluções de reconhecimento facial; exclusão do custeio de licenças e infraestrutura do escopo do projeto. |
| **1.5** | 01/09/2026 | Thiago José Camêlo Nunes | Ajuste ao volume operacional. Retenção de 6 meses; capacidade de 300 GB; conferência com descarte pontual e publicação do conjunto em ação única; situação Em Processamento; comando de descarte unificado; sinalização das imagens com remoção solicitada. |
| **1.6** | 22/09/2026 | Thiago José Camêlo Nunes | Colaboração de fotógrafos em um mesmo evento; ligação de definição de senha enviada ao e-mail institucional; supressão da estimativa automática de faixa etária; requisitos de parâmetros do reconhecimento facial, manutenção de temas e reindexação do acervo. |
| **2.0** | 17/10/2026 | Thiago José Camêlo Nunes | Revisão decorrente da primeira banca de avaliação e das reuniões com o cliente, a coordenação e a equipe de marketing. Reconhecimento facial definido como YuNet + SFace, por decisão institucional; troca de motor pelo painel do administrador, com falha segura; teste de precisão e calibração pelo próprio sistema; captura guiada com prova de vida e retirada do envio de foto pela galeria; perfil Marketing e conta temporária para fotógrafo contratado; vídeo no acervo e reconhecimento facial em vídeo, sujeito a prova de conceito; temas (tags) com ícone criados por fotógrafos e marketing; autorização por e-mail e marcação automática no acervo inteiro para pessoas institucionais; borrão manual de menores incidentais; eventos destinados a crianças e adolescentes suspensos até a validação da regra de autorização; solicitação de remoção iniciada somente na própria imagem localizada; painel de ocupação do armazenamento; site com leiaute próprio para computador e todas as funções de fotógrafo, marketing e fotógrafo contratado também no aplicativo; novos formatos de fotografia, inclusive formatos brutos (RAW) em caráter experimental; marca d'água institucional nos downloads do visitante e aviso de propriedade nos metadados, com os downloads das contas sem marca d'água; dados de identificação do fotógrafo contratado; aprovação em lote das mídias da conta temporária, com registro de quem aprovou; e-mail institucional obrigatório, exceto para o fotógrafo contratado; prova de vida decidida pelos giros laterais; exclusão de evento com prazo para desfazer, com o evento despublicado até nova publicação; envio de até 500 arquivos por operação e publicação por seleção na tela das mídias; nova aprovação quando o arquivo de mídia aprovada é substituído; avisos do painel (sino); proteção contra requisições de outra origem; risco residual da prova de vida declarado; teste de estimativa de idade retirado do sistema; meta de revocação revista para 80%; denominação FOTOMAC definitiva. |

## 1.4 Resumo das alterações da versão 2.0

| Tema | O que mudou | Requisitos |
|:---|:---|:---|
| **Reconhecimento facial** | O motor de produção passa a ser o **YuNet + SFace** (licenças livres para uso institucional), por decisão do CESMAC, com a configuração medida no Teste 1 do fotomac-lab (nota 89,5). O administrador troca o motor pelo painel; a troca restaura o limiar próprio do novo motor e reindexa o acervo. Na falta do motor, vale a falha segura. | RF010, RF026, RF028, RNF22, RNF26, RNF27 |
| **Calibração** | O administrador mede a precisão do reconhecimento pelo próprio sistema (teste de precisão), sobre eventos publicados, com uma pessoa de referência que consentiu, e obtém uma nota de 0 a 100 e o limiar de melhor desempenho. A meta de revocação foi revista para 80%, patamar medido do modelo, que é fixo. | RF029, RNF18 |
| **Busca pública** | A busca passa a usar **somente a câmera**, por captura guiada com movimentos em ordem sorteada e prova de vida. O envio de foto pela galeria sai. Dicas de captura aparecem antes de abrir a câmera. | RF015, RF016, RF017, RF036 |
| **Visualização** | Grade de resultados maior, visualizador com ampliação (zoom) e navegação, botão "Voltar" e trilha de navegação em todas as telas internas. | RF018, RNF28 |
| **Remoção** | A solicitação de remoção parte apenas da própria imagem localizada; a página avulsa de remoção sai. Quem não usou o sistema recorre ao encarregado pelo tratamento de dados. | RF022, RF023 |
| **Perfis** | Entram o perfil **Marketing** (mesmas funções do fotógrafo, com identificação própria e download para divulgação) e a **conta temporária** do fotógrafo contratado (24 horas a partir da definição da senha, um evento, mídias aprovadas pelo administrador, identificação por nome, CPF, data de nascimento e número do contrato). As mídias do fotógrafo contratado são aprovadas uma a uma ou em lote, e cada mídia guarda quem a enviou e quem a aprovou. E-mail do domínio institucional obrigatório para todos, exceto o fotógrafo contratado. | RF001, RF030, RF031 |
| **Vídeo** | Vídeos no acervo (MP4 e MOV), com remoção de localização, conversão para reprodução no navegador e miniatura. Reconhecimento facial em vídeo depende de prova de conceito. | RF034, RF035, RNF16 |
| **Formatos e downloads** | Além de JPEG, fotografias em PNG, HEIC e WebP e, em caráter experimental, formatos brutos de câmera (RAW). As fotografias baixadas pelo visitante levam marca d'água "CESMAC"; todo download leva aviso de propriedade e autoria nos metadados. Os downloads feitos pelas contas (equipe do CESMAC e fotógrafo contratado) saem sem marca d'água, e o original do acervo fica sem marca. | RF007, RF012, RF019, RF030 |
| **Temas (tags)** | Qualquer conta de fotógrafo ou marketing cria temas, com ícone, inclusive dentro do formulário do evento. Cada tema só é alterado por quem o criou ou pelo administrador. | RF004, RF027 |
| **Pessoas institucionais** | Autorização por e-mail; imagens de referência em mais de um ângulo; ao autorizar, a pessoa é procurada no acervo inteiro e passa a ser marcada nas novas imagens. | RF020, RF021 |
| **Crianças e adolescentes** | Eventos destinados a crianças e adolescentes ficam **suspensos** nesta versão, até que o orientador, a coordenação e a área jurídica validem a regra de autorização (seção 11). Menores que aparecem por acaso em outros eventos têm o rosto borrado manualmente. A estimativa automática de idade foi testada e descartada. | RF032, RF033, RF007, RF009 |
| **Exclusão de evento** | O responsável ou o administrador exclui o evento: ele sai do site e os dados de reconhecimento facial são apagados na hora; as mídias aguardam um prazo (7 dias, parâmetro), durante o qual a exclusão pode ser desfeita, e então são eliminadas. Desfeita a exclusão, o evento fica despublicado e só volta ao site quando publicado de novo. | RF006, RF026, RF038 |
| **Apoio** | Painel de ocupação do armazenamento para o administrador, tutorial escrito por perfil e avisos do painel (sino), que reúnem o que exige ação de cada conta. | RF037, RNF29, RNF31 |
| **Site e aplicativo** | O site ganha leiaute próprio para computador; o aplicativo segue o projeto do CITEC no Figma e passa a admitir todos os perfis: fotógrafo, marketing e fotógrafo contratado fazem pelo celular tudo o que fazem no site, inclusive cadastrar eventos e enviar mídias. | RNF08, RNF28 |

# 2. Descrição geral do sistema

## 2.1 Abrangência e sistemas relacionados

O sistema é a base institucional para publicar o acervo fotográfico e audiovisual dos eventos do Centro Universitário CESMAC e para que esse acervo seja recuperado pela própria pessoa retratada. Cada perfil o utiliza com um objetivo próprio:

- **fotógrafos institucionais** (de um a n, conforme a composição da equipe): cadastrar eventos, enviar mídias em qualidade original, acompanhar o envio, conferir e gerenciar o acervo produzido e extraí-lo em pacote quando necessário;
- **equipe de marketing**: as mesmas funções e, além delas, baixar o acervo publicado para a divulgação institucional;
- **fotógrafo contratado**: enviar, por prazo limitado, as mídias do evento para o qual foi contratado;
- **administrador**: gerenciar as contas, os parâmetros e o motor do reconhecimento facial, a calibração, as pessoas institucionais, as solicitações de remoção e a ocupação do armazenamento;
- **visitante** (qualquer pessoa que tenha participado de um evento): localizar o evento, realizar a captura guiada e obter exclusivamente as mídias em que aparece.

O sistema é composto por uma plataforma web e um aplicativo móvel que consomem a mesma interface de programação. A área pública é acessível sem conta nem cadastro. A área administrativa é restrita aos perfis autenticados.

- **Plataforma web**: possui leiaute próprio para computador. Quando acessada por telefone celular, recomenda a instalação do aplicativo.
- **Aplicativo móvel**: segue o projeto de interface do CITEC. Oferece as funcionalidades públicas e, aos perfis fotógrafo, marketing e fotógrafo contratado, todas as funções que eles têm na plataforma web, inclusive cadastrar eventos e enviar fotografias e vídeos.
- **Funções do administrador** (contas, parâmetros, calibração, pessoas institucionais e armazenamento): permanecem exclusivas da plataforma web.

A funcionalidade central do sistema é a busca por reconhecimento facial, sempre delimitada a um único evento previamente selecionado. A galeria de cada evento é privada: as mídias não são exibidas ao visitante antes da conclusão da busca, e o download restringe-se às mídias em que ele foi identificado. A referência da busca é obtida exclusivamente pela câmera, por captura guiada com prova de vida, o que impede o uso da fotografia de outra pessoa. Essa arquitetura é deliberada e constitui a principal salvaguarda da privacidade das pessoas fotografadas. Ela impede três coisas:

- a navegação livre pelo acervo;
- o rastreamento de uma pessoa entre eventos distintos;
- a busca por terceiros.

O acervo é constituído por etapas. Quem cobre o evento já faz a triagem do material no próprio equipamento e envia as mídias diretamente ao sistema. Em seguida, confere o conjunto recebido, descarta pontualmente o que não deva integrar o acervo e publica o restante em uma única ação. Somente as mídias publicadas são submetidas à indexação facial e disponibilizadas ao público. Assim, o material descartado jamais gera vetor biométrico. A instituição realiza de 35 a 40 eventos por mês, o que torna inviável exigir decisão individual sobre cada arquivo.

Um mesmo evento pode reunir a cobertura de mais de um profissional. O evento é cadastrado por uma única conta, que dele permanece responsável e pode liberar a colaboração das demais. Preserva-se o crédito individual de cada mídia e restringe-se a cada conta o gerenciamento das mídias que enviou.

Eventos destinados a crianças e adolescentes somente são publicados depois de registrada a autorização prévia dos responsáveis legais, coletada pela escola ou pela instituição. Crianças que aparecem por acaso em eventos não destinados a elas têm o rosto suprimido no próprio arquivo, por decisão humana.

Em caráter acessório, o sistema mantém cadastro restrito de pessoas em função de representação institucional que tenham autorizado expressamente o uso da sua imagem. Com ele, as contas autenticadas localizam pelo nome as imagens dessas pessoas em todo o acervo. Essa consulta é privativa dos perfis com conta e opera exclusivamente sobre pessoas previamente cadastradas e autorizadas. Toda consulta é registrada.

As mídias são mantidas em serviço de armazenamento de objetos. Os vetores de características são mantidos em base de dados com suporte a busca por similaridade vetorial, indexados por evento.

## 2.2 Partes interessadas

| Parte interessada | Papel |
|:---|:---|
| **Moacir Barbosa** | Fotógrafo institucional e cliente principal. Define a organização do acervo por temas. |
| **Centro Universitário CESMAC** | Controlador dos dados pessoais tratados (Art. 5º, VI, da LGPD). Decide sobre licenças, infraestrutura e operação. |
| **Equipe de marketing do CESMAC** | Produz fotografias e vídeos de eventos e utiliza o acervo na divulgação institucional. |
| **Prof. Mozart Melo** | Coordenador do curso. Acompanha o projeto e viabiliza a ampliação do armazenamento para vídeo. |
| **Prof. Wagner de Oliveira Lima Palmeira de Araujo** | Orientador do trabalho. |
| **Equipe do CITEC** | Responsável pelo projeto de interface (Figma). |

## 2.3 Descrição dos usuários

O sistema prevê cinco perfis de usuário. Quatro possuem conta, criada exclusivamente pelo administrador. O visitante acessa o sistema livremente, sem cadastro.

| Perfil | Descrição | Plataforma | Permissões |
|:--:|:---|:---|:---|
| **Administrador** | Responsável pela operação da plataforma — o autor do projeto e a equipe designada pela instituição. | Plataforma web, com conta | Todas as funcionalidades, inclusive contas, parâmetros e motor do reconhecimento facial, calibração, pessoas institucionais, aprovação das mídias de conta temporária, solicitações de remoção e painel do armazenamento. |
| **Fotógrafo** | Profissionais da instituição responsáveis pela cobertura dos eventos, em número de um a n. | Plataforma web e aplicativo móvel, com conta | Cadastrar, editar e excluir os eventos que criou; criar temas e editar os que criou; liberar a colaboração; enviar mídias aos eventos que criou e àqueles com colaboração liberada; conferir, descartar, borrar e excluir as mídias que enviou; publicar o conjunto e baixar o acervo em pacote nos eventos de que seja responsável; registrar a autorização de evento com menores; consultar pessoas institucionais. |
| **Marketing** *(novo)* | Integrantes da equipe de marketing do CESMAC. | Plataforma web e aplicativo móvel, com conta | As mesmas do fotógrafo, identificadas como "Equipe de marketing", e, adicionalmente, visualizar e baixar as mídias publicadas de qualquer evento para a divulgação institucional, sem marca d'água, conforme o [RF030]. |
| **Fotógrafo contratado** *(novo)* | Profissional externo contratado para um evento específico. Identifica-se por nome completo, CPF, data de nascimento e número do contrato. | Plataforma web e aplicativo móvel, com conta temporária | Enviar mídias exclusivamente ao evento vinculado, durante a validade da conta, e acompanhar a situação delas. As mídias só são publicadas após aprovação do administrador, conforme o [RF031]. |
| **Visitante** | Qualquer pessoa que tenha participado de um evento — aluno, servidor, docente, familiar ou público externo. Não possui conta nem cadastro. | Plataforma web e aplicativo móvel, sem conta | Pesquisar eventos; buscar suas mídias por reconhecimento facial com captura guiada; visualizar e baixar individualmente apenas as mídias em que foi identificado; solicitar a remoção de mídia localizada. |

## 2.4 Fora de escopo

Os itens a seguir não são exigidos nesta versão, podendo ser objeto de evoluções posteriores. O registro explícito evita divergência de expectativa entre as partes.

1. Conta, cadastro ou autenticação para o visitante; o acesso público é livre e não identificado.
2. Autocadastro de contas e autoatribuição de perfil; toda conta é criada pelo administrador, cabendo ao titular apenas a definição da própria senha, conforme o [RF001].
3. Busca pública no acervo integral, busca simultânea em vários eventos ou consulta pública que retorne a relação de eventos em que determinada pessoa aparece — excluídas como salvaguarda de privacidade.
4. Consulta por envio de fotografia de pessoa não constante do cadastro institucional; a consulta do [RF021] opera exclusivamente por seleção de pessoa cadastrada e autorizada.
5. Navegação livre pela galeria de um evento sem prévio reconhecimento facial.
6. Download do acervo completo por visitante, em pacote ou por seleção múltipla.
7. Guarda dos quadros da captura guiada ou de qualquer autorretrato para consultas futuras.
8. **Busca a partir de fotografia selecionada da galeria do dispositivo** *(novo)*. A referência é obtida apenas pela câmera, com prova de vida. O envio pela galeria existiu somente como recurso de teste do desenvolvimento e não integra o produto.
9. Denominação individual das mídias; apenas o evento recebe nome.
10. Envio de mídias a partir de repositório externo de armazenamento; o arquivo é transmitido diretamente do equipamento de quem cobriu o evento.
11. Formatos de arquivo diversos dos relacionados no [RF007] (fotografia: JPEG, PNG, HEIC/HEIF, WebP e, quando habilitados, formatos brutos de câmera; vídeo: MP4 e MOV), e a entrega de formato bruto ao visitante, que recebe sempre JPEG.
12. Marca d'água nos originais do acervo, nos downloads feitos pelas contas do sistema (inclusive pacotes e downloads para divulgação) e nos vídeos. A marca d'água institucional aplica-se apenas às fotografias baixadas pelo visitante ([RF019]).
13. Transmissão ao vivo, edição de vídeo e busca por voz ou por qualquer característica além do rosto.
14. **Treinamento ou retreinamento dos modelos de reconhecimento facial com os rostos do acervo** *(novo)*. Os rostos foram coletados para que cada pessoa encontre as próprias mídias; utilizá-los para treinar inteligência artificial seria finalidade não informada aos titulares (Art. 6º, I, da LGPD). O sistema apenas calibra a forma de uso dos modelos, conforme o [RF029].
15. **Estimativa automática de idade e detecção automática de menores** *(novo)*. O recurso de estimativa de idade do InsightFace foi testado em 16/10/2026 sobre um evento real com crianças e superestimou sistematicamente a idade delas, a ponto de criança ser estimada com mais de 50 anos. Foi descartado; a identificação de menores é humana, conforme os [RF032] e [RF033].
16. Detecção de mídias quase idênticas (editadas ou recomprimidas); o sistema recusa apenas arquivo idêntico no mesmo evento.
17. Identificação jurídica ou vinculação a cadastro civil da pessoa retratada; o sistema indica similaridade visual, não identidade legal.
18. Comercialização de mídias, processamento de pagamentos e emissão de documentos fiscais.
19. Publicação automática em redes sociais ou em outros canais de divulgação; a divulgação é feita pela equipe de marketing fora do sistema, a partir das mídias baixadas.
20. Custeio de licenças de software, de serviços de terceiros e de infraestrutura de execução, atribuição da instituição.
21. Dimensionamento do crescimento da infraestrutura para além do volume necessário à operação corrente, atribuição da instituição.
22. Definição da identidade visual, paleta de cores, tipografia e demais decisões de design, atribuídas à equipe do CITEC. Onde o projeto de interface não cobrir as funcionalidades desta versão, as telas são adaptadas no mesmo padrão visual.
23. Integração com o sistema institucional de contas do Centro Universitário CESMAC, prevista como evolução e contemplada apenas pelo isolamento do módulo de autenticação exigido no [RF001].
24. Assinatura eletrônica com certificação digital no consentimento das pessoas institucionais; o aceite por ligação enviada ao e-mail é registrado como prova, e a eventual exigência de assinatura qualificada é pendência da seção 11.
25. **Eventos destinados a crianças e adolescentes** *(novo)*, suspensos até a validação da regra de autorização dos responsáveis pelo orientador, pela coordenação e pela área jurídica ([RF032]; seção 11). Continua no escopo o borrão de menor que apareça por acaso em evento não destinado a menores ([RF033]).

## 2.5 Dependências e integrações

| Dependência | Papel no sistema |
|:---|:---|
| **Banco de dados relacional com suporte a busca vetorial** | Metadados de eventos, mídias, contas e pessoas institucionais, e busca por similaridade entre vetores, escopada por evento. Adotado: PostgreSQL com a extensão pgvector. |
| **Serviço de armazenamento de objetos compatível com S3** | Guarda das mídias em qualidade original, com acesso privado e entrega somente pela interface de programação. Executado em servidor próprio da instituição. Adotado: SeaweedFS. |
| **Motor de reconhecimento facial** | Detecção de faces e geração de vetores na indexação, na busca do visitante, na marcação de pessoas institucionais e na calibração. Adotado em produção: YuNet (detecção, licença MIT) com SFace (vetores de 128 dimensões, licença Apache 2.0), executados pela biblioteca OpenCV (licença Apache 2.0) em processador comum, sem unidade de processamento gráfico. |
| **Ferramenta de processamento de vídeo** *(novo)* | Extração de quadros, geração de miniatura, remoção de metadados de localização e conversão para formato reproduzível em qualquer navegador. Previsto: FFmpeg, em compilação de licença LGPL, a confirmar antes da adoção. |
| **Bibliotecas de conversão de imagem** *(novo)* | Leitura de HEIC/HEIF (libheif) e revelação padrão de formatos brutos de câmera (LibRaw), para gerar a cópia JPEG de exibição, indexação e download. Licenças LGPL, a confirmar antes da adoção. |
| **Fila de processamento assíncrono** | Indexação facial, testes de precisão, conversão de vídeos e geração de pacotes compactados, sem bloqueio das operações interativas. |
| **Serviço de envio de mensagens eletrônicas** | Ligações de definição de senha, notificações de expiração, solicitações de autorização das pessoas institucionais e comunicações das solicitações de remoção. |
| **Interface de programação REST versionada** | Contrato único consumido pela plataforma web e pelo aplicativo móvel, documentado em especificação OpenAPI. |

# 3. Requisitos funcionais (casos de uso)

Cada requisito traz a descrição do caso de uso, a relação de campos e elementos — com o número da observação que o detalha — e as regras e observações correspondentes.

## 3.1 Contas e acesso

### [RF001] Cadastro de Contas de Usuário — *[Alterado na v2.0]*

O sistema deve permitir que o administrador cadastre as contas de operação da plataforma. O próprio titular define a sua senha por meio de ligação de uso único encaminhada ao seu e-mail. Não existe autocadastro nem qualquer forma de criação de conta a partir da área pública.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Nome Completo | String, obrigatório, até 120 caracteres. | 1 |
| E-mail | String, obrigatório, até 100 caracteres, deve conter "@". | 2 |
| Perfil de Acesso | Seleção única entre "Administrador", "Fotógrafo", "Marketing" e "Fotógrafo contratado". | 3 |
| Assinatura do Autor | String, até 80 caracteres, exigida para os perfis "Fotógrafo", "Marketing" e "Fotógrafo contratado". | 4 |
| Evento Vinculado, Validade e Identificação | Exigidos para o perfil "Fotógrafo contratado": evento, validade, número do contrato, CPF e data de nascimento, conforme o [RF031]. | 10 |
| Ligação de Definição de Senha | Gerada pelo sistema no cadastro e encaminhada ao e-mail do titular. | 5 |
| Situação da Conta | Controlada pelo sistema: "Acesso Pendente", "Ativa", "Inativa", "Suspensa" ou "Expirada". | 6 |
| Relação de Contas | Lista todas as contas, com perfil e situação. | 7 |

**Regras e observações**

1. **Nome Completo** deve conter no mínimo duas palavras e é exibido nos registros de operações realizadas pela conta.
2. **E-mail** deve ser único no sistema. Para os perfis "Administrador", "Fotógrafo" e "Marketing", deve obrigatoriamente pertencer ao domínio institucional do CESMAC (cesmac.edu.br ou um subdomínio dele), e o sistema recusa outro domínio. Somente o "Fotógrafo contratado" usa e-mail pessoal, por não possuir vínculo institucional. É o identificador utilizado na autenticação.
3. **Perfil de Acesso**: o sistema prevê quatro perfis com conta. O visitante não possui conta nem cadastro, conforme a seção 2.3. A alteração de perfil é privativa do administrador e é registrada em log. A conta de "Fotógrafo contratado" não pode ser convertida em outro perfil.
4. **Assinatura do Autor** é o nome exibido como crédito nas mídias, conforme o [RF018], combinado automaticamente com a identificação da instituição. Para o perfil "Marketing", o crédito identifica também a equipe, conforme o [RF030]. Pode ser alterada posteriormente pelo próprio titular.
5. **Ligação de Definição de Senha**: a conta é criada sem senha.
    - O sistema envia ao e-mail informado uma ligação de uso único, com validade máxima de 24 horas, que conduz o titular à tela de definição da senha.
    - A senha é armazenada exclusivamente na forma de hash com algoritmo de derivação de chave (bcrypt ou Argon2).
    - Em nenhuma hipótese o sistema atribui, exibe ou transmite senha em texto claro, nem adota senha padrão comum a mais de uma conta.
    - Expirada a ligação sem utilização, o administrador pode emiti-la novamente.
6. **Situação da Conta**: a conta é criada em "Acesso Pendente", na qual não possui senha e não admite autenticação. Definida a senha, passa automaticamente a "Ativa". A situação "Expirada" aplica-se exclusivamente à conta temporária, ao término da validade.
7. **Relação de Contas** deve destacar as contas em "Acesso Pendente" e as contas temporárias com validade em curso, permitindo reemitir a ligação de definição de senha.
8. **Ausência de Autocadastro**: não existe, em nenhuma tela, funcionalidade que permita a criação de conta por iniciativa do interessado nem a autoatribuição de perfil.
9. **Integração Futura**: o módulo de autenticação é isolado das demais camadas, de modo a permitir a futura integração com o sistema institucional de contas sem alteração das regras de negócio.
10. **Conta Temporária**: o vínculo a um único evento, a validade e os dados de identificação seguem o [RF031].

### [RF002] Autenticação, Primeiro Acesso e Controle de Acesso — *[Alterado na v2.0]*

O sistema deve permitir que os usuários com conta se autentiquem, após a definição da própria senha no primeiro acesso, na plataforma web e no aplicativo móvel. O acesso às funcionalidades é controlado conforme o perfil, e as funcionalidades públicas permanecem acessíveis sem autenticação.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| E-mail | String, obrigatório, identificador de acesso. | 1 |
| Senha | String, obrigatória, mínimo de 8 caracteres. | 1, 2 |
| Definição de Senha no Primeiro Acesso | Nova senha com confirmação, acessível exclusivamente pela ligação do [RF001]. | 3 |
| Token de Sessão | Gerado pelo sistema, com prazo de validade definido. | 8 |
| Área Pública | Listagem de eventos, busca por reconhecimento facial, download das mídias autorizadas e solicitação de remoção. | 5 |
| Recuperação de Senha | Mensagem ao e-mail cadastrado com ligação de redefinição de validade limitada. | 6 |
| Registro de Tentativas | Contagem de tentativas consecutivas sem sucesso. | 7 |

**Regras e observações**

1. **Credenciais inválidas** geram mensagem genérica, sem indicar se o erro está no e-mail ou na senha, evitando a enumeração de contas.
2. **Senha** é conferida por comparação de hash. O sistema não é capaz de recuperar a senha original nem de exibi-la a qualquer perfil, inclusive ao administrador.
3. **Primeiro Acesso**: enquanto a conta estiver em "Acesso Pendente", a autenticação é impossível. A ligação recebida é invalidada imediatamente após o uso.
4. **Controle de Acesso no Servidor**: a verificação do perfil, da situação da conta e, para a conta temporária, da validade e do evento vinculado é aplicada obrigatoriamente no servidor, jamais apenas na interface. Requisições a rotas administrativas sem credencial válida são rejeitadas antes de qualquer processamento.
5. **Separação entre Área Pública e Administrativa**: as rotas públicas expõem exclusivamente as operações dos [RF013] a [RF019], [RF023] e [RF036]. É tecnicamente impossível criar evento ou enviar, aprovar, alterar ou excluir mídia sem autenticação.
6. **Recuperação de Senha**: ligação de uso único, com validade máxima de 30 minutos. Não se aplica à conta temporária, cuja nova ligação é emitida pelo administrador.
7. **Registro de Tentativas**: após 5 tentativas consecutivas sem sucesso, a conta é temporariamente bloqueada. O desbloqueio ocorre por e-mail de recuperação ou por ação do administrador.
8. **Encerramento de Sessão**: o token é regenerado a cada autenticação e invalidado no encerramento. A alteração de senha encerra todas as sessões ativas em outros dispositivos. Expirada a conta temporária, as suas sessões são encerradas imediatamente.
9. **Funções no Aplicativo Móvel**: fotógrafo, marketing e fotógrafo contratado dispõem no aplicativo de todas as funções que têm na plataforma web, inclusive cadastrar eventos e enviar mídias. As funções privativas do administrador (contas, parâmetros, motor e calibração do reconhecimento facial, pessoas institucionais, aprovação de mídias de conta temporária e painel do armazenamento) permanecem exclusivas da plataforma web.

### [RF003] Suspensão e Encerramento de Conta — *[Alterado na v2.0]*

O sistema deve permitir que o administrador altere a situação de uma conta, preservando a integridade dos registros e o histórico das operações realizadas.

| Situação ou elemento | Especificação | Obs. |
|---|---|:--:|
| Ativa | Apta a utilizar as funcionalidades compatíveis com o perfil. | 1 |
| Inativa | Temporariamente desabilitada; não autentica até ser reativada. | 1, 2 |
| Suspensa | Bloqueada por decisão administrativa ou descumprimento das políticas de uso. | 1, 2 |
| Expirada | Conta temporária cuja validade terminou; não pode ser reativada. | 6 |
| Registro da Alteração | Data, hora e administrador responsável. | 3 |

**Regras e observações**

1. **Controle de Acesso**: a alteração de situação é privativa do administrador, com confirmação explícita antes de efetivá-la.
2. **Preservação do Acervo**: a suspensão ou a inativação não exclui os eventos nem as mídias enviadas pela conta, nem suprime o crédito exibido, que permanecem vinculados ao acervo institucional.
3. **Registro da Alteração**: toda mudança de situação é registrada em log e comunicada ao titular por mensagem eletrônica.
4. **Exclusão Definitiva**: o sistema não permite a exclusão física de contas, preservando a rastreabilidade das operações sobre o acervo.
5. **Prerrogativas do Responsável**: suspensa ou inativada a conta do responsável por um evento, as prerrogativas exclusivas do [RF025] passam ao administrador. Assim, nenhum evento fica sem responsável apto a concluí-lo.
6. **Expirada**: a transição é automática ao término da validade da conta temporária e é irreversível. Nova cobertura pelo mesmo profissional exige nova conta temporária, conforme o [RF031].

## 3.2 Eventos

### [RF004] Cadastro de Evento — *[Alterado na v2.0]*

O sistema deve permitir que as contas de fotógrafo e de marketing cadastrem eventos, que são a unidade de organização do acervo e o escopo da busca pública.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Nome do Evento | String, obrigatório, até 150 caracteres (ex.: "Evento de Desenvolvedores Roga DX"). | 1 |
| Temas do Evento | Seleção múltipla, obrigatória, a partir da relação do [RF027]. Admite criar tema novo no próprio formulário. | 2 |
| Data do Evento | Obrigatória; dia exato, mês único ou intervalo de meses. | 3 |
| Local do Evento | String, obrigatório; campus, unidade ou espaço. | 4 |
| Descrição Breve | String, obrigatória, até 300 caracteres. | 5 |
| Imagem de Capa | Imagem JPEG, obrigatória. | 6 |
| Evento com Menores de 18 Anos | Booleano, obrigatório, declara se o evento é destinado à participação de crianças ou adolescentes; suspenso nesta versão, conforme o [RF032]. | 10 |
| Responsável pelo Evento | Preenchido automaticamente com a conta autenticada. | 7 |
| Identificação de Origem | Preenchida automaticamente conforme o perfil do responsável (ex.: "Criado por Lucas Bezerra — Equipe de marketing"). | 11 |
| Situação do Evento | Controlada pelo sistema: "Em Edição", "Em Processamento", "Publicado" ou "Expirado". | 8 |
| Data de Expiração do Acervo | Calculada a partir da data do evento. | 9 |

**Regras e observações**

1. **Nome do Evento** é único quando associado à mesma data. É o único elemento do acervo que recebe denominação atribuída por usuário. Ao cadastrar evento com nome e data semelhantes aos de evento existente, o sistema alerta e sugere a colaboração no evento existente, evitando duplicidade de cobertura e de armazenamento entre fotógrafos e marketing.
2. **Temas do Evento**: a seleção múltipla permite que um evento seja encontrado por mais de um tema. Se o tema desejado não existir, a conta o cria no próprio formulário, com nome e ícone, nos termos do [RF027], sem abandonar o cadastro.
3. **Data do Evento**: admite dia exato ("21/08/2026"), mês único ("Agosto/2026") ou intervalo de meses ("Junho a Agosto/2026"), exibida com a precisão informada. Em intervalos, o mês final não pode ser anterior ao inicial e a duração não pode ultrapassar 12 meses.
4. **Local do Evento** é exibido na listagem pública e pode ser usado como critério de filtro.
5. **Descrição Breve** é exibida na listagem e na página do evento.
6. **Imagem de Capa** é a única imagem do evento exibida publicamente sem reconhecimento facial, conforme o [RF014]. Recomenda-se imagem que não permita a identificação individual de participantes. Em evento com menores, é vedada capa em que se identifique criança ou adolescente.
7. **Responsável pelo Evento**: é único por evento. Um evento pode reunir mídias de autores diversos, na forma do [RF025], com o crédito individual de cada mídia. A edição do cadastro é privativa do responsável e do administrador. A conta temporária não cadastra eventos.
8. **Situação do Evento**: eventos "Em Edição" e "Em Processamento" são visíveis apenas ao responsável, aos colaboradores e ao administrador; eventos "Publicados" são acessíveis ao público; eventos "Expirados" deixam de ser exibidos e têm o acervo eliminado, conforme o [RF006].
9. **Data de Expiração do Acervo**: calculada conforme o prazo de retenção do [RNF12], contado da data do evento.
10. **Evento com Menores de 18 Anos**: requisito suspenso nesta versão ([RF032]). Quando reativado, marcada esta opção, a publicação fica condicionada ao registro da autorização prévia dos responsáveis legais, nos termos do [RF032]. A opção é exibida com texto explicativo sobre essa consequência.
11. **Identificação de Origem**: distingue, na área administrativa, os eventos criados pela equipe de marketing dos criados por fotógrafos, conforme o [RF030].

### [RF005] Edição de Evento e Manutenção do Acervo — *[Alterado na v2.0]*

O sistema deve permitir que o responsável pelo evento edite as informações do evento e inclua ou remova mídias a qualquer tempo, sem prejuízo das mídias já publicadas e indexadas.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Nome, Temas, Data, Local e Descrição | Editáveis, observadas as regras do [RF004]. | 1, 2, 3 |
| Evento com Menores de 18 Anos | Editável, com os efeitos do [RF032]; suspenso nesta versão, conforme o [RF032]. | 7 |
| Inclusão de Novas Mídias | Disponível enquanto o evento não estiver expirado. | 4 |
| Remoção de Mídias | Conforme o [RF011]. | 5 |
| Registro de Alterações | Data, hora, campo alterado e conta. | 6 |

**Regras e observações**

1. **Controle de Acesso**: a edição dos dados do evento é privativa do responsável e do administrador. O colaborador e a conta temporária não editam o cadastro do evento. Não existe alteração a partir da área pública.
2. **Temas do Evento** podem ser alterados a qualquer momento, inclusive após a publicação, refletindo-se imediatamente nos filtros públicos.
3. **Data do Evento**: a alteração recalcula a data de expiração, apresentada ao usuário antes da confirmação.
4. **Inclusão de Novas Mídias**: o evento recebe novas mídias a qualquer tempo enquanto não expirado, do responsável, dos colaboradores e da conta temporária vinculada. As mídias acrescentadas seguem o fluxo de envio, conferência, publicação e indexação, sem reprocessar o acervo existente.
5. **Remoção de Mídias**: cada conta remove apenas as mídias que enviou; o responsável e o administrador removem qualquer mídia do evento. A remoção elimina de forma consistente o arquivo, as versões derivadas, os metadados e os vetores, conforme o [RF011].
6. **Registro de Alterações**: todas as edições são registradas em histórico auditável.
7. **Alteração da Marcação de Menores**: marcar um evento já publicado como evento com menores retira-o imediatamente da área pública até o registro da autorização, conforme o [RF032]. A desmarcação é registrada em log com a conta responsável.

### [RF006] Controle de Situação e Expiração do Evento — *[Alterado na v2.0]*

O sistema deve controlar o ciclo de vida do evento, determinando a sua visibilidade pública e eliminando automaticamente o acervo ao término do prazo de retenção.

| Situação ou elemento | Especificação | Obs. |
|---|---|:--:|
| Em Edição | Em preparação e conferência. | 1 |
| Em Processamento | Mídias publicadas em fila de indexação, ainda indisponíveis ao público. | 2 |
| Publicado | Visível na área pública e apto a receber buscas. | 3 |
| Expirado | Deixou de ser exibido; acervo eliminado. | 4 |
| Aviso Prévio de Expiração | Notificação ao responsável e a todos os autores com mídias publicadas no evento. | 5 |
| Abrangência da Remoção | Mídias, versões derivadas, vetores e metadados. | 6 |
| Registro da Operação | Data, hora, evento e quantidade de itens removidos. | 7 |

**Regras e observações**

1. **Em Edição** é atribuída na criação do evento e mantida durante a conferência do [RF009].
2. **Em Processamento** decorre da publicação. O sistema exibe o percentual de conclusão da indexação e passa automaticamente a "Publicado" ao término, evitando resultados incompletos ao público.
3. **Publicado**: somente eventos nesta situação constam da listagem pública e admitem busca. Evento com menores sem autorização registrada não alcança esta situação, conforme o [RF032].
4. **Expirado**: transição automática e irreversível ao término do prazo de retenção, executada em rotina automática e auditável.
5. **Aviso Prévio de Expiração**: enviado com, no mínimo, 30 dias de antecedência, informando a data e recomendando a extração prévia do material pelo download em pacote do [RF012]. Decorrido o prazo, a eliminação é automática e o sistema não mantém cópia.
6. **Abrangência da Remoção**: nenhum vetor, versão derivada (prévia, miniatura, vídeo convertido) ou metadado permanece após a remoção do objeto correspondente.
7. **Registro da Operação** é preservado após a remoção, como prova do cumprimento da política de retenção.
8. **Ausência de Encerramento**: não existe situação "encerrado". O evento publicado continua apto a receber mídias enquanto não expirar.
9. **Exclusão Antecipada**: o responsável ou o administrador podem excluir o evento antes da expiração, conforme o [RF038].

## 3.3 Mídias

### [RF007] Envio de Mídias em Lote — *[Alterado na v2.0]*

O sistema deve permitir que as contas de fotógrafo, de marketing e temporária enviem fotografias e vídeos vinculados a um evento, diretamente do seu equipamento (computador ou celular, pela plataforma web ou pelo aplicativo), validando o formato e o tamanho de cada arquivo. As mídias não recebem denominação individual e ingressam no sistema pendentes de conferência.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Evento de Destino | Eventos do próprio responsável, eventos com colaboração liberada ([RF025]) ou, para a conta temporária, o evento vinculado. | 1 |
| Formato do Arquivo | Fotografia: JPEG, PNG, HEIC/HEIF ou WebP; formatos brutos de câmera (DNG, CR2, CR3, NEF, ARW e similares) quando habilitados pelo administrador. Vídeo: MP4 ou MOV. | 2, 13 |
| Tamanho Máximo por Arquivo | Fotografia: até 25 MB; formato bruto: até 100 MB. Vídeo: tamanho e duração parametrizáveis pelo administrador ([RF026]). | 3 |
| Quantidade Máxima por Evento | Até 1.000 mídias por evento, somadas fotografias e vídeos. | 4 |
| Quantidade Máxima por Lote | Até 500 arquivos por operação, sem limite de operações. | 5 |
| Identificação da Mídia | Gerada pelo sistema, aleatória, sem denominação por usuário. | 6 |
| Crédito do Autor | Atribuído a partir da assinatura da conta que enviou. | 7 |
| Situação Inicial da Mídia | "Em Conferência" ou, para conta temporária, "Aguardando Aprovação". | 8 |
| Advertência quanto a Menores de Idade | Texto destacado, exibido antes do início da transmissão. | 12 |

**Regras e observações**

1. **Evento de Destino**: toda mídia está vinculada a um único evento. Não existe acervo desvinculado nem envio a partir de repositório externo.
2. **Formato do Arquivo**: verificado pela assinatura binária do arquivo, não apenas pela extensão.
3. **Tamanho Máximo**: o limite de fotografia considera imagens de alta qualidade já editadas e exportadas. O limite dos formatos brutos depende da capacidade de armazenamento ([RNF16]). Os limites de vídeo dependem da prova de conceito do [RF034] e da ampliação do armazenamento, conforme a seção 11.
4. **Quantidade Máxima por Evento**: limite estabelecido com folga em relação ao volume praticado, de 100 a 500 fotografias por evento, a que se somam os vídeos e os envios da equipe de marketing. Fotografia e vídeo contam igualmente como mídia.
5. **Quantidade Máxima por Lote**: ampliada de 300 para 500 arquivos em 17/10/2026, para que a cobertura de um evento caiba em uma ou duas operações. O envio é resiliente e retoma a transmissão após interrupção da conexão, sem reenviar os arquivos concluídos.
6. **Identificação da Mídia**: aleatória e não sequencial, impedindo a enumeração do acervo.
7. **Crédito do Autor**: vinculado a cada mídia no envio, permitindo que um evento reúna autores distintos com o crédito correto.
8. **Situação Inicial**: nenhuma mídia é indexada nem exibida ao público antes da publicação do [RF009]. As mídias enviadas por conta temporária dependem, além disso, da aprovação do administrador, conforme o [RF031].
9. **Preservação da Qualidade**: o original é armazenado na qualidade e no formato recebidos, sem recompressão, e é o que integra o pacote de guarda do [RF012]. As fotografias baixadas pelo visitante são cópias com marca d'água, conforme o [RF019]. Para vídeo, a cópia convertida para reprodução no navegador é guardada separadamente do original.
10. **Deduplicação**: o sistema calcula a soma de verificação de cada arquivo e recusa arquivo idêntico já existente no mesmo evento.
11. **Remoção de Metadados**: os metadados de geolocalização são removidos das fotografias e dos vídeos armazenados e dos arquivos entregues no download, preservando-se data, hora e dados técnicos de captura.
12. **Advertência quanto a Menores de Idade**: antes de cada envio, o sistema lembra a conta de conferir a presença de pessoas menores de 18 anos. Em evento com menores, recorda que a publicação depende da autorização do [RF032]. Nos demais eventos, recorda que o rosto de menor incidental deve ser suprimido, pela ferramenta do [RF033] ou no próprio arquivo antes do envio. A triagem é humana; o sistema não estima idade.
13. **Formatos Diversos de JPEG**: para fotografias em PNG, HEIC/HEIF, WebP ou formato bruto, o sistema gera uma cópia em JPEG de alta qualidade, usada para exibição, indexação facial e download. O formato bruto é revelado com os ajustes padrão da câmera, sem edição; quem quiser entregar a fotografia editada envia o arquivo exportado. Os formatos brutos são habilitados pelo administrador ([RF026]) somente se houver espaço de armazenamento, e o recurso pode ser desabilitado sem prejuízo das mídias já enviadas.

### [RF008] Acompanhamento do Envio e Tratamento de Falhas — *[Alterado na v2.0]*

O sistema deve exibir, durante o envio, a relação de todas as mídias em transmissão e o resultado individual de cada arquivo, notificando de forma inequívoca as que não puderam ser processadas.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Relação das Mídias em Envio | Lista com pré-visualização e situação individual. | 1 |
| Indicador de Progresso | Percentual por arquivo e para o conjunto. | 2 |
| Notificação de Falha | Aviso destacado, com pré-visualização e a mensagem "Esta mídia não conseguiu ser renderizada ou enviada". | 3 |
| Motivo da Falha | Formato não permitido, tamanho ou duração excedidos, arquivo corrompido, limite do evento atingido, falha de transmissão ou de conversão. | 4 |
| Reenvio Individual | Reenvia apenas os arquivos com falha. | 5 |
| Resumo da Operação | Quantidade de arquivos com sucesso e com falha. | 6 |

**Regras e observações**

1. **Relação das Mídias em Envio**: carregamento progressivo em lotes extensos, sem aguardar a conclusão do lote.
2. **Indicador de Progresso**: a falha de um arquivo não interrompe os demais. Para vídeo, o progresso inclui a etapa de conversão, executada em segundo plano após a transmissão.
3. **Notificação de Falha**: identifica a mídia pela pré-visualização, já que os arquivos não têm nome no sistema.
4. **Motivo da Falha**: em português, em linguagem compreensível, sem detalhes técnicos internos.
5. **Reenvio Individual**: disponível ao término da operação.
6. **Registro de Falhas**: em log técnico, com arquivo, evento e causa.

### [RF009] Conferência e Publicação das Mídias — *[Alterado na v2.0]*

O sistema deve exibir o conjunto das mídias enviadas para conferência, permitindo o descarte pontual e a publicação do conjunto remanescente em uma única operação, sem exigir decisão individual sobre cada arquivo.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Painel de Conferência | Grade de miniaturas das mídias enviadas e não publicadas. | 1 |
| Ampliação da Mídia | Abre a mídia para exame detalhado. | 2 |
| Comando de Descarte | Na miniatura e na visualização ampliada. | 3 |
| Sinalização de Atenção | Indicação visual das mídias que demandam conferência específica. | 4 |
| Publicação do Conjunto | Ação única que encaminha à indexação todas as mídias prontas ou apenas as selecionadas. | 5 |
| Reversão do Descarte | Disponível até a publicação. | 6 |
| Substituição de Arquivo e Supressão de Rosto | Substituição por versão editada ou borrão de rostos pela ferramenta do [RF033]. | 7 |
| Resumo da Operação | Quantidade de mídias enviadas, descartadas e publicadas. | 8 |

**Regras e observações**

1. **Painel de Conferência**: a triagem principal ocorre no equipamento de quem cobriu o evento; o painel corrige envios indevidos. Considerando 35 a 40 eventos por mês, não se exige decisão individual sobre cada mídia.
2. **Ampliação da Mídia**: permite navegar sequencialmente entre as mídias sem retornar à grade, com ampliação (zoom) e botão de retorno visível.
3. **Comando de Descarte**: o mesmo comando atende à conferência, à exclusão de mídia publicada e às solicitações de remoção do [RF023]. Cada conta o utiliza sobre as mídias que enviou; o responsável e o administrador, sobre todas as mídias do evento.
4. **Sinalização de Atenção**: são assinaladas as mídias com remoção solicitada ([RF023]), as que aguardam aprovação do administrador ([RF031]) e, em evento sem menores, as ainda não conferidas quanto a menor incidental ([RF033]). O painel identifica o autor de cada mídia.
5. **Publicação do Conjunto**: privativa do responsável e do administrador, por ser o ato que submete as mídias à geração de dado pessoal sensível. Somente após a publicação as mídias são indexadas ([RF010]). Mídias descartadas não geram vetor em nenhuma hipótese. A publicação é recusada em três situações:
    - evento com menores sem autorização registrada ([RF032]);
    - mídias de conta temporária ainda não aprovadas pelo administrador ([RF031]), que permanecem fora do conjunto publicado;
    - mídias de vídeo cuja conversão não terminou.

    A publicação é feita na própria tela das mídias do evento, de uma só vez (todas as prontas) ou por seleção; as não selecionadas permanecem em conferência. Na página do evento, a visão geral reúne o cadastro, a edição e a exclusão do evento; o envio, a conferência e a publicação ficam na aba das mídias.
6. **Reversão do Descarte**: a mídia descartada é recuperável durante a conferência; a exclusão torna-se definitiva com a publicação.
7. **Supressão de Rosto**: aplicada no próprio arquivo, e não por sobreposição na interface, de modo que o rosto não permaneça recuperável nem seja detectado na indexação. Pode ser feita antes do envio, por substituição do arquivo ou pela ferramenta de borrão do [RF033], que também se aplica após a publicação.
8. **Resumo da Operação**: apresentado ao término da publicação e registrado em log.

### [RF010] Detecção e Indexação Facial das Mídias — *[Alterado na v2.0]*

O sistema deve processar as mídias publicadas, detectando as faces com o motor de reconhecimento facial ativo, gerando os vetores de características e armazenando-os indexados por evento.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Mídia de Origem | Restrita a mídias publicadas ([RF009]). | 1 |
| Faces Detectadas | Quantidade de faces identificadas. | 2 |
| Vetor de Características | Vetor numérico de dimensão fixa por face (128 dimensões no SFace). | 3 |
| Escopo de Indexação | Vincula todo vetor ao evento de origem. | 4 |
| Grau de Confiança da Detecção | Confiança da detecção da face. | 5 |
| Situação do Processamento | "Pendente", "Processada", "Sem faces detectadas" ou "Falha". | 6 |
| Versão do Modelo | Identificação do motor e da configuração, registrada a cada indexação. | 7 |
| Configuração de Referência | Configuração do motor medida no Teste 1 do fotomac-lab. | 9 |

**Regras e observações**

1. **Condição de Ingresso**: somente mídias publicadas são indexadas. Impede que mídias descartadas, inclusive com menores, gerem dado biométrico. Para fotografias em formato diverso de JPEG, a indexação usa a cópia JPEG do [RF007] nota 13.
2. **Processamento Assíncrono**: em fila, sem bloquear a conferência de outros eventos. Concluída a indexação, o evento passa a "Publicado" ([RF006]). Para vídeo, aplica-se o [RF035].
3. **Vetor de Características**: o sistema armazena exclusivamente a representação vetorial da face, sem recortes de rosto além da própria mídia publicada. O vetor é dado pessoal sensível (Art. 5º, II, da LGPD).
4. **Escopo de Indexação**: a busca pública compara apenas vetores do mesmo evento; a comparação entre eventos é tecnicamente vedada. A restrição atende ao princípio da finalidade (Art. 6º, I, da LGPD) e impede que a base se converta em índice de identificação geral. A única exceção é a marcação de pessoas institucionais do [RF021], limitada a quem autorizou expressamente esse tratamento.
5. **Grau de Confiança**: faces abaixo do limiar de confiança configurado são descartadas, sem gerar vetor, reduzindo detecções espúrias e pessoas ao fundo.
6. **Sem faces detectadas**: a mídia permanece no acervo, mas não é recuperável por nenhum visitante, já que o único acesso público é a busca do [RF016]. É o caso, por exemplo, de mídia cujos rostos foram borrados ([RF033]).
7. **Versão do Modelo**: identifica quais vetores foram gerados por qual motor e configuração, viabilizando a reindexação seletiva do [RF028].
8. **Reprocessamento**: mídias em "Falha" são reprocessadas automaticamente em até 3 tentativas, com intervalo progressivo, e depois sinalizadas. Quando a falha decorre da indisponibilidade do motor, aplica-se a falha segura ([RNF27]): a fila aguarda sem consumir tentativas.
9. **Configuração de Referência**: o motor YuNet + SFace deve operar com a mesma configuração que obteve a nota 89,5 no Teste 1 do fotomac-lab:
    - imagem reduzida a 1.920 pixels no maior lado;
    - supressão de detecções sobrepostas em 0,3;
    - até 5.000 candidatos por imagem;
    - lado mínimo de face de 10 pixels;
    - confiança mínima de 0,5;
    - alinhamento da face pelos cinco pontos de referência;
    - normalização do vetor.

    Os arquivos dos modelos são conferidos por soma de verificação antes do uso. A paridade foi comprovada em 16/10/2026: as 302 faces de referência geraram vetores idênticos aos do fotomac-lab. Variantes de maior resolução (2.560 e 3.840 pixels) foram medidas e não trouxeram ganho.

### [RF011] Gerenciamento e Exclusão de Mídias — *[Alterado na v2.0]*

O sistema deve permitir que as contas autenticadas acompanhem, confiram e removam as mídias do acervo, em qualquer situação do ciclo de vida, nos limites do seu perfil.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Relação de Mídias | Miniatura, tipo (foto ou vídeo), data de envio, crédito e situação. | 1 |
| Filtro por Situação | "Em Conferência", "Aguardando Aprovação", "Publicada", "Descartada", "Sem faces detectadas", "Falha", "Remoção Solicitada", "Rosto Borrado". | 2 |
| Filtro por Autor e por Tipo | Restringe a relação às mídias de um autor ou a fotos ou vídeos. | 2 |
| Conferência do Acervo | Abre qualquer mídia do evento para verificação. | 3 |
| Exclusão de Mídia | Individual ou em lote. | 4 |
| Reprocessamento Manual | Submete novamente a mídia publicada à indexação. | 5 |
| Estatísticas do Acervo | Total por situação, faces indexadas e percentual de conclusão. | 6 |

**Regras e observações**

1. **Controle de Acesso**: cada conta gerencia as mídias que enviou; o responsável e o administrador gerenciam todas as do evento; a equipe de marketing visualiza as mídias publicadas de qualquer evento, conforme o [RF030], sem poder excluí-las se não for autora ou responsável. Nada disso é exposto na área pública.
2. **Filtros**: localizam rapidamente as mídias que exigem atenção, com destaque visual próprio para as que têm remoção solicitada.
3. **Conferência do Acervo**: única hipótese de visualização integral das mídias de um evento sem reconhecimento facial, justificada pela conferência técnica e restrita aos perfis com conta.
4. **Exclusão de Mídia**: usa o comando de descarte do [RF009] e remove de forma consistente o objeto, as versões derivadas, os metadados e os vetores. Mídia publicada exige confirmação; a exclusão em lote informa antes a quantidade.
5. **Reprocessamento Manual**: limitado a 3 solicitações por mídia em 24 horas.
6. **Estatísticas do Acervo**: atualizadas automaticamente, sem recarregar a página.

### [RF012] Download do Acervo em Pacote — *[Alterado na v2.0]*

O sistema deve permitir que as contas autorizadas baixem as mídias publicadas de um evento em arquivo compactado, para conferência técnica, guarda do material e, no caso da equipe de marketing, divulgação institucional. A funcionalidade é vedada ao público.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Perfis Autorizados | Responsável pelo evento, "Marketing" (qualquer evento publicado) e "Administrador". | 1 |
| Formato do Pacote | Arquivo ZIP. | 2 |
| Estrutura do Pacote | Arquivo e pasta únicos com o nome do evento, sem subdivisões. | 3 |
| Geração Assíncrona | Em segundo plano, com aviso de conclusão. | 4 |
| Endereço de Download | Assinado, de validade reduzida. | 5 |
| Registro da Operação | Data, hora, conta, perfil e evento. | 6 |
| Pacote do Autor | Para colaborador e conta temporária: somente as mídias publicadas que a própria conta enviou. | 7 |

**Regras e observações**

1. **Perfis Autorizados**: a funcionalidade nunca é exposta na área pública. O visitante obtém apenas as mídias em que aparece, individualmente ([RF019]).
    - O acervo produzido na cobertura dos eventos pertence ao CESMAC. Por isso, o responsável e o administrador acessam a sua totalidade.
    - A equipe de marketing acessa as mídias publicadas de qualquer evento, exclusivamente para a divulgação institucional declarada no [RF022] e no [RF030].
    - O colaborador não baixa o acervo integral, que reúne obras de terceiros.
    - A titularidade institucional não afeta os direitos morais do autor (Lei nº 9.610/1998): o crédito permanece em cada mídia, na tela e nos metadados, ainda que a conta do autor seja suspensa, inativada ou expirada.
2. **Formato do Pacote**: o pacote de guarda do responsável, do autor e do administrador reúne os originais, no formato recebido (inclusive formato bruto), sem recompressão e sem marca d'água, com créditos nos metadados e sem geolocalização. O pacote baixado pela equipe de marketing para divulgação reúne as cópias JPEG, sem marca d'água e com o aviso de propriedade nos metadados, conforme o [RF030].
3. **Estrutura do Pacote**: uma única pasta com o nome do evento.
4. **Geração Assíncrona**: informa antes o volume estimado do arquivo.
5. **Endereço de Download**: validade máxima de 30 minutos, vinculado à conta que o solicitou.
6. **Registro da Operação**: trilha de auditoria obrigatória, identificando qual conta extraiu quais mídias de qual evento e quando.
7. **Pacote do Autor**: destina-se à guarda própria do material, sobretudo diante do aviso de expiração ([RF006]). O arquivo recebe o nome do evento acrescido da assinatura do autor.
8. **Mídias Removidas**: mídias excluídas, expiradas ou com remoção solicitada não integram pacotes gerados depois do pedido.

## 3.4 Acesso público e busca

### [RF013] Listagem e Pesquisa Pública de Eventos — *[Alterado na v2.0]*

O sistema deve exibir publicamente, sem autenticação, a relação dos eventos publicados, permitindo localizá-los por pesquisa textual e por filtros, na plataforma web e no aplicativo móvel.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Pesquisa por Nome do Evento | Busca textual parcial, sem distinção de maiúsculas, minúsculas e acentuação. | 1 |
| Imagem de Capa | Exibida em cada item. | 2 |
| Nome, Data e Local | Conforme o [RF004]. | 3 |
| Filtro por Tema | Seleção múltipla, com nome e ícone de cada tema ([RF027]). | 4 |
| Filtro por Data | Dia exato. | 5 |
| Filtro por Período | Intervalo de meses. | 5 |
| Quantidade de Mídias | Total de fotografias e de vídeos publicados. | 6 |
| Ordenação e Paginação | Carregamento por páginas. | 7 |

**Regras e observações**

1. **Pesquisa por Nome**: tolera diferenças de acentuação e erros ortográficos simples.
2. **Imagem de Capa**: única imagem exibida publicamente sem reconhecimento facial, observado o [RF004].
3. **Nome, Data e Local**: data exibida com a precisão cadastrada.
4. **Filtro por Tema**: usa a relação única do [RF027], com o ícone escolhido por quem criou o tema. Admite combinar temas. A apresentação deve continuar legível com o crescimento da quantidade de temas.
5. **Filtros de Data e Período**: consideram a data do evento, não a data de envio, e combinam-se com o filtro por tema.
6. **Quantidade de Mídias**: conta apenas as mídias publicadas, sem exibi-las.
7. **Paginação**: no máximo 20 eventos por página.
8. **Visibilidade**: apenas eventos "Publicados". Eventos em outra situação não constam da listagem nem são acessíveis por endereço direto.
9. **Leiaute**: na plataforma web, a listagem usa leiaute próprio para computador, aproveitando a largura da tela. Acessada por telefone celular, a plataforma web exibe aviso recomendando o aplicativo móvel, sem impedir o uso.

### [RF014] Página do Evento com Galeria Privada — *[Alterado na v2.0]*

O sistema deve apresentar a página de cada evento publicado sem exibir as suas mídias. A página informa que a galeria é privada e que o acesso depende da busca por reconhecimento facial.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Identificação do Evento | Nome, data, local, temas e descrição. | 1 |
| Quantidade de Mídias | Total de fotografias e de vídeos publicados. | 2 |
| Crédito do Evento | Autores da cobertura e instituição. | 3 |
| Aviso de Galeria Privada | Explica que é necessária a busca para visualizar as mídias. | 4 |
| Acesso à Busca | Conduz ao fluxo dos [RF015], [RF036] e [RF016]. | 5 |
| Aviso de Uso Responsável | Permanente, conforme o [RF022]. | 6 |
| Trilha de Navegação e Botão Voltar | Indicam onde o visitante está e permitem retornar com um toque. | 7 |

**Regras e observações**

1. **Vedação à Exibição do Acervo**: em nenhuma hipótese as mídias são exibidas antes da conclusão da busca, nem em miniatura, amostra, prévia ou rolagem parcial. A vedação é assegurada no servidor, não apenas na interface.
2. **Quantidade de Mídias**: não compromete a privacidade e ajuda o visitante a estimar a relevância da busca.
3. **Crédito do Evento**: respeita os direitos autorais sobre a obra.
4. **Aviso de Galeria Privada**: claro e direto.
5. **Acesso à Busca**: só se inicia após a manifestação de ciência do [RF015].
6. **Endereços das Mídias**: as rotas que servem mídias exigem resultado de busca válido na sessão do visitante.
7. **Navegação**: a página exibe trilha e botão "Voltar" visíveis, conforme o [RNF28].

### [RF015] Permissão para Uso de Imagem — *[Alterado na v2.0]*

O sistema deve apresentar ao visitante, antes de abrir a câmera, aviso destacado que solicita a sua permissão para o uso da imagem e informa de que modo ela será tratada, em atendimento à Lei nº 13.709/2018.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Momento da Exibição | Obrigatoriamente antes da abertura da câmera. | 1 |
| Título do Aviso | Identifica a solicitação de permissão para uso de imagem. | 2 |
| Declaração de Prioridade à Privacidade | Informa que a privacidade é prioridade e que os dados seguem a LGPD. | 2 |
| Explicação do Uso da Imagem | Finalidade, escopo, captura guiada, prova de vida, descarte e não transferência a terceiros. | 2, 3 |
| Advertência quanto a Menores de Idade | Uso por menor de 18 anos e busca de menor dependem do responsável legal. | 4 |
| Remissão à Política de Privacidade | Ligação para a política e para as informações sobre a LGPD. | 5 |
| Manifestação de Ciência | Ação afirmativa explícita: "Estou ciente". | 6 |
| Registro da Manifestação | Data, hora, evento e versão do texto apresentado. | 7 |

**Regras e observações**

1. **Momento da Exibição**: o aviso precede obrigatoriamente qualquer acesso à câmera. Sem manifestação de ciência, o fluxo não prossegue e nenhum vetor é gerado.
2. **Conteúdo Mínimo**: o aviso informa, no mínimo:
    - a necessidade de uma captura curta do rosto, com movimentos indicados na tela, para localizar as mídias;
    - que a privacidade é prioridade e que os dados são tratados conforme a Lei nº 13.709/2018;
    - que a captura é usada apenas para comparar com as mídias daquele evento e para confirmar que há uma pessoa real diante da câmera;
    - que apenas alguns quadros são enviados e que eles são excluídos após o processamento;
    - que a imagem não é compartilhada com terceiros;
    - a remissão à política de privacidade.
3. **Texto de Referência**: "Para encontrar suas fotos, precisamos de uma captura rápida do seu rosto: olhe para a câmera e siga os movimentos indicados na tela. Sua privacidade é nossa prioridade e seus dados serão tratados de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). A captura será utilizada apenas para comparar com as fotos deste evento e para confirmar que há uma pessoa real diante da câmera. Somente alguns quadros são enviados, e eles são excluídos após o processamento; o vídeo não é gravado. Não compartilhamos sua imagem com terceiros. Para mais informações, acesse nossa Política de Privacidade e LGPD. Ao clicar em Estou ciente, concordo com os termos e condições."
4. **Advertência quanto a Menores de Idade**: o aviso informa que o serviço não se destina a pessoas menores de 18 anos sem o consentimento de um dos pais ou do responsável legal (Art. 14, § 1º, da LGPD). Em evento com menores ([RF032]), informa ainda que a busca pelas mídias de criança ou adolescente deve ser feita pelo pai, pela mãe ou pelo responsável legal, que declara essa condição ao manifestar ciência.
5. **Vedação ao Aceite Presumido**: é vedada opção previamente assinalada ou aceite tácito; a manifestação decorre de ação afirmativa (Art. 8º, *caput* e § 4º, da LGPD).
6. **Ausência de Armazenamento para Buscas Futuras**: os quadros são sempre descartados ao término do processamento.
7. **Registro da Manifestação**: sem vínculo com a imagem nem com a identidade do visitante; apenas ocorrência, data, hora, evento e versão do texto.
8. **Apresentação Visual**: atribuição da equipe de interface; este documento define o conteúdo e o momento.
9. **Alteração do Texto**: a alteração da finalidade ou da forma de tratamento gera nova versão do texto, e o registro da manifestação identifica a versão aceita (Art. 8º, § 6º, da LGPD).

### [RF016] Busca de Mídias por Reconhecimento Facial no Evento — *[Alterado na v2.0]*

O sistema deve permitir que o visitante localize as mídias em que aparece dentro de um evento específico. A referência é obtida pela captura guiada com prova de vida ([RF036]) e comparada por similaridade com os vetores indexados daquele evento.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Evento Selecionado | Define o escopo exclusivo e único da busca. | 1 |
| Referência do Visitante | Quadros da captura guiada, obtidos exclusivamente pela câmera. | 2 |
| Dicas de Captura | Orientações exibidas antes da captura. | 9 |
| Manifestação de Ciência | Verificada antes do processamento. | 3 |
| Vetores de Consulta | Gerados em tempo de execução a partir das poses aprovadas. | 4 |
| Limiar de Similaridade | Configurável pelo administrador; valor inicial do motor ativo. | 6 |
| Teto de Resultados | Quantidade máxima de mídias por consulta. | 6 |
| Resultado da Busca | Mídias em que o visitante foi identificado, por similaridade decrescente. | 7 |

**Regras e observações**

1. **Escopo Único**: a busca pública é sempre feita em um único evento. Não existe busca no acervo integral, entre eventos, nem consulta que retorne os eventos em que alguém aparece. A limitação é deliberada e impede o rastreamento de pessoas.
2. **Referência do Visitante**: obtida apenas pela câmera, pela captura guiada do [RF036]. O servidor recusa a busca sem prova de vida aprovada. Não havendo face detectável, o sistema orienta nova captura, sem expor detalhes internos.
3. **Manifestação de Ciência**: verificada no servidor antes de gerar qualquer vetor; na ausência, a operação é recusada.
4. **Descarte da Referência**: os quadros recebidos e os vetores deles derivados ficam apenas em memória durante a busca e são descartados ao término, sem gravação em disco, log ou cache.
5. **Natureza do Resultado**: o sistema indica similaridade visual, não identidade. A interface comunica essa limitação e os fatores que afetam o resultado (iluminação, óculos, máscara, ângulo, partes do rosto cobertas).
6. **Limiar de Similaridade**: calibrado e documentado com base no teste de precisão do [RF029], privilegiando a precisão: o sistema exibe apenas as fotografias em que tem segurança. Se a pessoa aparece em 15 fotografias e o sistema tem segurança em 10, exibe as 10 e deixa as outras 5 de fora, por garantia. O falso positivo é particularmente grave, pois entrega ao visitante a mídia de outra pessoa. O valor inicial para o YuNet + SFace é 0,3741, ponto de melhor desempenho do Teste 1. Cada motor tem o seu limiar próprio, restaurado na troca de motor ([RF026]).
7. **Combinação das Poses**: a busca usa as poses aprovadas na captura guiada (até cinco: frente, dois lados, cima e baixo). Uma mídia é retornada quando alguma pose atinge o limiar, pelo critério de combinação que o teste de precisão do [RF029] indicar como mais preciso. O critério é registrado nos parâmetros.
8. **Vinculação do Resultado à Sessão**: o resultado fica vinculado à sessão e condiciona o acesso às mídias ([RF014], [RF019]). Não persiste após o visitante sair da página do resultado; nova consulta exige nova captura, considerando o uso de computadores compartilhados.
9. **Dicas de Captura**: antes de abrir a câmera, o sistema exibe orientações:
    - procurar local iluminado, com a luz de frente para o rosto;
    - manter o rosto inteiro visível;
    - retirar óculos escuros, máscara, boné ou outros acessórios que cubram o rosto.
10. **Limitação de Requisições**: limitada por sessão e por endereço de origem, dado o custo da inferência e o risco de uso desviado.
11. **Falha Segura**: indisponível o motor, a busca exibe aviso de indisponibilidade temporária, sem processar a referência, conforme o [RNF27].

### [RF017] Política de Seleção da Face de Consulta — *[Alterado na v2.0]*

O sistema deve adotar política determinística para selecionar a face de referência em cada quadro da captura e garantir que todos os quadros pertençam à mesma pessoa.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Critério Principal | Maior área da região delimitadora, após os filtros de qualidade. | 1 |
| Filtros de Qualidade | Lado mínimo, confiança mínima da detecção e nitidez mínima do quadro. | 2 |
| Critérios de Desempate | (i) maior confiança; (ii) menor distância ao centro; (iii) menor índice do detector. | 3 |
| Ausência de Face | Mensagem específica. | 4 |
| Face de Qualidade Insuficiente | Mensagem específica. | 5 |
| Face Única por Consulta | Uma só pessoa como referência. | 6 |
| Consistência entre Quadros | Todos os quadros aprovados devem conter a mesma pessoa. | 7 |

**Regras e observações**

1. **Determinismo**: os mesmos quadros produzem sempre a mesma seleção, requisito da reprodutibilidade dos testes ([RNF20]).
2. **Filtros de Qualidade**: faces pequenas, de baixa confiança ou em quadros borrados pelo movimento são descartadas antes do critério principal.
3. **Critérios de Desempate**: aplicados na ordem estabelecida, sem exceção.
4. **Ausência de Face**: orienta nova captura, com melhor iluminação e enquadramento.
5. **Face de Qualidade Insuficiente**: distinguida da ausência de face, com orientação específica.
6. **Face Única por Consulta**: impede que a fotografia de um grupo entregue as mídias de todos os retratados.
7. **Consistência entre Quadros**: se os quadros contiverem pessoas diferentes, a busca é recusada, impedindo a troca de rosto durante a captura.

### [RF018] Visualização das Mídias Localizadas — *[Alterado na v2.0]*

O sistema deve exibir ao visitante, ao término da busca, as mídias em que ele foi identificado, com visualização ampliada, ampliação por zoom e crédito do autor e da instituição.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Grade de Resultados | Miniaturas grandes, que se ajustam à largura da tela. | 1 |
| Visualizador | Abre a mídia em tela cheia, adequada ao dispositivo. | 2 |
| Ampliação (Zoom) | Aproximar, afastar e arrastar a imagem ampliada. | 2 |
| Crédito na Tela | "Fotografia por: [autor] — Centro Universitário CESMAC" ou equivalente para vídeo. | 3 |
| Informações da Mídia | Evento de origem e data de captura. | 4 |
| Navegação Sequencial | Avançar e retroceder entre os resultados, inclusive pelas setas do teclado. | 5 |
| Botões de Download e de Remoção | No visualizador ([RF019], [RF023]). | 6 |
| Mensagem de Resultado Vazio | Exibida quando nada for localizado. | 7 |

**Regras e observações**

1. **Restrição do Resultado**: somente as mídias em que o visitante foi identificado; as demais não são exibidas nem enumeradas. A grade é rolada automaticamente até os resultados ao término da busca.
2. **Visualizador**: usa versão redimensionada, reservando o original ao download. A marca d'água é aplicada no arquivo baixado ([RF019]). O botão de fechar e o retorno à grade são sempre visíveis.
3. **Crédito na Tela**: assinatura do autor ([RF001]) com a identificação da instituição, complementada pelos metadados do arquivo ([RF019]).
4. **Informações da Mídia**: as mídias não têm nome; são identificadas pelo evento e pela data.
5. **Navegação Sequencial**: restrita ao resultado do próprio visitante.
6. **Botões no Visualizador**: o download e a solicitação de remoção ficam no próprio visualizador, sem retorno à grade.
7. **Resultado Vazio**: orienta sobre as causas possíveis e sugere nova captura, informando que a ausência de resultado pode significar que a pessoa não foi fotografada.

### [RF019] Download das Mídias Localizadas — *[Alterado na v2.0]*

O sistema deve permitir que o visitante baixe exclusivamente as mídias em que foi identificado, de forma individual, na resolução original, com marca d'água institucional e com a autoria e a propriedade gravadas no arquivo.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Condição de Acesso | Busca prévia do [RF016]. | 1 |
| Abrangência | Mídias da busca em curso. | 2 |
| Forma do Download | Individual, uma mídia por operação. | 3 |
| Formato do Arquivo | JPEG para fotografia; MP4 para vídeo. | 4 |
| Qualidade | Resolução original, JPEG de alta qualidade, sem geolocalização. | 5 |
| Autoria e Propriedade nos Metadados | Autor, instituição, aviso de propriedade por escrito e endereço de origem. | 6 |
| Endereço de Download | Assinado, de validade reduzida. | 7 |
| Registro do Download | Ocorrência, data, hora, evento e mídia. | 8 |
| Marca d'Água Institucional | "CESMAC" no canto inferior da fotografia. | 9 |

**Regras e observações**

1. **Condição de Acesso**: não há download sem busca prévia; o servidor rejeita mídias fora do resultado da sessão.
2. **Abrangência**: o pacote do evento é vedado ao visitante ([RF012]).
3. **Forma do Download**: a limitação ao download individual desestimula a extração automatizada.
4. **Formato do Arquivo**: a fotografia é entregue em JPEG, inclusive quando o original estiver em outro formato; o visitante nunca recebe formato bruto. O vídeo é entregue no formato convertido para reprodução ampla, em qualidade equivalente ao original.
5. **Qualidade**: a fotografia entregue é cópia gerada no momento do download, na resolução original e em JPEG de alta qualidade, com a marca d'água e os metadados. O original guardado no acervo não é alterado.
6. **Autoria e Propriedade nos Metadados**: além do endereço de origem, o arquivo traz por escrito o autor e o detentor dos direitos, nos campos de autor, de direitos autorais, de crédito e de descrição (EXIF, IPTC e XMP). Exemplo: "Imagem do acervo do Centro Universitário CESMAC — Fotografia: [autor]". O texto definitivo é validado pela equipe de marketing e pela área jurídica (seção 11). Nos vídeos, os mesmos dados são gravados nas etiquetas do arquivo.
7. **Endereço de Download**: validade máxima de 15 minutos, vinculado à sessão e limitado à mídia autorizada.
8. **Registro do Download**: sem vínculo com a identidade do visitante.
9. **Marca d'Água Institucional**: a identificação "CESMAC" é aplicada no canto inferior da fotografia, de forma discreta e proporcional ao tamanho da imagem, sem cobrir a área central. O canto (direito ou esquerdo) é parâmetro do administrador ([RF026]). Nesta versão, a marca d'água aplica-se apenas a fotografias. Ela distingue a cópia entregue ao público: os downloads feitos pelas contas do sistema, de pessoas a serviço do CESMAC, não a recebem ([RF012], [RF030]).

## 3.5 Pessoas institucionais

### [RF020] Cadastro de Pessoas Institucionais — *[Alterado na v2.0]*

O sistema deve permitir que o administrador mantenha um cadastro restrito de pessoas de representação institucional — coordenadores, diretores e demais servidores em função de representação. Cada pessoa autoriza o uso da sua imagem por ligação enviada ao seu e-mail, o que viabiliza a consulta do [RF021].

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Nome Completo | String, obrigatório, até 120 caracteres. | 1 |
| Cargo ou Função | String, obrigatório, até 100 caracteres. | 1 |
| Unidade ou Curso | String, opcional, até 100 caracteres. | |
| E-mail | String, obrigatório; destino da solicitação de autorização. | 3 |
| Imagens de Referência | De uma a cinco fotografias do rosto, em ângulos variados, ou captura guiada ([RF036]). | 2 |
| Solicitação de Autorização | Ligação de uso único, enviada ao e-mail, que conduz ao termo de autorização. | 3 |
| Registro da Autorização | Versão do termo aceito, data, hora e ligação utilizada. | 3 |
| Situação do Cadastro | "Aguardando Autorização", "Ativo" ou "Revogado". | 4 |
| Capacidade do Cadastro | Inicialmente 50 pessoas, ampliável. | 5 |

**Regras e observações**

1. **Controle de Acesso**: o cadastro é privativo do administrador. Nenhum outro perfil inclui ou altera pessoas, nem acessa e-mail, imagens de referência ou registro de autorização. A consulta do [RF021] exibe às contas autorizadas apenas o nome e o cargo das pessoas ativas. Nenhum usuário da área pública tem acesso à relação.
2. **Imagens de Referência**: originam vetores armazenados de forma segregada dos vetores do acervo e destinados exclusivamente ao [RF021].
    - Admitem-se fotografias de frente e de lado, ou a captura guiada, para melhorar a identificação em mídias de evento, onde o rosto raramente está de frente.
    - Os vetores são gerados somente após o registro da autorização.
    - Enquanto o cadastro estiver "Aguardando Autorização", as imagens não são processadas.
3. **Autorização por E-mail**: a pessoa recebe ligação de uso único, com validade limitada, que exibe o termo de autorização e o botão de aceite. O consentimento abrange dado biométrico e, por isso, é específico e destacado (Art. 11, I, da LGPD). Pode ser dado por qualquer meio que demonstre a manifestação de vontade (Art. 8º, *caput*). O ônus da prova é do controlador (Art. 8º, § 2º). Por isso o sistema registra qual versão do termo foi aceita, quando e por qual ligação. A exigência de assinatura eletrônica qualificada é pendência da seção 11.
4. **Revogação**: a pessoa revoga a autorização a qualquer tempo, sem justificativa, por procedimento gratuito e facilitado (Art. 8º, § 5º, da LGPD), inclusive por ligação disponível na mensagem de confirmação. A revogação elimina, em prazo não superior a 5 dias e de forma irreversível:
    - as imagens de referência;
    - os vetores delas derivados;
    - todas as marcações do [RF021].
5. **Alcance Restrito**: somente pessoas em função de representação institucional. É vedado o cadastro de alunos, participantes de eventos ou pessoas sem função de representação, ainda que mediante autorização.
6. **Revisão Periódica**: ao menos uma vez por ano, eliminando-se quem não exerça mais a função.

### [RF021] Consulta de Mídias por Pessoa Institucional — *[Alterado na v2.0]*

O sistema deve localizar automaticamente, em todo o acervo publicado, as imagens das pessoas institucionais autorizadas e permitir que as contas autenticadas as consultem pelo nome, atendendo às demandas de comunicação sem percorrer manualmente os eventos.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Perfis Autorizados | "Fotógrafo", "Marketing" e "Administrador". | 1 |
| Consulta por Nome | Seleção a partir das pessoas ativas do [RF020]. | 2 |
| Busca Inicial no Acervo | Executada ao registrar a autorização, sobre todo o acervo publicado. | 3 |
| Marcação Automática | Na indexação de toda mídia publicada depois da autorização. | 3 |
| Indicação "Pessoa institucional localizada" | Exibida na mídia marcada, na área administrativa. | 3 |
| Relação de Eventos | Eventos com a pessoa, com nome, data e local. | 4 |
| Contador de Ocorrências | Ex.: "15 de 300 imagens contêm esta pessoa". | 5 |
| Abertura do Evento | Exibe apenas as imagens da pessoa naquele evento. | 6 |
| Filtro por Data e Tema | Opcional. | |
| Confirmação Humana | Confirmar ou rejeitar cada marcação. | 7 |
| Registro da Consulta | Conta, pessoa consultada, data e hora. | 8 |

**Regras e observações**

1. **Perfis Autorizados**: a funcionalidade nunca é exposta na área pública. A conta temporária não tem acesso.
2. **Consulta por Nome**: exclusivamente pela seleção de pessoa já cadastrada e ativa. É vedado o envio de fotografia para localizar pessoa não cadastrada: o sistema não aponta onde uma pessoa qualquer esteve; só recupera as imagens de quem autorizou previamente esse tratamento.
3. **Busca Inicial e Marcação Automática**: a comparação ocorre uma vez por mídia, evitando comparar todo o acervo a cada consulta.
    - Registrada a autorização, o sistema compara os vetores de referência com os vetores de todo o acervo publicado e marca as imagens em que a pessoa for localizada.
    - Daí em diante, cada mídia publicada é comparada com as pessoas ativas no momento da indexação.
    - A marcação registra o grau de similaridade e passa a constar da lista da pessoa, com a indicação "Pessoa institucional localizada".
    - É a única comparação entre eventos admitida no sistema, justificada pela autorização expressa do titular.
    - A marcação usa limiar próprio, configurado pelo administrador ([RF026]), nunca menos exigente que o da busca pública.
4. **Relação de Eventos**: apenas eventos com ao menos uma imagem marcada, do mais recente ao mais antigo.
5. **Contador de Ocorrências**: permite dimensionar a relevância de cada evento antes de abri-lo.
6. **Abertura do Evento**: exibe somente as imagens marcadas, permanecendo disponível a conferência completa do [RF011].
7. **Confirmação Humana**: o resultado indica similaridade e pode conter erros. Antes de qualquer uso institucional, a conta confirma visualmente a marcação; marcações rejeitadas deixam de constar da lista.
8. **Registro da Consulta**: inalterável, conforme o [RF024]. A indisponibilidade do registro impede a consulta.
9. **Efeito da Revogação**: a pessoa deixa imediatamente de ser localizável e todas as marcações são eliminadas.
10. **Busca Pública**: a marcação não altera a busca do visitante. A pessoa institucional continua podendo localizar as próprias mídias pela busca pública, como qualquer visitante.

## 3.6 Privacidade e conformidade

### [RF022] Aviso de Uso Responsável e Transparência — *[Alterado na v2.0]*

O sistema deve exibir, de forma permanente e acessível, aviso de uso responsável e as informações de transparência sobre o tratamento de dados pessoais, orientando os titulares sobre os seus direitos.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Aviso de Uso Responsável | Na página do evento e no resultado. | 1 |
| Política de Privacidade | Acessível de qualquer tela, sem autenticação. | 2 |
| Informação sobre o Tratamento | Dados tratados, finalidades, prazos e agentes. | 3 |
| Declaração de Finalidades | Finalidades declaradas, sem uso diverso. | 4 |
| Prazo de Retenção Declarado | Por quanto tempo as mídias permanecem. | 5 |
| Canais de Remoção e de Direitos | Remoção na própria mídia localizada e contato do encarregado. | 6 |
| Encarregado pelo Tratamento de Dados | Identidade e contato. | 7 |
| Informação sobre Crianças e Adolescentes | Tratamento em eventos com menores. | 8 |

**Regras e observações**

1. **Aviso de Uso Responsável**: as mídias destinam-se às pessoas nelas retratadas, e o compartilhamento ou uso da imagem de terceiros é vedado pela legislação.
2. **Política de Privacidade**: em linguagem clara, remetida a partir do aviso do [RF015].
3. **Informação sobre o Tratamento**: distingue a mídia armazenada do vetor gerado para a busca. Informa ainda:
    - que os quadros da captura guiada não são armazenados;
    - que os vídeos podem conter voz;
    - a identificação do controlador e dos operadores, inclusive dos fotógrafos contratados (Art. 9º, III a VI, da LGPD).
4. **Declaração de Finalidades**: as mídias publicadas são tratadas para duas finalidades, declaradas expressamente (Art. 6º, I e VI; Art. 9º, I, da LGPD):
    - permitir que cada pessoa localize e obtenha as mídias em que aparece;
    - divulgação institucional do CESMAC pela equipe de marketing, a partir das mídias publicadas.

    As mídias não são cedidas a terceiros alheios à instituição nem usadas para outra finalidade. Também não servem para treinar sistemas de inteligência artificial. São eliminadas ao término do prazo de retenção. A base legal da divulgação institucional e o direito de imagem correspondente são definidos pela área jurídica, conforme a seção 11.
5. **Prazo de Retenção Declarado**: corresponde ao prazo efetivamente praticado ([RNF12]), atualizado quando o parâmetro mudar.
6. **Canais de Remoção e de Direitos**:
    - quem localizou a própria mídia pede a remoção no próprio visualizador ([RF023]);
    - quem não usou o sistema ou aparece incidentalmente exerce os direitos do Art. 18 da LGPD por requerimento ao encarregado (Art. 18, § 3º; Art. 41, § 2º, I).

    Não existe página avulsa de remoção por envio de arquivo.
7. **Encarregado pelo Tratamento de Dados**: identidade e contato divulgados publicamente (Art. 41, § 1º, da LGPD). A indicação é atribuição institucional e é pendência da seção 11.
8. **Crianças e Adolescentes**: informação pública sobre os dados tratados em eventos com menores, a forma de utilização e o exercício dos direitos (Art. 14, § 2º, da LGPD).

### [RF023] Solicitação de Remoção de Mídia — *[Alterado na v2.0]*

O sistema deve permitir que a pessoa que localizou a própria mídia solicite a sua remoção diretamente no visualizador. A mídia sai imediatamente dos resultados e é excluída no prazo estabelecido, ainda que não haja atuação de quem a enviou.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Identificação da Mídia | Automática, a partir da mídia aberta no visualizador. | 1 |
| Confirmação Visual | A mídia é exibida ao solicitante antes da confirmação. | 1 |
| Motivo da Solicitação | Opcional. | 2 |
| Dados de Contato | E-mail para comunicar a conclusão. | 3 |
| Retirada Imediata | Remove a mídia das buscas no recebimento. | 4 |
| Prazo de Exclusão | 72 horas do recebimento. | 5 |
| Exclusão Automática | Ao término do prazo, sem depender de atuação humana. | 6 |
| Sinalização ao Responsável | Destaque na área administrativa. | 7 |
| Situação da Solicitação | "Recebida", "Excluída pelo responsável" ou "Excluída automaticamente". | 8 |

**Regras e observações**

1. **Identificação da Mídia**: a solicitação só pode ser iniciada a partir de mídia aberta no resultado da busca. Isso garante que a exclusão, irreversível, recaia exatamente sobre a mídia pretendida e dispensa a busca do arquivo. A página avulsa de remoção da versão 1.6 foi suprimida.
2. **Motivo**: facultativo. Não desejar a mídia no sistema é fundamento suficiente.
3. **Dados de Contato**: usados apenas para comunicar a conclusão e eliminados após o prazo de guarda.
4. **Retirada Imediata**: a mídia deixa de ser retornada em qualquer busca no ato do recebimento e também deixa de ser oferecida no download para divulgação ([RF030]).
5. **Prazo de Exclusão**: o responsável, o autor e o administrador são notificados no recebimento e alertados da proximidade do vencimento.
6. **Exclusão Automática**: sem atuação em 72 horas, o sistema exclui o arquivo, as versões derivadas, os metadados e os vetores. A ausência de resposta nunca mantém a mídia no acervo.
7. **Sinalização ao Responsável**: destaque próprio na relação do [RF011].
8. **Registro da Operação**: solicitação e conclusão são registradas sem preservar o arquivo excluído; a conclusão é comunicada ao solicitante.
9. **Outros Pedidos**: pedidos de quem não usou o sistema, recebidos pelo encarregado, são cumpridos pelo administrador com o mesmo comando de descarte e registrados da mesma forma.

### [RF024] Registro de Operações e Controle de Uso Atípico — *[Alterado na v2.0]*

O sistema deve registrar as operações sobre o acervo e monitorar padrões atípicos de utilização, sem identificar os visitantes que realizaram consultas públicas.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Registro de Operações Administrativas | Com identificação da conta. | 1 |
| Registro das Consultas Institucionais | Conta consulente e pessoa consultada. | 2 |
| Registro de Consultas Públicas | Agregado, sem identificação pessoal. | 3 |
| Limitação de Requisições | Buscas e downloads por sessão e por endereço de origem. | 4 |
| Sinalização de Uso Atípico | Alerta automático ao administrador. | 5 |
| Vedação ao Registro de Imagem | Nenhum quadro, autorretrato, vetor ou representação da face consultada. | 6 |
| Relatório Operacional | Exportação por período. | 7 |

**Regras e observações**

1. **Operações Administrativas**: registros inalteráveis por qualquer perfil, inclusive o administrador. Abrangem:
    - autenticações;
    - eventos;
    - envio, aprovação, publicação, descarte, borrão e exclusão de mídias;
    - downloads em pacote e downloads para divulgação;
    - alterações de parâmetros e troca de motor;
    - testes de precisão;
    - registro e revogação de autorização de evento com menores;
    - criação e expiração de contas temporárias;
    - solicitações de autorização de pessoas institucionais.
2. **Consultas Institucionais**: nominais, preservadas por prazo não inferior ao de retenção e disponibilizadas à pessoa cadastrada quando solicitado.
3. **Consultas Públicas**: limitadas ao necessário para apurar uso atípico e dimensionar o uso (Art. 6º, III, da LGPD). Incluem a contagem agregada de provas de vida reprovadas.
4. **Limitação de Requisições**: principal defesa contra a extração automatizada do acervo.
5. **Uso Atípico**: são sinalizados ao administrador o volume desproporcional de buscas de um mesmo endereço e a sequência de provas de vida reprovadas.
6. **Vedação ao Registro de Imagem**: vale para todos os registros, inclusive logs técnicos e cópias de segurança.
7. **Relatório Operacional**: sem dados pessoais de visitantes, conforme o [RNF14].

## 3.7 Colaboração, parâmetros e manutenção

### [RF025] Colaboração no Evento — *[Alterado na v2.0]*

O sistema deve permitir que o responsável por um evento libere o envio de mídias por outras contas de fotógrafo e de marketing. A cobertura de mais de um profissional fica reunida em um único evento, com o crédito individual de cada mídia, e cada conta gerencia apenas as mídias que enviou.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Liberação da Colaboração | Privativa do responsável. | 1 |
| Situação da Colaboração | "Liberada" ou "Não Liberada". | 2 |
| Relação de Colaboradores | Contas que enviaram mídias e a quantidade de cada uma, com o perfil. | 3 |
| Prerrogativas Exclusivas do Responsável | Edição do cadastro, liberação da colaboração, publicação, registro da autorização de menores e download em pacote. | 4 |
| Gerenciamento pelo Colaborador | Restrito às mídias que enviou. | 5 |
| Registro da Operação | Liberação, suspensão e envio por colaborador. | 6 |

**Regras e observações**

1. **Liberação**: não exige indicação nominal. Liberado o evento, toda conta ativa de fotógrafo ou de marketing passa a dispô-lo entre os destinos de envio ([RF007]). É o caminho recomendado para que fotógrafo e marketing reúnam a cobertura de um mesmo evento sem duplicá-lo.
2. **Situação da Colaboração**: independente da situação do evento e alterável a qualquer tempo; a suspensão não remove mídias já enviadas.
3. **Relação de Colaboradores**: acompanhamento do acervo pelo responsável.
4. **Prerrogativas Exclusivas**: indelegáveis. Suspensa ou inativada a conta do responsável, passam ao administrador ([RF003]).
5. **Gerenciamento pelo Colaborador**: é vedado descartar ou excluir mídia de outro autor, em respeito ao direito do autor sobre a obra. O responsável e o administrador dispõem dessa faculdade sobre todas as mídias do evento.
6. **Registro da Operação**: integra o [RF024].
7. **Conta Temporária**: envia ao evento vinculado independentemente da liberação da colaboração, conforme o [RF031].

### [RF026] Parâmetros e Motor do Reconhecimento Facial — *[Alterado na v2.0]*

O sistema deve permitir que o administrador configure os parâmetros da detecção e da comparação de faces e escolha o motor de reconhecimento facial ativo, sem alteração do código-fonte. Toda alteração é registrada com a sua repercussão sobre as métricas de acurácia.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Motor Ativo | Seleção no catálogo de motores disponíveis. | 5 |
| Limiar de Similaridade | Valor mínimo para correspondência ([RF016]); inicial de 0,3741 no YuNet + SFace. | 1 |
| Limiar da Marcação Institucional | Valor mínimo para a marcação do [RF021]. | 6 |
| Grau Mínimo de Confiança da Detecção | Conforme o [RF010] e o [RF017]. | |
| Lado Mínimo da Face de Consulta | Conforme o [RF017]. | |
| Teto de Resultados por Consulta | Conforme o [RF016]. | |
| Critério de Combinação das Poses | Conforme o [RF016] nota 7. | |
| Limites de Requisição | Buscas e downloads por sessão e por endereço ([RF024]). | |
| Limites de Vídeo | Tamanho e duração máximos por arquivo ([RF007], [RF034]). | |
| Posição da Marca d'Água | Canto inferior direito ou esquerdo ([RF019]). | |
| Formatos Brutos | Habilitados ou não, e tamanho máximo por arquivo ([RF007]). | |
| Prazo de Retenção do Acervo | Em meses ([RNF12]). | 2 |
| Prazo para Desfazer a Exclusão de Evento | Em dias; inicial de 7 ([RF038]). | |
| Guarda da Identificação do Fotógrafo Contratado | Em meses, após a saída das mídias do acervo; inicial de 36, provisório até a definição da área jurídica ([RF031] nota 7). | |
| Versão do Modelo em Uso | Leitura. | 3 |
| Registro da Alteração | Parâmetro, valor anterior, novo valor, data, hora e administrador. | 4 |

**Regras e observações**

1. **Limiar de Similaridade**: a alteração é precedida de advertência sobre o efeito na taxa de falso positivo e exige nova apuração das métricas do [RNF18], pelo teste do [RF029], privilegiando a precisão.
2. **Prazo de Retenção**: a alteração repercute na data de expiração dos eventos não expirados e no prazo declarado ao público ([RF022]).
3. **Versão do Modelo**: informação de leitura. A substituição do motor enseja a reindexação do [RF028].
4. **Registro da Alteração**: integra o [RF024] e é inalterável.
5. **Motor Ativo**: o catálogo lista cada motor com a licença, a dimensão do vetor, o limiar calibrado e a nota obtida no teste de precisão. O administrador troca o motor pelo painel; a troca:
    - exige confirmação de ciência das consequências;
    - carrega e verifica o novo motor antes de efetivar a mudança;
    - restaura os parâmetros próprios do motor, entre eles o limiar;
    - reindexa todo o acervo publicado ([RF028]).

    Motores marcados como de referência, cuja licença não admite uso institucional, aparecem apenas no teste de precisão e não podem ser ativados. O sistema nunca troca de motor por conta própria ([RNF27]).
6. **Limiar da Marcação Institucional**: não pode ser menos exigente que o limiar da busca pública. O uso de imagens de referência em vários ângulos melhora a localização sem afrouxar o limiar.

### [RF027] Manutenção dos Temas (Tags) — *[Alterado na v2.0]*

O sistema deve permitir que as contas de fotógrafo, de marketing e de administrador criem e mantenham os temas usados no cadastro de eventos e nos filtros da pesquisa pública. A relação é única e cada tema pertence a quem o criou.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Denominação do Tema | String, obrigatória, até 50 caracteres, única no sistema. | 1 |
| Ícone do Tema | Seleção em biblioteca de ícones do sistema. | 2 |
| Autor do Tema | Conta que o criou, preenchida automaticamente. | 3 |
| Situação do Tema | "Ativo" ou "Inativo". | 4 |
| Relação de Temas | Temas, ícone, autor, situação e quantidade de eventos vinculados. | 5 |

**Regras e observações**

1. **Denominação**: única sem distinção de maiúsculas, minúsculas e acentuação ("Formatura" e "formatura" são o mesmo tema). Admite temas específicos ("Colação de Jaleco", "Roga DX") ou genéricos ("Tecnologia", "Esporte").
2. **Ícone**: escolhido por quem cria o tema e exibido nos filtros públicos ([RF013]).
3. **Autor do Tema**: só o autor edita ou inativa o tema, para que ninguém altere ou apague o tema de outro. O administrador pode editar qualquer tema, preferencialmente apenas para moderação. A conta temporária não cria temas.
4. **Situação do Tema**: tema vinculado a evento não pode ser excluído, apenas inativado. Tema inativo deixa de ser oferecido no cadastro e nos filtros, mantendo-se nos eventos que já o usam.
5. **Relação de Temas**: lista única, visível a todas as contas, sem grupos ou categorias. Criar tema também é possível no formulário de evento ([RF004]).

### [RF028] Reindexação do Acervo — *[Alterado na v2.0]*

O sistema deve permitir que o administrador submeta novamente à indexação facial as mídias publicadas, total ou seletivamente por versão de modelo ou por evento. A reindexação também ocorre automaticamente quando o motor de reconhecimento facial é trocado.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Escopo da Reindexação | Por evento, por versão de modelo ou acervo publicado inteiro. | 1 |
| Execução Assíncrona | Em fila própria. | 2 |
| Substituição dos Vetores | Remove os vetores anteriores após a geração dos novos. | 3 |
| Mídias Desatualizadas | Quantidade de mídias indexadas por versão diferente da ativa. | 4 |
| Indicador de Progresso | Por evento e para o conjunto. | |
| Registro da Operação | Escopo, versão de origem e de destino e administrador. | |

**Regras e observações**

1. **Escopo**: apenas mídias publicadas. Mídias em conferência ou descartadas permanecem sem vetor ([RNF13]).
2. **Execução Assíncrona**: em fila distinta da indexação corrente, sem retardar a publicação de novos eventos.
3. **Substituição dos Vetores**: os vetores anteriores só são eliminados após a nova geração, de modo que o evento não fique sem busca. A base comporta temporariamente vetores de dimensões diferentes. A busca compara apenas vetores do motor ativo.
4. **Mídias Desatualizadas**: o painel informa quantas mídias ainda aguardam a nova versão, inclusive após troca de motor ou de configuração.

## 3.8 Requisitos novos da versão 2.0

### [RF029] Teste de Precisão e Calibração do Reconhecimento Facial — *[Novo na v2.0]*

O sistema deve permitir que o administrador meça a precisão do reconhecimento facial sobre os eventos publicados da própria plataforma, com uma pessoa de referência que consentiu. O teste produz uma nota de 0 a 100, as métricas de acerto e o limiar de melhor desempenho. Com isso, a calibração é feita pelo site, sem alteração de código.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Nome do Teste | String, obrigatória, de 2 a 80 caracteres. | |
| Evento de Teste | Evento com mídias publicadas. | 2 |
| Referência | Fotografia(s) ou quadros da captura guiada da pessoa de referência. | 3 |
| Consentimento da Pessoa de Referência | Declaração obrigatória do administrador. | 1 |
| Marcações | Para cada mídia: "a pessoa está" ou "não está"; e rosto errado no topo. | 4 |
| Execuções | Uma por motor e configuração escolhidos. | 5 |
| Formas de Combinação | Pose única, melhor pose e média das poses. | 6 |
| Resultado | Nota de 0 a 100, desempenho por limiar, limiar recomendado, tempo por mídia. | 7 |
| Encerramento | Manual ou automático após 30 dias. | 8 |

**Regras e observações**

1. **Consentimento**: o teste procura uma pessoa determinada no acervo. Por isso, a pessoa de referência consente previamente e de forma específica (Art. 11, I, da LGPD), e o administrador declara esse consentimento ao criar o teste. Não se usa referência de pessoa sem consentimento.
2. **Evento de Teste**: admite apenas mídias publicadas, de modo que o teste não alcance mídia em conferência ou descartada ([RNF13]). O teste mede o acerto do reconhecimento, e não a qualidade ou a resolução das imagens.
3. **Referência**: aceita uma ou mais fotografias, ou a captura guiada ([RF036]), para medir o ganho de várias poses. O resultado registra a prova de vida da referência.
4. **Marcações**: feitas pelo administrador sobre as mídias e compartilhadas entre as execuções do mesmo teste. A métrica considera também o caso de mídia certa com o rosto errado em primeiro lugar.
5. **Execuções**: rodam em segundo plano, em memória, sem tocar nos vetores de produção. Permitem comparar motores e configurações, inclusive motores de referência que não podem ser ativados ([RF026]).
6. **Formas de Combinação**: medem o efeito da captura com várias poses e fundamentam o critério do [RF016] nota 7.
7. **Resultado**: são as mesmas fórmulas do fotomac-lab, validadas contra os resultados do Teste 1.
    - A nota é 100 vezes o melhor desempenho (F1) sobre as mídias marcadas e não depende do limiar escolhido.
    - Também são apresentadas a área sob a curva, a precisão média, a quantidade de intrusos e a separação entre a pessoa e os demais.
    - O desempenho é apresentado em duas leituras: do modelo e do produto.
8. **Encerramento**: guarda apenas os números agregados. Exclui as marcações, as pontuações por mídia e os arquivos de referência. Testes esquecidos são encerrados automaticamente após 30 dias. O descarte exclui também os agregados.
9. **Calibrar não é Treinar**: o teste ajusta a forma de uso dos modelos e nunca os retreina com os rostos do acervo (seção 2.4, item 14).

### [RF030] Atuação da Equipe de Marketing — *[Novo na v2.0]*

O sistema deve oferecer à equipe de marketing as mesmas funções do fotógrafo, com identificação própria. Deve também permitir que ela visualize e baixe as mídias publicadas de qualquer evento para a divulgação institucional.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Funções de Produção | As mesmas do fotógrafo ([RF004] a [RF012], [RF025], [RF027]). | 1 |
| Identificação | "Equipe de marketing" no evento criado, na relação de mídias e no crédito. | 2 |
| Acervo para Divulgação | Visualização e download das mídias publicadas de qualquer evento, sem marca d'água e com o aviso de propriedade nos metadados. | 3 |
| Registro | Todo download para divulgação é registrado. | 4 |

**Regras e observações**

1. **Funções de Produção**: cadastrar eventos, criar temas, enviar fotografias e vídeos, conferir, publicar e colaborar, nos mesmos termos do fotógrafo, na plataforma web e no aplicativo móvel. Não há busca de alunos nem qualquer função de localizar pessoa, além da consulta a pessoas institucionais do [RF021].
2. **Identificação**: por exemplo, "Criado por Lucas Bezerra — Equipe de marketing". O crédito das mídias enviadas pela equipe segue o formato do [RF018].
3. **Acervo para Divulgação**: abrange apenas mídias publicadas e não sujeitas a remoção. Não abrange mídias em conferência, aguardando aprovação ou de evento com menores sem autorização. É finalidade declarada no [RF022]. As fotografias baixadas para divulgação, individualmente ou em pacote, saem sem marca d'água, por se tratar de equipe do CESMAC, e levam o aviso de propriedade nos metadados ([RF019] nota 6).
4. **Registro**: conta, evento, mídias e data, conforme o [RF024]. Permite demonstrar o uso feito do acervo (Art. 37 da LGPD).
5. **Uso de Mídia com Menores**: o uso de mídia de evento com menores na divulgação depende de que a autorização registrada no [RF032] contemple essa finalidade, o que é verificado pela equipe antes do uso.

### [RF031] Conta Temporária para Fotógrafo Contratado — *[Novo na v2.0]*

O sistema deve permitir que o administrador crie conta temporária para fotógrafo contratado, vinculada a um único evento e válida por 24 horas. As mídias enviadas por essa conta só são publicadas após a aprovação do administrador.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Dados da Conta | Nome, e-mail e assinatura, conforme o [RF001]. | |
| Dados de Identificação | Nome completo, CPF, data de nascimento e número do contrato de prestação de serviço. | 6, 7 |
| Evento Vinculado | Evento existente, obrigatório, único. | 1 |
| Validade | 24 horas, contadas da definição da senha. | 2 |
| Envio de Mídias | Somente ao evento vinculado. | 1 |
| Aprovação do Administrador | Aprovar ou rejeitar cada mídia ou um lote selecionado. | 3 |
| Registro da Aprovação | Na própria mídia: quem enviou, quem aprovou, data e hora. | 3 |
| Situação da Mídia | "Aguardando Aprovação", "Aprovada" ou "Rejeitada". | 3 |
| Expiração | Desativação automática ao término da validade. | 4 |

**Regras e observações**

1. **Evento Vinculado**: a conta não cadastra eventos, não cria temas, não colabora em outros eventos, não publica e não acessa mídias de outros autores. Vê apenas as próprias mídias e a situação delas.
2. **Validade**: contada a partir da definição da senha, para que o prazo não se esgote antes do evento. A ligação de definição de senha também vale 24 horas. O administrador pode emitir nova ligação, mas não estende a validade de conta já ativada; nova cobertura exige nova conta.
3. **Aprovação**: as mídias da conta temporária ingressam como "Aguardando Aprovação".
    - O administrador as examina para barrar conteúdo impróprio, uma a uma, com passagem direta à próxima mídia pendente, ou em lote, selecionando as mídias.
    - A aprovação, individual ou em lote, grava na própria mídia quem a aprovou e quando ("Revisada e aprovada por"), ao lado de quem a enviou, e integra o [RF024]. Aprovar em lote não é exigência de segurança a dispensar: o que garante a responsabilização é esse registro.
    - O painel inicial e a lista de eventos indicam ao administrador os eventos com mídias aguardando aprovação, com a quantidade.
    - A aprovação vale para o arquivo examinado. Se o arquivo de uma mídia aprovada for substituído, ela volta a "Aguardando Aprovação" e o registro de quem aprovou é apagado, porque o administrador não viu o conteúdo novo. A substituição fica registrada no [RF024].
    - As aprovadas passam ao fluxo normal de conferência e publicação do [RF009].
    - As rejeitadas são excluídas sem gerar vetor.
4. **Expiração**: ao término da validade, a conta passa a "Expirada" ([RF003]) e as sessões são encerradas. As mídias aprovadas permanecem no acervo, com o crédito do fotógrafo contratado. A conta expirada nunca é excluída: permanece desativada, nos termos da nota 7.
5. **Operador de Dados**: o fotógrafo contratado trata dados pessoais em nome do CESMAC e é operador, devendo tratá-los segundo as instruções do controlador (Art. 39 da LGPD). Essa condição é formalizada no contrato de prestação de serviço, atribuição institucional. O sistema contribui limitando o acesso a um evento e a um prazo.
6. **Dados de Identificação**: permitem saber com certeza quem responde pelas mídias enviadas. O administrador informa o número do contrato no cadastro; no primeiro acesso, o fotógrafo contratado confirma o nome e informa o CPF e a data de nascimento, e só então define a senha. A conta não é ativada sem esses dados. A base legal é a execução do contrato de que o fotógrafo é parte (Art. 7º, V, da LGPD). Coletam-se apenas esses dados, porque o contrato, guardado pela instituição, reúne os demais (Art. 6º, III).
7. **Guarda e Proteção dos Dados**: os dados de identificação são mantidos após a expiração, enquanto as mídias enviadas pela conta permanecerem no acervo e pelo prazo adicional definido pela área jurídica para a defesa de direitos (seção 11). Encerrado o prazo, o CPF e a data de nascimento são eliminados, e o nome permanece nos registros de operações ([RF003] nota 4; Art. 15, I, e Art. 16 da LGPD). Os dados são visíveis apenas ao administrador, com o CPF parcialmente mascarado nas telas, e armazenados com criptografia.

### [RF032] Evento com Menores de 18 Anos e Autorização Prévia — *[Suspenso na v2.0 — pendente de validação]*

**Requisito suspenso.** Eventos destinados a crianças e adolescentes ficam fora desta versão até que o orientador, a coordenação e a área jurídica validem a regra abaixo (seção 11). A exigência do termo como condição de participação pode conflitar com o Art. 14, § 4º, da LGPD. O texto a seguir registra a regra proposta, que pode ser substituída por uma das alternativas da seção 11.

O sistema deve condicionar a publicação de evento destinado a crianças ou adolescentes ao registro da autorização prévia de uso de imagem dos responsáveis legais. Essa autorização é coletada pela escola ou pela instituição como requisito de participação no evento.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Marcação de Evento com Menores | Conforme o [RF004] nota 10. | |
| Declaração de Coleta | Confirmação de que os termos assinados pelos responsáveis foram coletados. | 1 |
| Referência dos Termos | Onde os termos estão arquivados e quem os coletou (ex.: escola, setor do CESMAC). | 2 |
| Registro | Conta, data e hora do registro e da eventual revogação. | 3 |
| Bloqueio de Publicação | Recusa da publicação sem autorização registrada. | 4 |
| Aviso ao Visitante | Busca de menor feita pelo responsável legal. | 5 |

**Regras e observações**

1. **Autorização Obrigatória**: para que a criança ou o adolescente participe do evento, a escola ou a instituição colhe o termo de autorização de uso de imagem assinado por um dos pais ou pelo responsável legal (Art. 14, § 1º, da LGPD). Não há, nesses eventos, participante sem autorização. Por isso, o borrão do [RF033] não se aplica a eles.
2. **Referência dos Termos**: o sistema não armazena os termos nem dados das crianças. Registra apenas a declaração de coleta e a referência de onde estão arquivados, para demonstrar a autorização (Art. 8º, § 2º, e Art. 14, § 5º, da LGPD). A guarda dos termos é atribuição de quem os coletou.
3. **Registro e Revogação**: privativos do responsável pelo evento e do administrador. A revogação retira o evento da área pública até novo registro.
4. **Bloqueio de Publicação**: verificado no servidor. O evento com menores não é publicado nem reaparece na área pública sem autorização registrada, conforme o [RF006] e o [RF009].
5. **Aviso ao Visitante**: a página e o aviso do [RF015] informam que a busca pelas mídias de criança ou adolescente deve ser feita pelo responsável legal.
6. **Melhor Interesse**: o tratamento observa o melhor interesse da criança e do adolescente (Art. 14, *caput*, da LGPD). A validação desta regra pela área jurídica é pendência da seção 11.

### [RF033] Supressão de Rosto de Menor Incidental — *[Novo na v2.0]*

O sistema deve oferecer ferramenta para que quem enviou a mídia, o responsável pelo evento ou o administrador borre, no próprio arquivo, o rosto de criança ou adolescente que apareça por acaso em evento não destinado a menores.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Localização das Faces | Indicação, sobre a imagem, das faces encontradas pelo detector. | 1 |
| Seleção | Clique sobre a face a borrar. | 2 |
| Marcação Manual | Arrastar sobre a imagem para marcar face não detectada. | 2 |
| Aplicação do Borrão | Substitui o original e as versões derivadas. | 3 |
| Conferência sem Menores | "Sem menores nesta foto", registrada. | 4 |
| Aviso no Evento | Recomenda a conferência quanto a menor incidental. | 5 |

**Regras e observações**

1. **Localização das Faces**: o detector informa apenas onde estão os rostos. Não estima idade e não gera vetor ([RNF13]).
2. **Decisão Humana**: quem borra decide quais rostos são de menores. Faces pequenas, de perfil ou não detectadas são marcadas manualmente.
3. **Aplicação do Borrão**: desfoque forte com margem sobre a região.
    - Substitui o arquivo original, a prévia e a miniatura; nenhuma cópia com o rosto é mantida.
    - A operação é irreversível e exige confirmação.
    - Se a mídia já estiver publicada, é reindexada: o rosto borrado deixa de gerar vetor, o que foi verificado em teste.
4. **Conferência sem Menores**: a mídia conferida sem menores, ou já borrada, deixa de ser sinalizada no painel ([RF009] nota 4).
5. **Aviso no Evento**: em eventos não destinados a menores, o painel do evento recomenda a conferência e indica a quantidade de mídias ainda não conferidas.
6. **Vídeo**: a supressão de rosto em vídeo não integra esta versão. Vídeo com menor incidental é descartado ou substituído por versão editada fora do sistema.

### [RF034] Vídeos no Acervo — *[Novo na v2.0]*

O sistema deve admitir vídeos no acervo dos eventos, enviados, conferidos, publicados, retidos e removidos como as fotografias, com o processamento próprio do formato.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Formatos Aceitos | MP4 e MOV, verificados pela assinatura binária. | |
| Limites | Tamanho e duração máximos por arquivo, parametrizáveis ([RF026]). | 1 |
| Remoção de Localização | Metadados de geolocalização removidos. | 2 |
| Conversão | Cópia em formato reproduzível em qualquer navegador. | 3 |
| Miniatura | Gerada a partir de um quadro do vídeo. | |
| Reprodução | Em partes, sem baixar o arquivo inteiro, sempre pela interface de programação. | 4 |
| Galeria Privada | Aplicada igualmente aos vídeos. | 5 |

**Regras e observações**

1. **Limites**: os valores iniciais são fixados após prova de conceito com vídeos reais da equipe de marketing e após a ampliação do armazenamento, pré-requisito do vídeo ([RNF16]).
2. **Remoção de Localização**: vídeos de celular gravam localização. A remoção alcança o original guardado e a cópia convertida.
3. **Conversão**: executada em segundo plano. Vídeos em formato não reproduzido por todos os navegadores (por exemplo, HEVC de iPhone) são convertidos para H.264 em MP4. A cópia é guardada junto com o original, e o espaço de ambas é considerado no dimensionamento.
4. **Reprodução**: por endereços vinculados à sessão autorizada, como as fotografias.
5. **Galeria Privada**: o visitante só acessa vídeo em que foi identificado, conforme o [RF035]. Enquanto o reconhecimento em vídeo não estiver disponível, os vídeos são acessíveis apenas às contas autenticadas.
6. **Voz**: o vídeo pode conter voz, que é dado pessoal. A informação consta do [RF022].

### [RF035] Reconhecimento Facial em Vídeo — *[Novo na v2.0]*

O sistema deve permitir que o visitante localize, pela busca do [RF016], os vídeos em que aparece e os momentos de cada vídeo em que foi identificado. A implementação depende de prova de conceito aprovada.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Amostragem de Quadros | De 1 a 2 quadros por segundo de vídeo publicado. | 1 |
| Agrupamento | Faces da mesma pessoa no mesmo vídeo reunidas em grupo. | 2 |
| Vetores do Vídeo | Um conjunto reduzido de vetores por grupo, com os instantes de aparição. | 2 |
| Resultado | Vídeo e instantes em que o visitante aparece. | 3 |

**Regras e observações**

1. **Amostragem**: um vídeo de 5 minutos a 2 quadros por segundo gera cerca de 600 quadros. A taxa é definida na prova de conceito, conciliando acerto, tempo e volume de vetores.
2. **Agrupamento**: reduz o volume de vetores e evita resultados repetidos. Os vetores seguem as regras do [RF010]: somente após a publicação, escopo do evento e eliminação com o vídeo.
3. **Resultado**: o visualizador abre o vídeo no primeiro instante localizado e permite saltar para os demais.
4. **Prova de Conceito**: antes da implementação, mede tempo de processamento, acerto e quantidade de vetores com vídeo real de evento. O resultado é registrado; se for insatisfatório, o requisito permanece fora da versão.

### [RF036] Captura Guiada com Prova de Vida — *[Novo na v2.0]*

O sistema deve obter a referência da busca pública por uma captura guiada pela câmera, com movimentos em ordem sorteada, e verificar no servidor que eles foram executados. Isso impede o uso de fotografia impressa ou exibida em tela.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Dicas de Captura | Exibidas antes de abrir a câmera ([RF016] nota 9). | |
| Figura Animada | Boneco que mostra o movimento pedido em cada passo. | 1 |
| Sequência | Frente e quatro movimentos (esquerda, direita, cima, baixo) em ordem sorteada. | 2 |
| Quadros | Poucos quadros por passo, extraídos no próprio dispositivo. | 3 |
| Verificação | Movimento de cada passo medido em relação ao quadro de frente. | 4 |
| Resultado da Prova de Vida | Aprovada ou reprovada, com orientação. | 5 |
| Poses Aprovadas | Até cinco poses usadas na busca. | 6 |

**Regras e observações**

1. **Figura Animada**: orienta cada passo de forma visual, com texto curto e indicação de progresso, sem exigir leitura longa.
2. **Ordem Sorteada**: a ordem dos movimentos é sorteada a cada captura. Assim, não é possível preparar previamente um vídeo que acerte a sequência.
3. **Quadros**: o vídeo nunca é enviado nem gravado; apenas os quadros extraídos no dispositivo, com a indicação do passo a que pertencem. Os quadros seguem o [RF016] nota 4.
4. **Verificação**: feita no servidor, a partir dos pontos de referência do rosto já fornecidos pelo detector. Mede o giro e a inclinação da cabeça em cada passo, em relação ao quadro de frente, com limites acima do ruído medido em captura parada. Decidem a prova de vida os giros para a esquerda e para a direita, cujo sinal ficou bem acima do ruído na medição com rosto real (17/10/2026). A inclinação para cima e para baixo é pedida e aproveitada como pose de busca, mas não reprova, porque o seu sinal ficou no nível do ruído. Entre um movimento e outro, o visitante volta ao centro, para que um giro não se confunda com o seguinte. A sequência dos giros deve corresponder à ordem sorteada, e os quadros devem conter a mesma pessoa ([RF017] nota 7).
5. **Resultado**: reprovada a prova de vida, a busca não é executada, e o visitante recebe orientação para repetir a captura, sem detalhes da verificação. As reprovações entram apenas na contagem agregada do [RF024].
6. **Poses Aprovadas**: as melhores poses (frente, dois lados, cima e baixo) alimentam a busca do [RF016], o que também melhora o acerto em mídias de evento, onde o rosto raramente está de frente.
7. **Acessibilidade**: a alternativa para quem não consegue executar os movimentos é pendência da seção 11. Até a sua definição, essas pessoas recorrem ao encarregado pelo tratamento de dados.

### [RF037] Painel de Ocupação do Armazenamento — *[Novo na v2.0]*

O sistema deve exibir ao administrador a ocupação do armazenamento de objetos, lida diretamente do serviço de armazenamento, sem exibir as mídias.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Ocupação Total | Espaço usado e capacidade alocada. | |
| Ocupação por Evento | Espaço de cada evento, do maior para o menor. | |
| Ocupação por Tipo | Fotografia original, prévia, miniatura, vídeo original e vídeo convertido. | |
| Maiores Arquivos | Relação dos arquivos mais pesados, com evento e tipo. | 1 |
| Projeção | Ocupação prevista até o término do prazo de retenção. | 2 |

**Regras e observações**

1. **Sem Exibição de Mídia**: o painel mostra nomes de evento, tipos e tamanhos, nunca a imagem ou o vídeo. Não há acesso ao conteúdo a partir dele.
2. **Projeção**: considera os eventos publicados e as datas de expiração, confrontadas com a capacidade do [RNF16].
3. **Acesso**: privativo do administrador, na plataforma web.

### [RF038] Exclusão de Evento com Prazo para Desfazer — *[Novo na v2.0]*

O sistema deve permitir que o responsável pelo evento ou o administrador exclua o evento antes da expiração. O evento sai da área pública e os vetores faciais são eliminados de imediato; as mídias aguardam um prazo, durante o qual a exclusão pode ser desfeita, e então são eliminadas.

| Campo ou elemento | Especificação | Obs. |
|---|---|:--:|
| Quem Exclui | Responsável pelo evento ou administrador. | 1 |
| Confirmação | Janela que informa a data em que o acervo será eliminado. | 2 |
| Efeito Imediato | Saída da área pública, retorno das mídias à conferência, eliminação dos vetores faciais, encerramento das buscas em curso e bloqueio de envio e de publicação. | 3 |
| Prazo para Desfazer | Em dias, parâmetro do administrador ([RF026]); inicial de 7. | 4 |
| Desfazer a Exclusão | Retorno do evento despublicado, com as mídias em conferência, até nova publicação. | 5 |
| Eliminação | Ao término do prazo: mídias, versões derivadas, metadados e o próprio evento. | 6 |
| Registro da Operação | Quem pediu, quem desfez, data, hora e quantidade de itens eliminados. | 7 |

**Regras e observações**

1. **Quem Exclui**: o colaborador, a conta temporária e a conta de marketing sem responsabilidade pelo evento não excluem. Evento expirado não é excluído, porque o seu acervo já foi eliminado ([RF006]).
2. **Confirmação**: a janela informa a data da eliminação definitiva e que, até lá, a exclusão pode ser desfeita. Enquanto o prazo corre, o evento exibe o aviso "Exclusão agendada", com a data.
3. **Efeito Imediato**: o vetor facial é dado biométrico, portanto dado pessoal sensível (Art. 5º, II, da LGPD). Sem o evento na área pública, não há finalidade para mantê-lo, e ele é eliminado na hora (Art. 6º, III, e Art. 15, I). Pelo mesmo motivo, encerram-se os resultados das buscas em curso no evento.
4. **Prazo para Desfazer**: protege contra a exclusão por engano. Durante o prazo, as mídias permanecem guardadas, sem acesso público e sem vetores.
5. **Desfazer a Exclusão**: o evento permanece despublicado ("Em Edição"), com as mídias em conferência, e o sistema avisa que é preciso publicar de novo. Assim o responsável pode excluir mídias antes de o evento voltar ao público. A nova publicação reindexa as mídias ([RF009], [RF010]): nada retorna à área pública sem esse ato.
6. **Eliminação**: segue a abrangência do [RF006] nota 6 e é executada por rotina automática. Os registros de aceite do aviso de permissão ([RF015]) são mantidos sem o vínculo com o evento, como prova do que o visitante aceitou.
7. **Registro da Operação**: integra o [RF024] e é preservado após a eliminação.
8. **Evento Congelado**: durante o prazo, o servidor recusa editar o evento, alterar a colaboração, registrar autorização, enviar e publicar mídias, ainda que a tela já oculte esses comandos. Para alterá-lo, é preciso desfazer a exclusão.

# 4. Requisitos não funcionais

| ID | Requisito | Descrição | Prioridade |
|:--:|:---|:---|:--:|
| **[RNF01]** | Requisito de produto – facilidade de uso | O visitante localiza as suas mídias em, no máximo, três interações a partir da tela inicial: localizar o evento, manifestar ciência e realizar a captura guiada. *(alterado)* | Essencial |
| **[RNF02]** | Requisito de produto – facilidade de uso | A conferência das mídias é concluída por uma única ação de publicação do conjunto, com intervenção individual apenas nas mídias a descartar ou borrar, de modo a comportar 35 a 40 eventos por mês. Cada conta confere as mídias que enviou; a publicação cabe ao responsável pelo evento. | Essencial |
| **[RNF03]** | Requisito de produto – facilidade de uso | Mensagens de erro informam de forma clara o motivo e a maneira de resolver, sem detalhes técnicos internos. | Importante |
| **[RNF04]** | Requisito de produto – desempenho | A busca pública, a partir do envio dos quadros da captura guiada, retorna o resultado em tempo interativo, da ordem de segundos, para eventos com até 5.000 faces indexadas. *(alterado)* | Essencial |
| **[RNF05]** | Requisito de produto – desempenho | A fila de indexação processa, no mínimo, 500 imagens por hora em processador comum, sem unidade de processamento gráfico, suportando até 3 eventos publicados no mesmo dia. *(alterado)* | Essencial |
| **[RNF06]** | Requisito de produto – desempenho | As telas de listagem de eventos e de resultado de busca são carregadas em até 3 segundos em conexões móveis de 10 Mbps, com carregamento progressivo das miniaturas. | Essencial |
| **[RNF07]** | Requisito de produto – desempenho no aplicativo móvel | O aplicativo móvel é leve, não carrega mídias em resolução original para exibição e permanece responsivo durante envios e downloads em segundo plano. *(alterado)* | Essencial |
| **[RNF08]** | Requisito de produto – portabilidade e leiaute | A plataforma web tem leiaute próprio para computador, que aproveita a largura da tela, e adapta-se a tablets. Acessada por telefone celular, recomenda o aplicativo. Fotógrafo, marketing e fotógrafo contratado executam todas as suas funções também pelo aplicativo. O aplicativo móvel segue o projeto do CITEC no Figma, adaptado no mesmo padrão onde o projeto não cobrir as funções desta versão. *(alterado)* | Essencial |
| **[RNF09]** | Requisito de produto – confiabilidade | Falhas no processamento de mídias não interrompem a fila de indexação, de testes de precisão ou de conversão de vídeo; o sistema retoma automaticamente, sem perder arquivos enviados nem decisões de conferência. *(alterado)* | Essencial |
| **[RNF10]** | Requisito de produto – segurança | Todo o tráfego ocorre sobre HTTPS com TLS 1.2 ou superior; o armazenamento é privado, sem acesso público direto; aplicam-se limites de requisição nas rotas públicas de busca, download e remoção e na autenticação. | Essencial |
| **[RNF11]** | Requisito de produto – conformidade legal | O sistema observa a LGPD, tratando vetores biométricos e imagens faciais como dados pessoais sensíveis (Art. 5º, II), obtendo manifestação prévia do visitante antes de processar a captura que ele fornece, registrando a autorização das pessoas institucionais antes de gerar os seus vetores e tratando dados de crianças e adolescentes no seu melhor interesse (Art. 14). A base legal para gerar os vetores das pessoas retratadas no acervo é pendência da seção 11. *(alterado)* | Essencial |
| **[RNF12]** | Requisito de produto – conformidade legal | Política de retenção que elimina automaticamente mídias (fotografias e vídeos), versões derivadas e vetores decorridos 6 meses da data do evento, parametrizável pelo administrador e informada publicamente. *(alterado)* | Essencial |
| **[RNF13]** | Requisito de produto – conformidade legal | Nenhuma mídia gera vetor biométrico **armazenado** antes de publicada, assegurando que mídias descartadas não originem tratamento de dado sensível. A localização de faces da ferramenta de borrão ([RF033]) não gera vetor; o teste de precisão ([RF029]) opera apenas sobre mídias publicadas. *(alterado)* | Essencial |
| **[RNF14]** | Requisito de produto – conformidade legal | O sistema exporta os registros de operações, as consultas institucionais, as evidências de manifestação de ciência, as autorizações de pessoas institucionais e de eventos com menores e os downloads para divulgação, viabilizando a demonstração de conformidade e o relatório de impacto à proteção de dados pessoais (Art. 38 da LGPD). *(alterado)* | Importante |
| **[RNF15]** | Requisito de produto – capacidade | O sistema suporta eventos com até 1.000 fotografias, cadência de 35 a 40 eventos por mês e cerca de 240 eventos simultaneamente publicados, sem degradação perceptível. O volume praticado situa-se entre 100 e 500 fotografias por evento. A capacidade para vídeo é fixada após a prova de conceito do [RF034]. *(alterado)* | Essencial |
| **[RNF16]** | Requisito de produto – armazenamento | Armazenamento de objetos compatível com S3 (SeaweedFS), em servidor próprio da instituição destinado à aplicação, distinto do servidor de cópias de segurança. A capacidade inicial é de 300 GB, dimensionada para fotografias. Uma fotografia ocupa em média 4,26 MB (original, prévia e miniatura), e um evento de 1.000 fotografias, cerca de 4,3 GB. A entrada de vídeo exige ampliação prévia, sem alteração da aplicação: por estimativa, 35 vídeos de 5 minutos em 1080p gravados em celular ocupam de 18 a 29 GB com a cópia convertida (o espaço de 4 a 7 eventos só de fotografias), e cerca de 74 GB se gravados em câmera profissional; as taxas devem ser confirmadas com vídeos reais. Formatos brutos de câmera ocupam, por estimativa, de 25 a 60 MB por fotografia (de 25 a 60 GB por evento de 1.000 fotografias, além das cópias JPEG) e só são habilitados com espaço disponível, confirmado com arquivos reais da câmera do fotógrafo. *(alterado)* | Essencial |
| **[RNF17]** | Requisito de produto – escalabilidade | A busca por similaridade usa índice vetorial apropriado (HNSW), de modo que o tempo de consulta cresça de forma sublinear em relação às faces indexadas. | Essencial |
| **[RNF18]** | Requisito de produto – acurácia | O reconhecimento facial deve apresentar taxa de falso positivo máxima de 0,5% e revocação mínima de 80% em teste de precisão representativo ([RF029]), privilegiando a precisão. As métricas são documentadas e reavaliadas a cada alteração de motor, configuração ou limiar. No Teste 1, o YuNet + SFace com uma única foto de referência obteve, no limiar 0,3741, 48 de 59 imagens certas (revocação de 81%) com 1 erro. A meta foi revista de 85% para 80% nesta versão, porque o modelo é fixo e não pode ser retreinado com o acervo; deve ser reavaliada após novos testes com mais fotografias e vídeos, inclusive com a captura de várias poses ([RF036]). *(alterado)* | Essencial |
| **[RNF19]** | Requisito de produto – interoperabilidade | Comunicação por interface REST versionada e documentada em OpenAPI, consumida de forma idêntica pela plataforma web e pelo aplicativo móvel. | Essencial |
| **[RNF20]** | Requisito de produto – testabilidade | Testes automatizados cobrindo no mínimo 70% das regras de negócio. Incluem: regressão do reconhecimento facial (paridade com o fotomac-lab); impossibilidade de acesso a mídias sem busca; de indexação sem publicação; de busca sem prova de vida; de publicação de evento com menores sem autorização; de acesso de conta temporária expirada ou fora do evento; aplicação da marca d'água nos downloads do visitante e a sua ausência nos downloads das contas; eliminação imediata dos vetores na exclusão de evento; exigência dos dados de identificação da conta temporária; e ausência de vetor em rosto borrado. *(alterado)* | Essencial |
| **[RNF21]** | Requisito de produto – registro e auditoria | Registro nominal das operações administrativas e das consultas institucionais, e agregado das consultas públicas, vedado o registro de imagens, quadros, vetores ou dados que identifiquem o visitante. | Essencial |
| **[RNF22]** | Requisito de produto – manutenibilidade | Repositório único com histórico auditável e módulos independentes. O reconhecimento facial é acessado exclusivamente por interface interna própria (porta), e cada motor é um adaptador registrado em catálogo, escolhido pelo administrador sem alteração das demais camadas. A dimensão do vetor é parametrizada por motor. *(alterado)* | Importante |
| **[RNF23]** | Requisito de produto – idioma | Todos os textos exibidos ao usuário em português do Brasil; nomenclatura técnica em inglês apenas na interface de programação e no código. | Essencial |
| **[RNF24]** | Requisito de produto – independência de interface | Separação estrita entre apresentação e regras de negócio, de modo que o projeto de interface possa ser aplicado sem alterar o comportamento especificado. | Essencial |
| **[RNF25]** | Requisito de produto – acessibilidade | Observância das recomendações WCAG 2.1 nível AA: contraste, navegação por teclado, leitores de tela e alternativa acessível à captura guiada (seção 11). *(alterado)* | Desejável |
| **[RNF26]** | Requisito de produto – licenciamento | Todo componente da instalação de produção tem licença compatível com o uso institucional sem custo: YuNet (MIT), SFace (Apache 2.0), OpenCV (Apache 2.0), PostgreSQL, pgvector, SeaweedFS, FFmpeg em compilação LGPL e as bibliotecas de conversão de imagem (libheif e LibRaw), com licenças a confirmar. Modelos de licença restrita a pesquisa, como os do InsightFace, servem apenas de referência de comparação no teste de precisão, não podem ser ativados e não integram a instalação de produção. *(novo)* | Essencial |
| **[RNF27]** | Requisito de produto – confiabilidade do reconhecimento | Falha segura: indisponível o motor de reconhecimento facial, a aplicação continua no ar, a busca é pausada com aviso, a fila de indexação aguarda sem consumir tentativas e o administrador é informado. O sistema nunca troca de motor por conta própria. *(novo)* | Essencial |
| **[RNF28]** | Requisito de produto – navegação | Toda tela interna exibe botão "Voltar" visível e trilha de navegação (por exemplo, Eventos › Evento › Mídias › Mídia), permitindo retornar com uma interação. *(novo)* | Importante |
| **[RNF29]** | Requisito de produto – documentação de uso | Tutorial escrito por perfil (fotógrafo, marketing, fotógrafo contratado e administrador), com imagens de tela que não exibam rostos ou dados de terceiros, atualizado a cada versão. *(novo)* | Importante |
| **[RNF30]** | Requisito de produto – desempenho da captura guiada | A captura guiada é concluída em até 15 segundos em condições normais, e a prova de vida reprova menos de 10% das capturas de pessoas reais que seguem as instruções, medido em homologação. *(novo)* | Importante |
| **[RNF31]** | Requisito de produto – facilidade de uso | O painel reúne, no sino do cabeçalho e na visão geral, o que exige ação da conta: pedidos de remoção, exclusões agendadas, mídias aguardando aprovação (administrador) ou publicação, falhas de indexação e eventos a menos de 30 dias da expiração; ao fotógrafo contratado, a validade da conta e as mídias à espera de aprovação. Cada aviso indica o evento e leva ao lugar da ação. Os avisos são calculados a partir dos dados a cada consulta, sem registro próprio, e somem quando a situação é resolvida; o contador do sino mostra apenas os urgentes. Na visão geral, o administrador vê os números do sistema inteiro (eventos ativos, mídias aguardando aprovação, remoções pendentes e falhas). *(novo)* | Importante |

# 5. Requisitos de segurança

| ID | Perigo | Soluções |
|:--:|:---|:---|
| **[RS001]** | No [RF014] foi identificado que exibir o acervo antes da busca, ainda que em miniatura, expõe publicamente todas as pessoas fotografadas. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Vedar tecnicamente o retorno de qualquer mídia antes da busca. 2- Aplicar a verificação no servidor. 3- Testar automaticamente a impossibilidade de acesso sem busca. |
| **[RS002]** | No [RF016] foi identificado que limiar mal calibrado entrega ao visitante mídia de terceiro. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Calibrar pelo teste de precisão ([RF029]) privilegiando a precisão. 2- Comunicar que o resultado indica similaridade, não identidade. 3- Repetir o teste a cada alteração de motor, configuração ou limiar. |
| **[RS003]** | No [RF010] foi identificado que indexar mídias antes da publicação gera vetores de pessoas em mídias destinadas ao descarte, inclusive menores. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Condicionar a indexação à publicação. 2- Testar a ausência de vetor em mídias em conferência ou descartadas. 3- Suprimir rostos no próprio arquivo ([RF033]). |
| **[RS004]** | No [RF016] foi identificado que buscas sucessivas permitiriam a extração progressiva do acervo de um evento. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Limitar buscas por sessão e por endereço. 2- Sinalizar volume atípico. 3- Restringir o download à forma individual ([RF019]). |
| **[RS005]** | No [RF016] foi identificado que um visitante pode usar a imagem de outra pessoa para obter as mídias dela. *(alterado)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Restringir a busca a um único evento. 2- Admitir uma só face por consulta ([RF017]). 3- Obter a referência apenas pela câmera, com prova de vida ([RF036]); vedar a galeria. 4- Exibir aviso de uso responsável. 5- Manter a remoção na própria mídia e o canal do encarregado. |
| **[RS006]** | No [RF021] foi identificado que estender a consulta institucional a pessoas não cadastradas converteria o sistema em instrumento de rastreamento. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Consulta apenas por seleção de pessoa cadastrada e ativa. 2- Vedar fotografia como critério. 3- Condicionar o cadastro à autorização registrada. 4- Registrar nominalmente toda consulta. |
| **[RS007]** | No [RF020] foi identificado que cadastrar pessoa institucional sem autorização caracteriza tratamento de dado sensível sem base legal. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Não gerar vetores antes do aceite registrado. 2- Revogação a qualquer tempo, sem justificativa. 3- Eliminar referências, vetores e marcações em até 5 dias da revogação. |
| **[RS008]** | No [RF010] foi identificado que o vazamento da base de vetores é dano irreversível: a face não pode ser trocada como uma senha. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Vetores em tabela segregada, com acesso próprio. 2- Segregar vetores institucionais dos do acervo. 3- Registrar e monitorar leitura em massa. 4- Criptografar em repouso a base de dados, o armazenamento de objetos e as cópias de segurança (Art. 46 da LGPD). |
| **[RS009]** | No [RF015] foi identificado que capturar o rosto sem ciência prévia é tratamento de dado sensível sem informação ao titular. *(alterado)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Exibir o aviso antes de abrir a câmera. 2- Bloquear no servidor a geração de vetor sem manifestação. 3- Vedar aceite tácito. |
| **[RS010]** | No [RF016] foi identificado que reter os quadros da captura contrariaria o informado ao visitante. *(alterado)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Nunca enviar o vídeo; manter os quadros apenas em memória. 2- Vedar gravação em disco, log ou cache. 3- Testar automaticamente o descarte. |
| **[RS011]** | No [RF001] foi identificado que a ligação de definição de senha pode ser interceptada ou reutilizada. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Ligação de uso único, válida por até 24 horas. 2- Vedar senha atribuída pelo administrador ou padrão. 3- Destacar contas em "Acesso Pendente". 4- Vedar exibição ou recuperação de senha alheia. |
| **[RS012]** | No [RF007] foi identificado que identificadores previsíveis permitiriam enumerar o acervo. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Identificadores aleatórios. 2- Entrega apenas por endereços vinculados à sessão. 3- Exigir resultado de busca válido. |
| **[RS013]** | No [RF019] foi identificado que endereços de download compartilhados dariam acesso a terceiros. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Endereços assinados de até 15 minutos. 2- Vínculo com a sessão. 3- Limitação à mídia autorizada. |
| **[RS014]** | No [RF002] foi identificado que a falta de verificação de perfil no servidor permitiria operações administrativas pela área pública. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Controle de acesso por papéis no servidor. 2- Rejeitar antes de processar. 3- Registrar tentativas não autorizadas. |
| **[RS015]** | No [RF012] foi identificado que a exposição do download em pacote permitiria extrair o acervo inteiro. *(alterado)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Restringir aos perfis autorizados. 2- Nunca expor em tela pública. 3- Registrar cada extração, inclusive as da equipe de marketing. |
| **[RS016]** | No [RF007] foi identificado que arquivos podem conter conteúdo malicioso ou tipo diverso do declarado. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Validar pela assinatura binária. 2- Verificação antivírus. 3- Processar vídeos em ambiente isolado. |
| **[RS017]** | No [RF016] foi identificado que a inferência tem custo elevado e pode ser explorada para exaurir o servidor. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Limitar buscas por sessão e endereço. 2- Enfileirar em alta demanda. 3- Monitorar o tempo de resposta. |
| **[RS018]** | No [RF002] foi identificado que a autenticação pode sofrer força bruta. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Bloqueio após 5 falhas. 2- Limite por endereço. 3- Desafio de verificação após falhas repetidas. |
| **[RS019]** | No [RF013] foi identificado que campos de pesquisa podem ser usados para injeção de comandos. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Consultas parametrizadas. 2- Validação de toda entrada no servidor. |
| **[RS020]** | No [RF007] foi identificado que a configuração padrão do armazenamento pode expor o acervo. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Repositórios privados por padrão. 2- Endurecimento dos servidores. 3- Verificação periódica da exposição. |
| **[RS021]** | No [RF007] foi identificado que metadados revelam a localização da captação. *(alterado)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Remover a geolocalização de fotografias e vídeos, nos originais, nas cópias e nos downloads; nos formatos brutos em que a remoção não for tecnicamente segura, o original só integra o pacote de guarda, e a cópia JPEG é entregue sem localização. 2- Preservar apenas dados de organização e créditos. |
| **[RS022]** | No [RF023] foi identificado que identificar a mídia de forma imprecisa resulta em exclusão irreversível de outra mídia. *(alterado)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Iniciar a solicitação apenas a partir da mídia aberta no resultado. 2- Exibir a mídia antes de confirmar. 3- Registrar a operação. |
| **[RS023]** | No [RF006] foi identificado que falhas na expiração mantêm mídias e vetores além do prazo declarado. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Registrar e auditar cada rotina. 2- Alertar o administrador se não concluir. 3- Compatibilizar as cópias de segurança com o prazo. |
| **[RS024]** | No [RF024] foi identificado que o registro excessivo de consultas públicas identificaria os visitantes. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Registro agregado e sem identificação. 2- Vedar registro de quadros e vetores. 3- Limitar a retenção. |
| **[RS025]** | No [RF009] foi identificado que publicar o conjunto sem decisão individual pode tornar pública mídia indesejada. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Advertir quanto a menores na tela de envio. 2- Informar a quantidade antes de publicar. 3- Manter o descarte após a publicação, com exclusão dos vetores. |
| **[RS026]** | Foi identificado que mensagens de erro detalhadas revelam a estrutura interna. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Mensagens genéricas ao usuário. 2- Detalhes em logs de acesso restrito. |
| **[RS027]** | No [RF025] foi identificado que a colaboração permite a qualquer conta enviar ao evento, podendo incluir material estranho ou descartar mídia alheia. | Para resolver o perigo deve tomar as seguintes atitudes: 1- Restringir descarte e exclusão às próprias mídias, salvo responsável e administrador. 2- Publicação reservada ao responsável. 3- Registrar todo envio, descarte e exclusão. |
| **[RS028]** | No [RF036] foi identificado que fotografia impressa, tela de celular ou vídeo gravado de outra pessoa podem ser apresentados à câmera no lugar do visitante. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Movimentos em ordem sorteada a cada captura. 2- Verificação do movimento no servidor, relativo ao quadro de frente. 3- Exigir a mesma pessoa em todos os quadros. 4- Vedar a galeria. 5- Avaliar modelo passivo antifraude (seção 11). |
| **[RS029]** | No [RF031] foi identificado que conta temporária usada após o evento ou para enviar conteúdo impróprio. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Validade de 24 horas e vínculo a um evento, verificados no servidor. 2- Aprovação do administrador antes da publicação. 3- Registro de todo envio. 4- Cláusula de operador no contrato. |
| **[RS030]** | No [RF030] foi identificado que uso do acervo na divulgação sem que os titulares tenham sido informados dessa finalidade. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Declarar a finalidade na política e nos avisos ([RF022]). 2- Restringir às mídias publicadas e não sujeitas a remoção. 3- Registrar cada download. 4- Definir a base legal com a área jurídica. |
| **[RS031]** | No [RF032] foi identificado que publicação de evento com crianças sem a autorização dos responsáveis. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Bloquear a publicação no servidor. 2- Registrar declaração, referência dos termos, conta e data. 3- Retirar o evento da área pública na revogação ou na marcação posterior. |
| **[RS032]** | No [RF033] foi identificado que borrão insuficiente ou aplicado só na tela deixa o rosto recuperável. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Aplicar no arquivo e substituir original, prévia e miniatura. 2- Desfoque forte, com margem. 3- Reindexar a mídia publicada e verificar que o rosto não gera vetor. |
| **[RS033]** | No [RF029] foi identificado que o teste de precisão poderia ser usado para procurar qualquer pessoa no acervo. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Restringir ao administrador e a eventos publicados. 2- Exigir declaração de consentimento da pessoa de referência. 3- Processar em memória e manter apenas agregados após o encerramento. 4- Encerrar automaticamente após 30 dias. 5- Registrar a criação e o encerramento. |
| **[RS034]** | No [RF026] foi identificado que trocar o motor mantendo o limiar do anterior entregaria mídias de terceiros. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Restaurar os parâmetros próprios do novo motor. 2- Exigir confirmação de ciência. 3- Carregar e verificar o novo motor antes da troca. 4- Reindexar e comparar apenas vetores do motor ativo. 5- Nunca trocar automaticamente. |
| **[RS035]** | No [RF034] foi identificado que vídeos carregam localização e voz. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Remover a geolocalização. 2- Informar a presença de voz na transparência. 3- Aplicar a galeria privada aos vídeos. |
| **[RS036]** | No [RF021] foi identificado que marcação automática errada atribui imagem de terceiro a pessoa institucional. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Limiar próprio, nunca menos exigente que o da busca pública. 2- Confirmação humana antes do uso. 3- Registro do grau de similaridade. |
| **[RS037]** | No [RF020] foi identificado que ligação de autorização interceptada ou aceite sem prova. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Ligação de uso único, com validade limitada, enviada só ao e-mail cadastrado. 2- Registrar versão do termo, data e hora. 3- Mensagem de confirmação com ligação de revogação. |
| **[RS038]** | No [RF031] foi identificado que os dados de identificação do fotógrafo contratado (CPF e data de nascimento), se vazados ou guardados sem prazo, expõem o titular a fraudes. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Coletar apenas nome, CPF, data de nascimento e número do contrato. 2- Restringir o acesso ao administrador e mascarar o CPF nas telas. 3- Criptografar em repouso. 4- Eliminar o CPF e a data de nascimento ao término do prazo de guarda. |
| **[RS039]** | No [RF036] foi identificado que a prova de vida feita no navegador pode ser enganada por quem reúna, previamente, fotografias da mesma pessoa com o rosto voltado para cada lado (por exemplo, de redes sociais) e as apresente na ordem sorteada, pois é o dispositivo do visitante que informa a qual passo pertence cada quadro. *(novo — risco residual)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Apresentar a prova de vida como barreira ao caso comum (fotografia impressa ou na tela), e não como verificação antifraude. 2- Manter os limites de buscas por sessão e por endereço e o registro agregado ([RS004], [RS017]). 3- Manter a remoção a pedido da pessoa retratada ([RF023]). 4- A eliminação completa exige recurso fora do escopo desta versão: equipamento dedicado (câmera de profundidade) ou modelo passivo antifraude avaliado e licenciado (seção 11). |
| **[RS040]** | No [RF002] foi identificado que outra página hospedada em endereço da própria instituição (*.cesmac.edu.br) poderia fazer o navegador de quem está autenticado enviar ações ao sistema, pois o navegador trata esses endereços como o mesmo sítio. *(novo)* | Para resolver o perigo deve tomar as seguintes atitudes: 1- Recusar, no servidor, toda requisição que altere dados vinda de origem não autorizada. 2- Manter o cookie de sessão inacessível a scripts e restrito ao mesmo sítio. 3- Testar automaticamente a recusa. |

# 6. Matriz de avaliação de risco

A matriz classifica os requisitos de segurança conforme a probabilidade de ocorrência do perigo e a severidade das consequências para o titular e para a instituição.

| Segurança/probabilidade | Catastrófico (1) | Crítico (2) | Marginal (3) | Insignificante (4) |
|:--:|:---|:---|:---|:---|
| **Frequente (A)** | | | | |
| **Provável (B)** | RS001 | RS002, RS003, RS025, RS030 | RS017, RS026, RS035 | RS021 |
| **Ocasional (C)** | RS005, RS006, RS028, RS031 | RS004, RS012, RS022, RS034 | RS013, RS018, RS027, RS029, RS036 | RS024 |
| **Remoto (D)** | RS007, RS039 | RS008, RS015, RS020, RS032, RS033, RS037, RS038, RS040 | RS011, RS014, RS019 | RS023 |
| **Improvável (E)** | RS009, RS010 | RS016 | | |
| **Eliminado (F)** | | | | |

A área pública é acessível sem autenticação e o acervo reúne pessoas identificáveis. Por isso, os perigos que resultariam em exposição de mídias a quem nelas não aparece receberam a maior severidade. Nesta versão, somam-se a eles dois perigos novos:

- o uso de fotografia de terceiro diante da câmera (RS028), contido pela prova de vida;
- a publicação de evento com crianças sem autorização dos responsáveis (RS031), contida pelo bloqueio no servidor.

A prova de vida reduz, mas não elimina, o uso de imagens de terceiros: um conjunto de fotografias da mesma pessoa em poses diferentes, reunido previamente, ainda pode passar (RS039). Esse risco residual fica declarado e a sua eliminação depende de recurso fora do escopo desta versão.

A divulgação institucional pela equipe de marketing (RS030) foi classificada como provável enquanto a finalidade não estiver declarada e a base legal definida.

# 7. Matriz de rastreabilidade – Requisito Funcional

Na matriz a seguir, a letra "R" identifica o próprio requisito e a letra "D" identifica os requisitos dos quais ele depende para funcionar corretamente.

| Requisito | Depende de |
|:--:|:---|
| RF001 | — |
| RF002 | RF001 |
| RF003 | RF001, RF002 |
| RF004 | RF002, RF027 |
| RF005 | RF004 |
| RF006 | RF004, RF009, RF010 |
| RF007 | RF002, RF004, RF025, RF026, RF031 |
| RF008 | RF007 |
| RF009 | RF007, RF025, RF031, RF032, RF033 |
| RF010 | RF009, RF026 |
| RF011 | RF007, RF009, RF010, RF025 |
| RF012 | RF002, RF009, RF025 |
| RF013 | RF004, RF006, RF027 |
| RF014 | RF013 |
| RF015 | RF014 |
| RF016 | RF010, RF014, RF015, RF017, RF026, RF036 |
| RF017 | RF010, RF026 |
| RF018 | RF016 |
| RF019 | RF016, RF018, RF026 |
| RF020 | RF002 |
| RF021 | RF010, RF020, RF024, RF026 |
| RF022 | RF015 |
| RF023 | RF011, RF018, RF022 |
| RF024 | RF002 |
| RF025 | RF004 |
| RF026 | RF002, RF024 |
| RF027 | RF002 |
| RF028 | RF010, RF026 |
| RF029 | RF002, RF010, RF026, RF036 |
| RF030 | RF001, RF004, RF007, RF012, RF022, RF024 |
| RF031 | RF001, RF002, RF003, RF007, RF009, RF024 |
| RF032 | RF004, RF006, RF009, RF015 |
| RF033 | RF009, RF010, RF011 |
| RF034 | RF006, RF007, RF009, RF026 |
| RF035 | RF010, RF016, RF034 |
| RF036 | RF015, RF017 |
| RF037 | RF002, RF006 |
| RF038 | RF004, RF006, RF010, RF024 |

# 8. Ponto de função

Para conhecer o tamanho funcional de um software, mede-se a quantidade de funcionalidades que ele fornece ao usuário. A Análise por Pontos de Função divide o software em partes menores e conta as funcionalidades de cada uma, chegando ao tamanho total.

## 8.1 Componentes fundamentais

**Funções do tipo Dado** são as relacionadas ao armazenamento: o Arquivo Lógico Interno e o Arquivo de Interface Externa. **Funções do tipo Transação** são as atividades de processamento realizadas pelo usuário: a Entrada Externa, a Saída Externa e a Consulta Externa.

- **Arquivo Lógico Interno (ALI)**: grupo de dados relacionados, reconhecidos pelo usuário e armazenados dentro da fronteira da aplicação. Exemplos: contas, eventos, mídias, vetores, temas, testes de precisão e registros de operações.
- **Arquivo de Interface Externa (AIE)**: grupo de dados mantido por outra aplicação. Exemplos: o armazenamento de objetos, o motor de reconhecimento facial e a ferramenta de processamento de vídeo.
- **Entrada Externa (EE)**: processamento de dados recebidos que inclui, altera ou exclui dados no ALI. Exemplos: cadastro de evento, envio de mídias, borrão de rostos.
- **Saída Externa (SE)**: envio de dados ao exterior mediante cálculo ou processamento. Exemplos: resultado da busca, resultado do teste de precisão, relatório operacional.
- **Consulta Externa (CE)**: recuperação de dados sem cálculo. Exemplos: listagem pública de eventos, página do evento, painel do armazenamento.

## 8.2 Determinação do tipo de contagem

Utiliza-se a contagem para projeto em desenvolvimento, que mede a funcionalidade fornecida aos usuários na primeira instalação, ao término do projeto.

## 8.3 Determinação do escopo e da fronteira

O escopo compreende os requisitos funcionais dos módulos de contas e acesso, eventos, mídias, acesso público e busca, privacidade e conformidade, reconhecimento facial e calibração, e vídeo. São arquivos de interface externa o serviço de armazenamento de objetos, o motor de reconhecimento facial e a ferramenta de processamento de vídeo.

## 8.4 Cálculo dos pontos de função não ajustados

O tamanho funcional resulta da medição dos cinco componentes (ALI, AIE, EE, SE e CE), multiplicando-se a quantidade de cada componente pelo valor da complexidade atribuída.

| Requisito | Complexidade | ALI | AIE | SE | EE | CE | Total |
|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| RF001 | ALTA | 10 | 5 | 5 | 6 | 3 | 29 |
| RF002 | ALTA | 10 | 5 | 5 | 6 | 3 | 29 |
| RF003 | BAIXA | 7 | 0 | 4 | 3 | 3 | 17 |
| RF004 | ALTA | 15 | 0 | 5 | 6 | 4 | 30 |
| RF005 | MÉDIA | 10 | 0 | 4 | 4 | 4 | 22 |
| RF006 | MÉDIA | 10 | 5 | 5 | 4 | 3 | 27 |
| RF007 | ALTA | 15 | 10 | 5 | 6 | 4 | 40 |
| RF008 | MÉDIA | 7 | 0 | 5 | 4 | 4 | 20 |
| RF009 | ALTA | 10 | 0 | 7 | 6 | 6 | 29 |
| RF010 | ALTA | 15 | 10 | 7 | 6 | 4 | 42 |
| RF011 | ALTA | 10 | 7 | 5 | 6 | 6 | 34 |
| RF012 | MÉDIA | 7 | 7 | 5 | 4 | 3 | 26 |
| RF013 | MÉDIA | 7 | 0 | 5 | 3 | 6 | 21 |
| RF014 | ALTA | 10 | 0 | 7 | 3 | 6 | 26 |
| RF015 | MÉDIA | 10 | 0 | 4 | 4 | 3 | 21 |
| RF016 | ALTA | 15 | 10 | 7 | 6 | 6 | 44 |
| RF017 | ALTA | 7 | 5 | 7 | 6 | 3 | 28 |
| RF018 | MÉDIA | 7 | 5 | 5 | 3 | 6 | 26 |
| RF019 | ALTA | 10 | 10 | 7 | 6 | 4 | 37 |
| RF020 | ALTA | 15 | 7 | 5 | 6 | 4 | 37 |
| RF021 | ALTA | 15 | 10 | 7 | 6 | 6 | 44 |
| RF022 | BAIXA | 7 | 0 | 4 | 3 | 3 | 17 |
| RF023 | ALTA | 10 | 0 | 7 | 6 | 4 | 27 |
| RF024 | ALTA | 15 | 0 | 7 | 6 | 4 | 32 |
| RF025 | MÉDIA | 10 | 0 | 4 | 4 | 4 | 22 |
| RF026 | ALTA | 10 | 10 | 5 | 6 | 3 | 34 |
| RF027 | MÉDIA | 7 | 0 | 4 | 4 | 4 | 19 |
| RF028 | MÉDIA | 7 | 10 | 5 | 4 | 3 | 29 |
| RF029 | ALTA | 15 | 10 | 7 | 6 | 6 | 44 |
| RF030 | MÉDIA | 7 | 5 | 5 | 4 | 4 | 25 |
| RF031 | ALTA | 15 | 0 | 5 | 6 | 4 | 30 |
| RF032 | MÉDIA | 7 | 0 | 4 | 4 | 3 | 18 |
| RF033 | ALTA | 7 | 10 | 5 | 6 | 3 | 31 |
| RF034 | ALTA | 15 | 10 | 5 | 6 | 4 | 40 |
| RF035 | ALTA | 15 | 10 | 7 | 6 | 6 | 44 |
| RF036 | ALTA | 7 | 10 | 7 | 6 | 3 | 33 |
| RF037 | BAIXA | 0 | 7 | 5 | 0 | 4 | 16 |
| RF038 | MÉDIA | 7 | 0 | 4 | 4 | 3 | 18 |
| **Total de pontos de função não ajustados** | | | | | | | **1108** |

O tamanho funcional estimado passa de 791 pontos de função não ajustados, na versão 1.6, para 1.108 na versão 2.0, distribuídos entre 38 requisitos funcionais. Os dez requisitos novos somam 294 pontos. Os [RF007], [RF019], [RF020], [RF026], [RF027] e [RF031] cresceram com os novos formatos, a marca d'água, a autorização por e-mail, a troca de motor, os temas com ícone e autor e a identificação do fotógrafo contratado. Os [RF010], [RF016], [RF021], [RF029] e [RF035] concentram a maior parcela, coerente com o fato de constituírem o núcleo de reconhecimento facial do sistema e a origem da maior parte do seu risco técnico e jurídico.

# 9. Fases de entrega

O sequenciamento organiza a construção do sistema de modo que cada fase produza um conjunto funcional verificável. As fases são referenciais e não alteram a prioridade dos requisitos. A situação de cada fase registra o andamento em 17/10/2026.

| Fase | Escopo |
|:---|:---|
| **Fase 1 — Administração e acervo** | Contas, autenticação, eventos, envio, conferência, publicação, indexação, colaboração. Requisitos: RF001–RF012, RF025. **Situação:** Concluída na versão 1.6. |
| **Fase 2 — Acesso público** | Listagem, página do evento, aviso de permissão, busca, visualização e download. Requisitos: RF013–RF019. **Situação:** Concluída na versão 1.6. |
| **Fase 3 — Ajustes visuais** | Site com leiaute para computador, botão "Voltar" e trilha, visualizador com zoom, grade maior, dicas de captura, remoção na própria mídia. Requisitos: RF013, RF018, RF023, RNF08, RNF28. **Situação:** Concluída. |
| **Fase 4 — Novo reconhecimento** | YuNet + SFace com a configuração do Teste 1, catálogo e troca de motor, falha segura, índice de 128 dimensões, reindexação. Requisitos: RF010, RF026, RF028, RNF22, RNF27. **Situação:** Concluída. |
| **Fase 5 — Calibração** | Teste de precisão do reconhecimento facial com nota de 0 a 100, várias poses, captura guiada com prova de vida no teste. Requisitos: RF029, RNF18. **Situação:** Concluída; testes com pessoas de referência em andamento. A aba passou a "Teste de precisão" e o teste usa apenas eventos publicados. |
| **Fase 6 — Temas e menores** | Temas com ícone e autor, criação no formulário do evento; evento com menores e autorização; borrão de menor incidental. Requisitos: RF027, RF032, RF033. **Situação:** regra de eventos com menores suspensa no documento, com o código mantido como está até a decisão; Concluída em parte; falta retirar da área pública o evento cuja autorização foi revogada ou que foi marcado depois de publicado. |
| **Fase 7 — Contas e exclusão de evento** | Perfil Marketing; conta temporária com identificação criptografada e aprovação individual ou em lote, com registro de quem aprovou; exclusão de evento com prazo para desfazer. Requisitos: RF001, RF030, RF031, RF038. **Situação:** Concluída; ajustes de 17/10 em validação pelo autor. |
| **Fase 8 — Busca com prova de vida** | Captura guiada na busca pública e retirada definitiva do envio pela galeria. Requisitos: RF016, RF017, RF036. **Situação:** Concluída; prova de vida ajustada em 17/10 após medição com rosto real e validada pelo autor no mesmo dia. |
| **Fase 9 — Conformidade e pessoas institucionais** | Cadastro com autorização por e-mail, busca no acervo inteiro e marcação; tela de remoções, alerta de uso atípico, relatório e exportação. Requisitos: RF020–RF024, RNF14. **Situação:** Em parte: a remoção na própria mídia e a política de privacidade existem; faltam as pessoas institucionais, a tela de remoções do administrador, o alerta de uso atípico e o relatório. |
| **Fase 10 — Vídeo** | Prova de conceito; envio, conversão e reprodução; reconhecimento em vídeo. Requisitos: RF034, RF035. **Situação:** A fazer; depende da ampliação do armazenamento. |
| **Fase 11 — Aplicativo móvel** | Telas do Figma, câmera nativa, todas as funções de fotógrafo, marketing e fotógrafo contratado. Requisitos: RNF07, RNF08. **Situação:** A fazer. |
| **Fase 12 — Formatos e downloads** | Novos formatos de fotografia (PNG, HEIC, WebP e formatos brutos em caráter experimental), marca d'água institucional nos downloads do visitante e aviso de propriedade em todos os downloads. Requisitos: RF007, RF019, RF030. **Situação:** A fazer. |
| **Fase 13 — Fechamento** | Painel do armazenamento, tutorial por perfil, retirada dos recursos temporários de desenvolvimento. Requisitos: RF037, RNF29. **Situação:** A fazer. |

# 10. Métricas e critérios de aceite

As métricas permitem verificar objetivamente o atendimento dos requisitos. São apuradas em homologação antes da implantação e reavaliadas a cada alteração relevante.

| Métrica | Descrição |
|:---|:---|
| **Taxa de conclusão da busca** | Percentual de consultas em que a prova de vida foi aprovada e ao menos uma face foi detectada. |
| **Taxa de reprovação da prova de vida** *(nova)* | Percentual de capturas reprovadas, separando, em homologação, pessoas reais de tentativas com fotografia ou tela ([RNF30]). |
| **Taxa de busca sem resultado** | Percentual de consultas concluídas sem nenhuma mídia, indicador de calibração e de qualidade da captura. |
| **Tempo de resposta da busca** | Latência no percentil 95, em ambiente de referência. |
| **Duração da captura guiada** *(nova)* | Tempo do início da captura ao envio dos quadros. |
| **Taxa de indexação** | Imagens processadas por hora na fila de detecção. |
| **Tempo médio de conferência** | Tempo entre o fim do envio e a publicação do conjunto. |
| **Nota do teste de precisão** *(nova)* | Nota de 0 a 100 do [RF029] por motor e configuração; referência atual: 89,5 do YuNet + SFace no Teste 1. |
| **Precisão e revocação** | Apuradas no teste de precisão a cada alteração de motor, configuração ou limiar ([RNF18]). |
| **Solicitações por identificação incorreta** | Pedidos de remoção fundamentados em falso positivo. |
| **Cumprimento do prazo de remoção** | Percentual concluído em 72 horas e proporção por exclusão automática. |
| **Tempo de aprovação de mídias de conta temporária** *(nova)* | Tempo entre o envio e a decisão do administrador. |
| **Marcações institucionais rejeitadas** *(nova)* | Percentual de marcações automáticas rejeitadas na confirmação humana ([RF021]). |
| **Ocupação do armazenamento** | Volume por evento e por tipo de mídia e projeção até o fim da retenção, confrontada com o [RNF16]. |

Os critérios de aceite detalhados de cada requisito são elaborados no plano de testes; este documento fixa o comportamento esperado nas seções 3 e 4.

# 11. Pendências abertas

As decisões a seguir ainda não foram tomadas e condicionam a implementação. São registradas aqui, e este documento é atualizado quando forem encerradas.

**Encerradas desde a versão 1.6**

- *Denominação do sistema*: FOTOMAC, definitiva.
- *Solução de reconhecimento facial*: YuNet + SFace, por decisão do CESMAC, que prefere a solução gratuita; o InsightFace obteve nota maior (97,6 no Teste 1), mas a licença dos seus modelos restringe-se a pesquisa.
- *Contratação de licença e de unidade de processamento gráfico*: dispensadas pela decisão anterior.
- *Relação inicial de temas*: os temas passam a ser criados pelos próprios fotógrafos e pela equipe de marketing ([RF027]).
- *Tamanho médio dos arquivos*: medido em 4,26 MB por fotografia ([RNF16]).

**Em aberto**

1. **Base legal para gerar os vetores biométricos das pessoas retratadas no acervo**, que não manifestaram consentimento antes da indexação. O Art. 11 da LGPD admite o tratamento de dado sensível mediante consentimento específico e destacado (inciso I) ou nas hipóteses do inciso II. A definição cabe à área jurídica, assim como a eventual necessidade de aviso aos participantes no próprio evento (por exemplo, sinalização no local) e de relatório de impacto (Art. 38). Pendência herdada da versão 1.6 e registrada expressamente nesta versão.
2. Responsável pela manutenção da infraestrutura após a conclusão do projeto.
3. Política de cópias de segurança compatível com a eliminação de mídias e vetores nos prazos declarados.
4. Indicação do encarregado pelo tratamento de dados pessoais do CESMAC e validação, pela área jurídica, dos textos de transparência e da política de privacidade.
5. Validação, pela área jurídica, do termo de autorização das pessoas institucionais e da suficiência do aceite por ligação enviada ao e-mail, ou da necessidade de assinatura eletrônica.
6. Confirmação do prazo de retenção de 6 meses, sujeito à capacidade de armazenamento efetivamente disponível.
7. Conveniência de agrupar em um único evento coberturas de dias consecutivos de uma mesma programação.
8. Existência de diretório institucional de contas apto à integração futura de autenticação.
9. **Base legal e direito de imagem da divulgação institucional** pela equipe de marketing ([RF030]), a definir pela área jurídica, e texto da finalidade a declarar ao público ([RF022]).
10. **Regra de eventos destinados a crianças e adolescentes** ([RF032], suspenso), a decidir pelo orientador, pela coordenação e pela área jurídica. A regra proposta (termo coletado pela escola como condição de participação) pode conflitar com o Art. 14, § 4º, da LGPD, que veda condicionar a participação de crianças ao fornecimento de dados além dos estritamente necessários, e com o consentimento livre (Art. 5º, XII). Alternativas em estudo: (A) autorização separada e opcional para a cobertura fotográfica e para o reconhecimento facial, com identificação no evento e borrão de quem não autorizou; (B) evento com crianças publicado sem indexação facial, sem gerar vetor de criança, com as fotografias entregues pela escola; (C) aviso ou cláusula de participação, suficiente apenas como transparência da cobertura, e não como consentimento para o reconhecimento facial (Art. 11, I, e Art. 14, § 1º).
11. **Limites de vídeo** (tamanho e duração por arquivo) e **ampliação do armazenamento** (quanto e quando), após prova de conceito com vídeos reais da equipe de marketing.
12. **Reavaliação da meta do [RNF18]**, revista para 80% nesta versão, após novos testes com mais fotografias e vídeos e com a captura de várias poses.
12. **Prazo de guarda dos dados de identificação do fotógrafo contratado** ([RF031]), a definir pela área jurídica.
12. **Texto do aviso de propriedade e aparência da marca d'água** ([RF019]), a validar pela equipe de marketing e pela área jurídica.
12. **Viabilidade dos formatos brutos (RAW)**: tamanho real dos arquivos da câmera do fotógrafo e espaço disponível; se inviável, o recurso permanece desabilitado.
13. **Alternativa acessível à captura guiada** para pessoas que não conseguem executar os movimentos ([RF036], [RNF25]).
14. Confirmação, com rostos reais diversos, da convenção de sentido dos movimentos e dos limites da prova de vida, e avaliação de modelo passivo antifraude e da sua licença.
15. Licença da compilação do FFmpeg a adotar ([RNF26]).
16. Cláusula de operador de dados no contrato do fotógrafo contratado (Art. 39 da LGPD), atribuição institucional.
17. Destino da ferramenta de teste de estimativa de idade, mantida apenas como diagnóstico do administrador após o descarte do recurso.
18. Data da segunda banca de avaliação, que definirá o que desta versão entra no trabalho e o que fica como evolução.

# 12. Referências

1. NUNES, Thiago José Camêlo. *Documento de Requisitos — FOTOMAC*, versão 1.6. Centro Universitário CESMAC, 22/09/2026. Base desta revisão.
2. NUNES, Thiago José Camêlo. *FOTOMAC — Planejamento após a 1ª banca*. Centro Universitário CESMAC, 15/10/2026. Pedidos, decisões e estimativas de armazenamento que fundamentam esta versão.
3. NUNES, Thiago José Camêlo. *fotomac-lab — Teste 1 de reconhecimento facial*. Bancada de comparação de soluções, com as fórmulas de nota adotadas no [RF029].
4. ROSA, Pedro. *Documento de Requisitos do Produto — CESMAC Eventos*, versão 1.0. Centro Universitário CESMAC, 10/04/2026.
5. FOTOP. Plataforma de fotografia de eventos. Disponível em: https://fotop.com.br. Referência de domínio para a galeria privada e para o leiaute web.
6. FOCO RADICAL. Plataforma de fotografia esportiva. Disponível em: https://www.focoradical.com.br. Referência de domínio para o fluxo de permissão e para o leiaute web.
7. WU, Wei; PENG, Hanyang; YU, Shiqi. YuNet: A Tiny Millisecond-level Face Detector. *Machine Intelligence Research*, 2023. Modelo distribuído no OpenCV Zoo, licença MIT.
8. ZHONG, Yaoyao; DENG, Weihong *et al.* SFace: Sigmoid-Constrained Hypersphere Loss for Robust Face Recognition. *IEEE Transactions on Image Processing*, 2021. Modelo distribuído no OpenCV Zoo, licença Apache 2.0.
9. OPENCV. Open Source Computer Vision Library. Disponível em: https://opencv.org. Licença Apache 2.0.
10. DENG, Jiankang *et al.* InsightFace — 2D and 3D Face Analysis Project. Disponível em: https://github.com/deepinsight/insightface. Código MIT; modelos pré-treinados restritos a pesquisa não comercial. Usado apenas como referência de comparação.
11. SEAWEEDFS. Distributed storage system. Disponível em: https://github.com/seaweedfs/seaweedfs.
12. PGVECTOR. Open-source vector similarity search for Postgres. Disponível em: https://github.com/pgvector/pgvector.
13. FFMPEG. A complete, cross-platform solution to record, convert and stream audio and video. Disponível em: https://ffmpeg.org.
14. Documento de Requisitos — Sistema de Locação de Quartos Universitários. Centro Universitário CESMAC, Bacharelado em Sistemas de Informação. Referência estrutural do formato adotado.
15. BRASIL. Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais (LGPD).
16. BRASIL. Lei nº 9.610, de 19 de fevereiro de 1998. Lei de Direitos Autorais.
17. BRASIL. Lei nº 10.406, de 10 de janeiro de 2002. Código Civil, Arts. 20 e 21 — direito à imagem e à privacidade.
18. AUTORIDADE NACIONAL DE PROTEÇÃO DE DADOS (ANPD). Guia orientativo sobre o tratamento de dados pessoais sensíveis e o relatório de impacto à proteção de dados pessoais.
19. ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. NBR ISO/IEC 25010: Requisitos e avaliação da qualidade de sistemas e software. Rio de Janeiro, 2011.
20. INTERNATIONAL FUNCTION POINT USERS GROUP (IFPUG). *Function Point Counting Practices Manual*, versão 4.3.1.
21. OWASP FOUNDATION. OWASP Top 10 – The Ten Most Critical Web Application Security Risks.
22. W3C. Web Content Accessibility Guidelines (WCAG) 2.1.
