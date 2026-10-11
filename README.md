# FOTOMAC

**Acervo fotográfico dos eventos do Centro Universitário CESMAC, com busca por reconhecimento facial.**

A pessoa que aparece nas fotos de um evento tira uma selfie, ou envia uma foto, e recebe só as
imagens em que ela aparece. Ninguém navega pela galeria inteira. O sistema foi desenhado em
torno da LGPD: o rosto e o vetor facial são **dados pessoais sensíveis**, de natureza biométrica
(Lei 13.709/2018, Art. 5º, II).

> Trabalho de Conclusão de Curso, Bacharelado em Sistemas de Informação, CESMAC.
> Autor: Thiago Nunes · Orientador: Prof. Wagner de Oliveira Lima Palmeira de Araujo.
> Requisitos: `Requisitos FotoMac - v1.6.docx` · Diário de desenvolvimento: [`HISTORICO.md`](HISTORICO.md).

---

## Situação atual

Nesta fase o projeto inclui **só a versão web**; o aplicativo móvel vem depois. A tabela segue
as fases de entrega da seção 9 do documento de requisitos.

| Fase | Escopo | Situação |
|---|---|---|
| **1. Administração e acervo** | Contas por convite, login e perfis, eventos, envio em lote com validação, conferência com descarte, publicação, indexação facial, colaboração entre fotógrafos, temas | ✅ Pronta |
| **2. Acesso público** | Lista e pesquisa de eventos (tema, data, período), galeria privada, aviso de permissão, busca facial, visualização com crédito, download com créditos nos metadados | ✅ Pronta |
| **3. Conformidade e apoio** | Remoção com exclusão automática em 72 h, expiração automática do acervo, parâmetros do reconhecimento facial, reindexação | ✅ Pronta |
| | Registro de operações e uso atípico, tela de solicitações de remoção do administrador, pessoas institucionais, calibragem do limiar com conjunto de teste | ⏳ Em andamento |
| Fora das fases | Aplicativo móvel, implantação no servidor do CESMAC, métricas da seção 10 | 📋 Planejado |

## Como funciona

```
  Navegador (Expo / React Native Web)
        │  HTTPS + JSON, cookie de sessão HttpOnly
        ▼
  API em Python (FastAPI) ─────────────────────────────────────────────┐
        │                    │                        │                │
        │ adaptador facial   │ adaptador de arquivos  │ SQL            │ trabalhador em
        ▼                    ▼                        ▼                │ segundo plano
  InsightFace buffalo_l   SeaweedFS (S3)        PostgreSQL 17          │ (fila facial,
  (detecção + vetor       (fotos originais,     + pgvector             │  ZIP, expiração,
   de 512 números)         cópias, miniaturas)   (dados e vetores)  ◀──┘  remoções)
```

- **Busca facial:** o sistema localiza o rosto na selfie, transforma o rosto num vetor de 512
  números e compara esse vetor com os vetores **daquele evento** (similaridade de cosseno no
  pgvector). Só voltam as fotos acima do limiar configurado, que vem de fábrica em 0,30.
- **Adaptadores (padrão portas e adaptadores):** o sistema conversa com o reconhecimento
  facial e com o armazenamento por uma interface própria, a "porta":
  [`backend/app/face/port.py`](backend/app/face/port.py) e
  [`backend/app/storage/port.py`](backend/app/storage/port.py). Trocar o InsightFace por outra
  tecnologia significa escrever um adaptador novo. O resto do sistema não muda (RNF22). Cada
  vetor guarda a versão do modelo que o gerou, e a reindexação substitui os vetores quando o
  modelo muda (RF028).
- **Arquivos:** nenhum arquivo chega ao navegador direto do armazenamento. A API entrega cada
  foto e cada ZIP por um link assinado (HMAC), válido por poucos minutos e preso à sessão de
  quem o pediu.

## Privacidade desde o desenho (LGPD)

