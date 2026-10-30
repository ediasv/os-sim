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

`useSimulation` ja expoe `view`, `load` e `tick`, com `CommandResult`
(DEC-23/DEC-24, #17/#65 concluidas). Preservar esse contrato e o tratamento
central de erros; nao duplicar banner, handlers ou classificacao por painel.
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
| 1     | Base visual e area de trabalho vazia.                                    | Componentes, teclado, comparacao com Figma e redimensionamento; gate da #35 resolvido, aguardando merge. Nao conclui #36.                   |
| 2     | Inspecao isolada de tarefas, jobs e CPUs.                                | Projecoes, selecao e estados em testes de componentes; parte somente de leitura da #37.                                                     |
| 3     | Preparar, validar, iniciar, avancar um tick e atualizar os paineis.      | Integracao real com o nucleo, usando #17/#65 existentes e politicas de #19/#20; reconciliar preparacao com DEC-23.                          |
| 4     | Arquivos e diagnosticos completos.                                       | Parser, validacao contextual, ponte Electron e confirmacao; #30 ja concluida, #31/#32/#33/#34 ainda necessarias conforme escopo.            |
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
- Nao executados: aplicativo Electron (inclusive a conferencia visual dos
  icones no pacote, pendente antes de fechar a #70), comparacao visual com o
  Figma, screenshots (pertencem ao incremento Composicao), pacote no
  ambiente-alvo.

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
