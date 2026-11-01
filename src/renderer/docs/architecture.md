# Arquitetura e entregas do renderer

Planejamento atualizado em 2026-10-23; infraestrutura de testes de componentes
preparada na #67, sem implementacao visual das entregas abaixo. A
[spec de apresentacao](specification.md) registra comportamentos; este
documento registra responsabilidades, contratos propostos e ordem de codigo.
O [plano geral](../../../docs/plan.md) continua sendo a unica fonte de andamento.
Requisitos e contratos de dominio pertencem a [especificacao geral](../../../docs/specification.md)
e a [arquitetura geral](../../../docs/architecture.md), nunca aos componentes.
Essas fontes sao apenas consultadas neste planejamento. O escopo do PR fica
nos documentos do renderer, com no maximo a referencia ao frontend no plano
geral; nao inclui alterar regras, documentos, modelo ou API do nucleo.

## Diretrizes e propostas

- Acordado: frontend em `src/renderer/`, nucleo agnostico, separacao entre
  estado de dominio, apresentacao e rascunhos; componentes recebem dados
  somente de leitura e emitem intencoes. Nao implementar regras ausentes do
  nucleo, nem criar todas as pastas antecipadamente.
- Planejamento discutido: base visual, inspecao isolada e primeira integracao
  funcional, nessa ordem, com testes em cada incremento. Os nomes de
  componentes abaixo sao propostas, nao APIs implementadas ou obrigacao de
  criar um arquivo por conceito.
- Recomendacao tecnica: manter Vue, TypeScript, Vite e CSS com tokens; nao
  adicionar inicialmente Tailwind, Pinia, Router, microfrontends ou releases
  independentes. O produto continua sendo o aplicativo Electron.
- Ferramentas propostas: Lucide Vue para icones e Playwright para verificacao
  visual/ponta a ponta. Ainda nao instaladas ou declaradas aprovadas apenas
  porque a organizacao de pastas foi aceita. Inter empacotada localmente entrou
  na #68 (ver [Fundacoes visuais](#fundacoes-visuais-68)).
  Vue Test Utils e jsdom foram aprovados para testes na #67; suporte e
  verificacao estao descritos abaixo.
- Acordado apos esclarecimento: sem tooltip na entrega 1; manter nome
  acessivel de botoes de icone. Reka UI nao entra apenas para tooltip.
  Bibliotecas de dialogos/selecoes podem ser avaliadas na entrega que precisar
  desses comportamentos, sem construir uma biblioteca inteira antes do uso.

## Referencias do Figma

