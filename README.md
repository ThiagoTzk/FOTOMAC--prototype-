# FOTOMAC

**Acervo fotográfico dos eventos do Centro Universitário CESMAC, com busca por reconhecimento facial.**

A pessoa que aparece nas fotos de um evento mostra o rosto para a câmera, numa captura guiada com
prova de vida, e recebe só as imagens em que ela aparece. Ninguém navega pela galeria inteira. O sistema foi desenhado em
torno da LGPD: o rosto e o vetor facial são **dados pessoais sensíveis**, de natureza biométrica
(Lei 13.709/2018, Art. 5º, II).

> Trabalho de Conclusão de Curso, Bacharelado em Sistemas de Informação, CESMAC.
> Autor: Thiago Nunes · Orientador: Prof. Wagner de Oliveira Lima Palmeira de Araujo.
> Requisitos: [`docs/REQUISITOS-FOTOMAC-v2.0.md`](docs/REQUISITOS-FOTOMAC-v2.0.md) (entregável em `docs/entregaveis/`) ·
> Como o sistema funciona: [`docs/ESTRUTURA-DO-SISTEMA.md`](docs/ESTRUTURA-DO-SISTEMA.md) · Diário: [`HISTORICO.md`](HISTORICO.md).

---

## Situação atual

Nesta fase o projeto inclui **só a versão web**; o aplicativo móvel vem depois que tudo estiver
pronto no site. A tabela segue as fases da seção 9 dos requisitos v2.0.

| Fase | Escopo | Situação |
|---|---|---|
| **1–2. Acervo e acesso público** | Contas por convite, eventos, envio em lote, conferência, publicação, indexação, colaboração; lista de eventos, aviso de permissão, busca, visualização e download | ✅ Pronta (v1.6) |
| **3. Ajustes visuais** | Site com leiaute de computador, "Voltar" e trilha, visualizador com zoom, remoção na própria imagem | ✅ Pronta |
| **4. Novo reconhecimento** | YuNet + SFace, catálogo e troca de modelo pelo painel, falha segura, reindexação | ✅ Pronta |
| **5. Calibração** | Teste de precisão (nota 0–100) com várias poses, só sobre eventos publicados | ✅ Pronta; testes com pessoas de referência em andamento |
| **6. Temas** | Temas com ícone e autor | ✅ Pronta. As regras de menores (RF032, RF033) foram **retiradas** em 19/10, até a resposta oficial do orientador e da coordenação |
| **7. Contas e exclusão** | Perfil Marketing; conta temporária do fotógrafo contratado (identificação criptografada, aprovação individual ou em lote); exclusão de evento com prazo para desfazer | ✅ Pronta |
| **8. Busca com prova de vida** | Captura guiada com ordem sorteada pelo servidor; envio pela galeria retirado | ✅ Pronta (validada com rosto real em 17/10/2026) |
| **9. Conformidade e pessoas institucionais** | **Pessoas institucionais ✅ (21/10):** cadastro pelo administrador com 1 a 5 fotos, termo enviado por e-mail e **assinado na tela**, formulário oficial em PDF, busca no acervo inteiro (sem o teto de 200), marcação das fotos novas, confirmação humana e revogação. Faltam a tela de remoções do administrador, o alerta de uso atípico e o relatório | ⏳ Em parte |
| **12. Formatos e downloads** | PNG, HEIC, WebP e RAW (este desligado de fábrica; o administrador liga e a tela avisa quem envia), com o original guardado sem GPS; marca d'água só no download do visitante; aviso de propriedade em EXIF, IPTC e XMP; download da equipe sem marca, inclusive o pacote de divulgação do marketing | ✅ Pronta (21/10), em validação |
| **10, 11 e 13** | Vídeo, aplicativo móvel, fechamento (painel do armazenamento, tutorial) | 📋 Planejado |

## Como funciona

```
  Navegador (Expo / React Native Web)
        │  HTTPS + JSON, cookie de sessão HttpOnly
        ▼
  API em Python (FastAPI) ─────────────────────────────────────────────┐
        │                    │                        │                │
        │ adaptador facial   │ adaptador de arquivos  │ SQL            │ trabalhador em
        ▼                    ▼                        ▼                │ segundo plano
  YuNet + SFace (OpenCV)  SeaweedFS (S3)        PostgreSQL 17          │ (fila facial,
  (detecção + vetor       (fotos originais,     + pgvector             │  ZIP, expiração,
   de 128 números)         cópias, miniaturas)   (dados e vetores)  ◀──┘  remoções)
```

