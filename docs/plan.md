# Plano e acompanhamento

Atualizado em 2026-10-23. Escopo, evidencias e trabalho atual para humanos e
agentes; o estado de cada item fica no [GitHub Project](https://github.com/users/ediasv/projects/2).
Leia a [especificacao](specification.md) e a [arquitetura](architecture.md).

## Convencoes

- Itens das entregas E1-E6 sao issues (`#N`) no Project, com campos `Status`
  e `Fase`. Issue fechada ou `Done` exige evidencia de verificacao registrada.
  O corpo da issue segue o [template](../.github/ISSUE_TEMPLATE/item-de-trabalho.md);
  este plano guarda estado e evidencias, nao repete a descricao.
- Base existente e E0 mantem `[x]` como historico: entregue com evidencia.
- Trabalho parcial continua desmarcado e aparece em "Trabalho atual".
- Registrar bloqueios explicitamente; nao marcar uma fase inteira por ter
  implementado apenas parte dela. Propostas de arquitetura nao sao codigo pronto.
- Atualizar durante a implementacao e ao encerrar a sessao. Git guarda historico;
  este arquivo guarda estado atual, sem diarios separados por agente.

## Base existente

- [x] Estrutura Electron/Vue/TypeScript e comandos de qualidade configurados.
- [x] Contador de ticks, snapshots simples e adaptador Vue.

Evidencia: inspecao de [package.json](../package.json),
[simulator.ts](../src/core/simulator.ts) e
[useSimulation.ts](../src/renderer/composables/useSimulation.ts).
Existencia verificada por leitura; testes nao executados nesta entrega documental.
Os testes do contador e do composable foram removidos em `caf476e`; cobertura
do nucleo volta com E1 e a do adaptador com #17.
Essa base nao equivale a atender os requisitos funcionais do Projeto A.

## Entregas planejadas

### E0: Contexto compartilhado

- [x] Especificacao com requisitos, criterios e questoes abertas.
- [x] Arquitetura com decisoes identificadas e estado explicito.
- [x] Plano unico e instrucoes de manutencao para agentes.
- [x] README aponta para documentos e PDFs.

Verificacao: checagem automatizada de links locais, IDs e estrutura documental.
Nao altera codigo de execucao do simulador.

### E1: Primeira entrega do nucleo

Requisitos: REQ-01, REQ-02, REQ-03, REQ-07, REQ-08.

- #9 Definir TCBs, jobs, CPUs, configuracao, eventos e snapshots.
  Concluida no PR #46 (DEC-12): `npm test` 78/78, lint e typecheck ok.
- #10 Definir contrato somente de leitura para politica injetada.
  Concluida no PR #48 (DEC-13).
- #11 Resolver Q-01/Q-03 aplicaveis ao modelo e convencao inicial dos snapshots.
  Concluida em 2026-10-16: DEC-09, DEC-10 e DEC-11; Q-07 aberta para E2.
- #12 Implementar ativacoes e elegibilidade sequencial por tarefa.
  Concluida no PR #49 (merged).
  DEC-13: a regra do job mais antigo incompleto (DEC-02) e conferida somente
  aqui; `buildPolicyView` nao a verifica. Implementacao no PR #49: validacao da
  configuracao, ativacoes em cada fronteira (incluindo snapshot 0), prazo
  individual e elegibilidade de um job incompleto por tarefa. Evidencia:
  `npm test` 105/105 no merge `5242779`, `npm run lint` e `npm run typecheck`
  aprovados. Lacunas da revisao seguem na #51.
- #13 Implementar despacho global e execucao por tick com politica de teste.
  Concluida no PR #50 (merged, `5e525c5`; DEC-07 aceita, DEC-14). O motor injeta uma politica,
  valida a decisao, despacha globalmente, executa cada tick, registra
  conclusoes/perdas de prazo e desliga CPUs sem trabalho. CPUs iniciam com
  `offSince: null`; o despacho inicial define `0` e registra `cpu-off` quando
  ociosa. O passo e transacional: erro de politica ou inconsistencia preserva
  estado e historico (DEC-14). A politica e obrigatoria quando ha tarefas
  configuradas; configuracao vazia usa a politica sem trabalho. Evidencia
  (2026-10-17): `npm test` 132/132, `npm run lint` e `npm run typecheck`
  aprovados; RM/EDF seguem para E2.
- #51 Ajustes pos-revisao do PR #49: contrato do Simulator, testes e plano.
  Concluida no PR #52 (merged, `7124aa3`). O construtor rejeita configuracao
  invalida com `ConfigValidationError`, que guarda `field`/`taskIndex` de cada
  problema; `getEligibleJobs()` segue publico e somente leitura (DEC-15).
  Testes novos: configuracao normalizada no snapshot 0, configuracao conferida
  antes da politica, instantes exatos das dez ativacoes, jobs anteriores
  intactos, aperiodica com ingresso tardio, campos e eventos de ativacao no
  snapshot 0 e casos de elegibilidade (sem jobs, todos concluidos, mais antigo
  `running`, job `ready` nao elegivel). Evidencia (2026-10-17): `npm test`
  139/139, `npm run lint` e `npm run typecheck` aprovados.
- #14 Implementar quantum e preservacao de contexto na retomada/migracao.
  Concluida no PR #58 (merged, `f8837df`). DEC-18 revista pelo usuario em 2026-10-17: job com fatia vencida mantem o
  primeiro desempate, sem mudar a visao (DEC-13); troca por vencimento registra
  `quantum-expired` e `preemption`; conclusao na fronteira do vencimento
  registra so a conclusao. Implementada em `Simulator.expireSlices`, entre
  conclusoes/perdas de prazo e ativacoes. Testes novos: exemplo de DEC-18,
  troca no vencimento com `preemption` e migracao com quantum inteiro em 2
  CPUs, retomada apos preempcao no meio da fatia, quantum 1 sem dividir o
  intervalo, perda de prazo e vencimento na mesma fronteira e rollback de
  politica que falha no vencimento (DEC-14). Evidencia (2026-10-17):
  `npm test` 145/145, `npm run lint` e `npm run typecheck` aprovados.
- #15 Implementar conclusao, perda de prazo e intervalos de CPUs desligadas.
  Concluida no PR #59 (merged, `9acdcda`; DEC-21, aceita pelo usuario): `summarizeCpuOff`
  (`src/core/cpuOff.ts`) deriva intervalos e totais dos eventos de qualquer
  snapshot; `findInconsistencies` passa a conferir `offSince` contra os
  eventos. Testes novos: CPU que nunca liga, que desliga e religa varias
  vezes, que segue desligada ate o fim, consulta de snapshots anteriores e
  sequencias malformadas; tarefas periodicas terminam so com o 10o job, tanto
  com folgas entre jobs quanto com todos os jobs atrasados. Correspondencia
  REQ-03/REQ-08 -> testes no PR #59. Revisao do PR (2026-10-20): erro dedicado
  `CpuEventSequenceError` (outros erros propagam), rejeicao de eventos fora de
  ordem temporal e intervalos fechados com duas CPUs. Evidencia (2026-10-20, apos merge de
  `main`): `npm test` 205/205, `npm run lint` e `npm run typecheck` aprovados.
- #16 Testar fronteiras, sobreposicao, quantum, preempcao e multiplas CPUs.
  Concluida no PR #62 (merged, `4b28fe8`; DEC-22, aceita pelo usuario). O motor passa a
  registrar todas as conclusoes antes de todas as perdas de prazo na mesma
  fronteira. O teste da DEC-22 foi escrito antes e falhou com a ordem antiga;
  essa execucao nao ficou registrada no repositorio. Testes novos: ordem por
  etapas com todos os fatos em fronteiras compartilhadas (2 CPUs), job
  posterior retido com CPU livre ate a conclusao do anterior e quantum maior
  que a duracao; testes existentes de preempcao ganham assercoes de prazo
  preservado. `expectMultiCpuInvariants`, chamado a cada passo dos testes
  multi-CPU e do quantum, confere no historico de execucoes que nenhum job
  ocupa duas CPUs e nenhuma CPU executa dois jobs no mesmo tick e, no estado
  atual, que CPUs ocupadas = min(`cpuCount`, elegiveis) e que so CPUs ociosas
  estao desligadas. No PR #62 a contagem usava a elegibilidade do proprio
  motor; a #63 a substitui por uma contagem independente. Correspondencia cenario ->
  teste no PR. Evidencia (2026-10-23, apos ajustes da revisao): `npm test`
  209/209, `npm run lint` e `npm run typecheck` aprovados; mutacao em que CPU
  ociosa desde o inicio nunca desliga falha 4 testes pela nova conferencia.
- #17 Restaurar testes do adaptador Vue e alinha-lo a API atual do Simulator.
- #63 Conferir CPUs ocupadas contra elegibilidade independente do motor.
  Aberta na revisao do PR #62; depende de #16. Em revisao no PR #64. `countEligibleJobs` (teste do
  Simulator) aplica DEC-02 ao snapshot sem `findEligibleJobs`: job `ready`
  ou `running` cujos jobs anteriores da tarefa estao todos concluidos.
  `expectMultiCpuInvariants` passa a conferir CPUs ocupadas =
  min(`cpuCount`, essa contagem); a regra de DEC-02 fica no motor e no teste
  (aceito pelo usuario na revisao do PR #62). Mutacoes temporarias em
  `findEligibleJobs`, revertidas: M1 omite job preemptado em `ready`
  (`executed > 0`); M2 oferece todo job `ready`/`running` mesmo com anterior
  incompleto. Antes da mudanca, nenhuma falha vinha da conferencia (M1 e M2
  falhavam so em assercoes fixadas a mao). Depois, a conferencia falha com
  M1 em "restarts the slice when a job preempted mid-slice resumes on the
  same CPU" (quantum) e "processes every kind of fact at shared boundaries
  in stage order" (2 CPUs), e com M2 em "holds a later activation without
  running it, even with a free CPU" (2 CPUs ocupadas, esperado 1). Evidencia
  (2026-10-23): `npm test` 209/209, `npm run lint` e `npm run typecheck`
  aprovados.

### E2: Politicas obrigatorias

Requisito: REQ-07.

- #18 Resolver Q-04/Q-07 antes de definir selecao multiprocessador; DEC-07 aceita
  em 2026-10-17. Decisoes aceitas pelo usuario em 2026-10-17: DEC-16
  (desempates com prazo e ativacao do job e duracao da tarefa), DEC-17
  (aperiodica com menor prioridade RM) e DEC-18 (quantum vencido perde o
  primeiro desempate; revista na #14: o job vencido mantem o desempate). Concluida no PR #54 (merged, `90ddfb5`): Q-04 e Q-07
  resolvidas na especificacao. Evidencia (2026-10-17, sobre `02d9875`): links
  locais e IDs cruzados conferidos; `npm test` 139/139, `npm run lint` e
  `npm run typecheck` aprovados.
- #19 Implementar RM e EDF separados do motor (prioridades conforme DEC-17).
- #20 Implementar desempates completos, sorteio com estado e evento correspondente
  (DEC-16, DEC-18).
- #21 Testar exemplos das figuras 2.5/2.6 e casos de empate/multiplas CPUs,
  incluindo o exemplo de quantum vencido de DEC-18.
- #22 Decidir se o simulador exibe testes de escalonabilidade e com que ressalva.

### E3: Controle, historico e edicao

Requisitos: REQ-04, REQ-05.

- #23 Armazenar/restaurar snapshots completos, cursor e estado dos sorteios.
- #24 Implementar avancar/retroceder reutilizando futuro ainda valido.
- #25 Resolver Q-02: matriz de alteracoes validas e seus efeitos.
  Pendencia herdada da #9 (DEC-12): o modelo tem `suspended`, mas nao tem
  eventos de suspensao/retomada; definir esses eventos junto com a matriz.
- #26 Aplicar edicoes atomicas e invalidar futuro somente apos validacao.
  Registrar os eventos de suspensao/retomada definidos na #25 a cada edicao.
- #27 Implementar execucao completa cancelavel e tratar Q-06.
- #28 Testar restauracao, ramificacao, rejeicao de edicoes e falta de progresso.

### E4: Configuracao e arquivos

Requisitos: REQ-05, REQ-06; #29 tambem cobre REQ-10.

- #29 Definir diagnosticos do parser restantes de Q-03 (valores em DEC-10;
  REQ-06, REQ-10). Concluida no PR #57 (merged, `7156519`).
- DEC-19 aceita em 2026-10-17 e revista pelo usuario em 2026-10-18: diagnosticos
  usam linhas do arquivo original, acumulam erros recuperaveis, preservam
  literalmente as mensagens do nucleo e distinguem falhas de acesso; cancelar
  a escolha do arquivo nao e erro. Evidencia deste PR: decisao e exemplos em
  [architecture.md](architecture.md#dec-19-diagnosticos-do-parser-de-configuracao);
  Q-03 atualizada na [specification.md](specification.md#questoes-abertas-antes-das-entregas-afetadas).
  Links e IDs conferidos; documentacao apenas, testes e gates nao aplicaveis.
- #30 Implementar parser do arquivo com espacos, caixa e ";" final opcionais.
  Concluida no PR #60 (merged, `b28e487`): parser puro de sintaxe, diagnosticos com linhas
  originais e testes de variantes, erros recuperaveis e 500 tarefas. Evidencia
  (2026-10-18): `npm test` (154 testes), `npm run lint` e `npm run typecheck`
  aprovados. Revisao do PR
  (2026-10-19): `;` final opcional em toda linha e lista de eventos opcional
  (DEC-20), numeros so decimais, mensagens revistas, arquivo vazio com
  cabecalho e tarefa ausentes, e mapa tarefa/linha no resultado para a #31.
  Evidencia local (2026-10-19): `npm test` (186 testes), `npm run lint` e
  `npm run typecheck` aprovados; o CI executa somente `npm test`.
- #31 Validar IDs, cores, tempos e parametros com diagnosticos precisos.
- #32 Preservar eventos sem executa-los; tratar periodo ausente como aperiodica.
  O fim da lista de eventos ficou definido na DEC-20 (PR #60); periodo ausente
  continua nesta issue.
- #33 Carregar arquivo escolhido pelo usuario via processo principal e preload.
- #34 Testar arquivos validos/invalidos e falhas de leitura, sem caminho fixo.

### E5: Interface e Gantt

Requisitos: REQ-04, REQ-05, REQ-09, REQ-10.

- #35 Resolver Q-05 e avaliar DEC-08 antes da implementacao visual.
- #36 Implementar controles de configuracao, execucao e navegacao no historico.
- #37 Exibir TCBs, jobs e CPUs e permitir edicao com erros claros.
- #38 Desenhar o Gantt com tarefas ordenadas, CPUs, eventos e legenda.
  Depende dos eventos de suspensao/retomada da E3 (#25/#26): sem eles os
  trechos suspensos nao podem ser reconstruidos (pendencia de DEC-12).
- #39 Exportar imagem integral dos dados, sem screenshot nem corte temporal.
- #40 Verificar visualmente estados, controles, legibilidade e exportacao extensa.

### E6: Entrega e demonstracao

Requisito: REQ-10; integracao de todos os anteriores.

- #41 Revisar cada criterio de aceitacao e seus testes/evidencias.
- #42 Revisar comentarios de componentes/funcoes e justificativas das decisoes.
- #43 Executar testes, lint e typecheck; registrar falhas preexistentes separadamente.
- #44 Gerar e testar pacote sem instalar runtime extra no ambiente-alvo.
- #45 Preparar cenarios de demonstracao, incluindo sobrecarga e prazo perdido.

## Trabalho atual

- Estado: E0, #9 (PR #46), #10 (PR #48), #11, #12 (PR #49), #13 (PR #50),
  #51 (PR #52), #18 (PR #54), #55 (PR #56), #29 (PR #57), #14 (PR #58), #30
  (PR #60), #15 (PR #59) e #16 (PR #62) concluidos; evidencias registradas acima. Associacao
  de erros semanticos do parser permanece na #31, que pode usar `lines` do
  resultado.
- #63 em revisao no PR #64 (iniciada em 2026-10-23); mutacoes e gates
  registrados em E1. Fecha no merge do PR.
- #55 (descricoes das issues), concluida no PR #56 (merged, `26020cc`):
  corpos das issues abertas de #14 a #45
  reescritos no template, revisados pelo usuario fase a fase; titulos vagos
  ajustados (#17, #22, #30, #33, #36, #37, #38); template e convencoes no
  repositorio. Verificacao (2026-10-17): corpos publicados iguais aos rascunhos
  aprovados; IDs (#N, REQ, DEC, Q), ancoras e links locais conferidos; titulos
  deste plano iguais aos do GitHub. Sem mudanca de codigo, testes nao
  executados. O template esta em `main` desde o merge.
- Proximo passo: revisar e integrar o PR #64 (#63); depois #17 ou E2. Manter os diagnosticos de
  DEC-19 nos escopos de #31 e #34.
- Pendencias: Q-02, Q-05 e Q-06 conforme fase; DEC-08 ainda proposta.
- Bloqueios: nenhum.

## Como registrar uma entrega

Ao iniciar um item, mover sua issue para `In Progress`. Ao concluir, fechar a
issue (ou usar `Closes #N` no PR) e atualizar trabalho atual; registrar aqui
arquivos/PR relevantes, verificacao executada e resultado, limitacoes e proximo
passo. Nao marcar teste como aprovado por existir arquivo de teste.

Para iniciar trabalho, substituir "Trabalho atual" por objetivo, escopo, passos
pendentes e bloqueios concretos. Ao pausar, deixar o proximo passo executavel e
dizer o que foi realmente verificado.