Na [pagina Telas](https://www.figma.com/design/h2kssKC2KiSuN4iAg4K1yU?node-id=0-1)
foram inventariados 11 frames. Execucao, edicao, andamento e estado vazio
foram inspecionados visualmente nesta retomada. Eles compartilham uma area de
trabalho; nao sao 11 aplicacoes ou rotas independentes.

| Referencia                      | Uso na implementacao                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Tela principal                  | Toolbar, lista de tarefas, Gantt, painel do sistema e detalhes/jobs como composicao comum. |
| Configurar, editar e remover    | Dialogos sobre a mesma area de trabalho, com rascunho e confirmacao.                       |
| Andamento, bloqueio e conclusao | Estados da sessao e sobreposicoes; nao recriar a composicao inteira.                       |
| Erro de importacao e alertas    | Mensagens contextualizadas, distintas do banner de falhas inesperadas (DEC-24).            |
| Estado vazio                    | Referencia para a preparacao; nao copiar tick zero antes do inicio explicito.              |
| Exportacao                      | Referencia de layout, nao evidencia de exportacao integral ou contrato ja implementado.    |

As Fundacoes ja possuem nomes CSS, como `--color-bg-app`,
`--color-text-primary` e `--spacing-xs`, familia Inter e variantes dos botoes.
Reutilizar essas referencias; corrigir os contrastes conhecidos, sem reduzir
texto essencial apenas para caber. Os quatro exemplos de cores nao formam um
ciclo para atribuir tarefas. ID imutavel e rollback no cancelamento do
prototipo nao prevalecem sobre os acordos documentados. Tooltip nao foi
encontrado como componente definido no material inspecionado; uma consulta
adicional de reacoes nao retornou resultado, portanto nao ha afirmacao de
auditoria completa de todas as interacoes do arquivo.

## Modulos e fronteiras

| Area proposta             | Responsabilidade                                                                         | Limite                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `components/`             | Botoes, campos, mensagens e demais elementos genericos quando necessarios.               | Nao conhece tarefa, job ou Simulator.                            |
| `features/session/`       | Toolbar, composicao vazia e apresentacao de preparacao, andamento, bloqueio e conclusao. | Nao executa politica nem decide termino/bloqueio.                |
| `features/inspection/`    | Lista de tarefas, detalhes, tabela de jobs e CPUs.                                       | Apenas consulta os dados publicados e emite selecao.             |
| `features/configuration/` | Formularios, rascunhos, confirmacoes e diagnosticos.                                     | Nao duplica validacao semantica ou modifica snapshots.           |
| `features/gantt/`         | Projecao dos registros, geometria, desenho, selecao e SVG.                               | Nao inventa eventos nem reconstroi regras ausentes do nucleo.    |
| `composables/`            | Coordenacao Vue, selecao, dialogos, zoom e publicacao dos dados.                         | Nao guarda outra copia mutavel do dominio.                       |
| `adapters/`               | Consumo da API publica do nucleo e da ponte autorizada de arquivos.                      | Sem componentes visuais; renderer nao importa Node/main/preload. |

`App` compoe os modulos. O coordenador de sessao usa uma unica instancia
privada do simulador ativo, mantida na fronteira do adaptador; nenhum painel
cria outra. `WorkspaceLayout` apenas distribui slots de toolbar, lateral e
conteudo. `Root` continua com `ErrorBanner` fora de `App`, para o banner
sobreviver a falhas na inicializacao da aplicacao.

### Dados e comandos

Snapshot e consultas publicas do nucleo passam pelo adaptador e por funcoes
puras de projecao ate as propriedades dos componentes. Cliques e formularios
emitem intencoes; o coordenador chama o comando, trata seu resultado e so
publica dados confirmados. Componentes nao recebem `Simulator` ou estado vivo.

Projecoes preparam rotulos, percentuais e linhas de tabela, mas nao executam
politicas, sorteiam, rederivam elegibilidade ou inventam ranking. A consulta
de intervalos/totais de CPU desligada e `summarizeCpuOff` (DEC-21), nao uma
implementacao nova no Gantt. Para a experiencia planejada, a UI precisa
receber valores efetivos de cada job quando houver edicao da tarefa. Isso
e uma expectativa de dados a conferir na integracao, nao uma exigencia de
acrescentar campos em Job ou prescrever como o nucleo os representa.

`useSimulation` ja expoe `view`, `load`, `tick`, `forward`, `backward` e
`next`, com `CommandResult` (DEC-23/DEC-24/DEC-36, #17/#65/#24); `view` e o
snapshot do cursor e recusas chegam como `refused`. Preservar esse contrato e
o tratamento central de erros; nao duplicar banner, handlers ou classificacao
por painel.
`load` ja inicializa t=0, enquanto FE-02/FE-04 exigem preparacao antes de
iniciar. Essa integracao precisa ser fechada antes da entrega 3: nao chamar
`load` ao importar/preparar e esconder o snapshot como se o motor nao tivesse
iniciado, nem alterar o adaptador nesta entrega documental.

Estado de apresentacao: selecao, zoom, rolagem e dialogo aberto. Estado de
rascunho: valores ainda nao aplicados. Configuracao vigente, relogio, jobs,
CPUs, eventos e historico continuam pertencendo ao nucleo. A disponibilidade
dos comandos reflete a fase e as capacidades reais, nao a existencia de mocks.

## Ordem proposta de implementacao

Esta sequencia detalha dependencias das issues existentes, nao cria um plano
concorrente nem autoriza comecar o frontend antes das entregas do nucleo.
Nao e necessario fechar todos os detalhes visuais antes de preparar o
incremento correspondente; resolver conflitos e lacunas quando afetarem seu
contrato. Q-05/DEC-08 foram resolvidas na #35 (2026-10-24); o gate visual esta
liberado, sem dispensar o merge do registro.

| Ordem | Entrega                                                                  | Verificacao e dependencia                                                                                                                   |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Base visual e area de trabalho vazia.                                    | Concluida (#68, #70, #72; gate da #35 em `main`). Comparacao lado a lado com o Figma fica para a #40. Nao conclui #36.                      |
| 2     | Inspecao isolada de tarefas, jobs e CPUs.                                | Projecoes, selecao e estados em testes de componentes; parte somente de leitura da #37.                                                     |
| 3     | Preparar, validar, iniciar, avancar um tick e atualizar os paineis.      | Integracao real com o nucleo, usando #17/#65 existentes e politicas de #19/#20; reconciliar preparacao com DEC-23.                          |
| 4     | Arquivos e diagnosticos completos.                                       | Parser, validacao contextual, ponte Electron e confirmacao; #30 a #33 concluidas; #34 ainda necessaria.                                     |
| 5     | Gantt inicial com intervalos, eventos, legenda, selecao, zoom e rolagem. | Geometria e comparacao visual na #38; apenas fatos disponiveis, sem inventar trechos suspensos antes de #25/#26.                            |
| 6     | Historico com cursor e futuro valido visivel.                            | Restauracao, reproducao e selecao futura; depende de #23/#24.                                                                               |
| 7     | Intervencoes atomicas e, em incremento separado, execucao completa.      | Formularios integrados depois de #25/#26; andamento, cancelamento e bloqueio depois de #27; verificacao em #28.                             |
| 8     | SVG integral e fechamento.                                               | Mesma projecao/geometria do Gantt, sem recorte de viewport; #39/#40, gates de E6 e pacote no ambiente-alvo. SVG definido pela DEC-08 (#35). |

Dados de exemplo tipados pertencem aos testes e demonstracoes isoladas, nao
substituem o nucleo na aplicacao ou habilitam comandos ficticios. Cada entrega
deve deixar claro o que e visual, o que esta integrado e o que depende de
contrato ainda ausente. A etapa 4 exige o tratamento de arquivos ja acordado,
exibindo os avisos de periodo padrao aplicado na carga (DEC-29), sem filtro
ou conversao proprios no renderer.
As referencias a issues do nucleo indicam dependencias de consumo: nenhuma
delas passa a fazer parte deste PR. Planejar um componente isolado com dados
de exemplo nao exige concluir o nucleo nem autoriza modifica-lo para atender
ao exemplo. A integracao funcional so e verificada com contratos reais.

## Entrega 1: base visual

Objetivo: substituir a apresentacao do contador pela estrutura visual de
preparacao, baseada no estado vazio do Figma, sem implementar configuracao,
escalonamento, historico ou Gantt. Nao criar um simulador apenas para desenhar
o layout. Acoes ainda sem implementacao nao aparentam funcionar.

| Incremento        | Ordem do codigo                                                                       | Criterio verificavel                                                                       |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Fundacao          | Configurar testes de componentes, depois tokens CSS, estilos globais e fonte local.   | SFC monta no teste; testes do nucleo continuam em Node; aplicacao consome tokens.          |
| Elementos basicos | `UiButton`, `UiIconButton`, `UiAlert` e adaptacao visual de `ErrorBanner`.            | Variantes, nome acessivel, foco e desabilitacao testados; banner sobrevive a falha de App. |
| Composicao        | `WorkspaceLayout`, `SimulationToolbar` e `EmptyWorkspace`, depois verificacao visual. | Area de trabalho reconhecivel, sem sobreposicao ou comandos ficticios.                     |

Contratos propostos:

- `UiButton`: recebe variante, estado desabilitado e conteudo; emite clique.
  Nao decide se uma operacao e permitida. Reusar as variantes do Figma.
- `UiIconButton`: nome acessivel obrigatorio; sem tooltip na entrega 1.
- `UiAlert`: aparencia de mensagem, sem conhecer parser ou simulador.
  Nao confundir mensagem contextual de validacao com erro global inesperado.
- `WorkspaceLayout`: slots de toolbar, lateral e conteudo, sem importar core.
- `SimulationToolbar`: parametros e acoes disponiveis entram como dados;
  sai a intencao do usuario. Nenhuma chamada direta ao motor.
- `EmptyWorkspace`: apresenta preparacao sem tarefas e sem snapshot zero
  ficticio. A implementacao funcional das acoes pertence a entrega 3/4.

Verificacao: clique, desabilitacao, nome acessivel e foco nos testes; regressao
do banner; screenshots em 1440 x 924 e 1024 x 768, conferindo textos e toolbar
sem sobreposicao. Esses tamanhos sao cenarios iniciais, nao limites maximos
ou definicao de tamanho minimo da janela. Nao ha teste de tooltip neste escopo.

## Entrega 2: inspecao isolada

Objetivo: apresentar tarefas, jobs e CPUs antes de integrar edicao, seguindo
a lateral e os paineis inferiores da tela principal do Figma.

| Componente proposto | Recebe                                                   | Emite                      |
| ------------------- | -------------------------------------------------------- | -------------------------- |
| `TaskList`          | Tarefas e identificacao da selecionada.                  | Selecionar tarefa.         |
| `TaskDetails`       | Caracteristicas da tarefa selecionada.                   | Nenhum comando de dominio. |
| `JobTable`          | Jobs, selecao e tick inspecionado.                       | Selecionar job.            |
| `SystemInspector`   | CPUs, elegibilidade e pendencias informadas pelo nucleo. | Nenhum comando de dominio. |

Ordem de codigo: funcoes de projecao e testes com exemplos tipados;
`JobTable` e `SystemInspector`; `TaskList` e `TaskDetails`; coordenacao da
selecao; verificacao dos estados do Figma e dos casos adicionais acordados.
Reusar os elementos genericos da entrega 1, sem biblioteca de tabelas ou
gerenciador global de estado apenas para essa composicao.

Criterios: distinguir job concluido de tarefa aguardando; perda de prazo
separada do estado; CPU ocupada/desligada conforme dados recebidos; selecao
futura conforme FE-10; listas extensas consultaveis sem corte inacessivel.
Nenhum componente recebe ou modifica o simulador vivo. Suspender, retomar e
editar so ganham comportamento na entrega correspondente, sem mocks produtivos.

## Testes de componentes (#67)

O [Vitest](../../../vitest.config.mts) usa o plugin Vue existente para
transformar SFCs, incluindo `<script setup lang="ts">`. O ambiente padrao
continua `node`: nucleo, auxiliares e composables sem montagem nao recebem
DOM. Somente os testes do renderer que requerem DOM declaram
`// @vitest-environment jsdom` no inicio.

As dependencias de desenvolvimento `@vue/test-utils` e `jsdom` permitem
montar componentes reais e disparar eventos sem iniciar Electron.
O [teste do ErrorBanner](../components/ErrorBanner.test.ts) verifica ausencia
inicial, renderizacao reativa, clique em Dismiss e exibicao de novo erro
apos o descarte. Limpa estado global e mocks e desmonta os componentes
automaticamente, sem alterar o componente ou a classificacao de DEC-24.

Executar na raiz com a versao de Node declarada em `devEngines.runtime` no
[package.json](../../../package.json) (24.22.1, fonte unica para desenvolvimento,
CI e release; #80). Ela esta dentro das engines de Vitest 5 e jsdom 30, que
excluem o Node 25:

```sh
npm test -- src/renderer/components/ErrorBanner.test.ts
npm test
npm run typecheck
npm run lint
```

Os fins de linha dos arquivos de texto sao LF em qualquer sistema, definidos
em `.gitattributes`; assim `npm run lint` tambem passa em checkout Windows.

jsdom verifica DOM e eventos, nao layout, pixels, foco nativo do Electron ou
distribuicao. Esta infraestrutura nao implementa componentes, estilos ou
contratos novos; verificacao visual e pacote continuam fora de F1.

### Evidencia da #67 (2026-10-24)

Verificado sobre `main` em `5dd741f`, com `npm ci` do lockfile, em Node 25.8.0
(fora das engines de Vitest 5 e jsdom 30; a versao padronizada veio depois, na
#80):

- Teste focado do ErrorBanner 2/2; `npm test` 242/242 em 14 arquivos (240 do
  `main` mais 2 do F1); `npm run typecheck` aprovado; `oxlint` do codigo e
  formato de `package.json`, `vitest.config.mts` e do teste aprovados.
- Isolamento: teste descartavel no nucleo confirmou `window` e `document`
  ausentes sem a diretiva jsdom, e o teste do componente a declara
  explicitamente. O teste descartavel foi removido.
- `npm run lint` global segue reprovado por formatacao preexistente fora do
  escopo: o checkout usa CRLF e `oxfmt --check` acusa ate arquivos nao
  alterados; copias LF dos arquivos alterados passam. Nenhuma normalizacao
  geral foi feita. A causa foi tratada na #80 (`.gitattributes`).
- Links locais e IDs deste documento conferidos. Build, aplicativo, verificacao
  visual e pacote nao executados. F2, #36 e #37 nao foram implementadas.

## Fundacoes visuais (#68)

Primeiro incremento da entrega 1, sem componentes funcionais, sem alterar
`App`, `ErrorBanner` ou o nucleo.

- [tokens.css](../styles/tokens.css): unica fonte dos valores da pagina
  [Fundacoes](https://www.figma.com/design/h2kssKC2KiSuN4iAg4K1yU?node-id=60-163)
  (colecao `os-sim`, **modo escuro**): cores semanticas, espacamento, raio e os
  11 estilos de texto, com os nomes de codigo do Figma (`--color-bg-app`,
  `--color-text-primary`, `--spacing-xs`, `--font-body-md`, ...). Os
  `--font-*` sao o shorthand `font` (peso, tamanho, `normal`, familia). O
  Figma nao define sombras; nao ha token delas. Cores de tarefa nao tem token:
  `task/1..4` sao amostras e o "ciclo de quatro cores" do Figma nao vale (REQ-06).
- [base.css](../styles/base.css): `color-scheme: dark`, corpo com
  `--font-body-md`, anel de foco, so com `var(--...)`. [index.css](../index.css)
  importa fonte, tokens e base.
- Inter via `@fontsource-variable/inter` (OFL-1.1), importada do pacote e
  emitida pelo Vite no bundle: sem servico externo de fontes. Justificativa: a
  forma usual de empacotar Inter localmente com Vite, sem copiar binarios para
  o repositorio. Custo: `wght.css` inclui todos os subconjuntos (cerca de 220 kB
  de woff2); reduzir a latin/latin-ext se o tamanho do pacote importar.
- [Teste das fundacoes](../styles/foundations.test.ts): valores iguais aos do
  Figma, contraste WCAG, ausencia de tokens de cor de tarefa, de valores
  literais em `base.css` e de URLs externas. O CSS e lido com `?raw`; o
  `vitest.config.mts` libera o processamento de `.css?raw`, que o Vitest esvazia
  por padrao.

Desvios do Figma, para corrigir contrastes conhecidos como insuficientes:

| Token                        | Figma        | Aqui      | Motivo                                                      |
| ---------------------------- | ------------ | --------- | ----------------------------------------------------------- |
| `--color-text-on-color`      | `#FFFFFF`    | `#171A21` | Branco da 3,23:1 sobre accent e 3,67:1 sobre danger.        |
| `--color-accent-text`        | (nao existe) | `#6E9FFB` | Accent como texto: 4,35:1 em `bg-raised`, 4,37:1 em subtle. |
| `--color-status-danger-text` | (nao existe) | `#F27878` | Danger como texto: 4,22:1 em surface, 3,83:1 em raised.     |
| `--color-focus-ring`         | (nao existe) | `#6E9FFB` | Anel de foco acima de 3:1 em todas as superficies.          |

Os fills `accent-default` e `status-danger` ficam como no Figma; os `-text`
sao para texto sobre superficies. Outras ressalvas: `border-default` (1,5:1) so
separador, nao delimita controle; os estilos de 9 a 11 px (`label-xs`,
`body-sm`, `body-xs`, `badge-*`) existem como no Figma, mas nao devem levar
texto essencial (o teste exige 12 px ou mais nos estilos essenciais). O texto
sobre cor de tarefa e o adaptativo preto/branco (FE-DEC-10) ficam para o Gantt;
`text-on-task` so e o padrao escuro e passa de 4,5:1 nas amostras do Figma.

### Evidencia da #68 (2026-10-25)

Sobre `main` em `5a569db`, worktree `feat/68-renderer-visual-foundations`,
Node 24.22.1 (via `npm exec --package=node@24`; o Node global e 25.8.0):

- `vitest run` 253/253 em 15 arquivos (11 novos); `vue-tsc` sem erros;
  `oxlint` sem achados; `oxfmt --check` limpo. Primeira versao dos tokens
  (valores provisorios, tema claro) foi substituida apos ler o Figma.
- Valores lidos do Figma pela API do MCP (`get_metadata` da pagina Fundacoes,
  2026-10-25), somente leitura; o teste fixa cada valor.
- Build do renderer (`vite build` em pasta temporaria): 7 woff2 da Inter no
  bundle e nenhuma URL externa no CSS gerado (verificado na primeira versao;
  `index.css` nao mudou).
- Nao executados: aplicativo Electron, comparacao visual lado a lado com o
  Figma, screenshots, pacote no ambiente-alvo.

## Elementos basicos (#70)

Segundo incremento da entrega 1. Componentes genericos em
[components](../components/), estilizados so com `var(--...)` de
[tokens.css](../styles/tokens.css), sem importar `core/` nem `errors.ts`
(FE-01). Valores da pagina Componentes do Figma (nos `50:14`, `89:49`,
`81:33`, `92:93` e `81:28`).

- [UiIcon](../components/UiIcon.vue): `name` entre `alert`, `warning`,
  `check`, `info` e `close` ([icons.ts](../components/icons.ts)); decorativo
  (`aria-hidden`), 16 px. Os SVGs de [assets/icons](../assets/icons/) sao os
  exportados do Figma, sem edicao, aplicados como mascara CSS sobre
  `currentColor`: o controle ao redor define a cor. Sem biblioteca de icones,
  pois o Figma ja define os cinco glifos necessarios (FE-DEC-13).
- [UiButton](../components/UiButton.vue): `variant` (`primary`,
  `secondary` padrao, `accent`, `danger`), `disabled`, slot do rotulo e slot
  `icon` opcional (oculto de tecnologia assistiva); emite `click`. Usa o
  `disabled` nativo, que bloqueia mouse e teclado. Nao decide disponibilidade:
  a composicao passa `disabled` conforme a capacidade real da sessao.
- [UiIconButton](../components/UiIconButton.vue): `label` obrigatorio vira o
  `aria-label`; icone no slot, oculto de tecnologia assistiva; sem `title` nem
  tooltip (FE-DEC-11). Mesmo contrato de `disabled` e `click`.
- [UiAlert](../components/UiAlert.vue): `tone` (`danger`, `warning`,
  `success`, `info`), `title` opcional, `message` e `dismissible` (padrao
  `true`); emite `dismiss`. Com `dismissible` falso nao ha botao de fechar:
  serve a mensagem sobre condicao ainda valida, como erro corrigivel
  (DEC-24), que a composicao remove quando o estado muda. Texto por
  interpolacao, nunca `v-html`, com espacos e quebras preservados
  (`pre-wrap`). `role="alert"` em danger/warning e `role="status"` em
  success/info, como as regras de uso do Figma. Nao move foco e nao some
  sozinho: quem o exibe o remove ao receber `dismiss`.
- [ErrorBanner](../components/ErrorBanner.vue): `UiAlert` em tom danger com
  titulo "Erro inesperado (detalhes no console)" e a mensagem de
  `currentError`; continua irmao de `App` em `Root.vue` e reservado a falhas
  inesperadas (DEC-24). Texto passou do ingles para o portugues, como o resto
  da interface.

Desvios e lacunas do Figma, registrados em FE-DEC-13 na
[spec do renderer](specification.md#decisoes-de-apresentacao-registradas):

- Foco: o Figma desenha borda de 2 px `accent-default` no Icon button e no
  Dismiss. Usa-se o anel global de [base.css](../styles/base.css)
  (`outline` com `--color-focus-ring`): mesma intencao, nao muda a caixa nem
  desloca o layout e mantem o contraste de #68.
- Bordas: todo estado de um componente tem a mesma largura de borda (Primary
  e Danger com 1 px transparente), para nenhuma troca de estado mudar o tamanho.
- Accent: texto em `--color-accent-text`, nao `accent-default` (contraste, #68).
- Button sem estado hover: o Figma nao define; nao foi inventado.
- Foco apos dispensar: o botao focado sai do DOM e o foco volta ao `body`.
  Devolver o foco ao controle de origem cabe a composicao (#36, #37), que sabe
  qual e; `UiAlert` nao recebe essa responsabilidade.

### Evidencia da #70 (2026-10-30)

Worktree `feat/70-controles-mensagens` com `main` mesclada em `00ee0f1`,
Node 24.22.1:

- Testes novos: [UiIcon](../components/UiIcon.test.ts),
  [UiButton](../components/UiButton.test.ts),
  [UiIconButton](../components/UiIconButton.test.ts),
  [UiAlert](../components/UiAlert.test.ts), [Root](../Root.test.ts) e
  [ErrorBanner](../components/ErrorBanner.test.ts) atualizado: variantes,
  clique e bloqueio quando desabilitado, foco por teclado, nome acessivel sem
  `title`, texto com HTML/espacos exibido literalmente, papeis por tom,
  alerta nao dispensavel sem botao de fechar e banner
  visivel e dispensavel com `App` lancando no `setup()`. O teste de `Root` usa
  `createApp` como `renderer.ts`, porque `@vue/test-utils` relanca erros do
  `mount`.
- `npm test` 414/414 em 23 arquivos (linha de base 380 em 18: os mesmos
  arquivos sem os testes novos desta issue);
  `npm run lint` e `npm run typecheck` sem achados, como na linha de base.
- Busca sem resultado por cor hexadecimal nos componentes e por import de
  `core/` ou `errors` nos `Ui*`.
- SVGs baixados do Figma via MCP (`get_design_context`) em 2026-10-29.
- Icones no build: os SVGs ficam abaixo do `assetsInlineLimit` do Vite e viram
  data URLs com aspas simples no build (e no Vitest), mas URLs de arquivo no
  `npm start`. Por isso `UiIcon` usa `url("...")` com aspas; sem elas a mascara
  e invalida e o icone vira um quadrado. Revisao final achou o defeito; teste
  do `UiIcon` exige a URL entre aspas, e `vite build` do renderer (pasta
  temporaria) confirmou data URLs so com aspas simples.
- Desabilitado: os testes cobrem clique; Enter/Espaco dependem da semantica
  nativa de `disabled`, sem teste proprio.
- Conferencia no app Electron (2026-10-30, `npm start`, pelo usuario):
  erro lancado no console do DevTools exibiu o `ErrorBanner`; os icones
  `alert` e `close` aparecem como glifos, sem quadrado solido, e o fechar
  remove o banner. No `npm start` os icones sao URLs de arquivo; o caminho de
  data URL do build fica coberto pela inspecao do `vite build` acima.
  `warning`, `check` e `info` ainda nao sao montados no app; conferir no
  incremento Composicao.
- Nao executados: pacote do Electron e pacote no ambiente-alvo, comparacao
  visual com o Figma, screenshots (pertencem ao incremento Composicao).

## Composicao (#72)

Terceiro incremento da entrega 1: `App` compoe a area de trabalho vazia em
preparacao (FE-02, FE-DEC-14) com componentes em [components](../components/),
so com `var(--...)` de [tokens.css](../styles/tokens.css) e sem importar
`core/` nem `errors.ts` (FE-01). Somente [App](../App.vue) importa
`DEFAULT_CONFIG` de `core/domain`, e repassa RM, quantum e CPUs por props.
`App` nao chama `useSimulation()` nem cria simulador: a #36 decide quando
criar e reconcilia a preparacao com o adaptador de DEC-23, que parte de
`DEFAULT_CONFIG` em t=0. `useSimulation.ts` nao foi alterado e, ate a #36,
nao tem uso em producao: so seus testes e o espiao de `App.test.ts` (que
garante que `App` nao o chama) o importam. A #36 deve liga-lo ou revisar o
contrato antes de usa-lo (pendencia registrada no plano).

Valores do quadro `99:3895` do Figma (arquivo `h2kssKC2KiSuN4iAg4K1yU`).

### Divisao em cinco componentes

A arquitetura previa tres (`WorkspaceLayout`, `SimulationToolbar`,
`EmptyWorkspace`). Os paineis foram separados para a #37 (lista de tarefas) e
a #38 (Gantt) os reutilizarem sem reabrir a composicao; e escolha de
implementacao, nao decisao do usuario.

- [WorkspaceLayout](../components/WorkspaceLayout.vue): grade com slots
  `toolbar`, `sidebar` e o padrao (area principal); so posiciona. Barra nas
  duas colunas, painel de 320 px, area principal com `min-width: 0` para um
  Gantt largo nao esticar a janela. Dono do padding de regiao `--spacing-lg` e
  do `gap` `--spacing-sm` da coluna: os paineis nao aplicam padding proprio.
- [SimulationToolbar](../components/SimulationToolbar.vue): props `clock`
  (`number | null`), `algorithm`, `cpuCount`, `quantum` e `available`
  (`ReadonlySet<WorkspaceAction>`, padrao vazio); emite `action`. Titulo
  `os-sim`, seis botoes e quatro chips. `clock` nulo mostra `–` (U+2013). O
  quantum sempre aparece: vale para RM e EDF (DEC-03), entao a nota do chip do
  Figma (usar "—" quando o parametro nao se aplica) nao se aplica ao Projeto A.
- [TaskPanel](../components/TaskPanel.vue): prop `available`; emite `action`.
  Titulo, texto de estado vazio e "Adicionar tarefa" em largura total. A #71
  poe a lista entre o cabecalho e o botao.
- [GanttPanel](../components/GanttPanel.vue): prop `available`; emite
  `action`; slot padrao para o corpo (a #38 poe o grafico). Cabecalho com
  zoom (`Diminuir zoom`, `Aumentar zoom`) e "Exportar SVG". A leitura `100%` e
  texto estatico: nao ha estado de zoom antes do grafico.
- [EmptyWorkspace](../components/EmptyWorkspace.vue): props `algorithm`,
  `quantum`, `cpuCount` e `available`; emite `action`. Pasta de 32 px, titulo,
  texto com os valores recebidos (`1 CPU`, `2 CPUs`) e tres botoes. Sem
  "(DEC-10)" na tela (FE-DEC-14).
- [workspaceActions.ts](../components/workspaceActions.ts): tipo
  `WorkspaceAction` (`load-config`, `configure-system`, `add-task`,
  `step-back`, `step-forward`, `restart`, `run-all`, `zoom-out`, `zoom-in`,
  `export-svg`). Os componentes so emitem intencoes; quem os usa decide a
  disponibilidade e o efeito. Treze botoes na tela mapeiam para dez intencoes
  (Carregar configuracao, Adicionar tarefa e Sistema aparecem duas vezes), por
  isso rotulo e icone de cada intencao ficam so em `ACTION_META`; a variante
  visual fica em cada tela, pois Sistema e accent na barra e secondary no
  estado vazio. `NO_ACTIONS` (`ReadonlySet` vazio compartilhado) e o padrao de
  `available` em todos os componentes e o valor que `App` passa.

`available` vazio por padrao faz um uso ainda nao ligado renderizar tudo com
`disabled` nativo, em vez de clicavel e inerte. `App` passa o conjunto vazio:
nenhuma acao existe ate as #36 a #38. Clicar em desabilitado nao emite nada.

### Icones e `UiIcon`

`UiIcon` ganhou a prop `size` (`16` padrao ou `32`): a pasta do estado vazio
tem 32 px no Figma. O tamanho vai como propriedade customizada
(`--ui-icon-size`) lida pela regra `.ui-icon`, e nao como `width`/`height`
inline, para um componente pai ainda poder redimensionar o icone por CSS. Nove SVGs novos em [assets/icons](../assets/icons/),
exportados sem edicao da pagina Componentes via `get_design_context` em
2026-10-31 e registrados em [icons.ts](../components/icons.ts):

| Icone        | No Figma | Uso                                         |
| ------------ | -------- | ------------------------------------------- |
| folder       | `49:5`   | Carregar configuracao; estado vazio (32 px) |
| settings     | `86:87`  | Sistema                                     |
| step-back    | `49:9`   | Voltar tick                                 |
| step-forward | `49:13`  | Avancar tick                                |
| restart      | `49:17`  | Reiniciar                                   |
| run-all      | `49:21`  | Executar tudo                               |
| plus         | `86:38`  | Adicionar tarefa; zoom +                    |
| minus        | `86:43`  | Zoom -                                      |
| download     | `49:26`  | Exportar SVG                                |

### Desvios e lacunas

Registrados em FE-DEC-14 na
[spec do renderer](specification.md#decisoes-de-apresentacao-registradas)
quando mudam comportamento; os demais sao so de implementacao:

- Texto do Figma com "(DEC-10)" e chip com `—` condicional: ver FE-DEC-14 e
  o quantum acima.
- Barra: o Figma a desenha com 64 px a 1440 px. O conteudo ocupa cerca de
  1230 px mais o padding horizontal, entao a barra quebra em segunda linha
  (`flex-wrap`) abaixo de cerca de 1270 px; os 64 px viram `min-height` e
  `padding-block: var(--spacing-sm)` evita que a linha quebrada encoste na
  borda da janela e corte o anel de foco. Sem quebra o conteudo se
  sobreporia ou geraria rolagem horizontal.
- Banner de erro: `Root.vue` o renderiza acima de `App`, em fluxo normal.
  `#app` (em `base.css`) e uma coluna flex de `100vh` e `.workspace` usa
  `flex: 1; min-height: 0`, de modo que o banner reduz a area de trabalho em
  vez de tornar a pagina mais alta que a janela. O banner tem
  `max-height: 40vh` com rolagem propria: uma mensagem longa (pilha de erro)
  nao comprime a area de trabalho a zero nem faz a pagina rolar.
- Testes que leem o CSS de um `.vue` usam `import ... from '...?raw'` do Vite:
  `readFileSync` falha sob jsdom e o lint proibe `node:fs` no renderer. O
  helper de teste [testing/cssRule.ts](../testing/cssRule.ts)
  (`ruleBody(source, seletor, atRule?)`) extrai o corpo de uma regra, para as
  assercoes valerem para o seletor certo e nao para qualquer ocorrencia no
  arquivo. Le so os blocos `<style>` de um `.vue`, aceita seletores agrupados
  e distingue regras de topo das internas a um `@media` (terceiro argumento).
  Fica em `testing/`, pasta que o codigo de producao nao importa, com testes
  proprios.
- Foco e estados dos botoes seguem [Elementos basicos](#elementos-basicos-70).
  Botoes de accent desabilitados aparecem mais apagados que no Figma, que
  mostra Carregar configuracao e Sistema habilitados.

### Evidencia da #72 (2026-10-31)

Worktree `feat/72-area-trabalho-vazia`, Node 24.22.1:

- Testes novos de componente: icones e `UiIcon` (tamanho), barra, layout,
  paineis, estado vazio e `App` (nenhum simulador criado na montagem, cada
  botao desabilitado nao emite `action`, `2 CPUs` no plural, sem "DEC-" na
  tela); `Root.test.ts` inalterado e verde (banner com `App` lancando).
- `npm test` 460/460 em 29 arquivos (linha de base 422 em 23);
  `npm run lint` e `npm run typecheck` sem achados.
- Revisao do PR #100 (2026-10-31): tamanho do `UiIcon` por
  `--ui-icon-size`, altura maxima do banner, `ACTION_META` e `NO_ACTIONS`,
  helper movido para `testing/` com seletores agrupados e `@media`, pendencia
  do `useSimulation` registrada. `npm test` 467/467 em 30 arquivos, lint e
  typecheck sem achados. No app (`npm start`, conferencia manual do
  usuario): icones intactos (pasta 32 px, demais 16 px) e erro longo com
  banner limitado e rolagem propria, sem rolagem da pagina.
- Buscas sem resultado: cor hexadecimal em `components/*.vue` e `core/` em
  `components/*.vue` e `components/*.ts`.
- Conferencia no app Electron (`npm start`, `--remote-debugging-port`, medicao
  e captura por CDP, sem redimensionar a janela nativa: tamanho emulado com
  `Emulation.setDeviceMetricsOverride`). A 1440 x 924: barra de 64 px, sem
  rolagem horizontal, 13 botoes, todos desabilitados; leiaute equivalente ao
  quadro `99:3895` (captura do Figma via MCP). A 1024 x 768: barra com 112 px
  (duas linhas, chips na segunda), sem rolagem horizontal
  (`scrollWidth` 1024), sem sobreposicao. Icones: 27 elementos de icone,
  todos com mascara `url("data:image/svg+xml...")` e a pasta do estado vazio
  com 32 x 32; nas capturas todos aparecem como glifos, sem quadrado solido.
- Achado visual (corrigido nesta issue): a 1024 px a barra nao tinha
  espacamento vertical e a linha dos botoes encostava no topo da janela
  (`actionsTop` 0 px, barra de 88 px). Com `padding-block: var(--spacing-sm)`
  a 1024 x 768 o primeiro botao fica a 12 px do topo e a barra mede 112 px;
  a 1440 x 924 a barra continua com 64 px. Com um bloco de 48 px simulando o
  banner acima de `App`, `scrollHeight` segue igual a `clientHeight` (768).
  Remedicao por CDP no app em execucao (HMR) em 2026-10-31; capturas locais.
- Diferencas conhecidas contra o Figma: botoes accent desabilitados mais
  apagados; texto do painel lateral quebra em outro ponto; texto do estado
  vazio em duas linhas (Figma: tres, por conter "(DEC-10)").
- App empacotado (`npm run package`, macOS arm64, 2026-11-01), conferido
  pelo usuario, que relatou tudo funcionando, sem copiar a saida: icones
  (pasta 32 px, demais 16 px), banner com erro longo limitado e com rolagem
  propria, redimensionamento real da janela nativa e navegacao por Tab (com
  todos os botoes desabilitados o foco nao entra em nenhum).
- Nao executados: pacote no ambiente-alvo e comparacao lado a lado com o
  Figma (#40).

## Estado do sistema e das CPUs (#73)

Componente `SystemInspector` da entrega 2, em
[features/system](../features/system/). `projectSystem`
([system.ts](../features/system/system.ts)) e funcao pura sobre o snapshot:
usa `findEligibleJobs` e `summarizeCpuOff` e apenas agrupa o resultado, sem
regra propria de elegibilidade, despacho ou intervalos (FE-01, DEC-21). Entrega
uma linha por CPU na ordem recebida, a fila de prontos e os pendentes; jobs
concluidos ficam de fora, como na tabela de jobs. Se o snapshot estiver
inconsistente (job `running` sem CPU, CPU ligada sem job, CPU sem job conhecido,
sequencia de eventos malformada), a projecao lanca erro em vez de omitir ou
adivinhar.

Decisoes acordadas com o usuario em 2026-10-31, conforme o protótipo Figma
(arquivo `h2kssKC2KiSuN4iAg4K1yU`, card "Estado do sistema", node 96:422):

- FE-DEC-15 (REQ-02, REQ-10; DEC-21): a CPU tem so duas condicoes, "Ocupada" (com job) e "Desligada"
  (sem trabalho elegivel). Nao existe estado "Ociosa": depois de cada despacho
  uma CPU sem job e desligada (`offSince` recebe o tick, DEC-21), e a
  projecao falha se encontrar CPU ligada sem job. Cada linha mostra "desde t =
  N": na CPU desligada, o tick em que desligou (`offSince`); na ocupada, o
  inicio da corrida ininterrupta do job atual naquela CPU, lido da ultima
  fatia de `executions` quando ela pertence ao mesmo job e termina no tick
  inspecionado, senao o proprio tick. Intervalos e total desligado seguem
  DEC-21 e ficam em linha propria, abaixo da linha principal.
- FE-DEC-16 (REQ-04, REQ-10; FE-09): o cabecalho mostra "snapshot t = N". Os parametros do
  sistema (politica, CPUs, quantum) nao aparecem no painel: o protótipo os
  traz so nos chips da barra ([SimulationToolbar](../components/SimulationToolbar.vue)),
  e a projecao nao os expoe (decidido com o usuario no PR #110, ao tratar a
  revisao; a descricao da #73 foi ajustada). A fila e os pendentes
  seguem em duas listas com os textos do protótipo: "FILA GLOBAL DE PRONTOS"
  (vazia: "Vazia — nenhum job elegivel esperando CPU.") e "PENDENTES (DEC-02)"
  (vazia: "Nenhum — cada tarefa tem no maximo um job incompleto."). Prontos
  traz so jobs elegiveis em estado pronto; pendentes traz jobs nao elegiveis
  (inclui suspensos), com estado e prazo perdido. Ambas na ordem da
  configuracao, sem rotulo de prioridade (FE-09).
- FE-DEC-17 (REQ-02, REQ-10; FE-09): a linha principal da CPU traz nome, condicao, job (com a cor da
  tarefa) e "desde t". A fatia ("Fatia: x de quantum ticks") aparece so quando
  ha job, e o progresso do job ("Progresso: y de duracao ticks") em linha
  secundaria; ambos com rotulos distintos, como antes.

Integracao: nao ha uso em producao. `App` ainda nao chama `useSimulation` e o
`WorkspaceLayout` nao tem slot para este painel; a composicao fica para a #36
(a issue pede verificacao isolada e composicao posterior).

### Evidencia da #73 (2026-11-01)

- Figma: card "Estado do sistema" (`96:422`, arquivo `h2kssKC2KiSuN4iAg4K1yU`)
  lido via MCP (`get_design_context`); colunas de 48/96/flex/80 px e `gap` de
  12 px conferidos contra o codigo de referencia. A lista de CPUs tambem
  rola como as duas listas (sem teto de CPUs ou jobs).
- Testes: `features/system` 25/25 (projecao e componente); `npm test`
  611 aprovados e 1 ignorado em 38 arquivos; `npm run lint` e
  `npm run typecheck` sem achados.
- Visual (Vite temporario fora do commit, dados tipados, navegador do app):
  1440 x 924 com o cenario do Figma (CPU 1 e 2 desligadas, CPU 3 ocupada,
  filas vazias) reproduz o card; 390 x 844 com 12 CPUs, 30 prontos e 30
  pendentes: sem rolagem horizontal (`scrollWidth` 390), as tres listas com
  rolagem propria e todos os itens no DOM. A 390 px o nome do job quebra em
  duas linhas.
- Nao executados: app Electron e pacote, comparacao lado a lado por captura
  com o Figma, leitura de `projectSystem` com snapshots reais do simulador
  no app (a #36 liga o `useSimulation`).

## Fluxo da area de trabalho (#36, parte 1)

`App` passa a compor o fluxo de preparar, iniciar e navegar. A logica fica em
[useWorkspace](../composables/useWorkspace.ts), que nao guarda objetos do
simulador: le o snapshot publicado por `useSimulation()` (DEC-23) e envia
comandos; `App` so liga projecoes (`projectSystem`, `projectInspection`) aos
paineis.

- Preparacao: `load-config` abre o dialogo da #33, passa o texto a
  `loadConfig` e guarda a configuracao como rascunho; carregar nao cria
  simulador nem avanca ticks (FE-02, FE-DEC-14). Erros de conteudo e avisos de
  periodo padrao (DEC-29) aparecem em alertas separados, com linha e motivo
  vindos do nucleo; falha de leitura mostra a frase do main.
- Inicio: o primeiro "Avancar tick" cria o simulador (`useSimulation()`
  chamado so ai, por isso o `App` continua sem simulador em preparacao),
  carrega o rascunho e publica o snapshot zero, sem executar `[0, 1)`. Exige
  ao menos uma tarefa (FE-02). Depois, "Avancar tick" usa `next()` (reaproveita
  o futuro gravado ou calcula um passo), "Voltar tick" usa `backward()` e
  "Reiniciar" recarrega o rascunho no snapshot zero (FE-05).
- Disponibilidade: Carregar configuracao so antes do inicio, porque substituir
  uma sessao em andamento pede a confirmacao de FE-04, ainda nao implementada.
  Voltar tick fica desabilitado em t = 0. Recusas do nucleo aparecem como
  alerta no ponto da acao e o ultimo snapshot valido permanece (DEC-24,
  DEC-36); erros inesperados seguem so para o banner.
- Disposicao provisoria: ate o Gantt (#38), o corpo do painel do diagrama
  mostra lado a lado o estado do sistema (#73) e a inspecao (#69/#71), que no
  Figma ficam na regiao "Detalhes" sob o diagrama. `InspectionPanel` deixou de
  usar `<main>` como raiz, pois ja ha um `<main>` no layout.
- FE-DEC-18 (REQ-04, REQ-05, REQ-10; FE-02, FE-04, FE-05): nesta parte, (a) o
  simulador so e criado no primeiro "Avancar tick" e Reiniciar recarrega o
  rascunho usado no inicio; (b) Carregar configuracao so existe antes de
  iniciar e fica desabilitado enquanto o dialogo esta aberto; um arquivo
  escolhido depois do inicio e ignorado, para nao mudar o que Reiniciar
  recarrega; (c) a disposicao lado a lado e provisoria ate o Gantt (#38).
  Justificativa: nao ha ainda a confirmacao de substituicao de FE-04, e iniciar
  sem tarefa ou trocar a sessao em silencio perderia trabalho (FE-05).
  Acordado com o usuario em 2026-11-01 ao delimitar a parte 1 da #36.
- Consultas compartilhadas: [snapshotQueries](../snapshotQueries.ts) guarda por
  snapshot (`WeakMap`) o resultado de `findEligibleJobs` e `summarizeCpuOff`,
  para as projecoes de sistema e inspecao nao perguntarem duas vezes ao nucleo
  a cada tick. Nao decide regra; so evita repetir a consulta.
- Fora desta parte: Executar tudo e cancelamento (#27), tarefas e sistema
  editaveis (#37 e restante da #36: Sistema e Adicionar tarefa seguem
  desabilitados) e a confirmacao de substituicao (FE-04).

Verificacao (2026-11-01): `npm test` 685 aprovados e 1 ignorado em 44 arquivos,
`npm run lint` e `npm run typecheck` sem achados. No renderer (Vite, com um
`window.configFile` simulado no navegador do app) a 1440 x 924: carregar um
arquivo com periodo ausente mostra o aviso, o primeiro avancar mostra t = 0,
avancar ate t = 5 atualiza relogio, estado do sistema e inspecao, sem rolagem
horizontal. Nao verificado: app Electron com o dialogo real, 390 px, voltar e
reiniciar no navegador (cobertos por testes de componente).

## Verificacao e pendencias tecnicas

- Componentes SFC usam o suporte Vue no Vitest e ambiente DOM somente
  para os testes do renderer que o requerem, conforme a secao de testes.
  O ambiente Node do nucleo nao deve ser trocado globalmente por jsdom.
- Projecoes e geometria recebem testes puros; componentes, testes de
  propriedades/eventos e teclado; integracao, testes dos comandos reais.
  Playwright compara estados e viewports, nao uma captura unica para todo o app.
- Codigo passa por `npm test`, `npm run lint` e `npm run typecheck`. Empacotar
  nao equivale a validar distribuicao; E6 exige teste no ambiente-alvo.
- Permanecem abertos os contratos detalhados das entregas 3 a 8, matriz de
  disponibilidade completa, escalabilidade/redimensionamento alem dos casos
  iniciais, foco dos dialogos e aprovacao das bibliotecas propostas. Isso nao
  reabre os acordos funcionais ja aceitos na spec.
- Exceto a infraestrutura de testes da #67 e as fundacoes visuais da #68, as
  ferramentas e os componentes
  planejados nao foram implementados nem seus criterios marcados como atendidos.
- Diferencas entre expectativas da interface e a API disponivel ficam
  registradas como dependencias, sem propor DECs ou alterar documentos do
  nucleo neste escopo. Ajustes futuros de integracao precisam de verificacao
  propria; esta arquitetura especifica somente a camada de apresentacao.