- **Busca facial (só pela câmera, v2.0):** o servidor sorteia a ordem de 4 movimentos de cabeça; o
  navegador grava seguindo um bonequinho e envia só alguns quadros (o vídeo não sai do aparelho). O
  servidor confere se a cabeça seguiu a ordem (prova de vida, RF036) e se é a mesma pessoa em todos os
  quadros, e então localiza o rosto em cada pose (YuNet), transforma em vetores de
  128 números (SFace) e compara com os vetores **daquele evento** (similaridade de
  cosseno no pgvector). Só voltam as fotos acima do limiar, que vem calibrado em 0,3741 (Teste 1
  do fotomac-lab: melhor F1, precisão de 98%).
- **Adaptadores (padrão portas e adaptadores):** o sistema conversa com o reconhecimento
  facial e com o armazenamento por uma interface própria, a "porta":
  [`backend/app/face/port.py`](backend/app/face/port.py) e
  [`backend/app/storage/port.py`](backend/app/storage/port.py). Trocar a tecnologia de
  reconhecimento significa escrever um adaptador novo e acrescentar uma linha no catálogo do
  builder ([`backend/app/face/factory.py`](backend/app/face/factory.py)). O resto do sistema não
  muda (RNF22). O administrador escolhe o modelo no painel (Reconhecimento facial); a troca
  reindexa o acervo, porque cada vetor guarda a versão do modelo que o gerou (RF028). O sistema
  nunca troca de modelo sozinho: se o modelo não carregar, a busca pausa com aviso.
- **Teste de precisão (painel do admin; antes "teste de qualidade"):** o Teste 1 do fotomac-lab dentro
  do sistema, só sobre fotos publicadas (RF029). Usa uma foto
  de consulta (com o consentimento da pessoa), a marcação "está / não está" de cada foto do evento e
  uma rodada por modelo candidato: o SFace, variantes em resolução maior e o InsightFace, que entra
  **só como régua** (a licença dele não permite uso institucional). A nota é a mesma do lab
  (100 × melhor F1), conferida contra os CSVs do Teste 1. Ao encerrar o teste, ficam só os números
  agregados.
- **Perfis:** administrador, fotógrafo, marketing (mesmas funções do fotógrafo e visualização das
  imagens publicadas de qualquer evento) e fotógrafo contratado (conta temporária de 24 h, um evento,
  imagens só publicadas depois da aprovação do administrador; trocar o arquivo exige nova aprovação).
- **Painel:** cada evento mostra o seu andamento em quatro etapas (enviar → conferir e publicar →
  reconhecimento facial → no site). O sino do cabeçalho reúne o que exige ação da conta: remoções,
  aprovações, exclusões agendadas, falhas e prazos. Os avisos são calculados a cada consulta e somem
  quando a situação é resolvida.
- **Arquivos:** nenhum arquivo chega ao navegador direto do armazenamento. A API entrega cada
  foto e cada ZIP por um link assinado (HMAC), válido por poucos minutos e preso à sessão de
  quem o pediu.

## Privacidade desde o desenho (LGPD)