| Decisão | Onde está |
|---|---|
| A **selfie nunca é armazenada**: o sistema compara o vetor e o descarta | `app/public/service.py` |
| **Nenhum vetor antes da publicação**: só fotos publicadas entram na busca | `app/indexing/`, restrições no banco |
| A **busca vale para um evento por vez**: não existe busca no acervo inteiro | `app/public/service.py` |
| **"Estou ciente" antes da câmera**, sem caixa pré-marcada; a ciência fica registrada sem vínculo com a pessoa | `app/public/`, `src/components/visitor/` |
| O **resultado some ao sair da página**, pensando em computador compartilhado | `src/app/evento/[id].tsx` |
| **Remoção pelo titular**: a foto sai da busca na hora e é excluída em até 72 h; o e-mail de contato é apagado ao concluir | `app/public/service.py`, trabalhador |
| **Expiração automática**: aviso 30 dias antes; no vencimento, fotos, cópias, pacotes e vetores são eliminados | `app/events/expiry.py` |
| **GPS removido** de toda foto enviada; crédito do fotógrafo gravado nos metadados | `app/imaging_meta.py` |
| **Senha** guardada só como hash Argon2id; sessão em cookie HttpOnly; no banco, só o hash do token | `app/auth/` |
| **Auditoria inalterável**: o banco recusa alterar ou apagar registros de auditoria | migrações, `app/audit.py` |
| **Controle de acesso no servidor**: fotógrafo e administrador verificados em toda rota | `app/api/deps.py` |

Este projeto aplica a lei como engenharia; não é parecer jurídico. A validação final da base
legal, da Política de Privacidade e a indicação do encarregado (DPO) cabem à área jurídica da
instituição.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Interface | Expo SDK 57 (React Native 0.86 + React Native Web), Expo Router, TypeScript |
| API | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Reconhecimento facial | InsightFace 1.0 (modelo `buffalo_l`) sobre ONNX Runtime |
| Banco de dados | PostgreSQL 17 + pgvector |
| Armazenamento de arquivos | SeaweedFS, pelo protocolo S3 (boto3) |
| Testes | pytest (servidor), Playwright (navegador, ponta a ponta) |

> **Licença do modelo:** os modelos pré-treinados do InsightFace (`buffalo_l`) são distribuídos
> só para pesquisa não comercial. O uso acadêmico neste TCC está coberto. Antes de uma
> implantação institucional, o modelo precisa ser licenciado ou trocado por outro; o adaptador
> existe também por isso.

## Estrutura

```
backend/
  app/
    api/            rotas HTTP (painel, visitante, administrador)
    face/           porta + adaptador InsightFace
    storage/        porta + adaptador S3/SeaweedFS
    indexing/       fila de indexação facial, reindexação, trabalhador
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
docs/               relatório de adequação das telas do Figma aos requisitos v1.6
tools/figma/        leitor offline do arquivo .fig (as telas da equipe de design)
```

## Rodar na máquina (macOS)

### Instalação, uma vez só

```bash
brew install python@3.12 postgresql@17 pgvector seaweedfs node
brew services start postgresql@17
infra/setup_local.sh                      # cria os bancos e as senhas locais (backend/.env)

cd backend
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade head && .venv/bin/alembic -x db=test upgrade head

cd ../frontend
npm install && npx playwright install chromium
```

Na primeira vez que carrega o modelo, o InsightFace baixa o `buffalo_l` (cerca de 280 MB) para
`~/.insightface/models/`.

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
- `http://localhost:8081/login`: **equipe** (fotógrafo e administrador).

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
em `backend/outbox/`, e o link de ativação está no arquivo mais novo.

## Testes

```bash
cd backend && .venv/bin/pytest                     # 125 testes das regras do servidor
cd frontend && npm run typecheck && npx expo lint
```

Os testes do servidor usam um banco separado (`fotomac_test`) e nunca tocam o banco de
desenvolvimento.

Os testes de ponta a ponta abrem um navegador de verdade e usam o InsightFace real. Eles
precisam dos três serviços no ar:

```bash
cd frontend
npm run e2e                                        # login, primeiro acesso, recuperação de senha
node e2e/panel.e2e.mjs CAPA.jpg                    # painel do fotógrafo
node e2e/images.e2e.mjs PASTA-FOTOS CAPA.jpg       # envio → conferência → publicação → indexação → ZIP
node e2e/visitor.e2e.mjs PASTA-FOTOS               # visitante: busca facial, download, remoção
node e2e/admin.e2e.mjs                             # administrador: contas
node e2e/config.e2e.mjs GRUPO.jpg CAPA.jpg         # administrador: temas, parâmetros, reindexação

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
