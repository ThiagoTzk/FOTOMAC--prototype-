# FOTOMAC — Dúvidas sobre crianças e adolescentes

**Para:** orientador e coordenação do curso (Prof. Mozart Melo)\
**De:** Thiago José Camêlo Nunes\
**Data:** 19/10/2026

> **Pedido: resposta oficial, por escrito** (e-mail ou este documento preenchido e assinado), a cada
> pergunta da seção 4. A folha de resposta está na seção 7.
>
> **Até a resposta chegar:** o sistema não tem nenhuma regra sobre crianças e adolescentes, e
> **nenhuma foto de evento com crianças ou adolescentes será enviada ao FOTOMAC.**

## 1. Por que isto precisa de decisão

O FOTOMAC transforma cada rosto das fotos publicadas em um **vetor facial**, uma sequência de
números que permite reconhecer a pessoa. A LGPD classifica esse vetor como **dado pessoal sensível**,
por ser dado biométrico (Art. 5º, II). Quando o rosto é de uma criança, também se aplica o Art. 14,
que tem regras próprias.

As crianças aparecem no acervo de duas formas:

- **em eventos feitos para elas**, como a Olimpíada Brasileira de Robótica (OBR) e visitas de escolas;
- **por acaso, em eventos comuns**, como o filho de um formando na colação de grau.

O reconhecimento facial não distingue idade. A estimativa automática de idade foi testada em
16/10/2026, com fotos reais de um evento com crianças, e atribuiu cerca de 54 anos a uma criança.
Por isso foi descartada: identificar quem é menor depende de uma pessoa olhando a foto.

## 2. O que já foi feito, e por que tudo foi retirado

| Data | O que aconteceu |
|:---|:---|
| 22/09 (v1.6) | Triagem humana dos menores e supressão do rosto no próprio arquivo antes do envio. |
| 16/10 | Implementados dois caminhos: (A) evento marcado "com menores", publicado só depois de registrada a autorização dos responsáveis, coletada pela escola; (B) ferramenta para borrar, no arquivo, o rosto de criança que aparece por acaso. |
| 16/10 | Decisão: a autorização dos responsáveis passa a ser **obrigatória** em evento para crianças, e o borrão não a substitui. |
| 17/10 | Regra **suspensa**: exigir o termo como condição para a criança participar do evento pode contrariar o Art. 14, § 4º, e o consentimento livre (Art. 5º, XII). A alternativa de autorização separada foi avaliada como difícil de as escolas aceitarem. |
| 19/10 | **Tudo o que se refere a crianças e a idade foi retirado do sistema e dos requisitos**, até a resposta oficial: a marcação de evento com menores, o registro da autorização, a ferramenta de borrão, a advertência no envio de fotos e os avisos de idade ao visitante e na Política de Privacidade. |

O código retirado foi guardado e pode ser reaproveitado, conforme a resposta.

Um fato que importa: em 16/10, o evento de teste da OBR chegou a ser publicado e gerou vetores de
crianças. O banco de desenvolvimento foi **zerado em 17/10**. Hoje não há nenhum evento, foto ou vetor
no sistema.

## 3. O que a lei diz

Trechos lidos na Lei nº 13.709/2018 (edição do Senado, atualizada até junho de 2024):

- **Art. 14, *caput*:** o tratamento de dados de crianças e de adolescentes "deverá ser realizado em
  seu melhor interesse".
- **Art. 14, § 1º:** o tratamento de dados pessoais **de crianças** "deverá ser realizado com o
  consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal".
- **Art. 14, § 2º:** quem trata esses dados deve manter pública a informação sobre os dados
  coletados, a forma de uso e como exercer os direitos.
- **Art. 14, § 4º:** não se deve "condicionar a participação" das crianças em "jogos, aplicações de
  internet ou outras atividades ao fornecimento de informações pessoais além das estritamente
  necessárias à atividade".
- **Art. 14, § 5º:** é preciso fazer "todos os esforços razoáveis" para verificar que o consentimento
  foi dado pelo responsável.
- **Art. 5º, XII:** consentimento é "manifestação livre, informada e inequívoca".
- **Art. 11, I:** dado sensível pode ser tratado quando "o titular ou seu responsável legal
  consentir, de forma específica e destacada, para finalidades específicas".

Dois pontos que mudam a resposta:

1. O § 1º fala só de **crianças**. Pelo Estatuto da Criança e do Adolescente (Lei nº 8.069/1990,
   Art. 2º), criança tem até 12 anos incompletos, e adolescente, de 12 a 18. Em uma universidade há
   **calouros de 17 anos**, por exemplo.
2. O **Enunciado CD/ANPD nº 1/2023** entende que dados de crianças e adolescentes podem ser tratados
   com base nas hipóteses dos Arts. 7º e 11, e não só com o consentimento do § 1º, desde que o melhor
   interesse deles prevaleça.

Este documento é análise de engenharia com a lei em mãos, e não parecer jurídico. A palavra final
sobre a base legal é da área jurídica do CESMAC.

## 4. Perguntas

### Pergunta 1 — Eventos feitos para crianças (OBR, visitas de escolas) entram no FOTOMAC?