| Decisão | Onde está |
|---|---|
| Os **quadros da captura nunca são armazenados**: o sistema compara os vetores e os descarta | `app/public/service.py` |
| **Não existe busca por foto da galeria**: só a captura guiada, com ordem sorteada pelo servidor | `app/public/service.py`, `app/calibration/poses.py` |
| **CPF e nascimento do fotógrafo contratado criptografados** (pgcrypto), com a chave só no `backend/.env` (`FOTOMAC_IDENTITY_KEY`); apagados ao fim do prazo de guarda. Trocar a chave torna os dados ilegíveis | `app/accounts/identity.py`, migração 0018 |
| **Conta temporária** (24 h, um evento, fotos com aprovação do administrador) e **perfil Marketing** (vê só as fotos publicadas dos eventos alheios) | `app/accounts/service.py`, `app/images/service.py` |
| **Nenhum vetor antes da publicação**: só fotos publicadas entram na busca | `app/indexing/`, restrições no banco |
| A **busca vale para um evento por vez**: não existe busca no acervo inteiro | `app/public/service.py` |
| **"Estou ciente" antes da câmera**, sem caixa pré-marcada; a ciência fica registrada sem vínculo com a pessoa | `app/public/`, `src/components/visitor/` |
| O **resultado some ao sair da página**, pensando em computador compartilhado | `src/app/evento/[id].tsx` |
| **Remoção pelo titular**: a foto sai da busca na hora e é excluída em até 72 h; o e-mail de contato é apagado ao concluir | `app/public/service.py`, trabalhador |
| **Expiração automática**: aviso 30 dias antes; no vencimento, fotos, cópias, pacotes e vetores são eliminados | `app/events/expiry.py` |
| **Excluir evento**: sai do site e os vetores são apagados na hora; as imagens esperam 7 dias para a exclusão poder ser desfeita (o evento volta despublicado) | `app/events/deletion.py` |
| **GPS removido** de toda foto enviada; crédito do fotógrafo gravado nos metadados | `app/imaging_meta.py` |
| **Senha** guardada só como hash Argon2id; sessão em cookie HttpOnly; no banco, só o hash do token | `app/auth/` |
| **Auditoria inalterável**: o banco recusa alterar ou apagar registros de auditoria | migrações, `app/audit.py` |
| **Controle de acesso no servidor**: perfil e vínculo com o evento verificados em toda rota; regra que a tela esconde, o servidor também recusa | `app/api/deps.py`, `app/events/service.py` |
| **Escrita só da própria origem**: o servidor recusa ações vindas de outro site, mesmo de outro endereço do CESMAC (CSRF) | `app/main.py` |

**Risco residual declarado (RS039):** a prova de vida barra foto impressa ou na tela, mas quem
reunir antes fotos da mesma pessoa virando o rosto para cada lado pode montar a sequência. Eliminar
isso exige equipamento dedicado (câmera de profundidade) ou modelo antifraude, fora do escopo.

Este projeto aplica a lei como engenharia; não é parecer jurídico. A validação final da base
legal, da Política de Privacidade e a indicação do encarregado (DPO) cabem à área jurídica da
instituição.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Interface | Expo SDK 57 (React Native 0.86 + React Native Web), Expo Router, TypeScript |
| API | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Reconhecimento facial | YuNet (detecção) + SFace (vetor de 128 dimensões), executados pelo OpenCV 5 |
| Banco de dados | PostgreSQL 17 + pgvector |
| Armazenamento de arquivos | SeaweedFS, pelo protocolo S3 (boto3) |
| Fotos em outros formatos | pi-heif (HEIC), rawpy/LibRaw (RAW), ExifTool (tira o GPS e grava os créditos sem recomprimir), Pillow (marca d'água, fonte Montserrat) |
| Documentos | ReportLab (formulário oficial em PDF da autorização das pessoas institucionais) |
| Testes | pytest (servidor), Playwright (navegador, ponta a ponta) |

> **Licença dos modelos:** YuNet (MIT) e SFace (Apache 2.0) são livres para uso institucional, sem
> custo. Foi por isso que o CESMAC os escolheu (15/10/2026), no lugar do InsightFace, que venceu o
> Teste 1 mas só é liberado para pesquisa não comercial. Os arquivos oficiais e os seus SHA-256
> estão em [`backend/models/README.md`](backend/models/README.md).

## Estrutura

```
backend/
  app/
    api/            rotas HTTP (painel, visitante, administrador)
    face/           porta, builder (catálogo de modelos e troca) e adaptador YuNet + SFace
    storage/        porta + adaptador S3/SeaweedFS
    indexing/       fila de indexação facial, reindexação, trabalhador
    calibration/    teste de precisão e prova de vida (poses)
    events/ images/ packages/ public/ accounts/ themes/ auth/   regras de negócio
    security/       links assinados
  migrations/       evolução do banco (Alembic)
  tests/            testes automáticos do servidor
  scripts/          criar o primeiro administrador, limpar dados de teste
frontend/
  src/app/          telas (Expo Router): visitante em /, equipe em /login e no painel
  src/components/   componentes do painel, do visitante e do administrador
  e2e/              testes no navegador de verdade
infra/              scripts do PostgreSQL e do SeaweedFS para a máquina local
docs/               requisitos v2.0, estrutura do sistema, auditoria e adequação ao Figma
                    (entregáveis em PDF/DOCX em docs/entregaveis/)
tools/figma/        leitor offline do arquivo .fig (as telas da equipe de design)
```

## Rodar na máquina (macOS)

### Instalação, uma vez só

```bash
brew install python@3.12 postgresql@17 pgvector seaweedfs node exiftool   # exiftool: fotos em HEIC/PNG/WebP/RAW
brew services start postgresql@17
infra/setup_local.sh                      # bancos, senhas locais (backend/.env) e modelos YuNet + SFace

cd backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt   # desenvolvimento: inclui testes e a "régua" InsightFace
.venv/bin/alembic upgrade head && .venv/bin/alembic -x db=test upgrade head

cd ../frontend
npm install && npx playwright install chromium
```

O `setup_local.sh` baixa os dois modelos oficiais (cerca de 39 MB) para `backend/models/` e
confere o SHA-256 de cada um. No servidor de produção, instale só `requirements.txt`: o InsightFace
(licença de pesquisa) e as ferramentas de teste ficam de fora.

### No dia a dia, três terminais

```bash
# 1) armazenamento
infra/seaweedfs.sh start                   # parar: infra/seaweedfs.sh stop

# 2) API (a documentação das rotas fica em http://localhost:8000/api/v1/docs)
cd backend && .venv/bin/uvicorn app.main:app --host localhost --port 8000 --reload

# 3) site
cd frontend && npx expo start --web --port 8081
```

- `http://localhost:8081/`: **área do visitante**, pública e sem conta.
- `http://localhost:8081/login`: **equipe** (administrador, fotógrafo, marketing e fotógrafo contratado).

Use sempre `localhost`, nunca `127.0.0.1`: o cookie de sessão só vale no mesmo nome de host. A
fila facial, os pacotes ZIP, as remoções e a expiração rodam **dentro da API**, num
trabalhador em segundo plano, então não precisam de um quarto terminal.

### Primeiro administrador

As outras contas, o administrador cria pelo painel, em **Contas**. O primeiro sai por linha de
comando:

```bash
cd backend
.venv/bin/python scripts/create_account.py --name "Nome Sobrenome" --email voce@cesmac.edu.br --role admin
```

Em desenvolvimento, nenhum e-mail é enviado de verdade. Cada mensagem vira um arquivo `.eml`
em `backend/outbox/`, e o link de ativação está no arquivo mais novo. O envio real (SMTP do CESMAC)
e a retirada do link de demonstração do painel ficam para a implantação.

## Testes

```bash
cd backend && .venv/bin/pytest                     # 215 testes das regras do servidor
cd frontend && npm run typecheck && npx expo lint
```

Os testes do servidor usam um banco separado (`fotomac_test`) e nunca tocam o banco de
desenvolvimento.

Os testes de ponta a ponta abrem um navegador de verdade e usam o YuNet + SFace real. Eles
precisam dos três serviços no ar:

```bash
cd frontend
npm run e2e                                        # login, primeiro acesso, recuperação de senha
node e2e/panel.e2e.mjs CAPA.jpg                    # painel do fotógrafo
node e2e/images.e2e.mjs PASTA-FOTOS CAPA.jpg       # envio → conferência → publicação → indexação → ZIP
node e2e/visitor.e2e.mjs PASTA-FOTOS               # visitante: eventos, aviso, captura guiada e prova de vida
node e2e/admin.e2e.mjs                             # administrador: contas
node e2e/config.e2e.mjs GRUPO.jpg CAPA.jpg         # administrador: temas, parâmetros, reindexação
node e2e/formats.e2e.mjs CAPA.jpg                  # HEIC, PNG, WebP e RAW; download da conta; parâmetros novos
node e2e/institutional.e2e.mjs PASTA-FOTOS         # pessoa institucional: cadastro, assinatura, busca, consulta, PDF, revogação

cd ../backend && .venv/bin/python scripts/cleanup_e2e.py --apply   # apaga o que os testes criaram
```

As fotos dos testes ficam fora do repositório, porque mostram rostos de pessoas reais. Os
limitadores de tentativas ficam na memória da API: se várias rodadas seguidas baterem no
limite, reinicie a API.

## O que nunca vai para o repositório

O `.gitignore` bloqueia:
- `backend/.env` e `infra/seaweedfs/s3.json`, com senhas e chaves;
- `infra/seaweedfs/data/`, `backend/samples/` e `e2e-screenshots/`, com fotos e rostos;
- `backend/outbox/`, com e-mails e links de uso único;
- os arquivos `.fig` do design.

Antes de cada `git add`, confira com `git status` que nada disso apareceu.