| Opção | Como funciona | A favor | Contra |
|:--:|:---|:---|:---|
| **A** | Autorização separada e **opcional**: uma para a cobertura fotográfica e outra para o reconhecimento facial. Quem não autorizou é identificado no evento e tem o rosto borrado. | Atende quem quer achar as fotos pelo rosto. | Muito trabalho para a escola e para o fotógrafo, que precisa saber quem não autorizou em cada foto. Erro de borrão expõe a criança. |
| **B** | O evento é publicado **sem reconhecimento facial**: nenhum vetor de criança é gerado, e as fotos são entregues à escola. | Não existe dado biométrico de criança. | Não há busca pelo rosto nesses eventos. A escola ainda precisa da autorização de uso de imagem. |
| **C** | Só um aviso ou cláusula de participação. | Simples. | Serve apenas como transparência da cobertura. **Não vale** como consentimento para o reconhecimento facial (Art. 11, I, e Art. 14, § 1º). |
| **D** | Eventos para crianças **ficam fora** do FOTOMAC. | Nenhum risco. Não exige nada novo. | A OBR e as visitas de escolas não são atendidas. |

*Sugestão técnica:* **D** na versão do TCC, com **B** como evolução, se o jurídico validar a
autorização de uso de imagem coletada pelas escolas.

### Pergunta 2 — E a criança que aparece por acaso em um evento comum?

| Opção | Como funciona | A favor | Contra |
|:--:|:---|:---|:---|
| **A** | O fotógrafo **borra o rosto** da criança no próprio arquivo antes de publicar, com a ferramenta que já existiu. | O resto da foto continua útil para os adultos. | Depende de atenção humana, foto a foto. |
| **B** | O fotógrafo **descarta a foto** inteira. | Simples, sem ferramenta nova. | Perde-se a foto dos adultos. |
| **C** | Não tratar: a foto é publicada normalmente. | Nenhum trabalho. | Gera vetor biométrico de criança sem consentimento dos pais (Art. 11 e Art. 14, § 1º). |

*Sugestão técnica:* **A ou B, à escolha do fotógrafo em cada foto** (era o desenho de 16/10). **C não
é recomendada.**

### Pergunta 3 — Adolescentes (12 a 17 anos) seguem a regra das crianças?

- **A:** sim, qualquer pessoa com menos de 18 anos segue a mesma regra das crianças.
- **B:** não, o adolescente é tratado como os demais participantes. Ele próprio dá ciência na busca, e
  o melhor interesse é avaliado conforme o Enunciado CD/ANPD nº 1/2023.

*Por que importa:* na opção A, um calouro de 17 anos na semana acadêmica entraria na regra das
crianças, com borrão ou descarte das fotos dele.

### Pergunta 4 — O visitante menor de idade pode fazer a busca pelo rosto?

Para fazer a busca, o visitante tira uma selfie guiada. O sistema gera um vetor temporário, que é
apagado logo depois. Até 19/10, o aviso dizia que o serviço "não se destina a pessoas menores de 18
anos sem o consentimento de um dos pais ou do responsável legal". Esse parágrafo foi retirado.

- **A:** o parágrafo volta como estava.
- **B:** volta com outra idade de corte (por exemplo, só para menores de 12 anos).
- **C:** nenhum aviso de idade.

*Por que importa:* o aviso é o único ponto em que o sistema fala de idade com o visitante. Mudar o
texto gera uma nova versão do aviso, e o registro de cada aceite guarda a versão aceita.

### Pergunta 5 — A resposta precisa passar pela área jurídica do CESMAC?

O encarregado pelo tratamento de dados (Art. 41) ainda não foi indicado. Se a resposta depender do
jurídico, peço que isso conste da resposta, com quem será o contato.

## 5. O que muda no sistema com cada resposta

| Resposta | Efeito no FOTOMAC |
|:---|:---|
| P1 = D | Nada a programar. Uma regra de uso é registrada nos requisitos: "eventos para crianças não são enviados". |
| P1 = B | Marcação "evento com crianças" que publica sem indexar rostos, e entrega das fotos à escola. Trabalho médio. |
| P1 = A | Volta o registro da autorização e o borrão, com o controle de quem não autorizou. É o trabalho maior. |
| P2 = A | Volta a ferramenta de borrão, que já existiu e foi testada. Trabalho pequeno. |
| P2 = B | Nada a programar. O descarte já existe. Volta só a advertência no envio. |
| P3 | Muda só o texto das regras e dos avisos. |
| P4 = A ou B | Volta o parágrafo no aviso, com nova versão do texto. Trabalho pequeno. |

Em todas as respostas que tratam dados de crianças, a Política de Privacidade volta a ter a seção
"Crianças e adolescentes" (Art. 14, § 2º).

## 6. Enquanto a resposta não chega

- Nenhuma foto de evento com crianças ou adolescentes é enviada ao FOTOMAC.
- Se aparecer uma criança por acaso, a foto é descartada na conferência, antes de publicar.
- O documento de requisitos v2.0 registra os RF032 e RF033 como **retirados**, com esta pendência na
  seção 11.

## 7. Folha de resposta

**1 — Eventos feitos para crianças:** ( ) A  ( ) B  ( ) C  ( ) D\
Observações: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**2 — Criança que aparece por acaso:** ( ) A  ( ) B  ( ) C\
Observações: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**3 — Adolescentes de 12 a 17 anos:** ( ) A  ( ) B\
Observações: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**4 — Visitante menor de idade na busca:** ( ) A  ( ) B  ( ) C\
Observações: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

**5 — A resposta passa pelo jurídico?** ( ) Sim  ( ) Não\
Contato no jurídico: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

Nome: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  Função: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\
Assinatura: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  Data: \_\_\_/\_\_\_/\_\_\_\_\_\_

Nome: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  Função: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\
Assinatura: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_  Data: \_\_\_/\_\_\_/\_\_\_\_\_\_
