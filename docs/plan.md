# Plano e acompanhamento

Atualizado em 2026-11-01. Escopo, evidencias e trabalho atual para humanos e
agentes; o estado de cada item fica no [GitHub Project](https://github.com/users/ediasv/projects/2).
Leia a [especificacao](specification.md) e a [arquitetura](architecture.md).

## Convencoes

- Itens das entregas E1-E6 sao issues (`#N`) no Project, com campos `Status`
  e `Fase`. Issue fechada ou `Done` exige evidencia de verificacao registrada.
  O corpo da issue segue o [template](../.github/ISSUE_TEMPLATE/item-de-trabalho.md);
  este plano guarda estado e evidencias, nao repete a descricao.
- Issues `[Docs]` nao pertencem a uma fase e ficam sem `Fase` no Project
  (decidido pelo usuario na #88); aparecem em "Itens de documentacao".
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
do nucleo voltou com E1 e a do adaptador com #17.
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
  Reaberta em 2026-11-01 pela #25 para registrar DEC-38 (uma ativacao por
  vez) e fechada de novo no mesmo dia: DEC-38 foi retirada do PR #101, e
  DEC-09 e DEC-02 continuam valendo (justificativa em DEC-02).
- #12 Implementar ativacoes e elegibilidade sequencial por tarefa.
  Concluida no PR #49 (merged).
  DEC-13: a regra do job mais antigo incompleto (DEC-02) e conferida somente
  aqui; `buildPolicyView` nao a verifica. Implementacao no PR #49: validacao da
  configuracao, ativacoes em cada fronteira (incluindo snapshot 0), prazo
  individual e elegibilidade de um job incompleto por tarefa. Evidencia:
  `npm test` 105/105 no merge `5242779`, `npm run lint` e `npm run typecheck`
  aprovados. Lacunas da revisao seguem na #51. Reaberta e fechada de novo em
  2026-11-01: DEC-38 foi retirada, e o codigo e os testes atuais continuam
  corretos.
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
- #65 Definir arquitetura de erros e comandos do adaptador Vue.
  Concluida no PR #66 (DEC-23 revista e DEC-24, aceitas pelo usuario em
  2026-10-23). Comandos `load`/`tick` devolvem `CommandResult`; erro de
  configuracao vai so ao resultado, erro inesperado tambem ao banner; `load`
  reconstroi em t=0 e so substitui a simulacao atual em sucesso. Testes novos:
  `commandFailure` (configuracao fora do banner, banner anterior preservado,
  inesperado no banner, string e objeto lancados) e comandos do adaptador. Os
  testes falharam antes da implementacao; os dois acrescentados na revisao
  (objeto lancado, mensagem da politica ausente) falharam com mutacoes
  temporarias de `commandFailure` e `load`. Evidencia (2026-10-23): `npm test`
  222/222, `npm run lint` e `npm run typecheck` aprovados.
- #17 Restaurar testes do adaptador Vue e alinha-lo a API atual do Simulator.
  Concluida no PR #66, junto com #65. Testes do adaptador cobrem
  snapshot 0, snapshot novo por tick com anteriores congelados e intactos,
  somente `view`/`load`/`tick` expostos e erro de `tick()` no banner com o
  ultimo snapshot valido preservado e continuacao (DEC-14). Nao executado:
  iniciar o app e clicar no botao de tick.
- #63 Conferir CPUs ocupadas contra elegibilidade independente do motor.
  Aberta na revisao do PR #62; depende de #16. Concluida no PR #64 (merged, `8459443`, 2026-10-23).
  `eligibleJobKeys` (teste do Simulator) rederiva DEC-02 dos estados dos
  jobs no snapshot, sem `findEligibleJobs`: job `ready` ou `running` cujos
  jobs anteriores da tarefa estao todos concluidos. `expectMultiCpuInvariants`
  passa a conferir que todo job em execucao pertence a esse conjunto e que
  CPUs ocupadas = min(`cpuCount`, tamanho do conjunto); a regra de DEC-02 fica
  no motor e no teste (aceito pelo usuario na revisao do PR #62). Comparar so
  contagens nao bastava: com CPUs saturadas ou troca de job da mesma tarefa
  os numeros coincidem. Mutacoes temporarias em `findEligibleJobs`,
  revertidas, sem registro de execucao no repositorio: M1 omite job
  preemptado em `ready` (`executed > 0`); M2 oferece todo job
  `ready`/`running` mesmo com anterior incompleto; M3 escolhe o job
  incompleto mais recente (`findLastIndex`). Antes da mudanca, nenhuma falha
  vinha da conferencia (M1 e M2 falhavam so em assercoes fixadas a mao).
  Depois, a contagem falha com M1 em "restarts the slice when a job preempted
  mid-slice resumes on the same CPU" (quantum) e "processes every kind of
  fact at shared boundaries in stage order" (2 CPUs); a pertinencia falha com
  M2 e M3 em "holds a later activation without running it, even with a free
  CPU" (CPU executa job 1:1). So com contagem, M3 passava pela conferencia.
  Evidencia (2026-10-23): `npm test` 209/209, `npm run lint` e
  `npm run typecheck` aprovados.

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
  Concluida no PR #74 (merged, `cf139aa`; DEC-25, aceita pelo usuario em 2026-10-24).
  `src/core/policies.ts`: `rmPolicy`, `edfPolicy` e o registro
  `DEFAULT_POLICIES`; `src/core/createSimulator.ts` resolve `config.algorithm`
  no registro; o adaptador cria simulacoes pela fabrica (`load(config)`). Motor
  inalterado. Testes novos: prioridade com 1 e varias CPUs e candidatas em
  qualquer ordem, aperiodicas abaixo de periodicas (DEC-17), empate que nao
  cruza o corte, mesma configuracao com escalas diferentes em RM e EDF,
  preempcao por chegada com o motor em RM e EDF, registro sem o algoritmo e
  configuracao invalida antes do registro. Limite: sem desempates (#20), empate
  no corte de CPUs cai na ordem do arquivo; RM/EDF nao vao ao usuario antes da
  #20. Limite resolvido pela #20 (DEC-27). Evidencia (2026-10-24): `npm test` 240/240, `npm run lint` e
  `npm run typecheck` aprovados.
- #20 Implementar desempates completos, sorteio com estado e evento correspondente
  (DEC-16, DEC-18). Concluida no PR #75 (merged, `f22281d`, 2026-10-27;
  DEC-27, decidida pelo usuario em 2026-10-24): RM e EDF aplicam DEC-16/DEC-18 e relatam o empate residual em
  `tie`; o motor sorteia com semente fixa, guarda `drawState` no snapshot e
  registra um `tie-break` por vencedor. Arquivos: `draw.ts`, `policy.ts`,
  `policies.ts`, `simulator.ts`, `domain.ts`, `snapshot.ts` e testes.
  Evidencia (2026-10-24): um teste por criterio em RM e EDF (criterio 2 nao
  separa empate no EDF, conforme DEC-16); empate que cabe nas CPUs sem
  sorteio nem evento; mesma configuracao repete sorteios e `drawState`;
  vencedor que ja executava registrado; `tie` invalido nao altera estado nem
  historico; candidatas do `tie-break` em ordem de ID da tarefa; `tie` nulo
  rejeitado. `npm test` 278/278, `npm run lint` e `npm run typecheck`
  aprovados. Revisao do PR: `drawWinners` recusa `slots` fora de
  `1 <= slots < empatados`; `checkDecision` conta so empatados sorteaveis;
  grupo ordenado uma vez; DEC renumerada de 26 para 27 apos a #22 ocupar a
  DEC-26. Achado restante (ordem de validacao na fabrica) segue na #79.
  Evidencia (2026-10-24, apos merge de `da52d14`): `npm test` 285/285,
  `npm run lint` e `npm run typecheck` aprovados; IDs DEC-26/DEC-27
  conferidos. Evidencia (2026-10-27, apos merge de `eecf575`; conflito so no
  plano): `npm test` 298/298 em 16 arquivos, `npm run lint` e
  `npm run typecheck` aprovados (Node 24.21.0 local, fora do 24.22.1 fixado).
- #79 Decidir fonte unica da ordem de validacao entre configuracao e registro
  de politicas (achado 7 da revisao do PR #75). Decidida pelo usuario em
  2026-10-27 (DEC-28): `requireValidConfig` em `config.ts` e o unico ponto que
  lanca `ConfigValidationError`; o construtor do `Simulator` e o caminho de
  algoritmo sem politica de `createSimulator` o chamam. Arquivos: `config.ts`,
  `simulator.ts`, `createSimulator.ts`, `config.test.ts` e arquitetura.
  Evidencia (2026-10-27): testes novos de `requireValidConfig` falharam antes
  da implementacao; o teste existente de configuracao invalida antes do
  registro passa sem mudanca; `npm test` 300/300 em 16 arquivos, `npm run lint`
  e `npm run typecheck` aprovados (Node 24.21.0 local, fora do 24.22.1
  fixado); DEC-28 unica e links locais conferidos. Nao executado: app
  Electron (sem mudanca no renderer). Concluida no PR #86 (merged,
  `a92fd58`, 2026-10-27).
- #21 Testar exemplos das figuras 2.5/2.6 e casos de empate/multiplas CPUs,
  incluindo o exemplo de quantum vencido de DEC-18. Concluida no PR #85
  (merged, `ef2427a`, 2026-10-27):
  `src/core/scenarios.test.ts` roda `createSimulator` com RM/EDF reais, com
  `findInconsistencies` vazio no snapshot 0 e apos cada passo. Figuras com
  quantum igual a maior duracao, sem vencimento na janela, e janelas
  [0, 360] na 2.5 e [0, 55] na 2.6, com os eventos da borda (decidido na
  #21). Esperados derivados a mao das figuras e decisoes. Conferidos por
  mutacao: cada esperado alterado e cada criterio de DEC-16 (2) e (4) e da
  DEC-17 removido da politica falham; trocar duracao por trabalho restante no
  (4) nao e detectavel de ponta a ponta (ativacoes iguais) e e coberto em
  `policies.test.ts` ("criterion 4: shorter task duration even with more work
  left", RM e EDF), que falha com a troca. Segunda revisao do PR (2026-10-27),
  tambem conferida por mutacao temporaria do motor ou da politica: aperiodica
  com prazo 8 falha se empatar em prioridade com a periodica; listas exatas de
  `quantum-expired` falham se o vencimento na fronteira de uma preempcao for
  omitido; o sorteio falha se os vencedores forem ordenados por ID; a
  preempcao simultanea falha se as CPUs livres forem preenchidas na ordem
  inversa. A ordem de `selected` passou a ser contratual (DEC-13 revista).
  Nenhuma mudanca no motor ou nas politicas. Evidencia (2026-10-27, Node
  24.22.1, apos `npm ci`): `npm test` 336/336 em 17 arquivos (32 de cenario),
  `npm run lint` e `npm run typecheck` aprovados. Nao executados: app
  Electron; CI ate o push. Casos:
    - figura 2.5 (RM) e 2.6 (EDF sem perda; RM perde o prazo de B em t=50 e o
      conclui em 55, como na figura), com escala e lista de eventos completas;
    - as mesmas escalas com quantum 1 e 7 mudam so eventos `quantum-expired`,
      com a lista exata derivada das fatias (DEC-03, DEC-18), inclusive nas
      fronteiras de preempcao e sem vencimento junto da conclusao; instantes
      escritos a mao na 2.6 EDF com quantum 7; ordem da DEC-22 em t=100 da
      2.5 com quantum 1 (vencimento, ativacao, preempcao);
    - exemplo da DEC-18 com RM (J [0, 4), K [4, 6)), com lista de eventos
      completa;
    - em RM e EDF: empate que cabe nas CPUs, sorteio no corte com um
      `tie-break` por vencedor, lista de eventos completa e vencedores nas
      CPUs livres na ordem sorteada (DEC-27), com guarda que falha se a
      semente sortear em ordem de ID; desempate por ativacao e por menor duracao da tarefa (o
      vencedor e a tarefa de maior ID, para que desempate por ID falhe); em
      RM, desempate por prazo absoluto (DEC-16);
    - RM com tarefa aperiodica abaixo da periodica, com prazo menor que o da
      periodica para que um empate de prioridade falhe (DEC-17);
    - duas CPUs: distribuicao, preempcao na CPU 2 e, no caso espelhado, na
      CPU 1, duas preempcoes no mesmo instante, CPUs desligadas e religadas.
- #22 Decidir se o simulador exibe testes de escalonabilidade e com que ressalva.
  Concluida no PR #77 (merged, `da52d14`).
  Decidida pelo usuario em 2026-10-24 (DEC-26): nada e exibido; citacoes
  trazem a ressalva de varias CPUs e de simulacao finita. Registrada em
  REQ-07 e no escopo da [spec do frontend](../src/renderer/docs/specification.md).
  Evidencia (2026-10-24): links locais e IDs cruzados conferidos; mudanca so
  documental, testes nao executados.

### E3: Controle, historico e edicao

Requisitos: REQ-04, REQ-05.

- #23 Armazenar/restaurar snapshots completos, cursor e estado dos sorteios.
  Concluida no PR #109 (merged, `51dd7bf`, 2026-11-01; issue fechada).
  Evidencia (2026-11-01, branch `feat/23-historico-snapshots`, antes do
  merge, com a main integrada): `restoreState` em `src/core/snapshot.ts`,
  `SnapshotHistory` em `src/core/history.ts`, `restore` e cursor em
  `src/core/simulator.ts`, testes em `src/core/snapshot.test.ts`,
  `src/core/history.test.ts` e `src/core/simulator.history.test.ts`;
  `npm test` 632/632 em 40 arquivos (base: main com 612 em 38),
  `npm run lint` e `npm run typecheck` sem erros. Prova de restauracao em
  dois cenarios (empates residuais; fatia e progresso parciais), conferida
  com mutacoes em `restore`: limpar eventos, semear `drawState`, nao
  restaurar, zerar `sliceElapsed` e zerar `executed` derrubam a prova.
  Memoria: copia integral por passo mantida (DEC-30), sem copia extra por
  passo, com medicao no Node 24.22.1 registrada em DEC-35. Contrato em
  DEC-35; PR #106 (mesma issue) avaliado e descartado em DEC-35.
- #24 Implementar avancar/retroceder reutilizando futuro ainda valido.
  Concluida no PR #112 (merged, `ba14179`, 2026-11-01; issue fechada).
  Evidencia (branch `feat/24-navegacao-historico`, antes do merge): `Simulator.forward()`/`backward()`, `canForward()` e
  `SimulationRefusal` (`src/core/refusal.ts`); `useSimulation` com `forward`,
  `backward` e `next`, publicando o snapshot do cursor; categoria `refused` em
  `commandFailure`. Contrato em DEC-36. Testes em
  `src/core/simulator.navigation.test.ts`, `useSimulation.test.ts` e
  `errors.test.ts`. `npm test` 669/669 em 42 arquivos (base: main com 653 em
  41), `npm run lint` e `npm run typecheck` sem erros. Botoes ficam na #36 e
  recusar `tick()` com tudo terminado na #27.
- #25 Resolver Q-02: matriz de alteracoes validas e seus efeitos.
  Pendencia herdada da #9 (DEC-12): o modelo tem `suspended`, mas nao tem
  eventos de suspensao/retomada; definir esses eventos junto com a matriz.
  Concluida no PR #101 (squash merge `110e4ec`, 2026-11-01; issue fechada).
  DEC-37 aceita pelo usuario (edicao durante a simulacao: recalculo do tick
  a partir de `t-1` com a lista de edicoes do tick, estado por tarefa
  aplicado ao job mais antigo incompleto, caracteristicas, inclusao e
  exclusao, parametros do sistema e eventos de suspensao, retomada,
  forcamento e CPUs). DEC-38 (uma ativacao por vez) retirada antes do
  aceite; DEC-02 ganhou a justificativa completa e DEC-09 continua valendo.
  A matriz foi numerada DEC-32 e DEC-35 durante o PR; DEC-37 desde o merge
  com a `main` (#23 e #24 ocuparam DEC-35 e DEC-36). #11 e #12 reabertas e
  fechadas de novo; #26, #37 e #38 atualizadas. Verificacao: mudanca so
  documental; links locais e IDs DEC conferidos por script (DEC-01 a
  DEC-38, sem lacunas nem duplicatas), `oxfmt --check` ok e CI `test`
  aprovado no PR. Testes, lint e typecheck locais nao aplicaveis.
- #26 Aplicar edicoes atomicas e invalidar futuro somente apos validacao.
  Implementa DEC-37: etapa de edicao no passo, recalculo do tick a partir de
  `t-1` com a lista de edicoes do tick, estado por tarefa e os eventos de
  suspensao, retomada, forcamento e CPUs (issue atualizada em 2026-11-01).
- #27 Implementar execucao completa e detectar falta de progresso.
  DEC-49 aceita em 2026-11-01: guardar todo o historico, interromper por
  falta de progresso conforme Q-06 e nao oferecer cancelamento; implementacao
  nao iniciada.
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
  Concluida no PR #84 (merged, `37ab733`, 2026-10-28). `loadConfig` (`src/core/loadConfig.ts`) envia
  ao `validateConfig` somente arquivo sem erro de sintaxe e associa `taskIndex`
  a linha, campo e texto recebido pelo mapa do parser (`analyzeConfig`), no
  formato de DEC-19. Ajustes da revisao (2026-10-28, DEC-19 revista): com erro
  de sintaxe, so erros de sintaxe sao reportados, para que os ordinais do
  nucleo ("1a tarefa") correspondam ao arquivo e conflitos com a linha
  quebrada nao fiquem ocultos; o estouro do prazo da ultima ativacao vem do
  nucleo com `combined` e sai sem valor recebido. Mantido o formato de DEC-19
  (`(valor v)` no nucleo, `valor "v"` na sintaxe). Revisao independente
  (2026-10-28): o parser entrega a cor como foi escrita e o nucleo a normaliza,
  para que a mensagem do nucleo mostre o valor recebido (DEC-19 revista; a cor
  sem caixa da #30 vale para `loadConfig`); `analyzeConfig` devolve o rascunho
  so sem erro de sintaxe, sem configuracao parcial; testes de cor minuscula,
  arquivo so com cabecalho e mensagem completa em varias linhas. Itens
  independentes viraram #92, #93 e #94.
  Evidencia (2026-10-28, Node 24.22.1): `npm test` 368/368, `npm run lint` e
  `npm run typecheck` aprovados; os testes de comportamento novo falharam
  antes da mudanca (o da cor como escrita, revertendo a linha); os do loader
  para arquivo sem tarefa, mensagem completa e cor repetida cobrem
  comportamento existente e passaram de primeira.
  Nao executado: interface (#36).
- #32 Preservar eventos sem executa-los; tratar periodo ausente como aperiodica.
  O fim da lista de eventos ficou definido na DEC-20 (PR #60); periodo ausente
  continua nesta issue e, por DEC-29, a tarefa resultante recebe o periodo
  padrao com aviso na carga pela #89. Concluida no PR #96 (merged,
  `00ee0f1`, 2026-10-29): `parseTask` entrega periodo
  vazio ou so com espacos como zero; linha com menos de seis campos continua
  erro (DEC-31, definicao aceita pelo usuario). Testes novos: periodo
  vazio, em branco e antes de eventos no parser; carga igual ao zero
  explicito, lista de 5000 eventos preservada e simulacao de 30 ticks igual
  com e sem eventos. Evidencia (2026-10-29, Node 24.22.1): `npm test`
  380/380, `npm run lint` e `npm run typecheck` aprovados. Os testes do
  parser e o de carga com periodo vazio falharam antes da mudanca; os de
  lista longa e de simulacao igual cobrem comportamento da DEC-20 e passaram
  de primeira (o de lista longa falha se os espacos internos forem
  removidos). Revisao independente sem achados criticos. Nao executado:
  interface (#36); periodo padrao com aviso (#89).
- #87 Reconciliar A.4.4 (ignorar aperiodicas com aviso) com REQ-03, DEC-09 e
  DEC-17. Decisoes do usuario em 2026-10-28 (DEC-29, Q-08 resolvida):
  periodo padrao 15; periodo zero ou ausente no arquivo recebe o padrao com
  aviso; telas rejeitam periodo zero; nucleo mantem periodo zero. Divergencia
  da letra de A.4.4 ("ignoradas") registrada na DEC-29. REQ-03, REQ-06,
  REQ-07, DEC-09, DEC-10, DEC-17 e PEND-02 atualizadas; corpos da #32 e da
  #89 alinhados. Confirmacao do professor nao obtida. Verificacao
  (2026-10-28): links locais e ancoras dos documentos alterados conferidos (0
  quebrados), IDs DEC-29, Q-08, #87 e #89 cruzados; `npm run lint` aprovado;
  `npm test` e `npm run typecheck` nao aplicaveis (sem mudanca de codigo).
  Texto de A.3.3/A.4.4 conferido pela citacao da issue, nao pelo PDF.
  Concluida no PR #90 (merged, `5b67474`, 2026-10-28).
- #89 Aplicar periodo padrao com aviso a tarefas sem periodo positivo
  (DEC-29). A parte de interface da DEC-29 (padrao 15 em tarefa nova, recusa
  de periodo zero, exibicao dos avisos) foi acrescentada aos corpos da #36 e
  da #37 em 2026-10-28. Concluida no PR #98 (merged, `d43962b`,
  2026-10-30): `loadConfig` aplica `DEFAULT_TASK_PERIOD` (15)
  antes do `validateConfig` e devolve `warnings` (`ConfigLoadWarning`) no
  sucesso. Desde a #92, tambem preserva os avisos quando a validacao semantica
  falha. Evidencia: bloco `default period (DEC-29)` em
  `src/core/loadConfig.test.ts` (ausente e zero com aviso por linha, sem
  avisos com periodo positivo, simulacao igual a periodo 15 com dez
  ativacoes, erro de outro campo mantido, prazo derivado validado com periodo
  15, `-0`/`+0`/`0.0`); linha "aperiodica" do teste de prazo combinado
  passou a esperar a formula periodica. `npm test` 388/388, `npm run lint` e
  `npm run typecheck` aprovados (2026-10-29). Revisao do PR (2026-10-30):
  texto da formula aperiodica (`ingresso + prazo`) voltou a ter assercao em
  `src/core/config.test.ts`, e os testes da carga usam o literal 15 em vez
  de `DEFAULT_TASK_PERIOD`; mutacoes temporarias confirmaram que os testes
  falham; `npm test` 388/388, lint e typecheck aprovados. Falha de carga sem
  aviso da conversao ficou na #92. Nao verificado: exibicao na interface
  (#36).
- #33 Carregar arquivo escolhido pelo usuario via processo principal e preload.
  Concluida no PR #99 (merged, `616629d`, 2026-11-01; issue fechada em
  2026-11-01). Codificacao decidida pelo
  usuario: UTF-8 com ou sem BOM; conteudo que nao e UTF-8 valido e rejeitado
  como falha de leitura (DEC-32). API em DEC-33 (aceita pelo usuario em 2026-10-31):
  `src/shared/configFile.ts` (canal e tipos), `src/main/configFile.ts`
  (leitura, sem lancar), `src/preload/configFileApi.ts` (unica funcao, sem
  argumentos) e o canal IPC em `src/main/main.ts`; lint impede `shared/` de
  importar Node, Electron, Vue ou outras camadas. Evidencia (2026-10-31):
  testes novos em `src/main/configFile.test.ts` (sucesso com espaco e acento,
  BOM, arquivo vazio, inexistente, diretorio, `EACCES`/`EPERM`, Latin-1,
  UTF-16, erro do sistema, erro sem mensagem, cancelamento, dialogo sem
  caminho, arquivo removido apos a escolha) e
  `src/preload/configFileApi.test.ts` (canal sem argumentos, argumento do renderer
  ignorado, so `openConfigFile` exposta); com `fatal: false` os dois testes
  de UTF-8 falham. `npm test` 442/442, `npm run lint` e `npm run typecheck`
  aprovados; `npm run package` gera o app, e nele a pagina ve
  `window.configFile` so com `openConfigFile` e `require`/`process`
  indefinidos (consulta por CDP). Verificacao manual no aplicativo
  (`npm start`, macOS, 2026-10-31) executada pelo usuario, que relatou todos
  os casos como esperados, sem copiar a saida: `pasta ç/config ação.txt` e
  `outra pasta/sem extensao` carregados, cancelamento como `canceled`,
  arquivo Latin-1 como `not-utf8` e arquivo sem permissao como
  `permission-denied`. Nao verificado: disco externo e outras plataformas.
  Revisao do PR #99 (2026-10-31, commits `7d731c9` e `0e0ac78`; mudancas
  em DEC-32 e DEC-33 aceitas pelo usuario): byte NUL rejeitado como
  `not-utf8` (UTF-16 sem BOM), limite de 1 MiB com motivo `too-large`,
  codigos de erro herdados de `Object.prototype` tratados como `unknown`,
  motivo do sistema sem o caminho repetido, canal atendido so para a pagina
  do app (`src/main/trustedSender.ts`), pedido com dialogo aberto
  compartilha o resultado e lint impede `core/` de importar `shared/`.
  Evidencia: testes novos em `src/main/configFile.test.ts` e
  `src/main/trustedSender.test.ts`; `npm test` 472/472, `npm run lint` e
  `npm run typecheck` aprovados; regra de lint conferida com arquivo
  temporario em `src/core/`. Verificacao manual (`npm start`, macOS,
  2026-10-31) executada pelo usuario pelo console do DevTools, que relatou
  "tudo funciona", sem copiar a saida. Roteiro: arquivo valido carregado
  (remetente aceito); opcionais: UTF-16 sem BOM como `not-utf8`, arquivo de
  1,05 MiB como `too-large`, cancelamento como `canceled` e duas chamadas
  simultaneas com um so dialogo. App empacotado (`npm run package`, macOS arm64, 2026-11-01) conferido
  pelo usuario pelo console do DevTools, que relatou tudo funcionando, sem
  copiar a saida: arquivo valido carregado (remetente `file:` do `index.html`
  aceito), cancelamento como `canceled`, `require` e `process` indefinidos.
  Nao verificado: disco externo, outras plataformas e pacote no
  ambiente-alvo.
- #34 Testar arquivos validos/invalidos e falhas de leitura, sem caminho fixo.
  Concluida no PR #107 (merged, `9c97048`, 2026-11-01; issue fechada em
  2026-11-01). Evidencia (2026-10-31): `src/core/loadConfig.test.ts`
  ganhou a regra de inteiros em cada campo numerico (fracionario e alem da faixa
  exata nos 7 campos, zero CPUs), campos obrigatorios vazios e 300 tarefas;
  `src/main/configLoad.test.ts` (novo, 46 testes) le arquivos reais de
  diretorio temporario e passa por `readConfigFile` e `loadConfig` (e
  `openConfigFile` nos testes de dialogo e cancelamento): validos
  (CRLF, CR, BOM, espacos, linhas em branco, `;` final), invalidos (sintaxe e
  nucleo, linha original apos linhas em branco e CR), falhas de leitura
  (inexistente, diretorio, sem permissao real, nao UTF-8, UTF-16 sem BOM,
  acima do limite, vazio como erro de conteudo, cancelamento) e qualquer nome e
  local (A.3.3.4). Busca estatica `grep -rnE "defaultPath|filters|readFileSync|\.(txt|cfg|conf)['\"]" src --exclude='*.test.ts'`
  so acha texto em `src/renderer/docs/architecture.md:503`, nenhum codigo com
  caminho fixo. Teste de permissao negada rodou em darwin sem root (nao foi
  pulado). Mutacoes temporarias (minimo de CPUs em 0; sem a checagem de NUL no
  decodificador) fizeram os testes falharem. `npm test` 587/587 em 36 arquivos
  (base: 517 em 35), `npm run lint` e `npm run typecheck` aprovados. Defeito do
  plano: os bytes `52 4D 00 FF` ja caem na decodificacao UTF-8 estrita, entao
  foi incluido o caso UTF-16 sem BOM, o unico que falha sem a checagem de NUL.
  As mensagens seguem o formato do nucleo da epoca; a #93 depois tirou o
  valor do prefixo dos problemas do nucleo.
  Verificacao manual no aplicativo nao executada pelo agente: o carregamento
  completo depende da interface (#36); `window.configFile.openConfigFile()` pelo
  DevTools e um arquivo em outro volume (A.3.3.4) ficam com o usuario. Nao
  verificado: pacote no ambiente-alvo (#44).
- #92 Distinguir valor ausente e origem nos diagnosticos de carga. Concluida
  no PR #102 (merged, `3a6b948`, 2026-10-31; issue fechada em 2026-10-31):
  `ConfigParseIssue` expoe `valueKind` (`received`, `missing`, `combined`) e
  `origin` (`syntax`, `core`, `default-period`), sem alterar `value` nem as
  mensagens de DEC-19; `loadConfig` preserva `ConfigLoadWarning[]` em falhas
  semanticas apos aplicar o periodo 15. Testes cobrem sintaxe com valor
  ausente, problema `combined` do nucleo e conversao que causa falha no prazo
  da ultima ativacao. Evidencia (PR #102): `npm test` 432/432, `npm run lint`,
  `npm run typecheck`, `git diff --check` e links/IDs locais conferidos.
  Pendente: DEC-34 continua proposta na arquitetura, embora o codigo esteja
  em `main`; falta o aceite do usuario ou a revisao da decisao. Nao executado:
  interface (#36) e ponte main/preload (#33).
- #93 Decidir se o valor recebido aparece duas vezes nos diagnosticos do
  nucleo. Decisao do usuario (2026-11-01): mostrar o valor uma vez; o
  `loadConfig` acrescenta so linha e campo aos problemas do nucleo, cujas
  mensagens ja citam o valor, inclusive quando texto e numero convertido
  diferem (DEC-19 revista). O texto escrito continua em `value`; erros de
  sintaxe e o aviso de periodo padrao mantem `(valor ...)`. Concluida no PR #120
  (squash merge `220e35c`, 2026-11-01). Evidencia (2026-11-01): os testes
  de mensagem completa em `loadConfig.test.ts`, `configLoad.test.ts` e
  `demoConfigs.test.ts` falharam antes da mudanca (37); depois, `npm test`
  669/669, `npm run lint` e `npm run typecheck` aprovados.
- #94 Decidir se a checagem do algoritmo no parser e sintaxe ou regra do
  nucleo. Decisao do usuario (2026-10-28): o nucleo decide se o algoritmo e
  valido (DEC-19 e DEC-10 revistas). Concluida no PR #95 (merged,
  `4a1ca21`, 2026-10-28): `validateConfig` aceita `ConfigInput` (nome
  como texto), compara sem caixa e devolve RM/EDF; o parser entrega o nome
  como escrito; algoritmo invalido gera um diagnostico do nucleo com linha,
  campo e valor, e so aparece sem erro de sintaxe no arquivo.
  Evidencia (2026-10-28, Node 24.22.1): `npm test` 373/373, `npm run lint`
  e `npm run typecheck` aprovados; testes novos de caixa no nucleo, nome
  cru no parser e diagnosticos do loader falharam antes da mudanca; o de
  algoritmo ausente no nucleo passou de primeira (protege a nova chamada a
  `toUpperCase`). Revisao independente sem achados criticos ou importantes;
  pendencias menores registradas no PR #95.

### E5: Interface e Gantt

Requisitos: REQ-04, REQ-05, REQ-09, REQ-10.

- #35 Resolver Q-05 e avaliar DEC-08 antes da implementacao visual.
  Decisao registrada em 2026-10-24, aceita pelo usuario: DEC-08 aceita e Q-05
  resolvida (rotulo de job, vazio para nao ativada/terminada, termino de job e
  de tarefa, SVG). Concluida no PR #76 (merged, `5dd741f`, 2026-10-24);
  apenas documentacao, links e IDs conferidos, sem build.
- #36 Implementar controles de configuracao, execucao e navegacao no historico.
  Pendencia herdada da #72: `useSimulation` (adaptador de DEC-23) ficou sem
  uso em producao desde que `App` deixou de chama-lo; a #36 deve liga-lo ou
  revisar o contrato, ja que ele parte de `DEFAULT_CONFIG` em t=0 e a
  preparacao nao cria simulador. Parte 1 (carregar, iniciar, avancar, voltar,
  reiniciar, paineis #73/#69/#71 montados): ver
  [arquitetura do renderer](../src/renderer/docs/architecture.md#fluxo-da-area-de-trabalho-36-parte-1).
  Faltam Executar tudo (#27), Sistema, Adicionar tarefa e confirmacao de FE-04.
- #37 Exibir TCBs, jobs e CPUs e permitir edicao com erros claros.
  Oferece as edicoes de DEC-37 com recusas e avisos (FE-10 a FE-16, FE-19);
  issue atualizada em 2026-11-01.
- #38 Desenhar o Gantt com tarefas ordenadas, CPUs, eventos e legenda.
  Depende dos eventos de DEC-37 registrados pela #26: trechos suspensos e
  forcados e lacunas de CPU removida (pendencia de DEC-12); issue atualizada
  em 2026-11-01.
- #39 Exportar imagem integral dos dados, sem screenshot nem corte temporal.
  Em andamento, parte 1 (nao fecha a issue): gravacao pelo processo principal
  (`src/shared/imageFile.ts`, `src/main/imageFile.ts`, `src/preload/imageFileApi.ts`,
  canal `image-file:save`, mesmo padrao da #33; falha com caminho e motivo,
  cancelamento nao e erro) e SVG gerado so dos dados do ultimo snapshot do
  historico (`src/renderer/features/export/ganttSvg.ts`): linhas por tarefa em ID
  decrescente, trechos de execucao com CPU e job, prontas tracejadas, faixas de
  CPU desligada, marcadores por evento empilhados no mesmo instante, instante
  atual e legenda; sem teto de ticks. Acordado com o usuario em 2026-11-01:
  exportar em qualquer passo (resultado parcial identificado no titulo,
  FE-18; DEC-41, aceita). Layout do SVG conforme o frame "Exportacao SVG - layout da imagem" da
  pagina Telas do Figma (eixo no topo, raias por tarefa, divisor PROCESSADORES,
  raias de CPU, cartao de legenda; 73 px por tick; titulo com nome do arquivo
  e data da exportacao). Botao "Exportar SVG" ligado em `App` e `useWorkspace`. Pendente (depende da
  #26, PRs #115 a #119, rascunhos): trechos suspensos e forcados e lacuna de CPU
  removida; revisar o SVG quando a #38 desenhar o Gantt na tela, para
  compartilhar a apresentacao em vez de manter duas (hoje o Gantt na tela nao
  existe). Verificacao: `npm test` 850/850 (1 ignorado, apos sincronizar com a `main`), `npm run lint` e
  `npm run typecheck` aprovados; SVG gerado com `demoConfigs/05` lido como XML
  bem formado e aberto no painel de navegacao do app, sem conferencia visual
  detalhada (#40). Nao verificado: gravacao pelo dialogo real do Electron.
- #40 Verificar visualmente estados, controles, legibilidade e exportacao extensa.
- Planejamento do frontend (#35 a #40, PR #61):
  [spec de apresentacao](../src/renderer/docs/specification.md) e [arquitetura propria](../src/renderer/docs/architecture.md) concentram o
  planejamento da apresentacao e suas expectativas de integracao, sem alterar
  os contratos ou o andamento do nucleo. Implementacao ainda nao iniciada.
  #38 segue DEC-08 e #39 nao muda de escopo (#35).
- #67 Preparar a infraestrutura de testes do renderer (F1). Concluida no
  PR #78 (merged, `cb37e00`): Vue Test Utils e jsdom, ambiente Node mantido por padrao e teste
  do ErrorBanner; `npm test` 242/242 e typecheck aprovados; evidencia e comandos em
  [arquitetura do renderer](../src/renderer/docs/architecture.md#testes-de-componentes-67).
  Lint global reprovado por CRLF preexistente na epoca; causa tratada na #80.
- #68 Estabelecer as fundacoes visuais do renderer (F2). Concluida no
  PR #82 (merged, `700a178`, 2026-10-25), com o gate da #35 ja em `main`: tokens, estilos base e
  Inter empacotada (`@fontsource-variable/inter`, OFL-1.1). Valores lidos da
  pagina Fundacoes do Figma (tema escuro), com 4 desvios de contraste
  documentados; `npm test` 253/253, typecheck e lint aprovados, CI verde.
  Revisao do PR: links da doc e heranca de cor do botao Dismiss corrigidos.
  Nao executados: app Electron e comparacao visual lado a lado com o Figma
  (#40). O `ErrorBanner` ainda usa cores de tema claro, a adaptar na #70.
  Detalhes e evidencia em
  [arquitetura do renderer](../src/renderer/docs/architecture.md#fundacoes-visuais-68).
- #69 Preparar os dados de apresentacao para a inspecao. Concluida no PR #103
  (merged, `48cf6d5`, 2026-10-31), com correcoes da revisao no PR #104
  (merged, `53e3a4c`, 2026-10-31), que fechou a issue.
  `src/renderer/features/inspection/inspection.ts` projeta tick, tarefas,
  jobs, estados, elegibilidade, perda de prazo, tarefas aguardando/terminadas
  e CPU desligada usando `findEligibleJobs` e `summarizeCpuOff`, sem
  reimplementar regras do nucleo; jobs futuros sao referencias de
  apresentacao sem progresso ou estado atual. Evidencia em conjunto com a #71.
- #70 Implementar controles e mensagens reutilizaveis do renderer. Concluida
  no PR #97 (merged, `f1ced12`, 2026-10-30): `UiIcon` (SVGs do Figma
  por mascara), `UiButton`, `UiIconButton`, `UiAlert` e `ErrorBanner` sobre
  `UiAlert` (com `dismissible`), em portugues e so com tokens; decisoes em
  FE-DEC-13. `npm test` 414/414, lint e typecheck aprovados; icones `alert`
  e `close` conferidos no app (`npm start`, 2026-10-30); pacote e comparacao
  visual com o Figma nao executados.
  Detalhes em
  [arquitetura do renderer](../src/renderer/docs/architecture.md#elementos-basicos-70).
- #71 Apresentar tarefas e jobs com selecao independente do tempo. Concluida
  no PR #103 (merged, `48cf6d5`) e PR #104 (merged, `53e3a4c`, 2026-10-31,
  fechou a issue). `TaskList`, `TaskDetails`, `JobTable` e `InspectionPanel`
  em `src/renderer/features/inspection/` mantem selecao independente do tick,
  com teclado (Enter/Espaco), listas rolaveis e job futuro selecionavel sem
  restaurar o tempo. O PR #104 reutiliza os rotulos em portugues entre lista e
  detalhes, reconcilia a tarefa selecionada quando os dados mudam e limpa so o
  job que deixou de existir. Evidencia: PR #103 com `npm test` 429/429,
  typecheck, `oxlint` e `oxfmt --check` dos arquivos da implementacao, e
  verificacao visual com fixtures temporarias (1440x924 e 390x844); PR #104
  com testes focados 8/8, `npm test` 432/432, typecheck, `oxlint`, `oxfmt
  --check` do escopo alterado e `git diff --check`. `npm run lint` completo
  nao passou nos worktrees desses PRs por um panic do `oxfmt` em Markdown.
  Reproduzido em 2026-10-31 num checkout local: o panic vem so de
  `docs/references/como-funciona-escalonamento-em-tempo-real.md`, arquivo
  nao rastreado; nenhum arquivo rastreado o causa. Nao integrado ao `App.vue` (#72) nem ao historico/cursor
  real, que depende de #36/#24 (#23 concluida).
- #72 Compor a area de trabalho vazia em preparacao. Concluida no PR #100
  (merged, `2efe280`, 2026-11-01; issue fechada em 2026-11-01): `App` mostra a preparacao estatica (barra, painel de tarefas e
  Gantt com estado vazio, 13 acoes desabilitadas) sem criar simulador; cinco
  componentes novos, nove icones do Figma e `size` no `UiIcon`; decisoes em
  FE-DEC-14. `npm test` 460/460 em 29 arquivos, lint e typecheck aprovados;
  app conferido por CDP a 1440 x 924 e 1024 x 768. Achado de espacamento
  vertical da barra a 1024 px corrigido (`padding-block`), junto com a altura
  da pagina com o banner de erro. Revisao do PR: tamanho do `UiIcon` por
  propriedade customizada, altura maxima do banner, rotulos e icones das
  acoes centralizados (`ACTION_META`, `NO_ACTIONS`), helper de CSS movido
  para `testing/`; `npm test` 467/467 em 30 arquivos, lint e typecheck
  aprovados; icones e banner com erro longo conferidos no app pelo usuario.
  App empacotado (`npm run package`, macOS arm64, 2026-11-01) conferido pelo usuario, que relatou tudo
  funcionando, sem copiar a saida: icones (pasta 32 px, demais 16 px), banner
  com erro longo, redimensionamento real da janela e navegacao por Tab. Nao
  executados: comparacao lado a lado com o Figma (#40) e pacote no
  ambiente-alvo. Detalhes em
  [arquitetura do renderer](../src/renderer/docs/architecture.md#composicao-72).
- #73 Apresentar o estado do sistema e das CPUs sem alterar a simulacao.
  Concluida no PR da #73 (a preencher no merge): `projectSystem` e
  `SystemInspector` isolados, sem integracao ao `App` (a #36 compoe), conforme
  o card `96:422` do Figma; FE-DEC-15 a FE-DEC-17. `npm test` 611 aprovados
  (1 ignorado), lint e typecheck aprovados; conferido a 1440 x 924 e
  390 x 844 com dados tipados. Nao executados: app Electron e comparacao
  lado a lado com o Figma (#40). Detalhes em
  [arquitetura do renderer](../src/renderer/docs/architecture.md#estado-do-sistema-e-das-cpus-73).

### E6: Entrega e demonstracao

Requisito: REQ-10; integracao de todos os anteriores.

- #41 Revisar cada criterio de aceitacao e seus testes/evidencias.
- #42 Revisar comentarios de componentes/funcoes e justificativas das decisoes.
- #43 Executar testes, lint e typecheck; registrar falhas preexistentes separadamente.
- #44 Gerar e testar pacote sem instalar runtime extra no ambiente-alvo.
  Em andamento (Refs #44, issue aberta; nenhum codigo alterado). Alvos
  propostos em DEC-42 (aceite do usuario pendente): Windows x64 com o
  `Setup.exe` do Squirrel (zip vetado pelo portal) e macOS, testado por ediasv
  (abaixo). Verificacao no Windows (2026-11-01,
  Windows 10 Pro 10.0.19045, Node 24.22.1 (fixado; refeito apos a revisao
  do PR #122, a primeira rodada usou Node 25.8), pacote 1.0.5, `npm ci` e
  `npm run make`, Setup.exe de 146 MiB), sempre com o PATH sem `node.exe` nem
  `npm` e com uma copia de `demoConfigs/02-edf-figura-2-6.txt` em caminho curto,
  escolhida pelo dialogo nativo (carrega como EDF, quantum 25, 1 CPU; ao avancar
  ate t=53, o painel mostra o job 3 da tarefa 1 executando desde 45, sem perda
  de prazo, como o README dos cenarios): (1) app desempacotado
  (`out/os-sim-win32-x64/os-sim.exe`): abre e passa no roteiro. (2) `Setup.exe`
  em modo silencioso instala em `%LOCALAPPDATA%/os_sim/app-1.0.5` e cria atalho,
  mas **na primeira tentativa o app instalado nao abriu**: saia de imediato com
  "Sandboxed processes cannot read ... its ACL has an entry for an AppContainer
  package SID but none for ALL APPLICATION PACKAGES" (Electron 44,
  `install_dir_access.cc`). A entrada vem herdada de `%LOCALAPPDATA%` e parece
  propria desta maquina (nao confirmado em outra). Depois de
  `icacls <pasta> /grant *S-1-15-2-1:(OI)(CI)(RX)`, a correcao sugerida pelo
  proprio Electron, o app instalado abriu e repetiu o roteiro ate t=53. Ambas as
  instalacoes foram desfeitas com `Update.exe --uninstall`. Refeito com
  Node 24.22.1 (`npm ci`, `npm run make`, `Setup.exe` novo): sem o `icacls` o
  app instalado fecha de novo; com ele abre e chega a t=53 igual. `npm test`
  690 aprovados (1 ignorado), `npm run lint` e `npm run typecheck` aprovados no
  Node 24.22.1.
  Nao verificado: maquina limpa sem Node (a instalacao em maquina sem essa ACL
  nao foi testada); Linux (so fica fora da entrega se a
  DEC-42 for aceita; ate la, escopo pendente); Executar tudo (#27) e Exportar SVG (#39),
  desabilitados no app. Um carregamento anterior por engano abriu outro
  arquivo (nao de `demoConfigs/`) e nao conta. Um processo do app
  desapareceu sem causa identificada em duas ocasioes (uma no avanco rapido de
  56 ticks a 60 ms); nao repetiu com 150 ms entre cliques.
  macOS (2026-11-01): ediasv rodou `npm run make` e relatou ao usuario que
  funcionou, sem copiar a saida; versao do macOS e do Node, artefato gerado e
  se o app foi aberto com um cenario nao foram registrados. Formato da entrega
  no macOS (so ha o zip, vetado pelo portal) segue em aberto.
- #45 Preparar cenarios de demonstracao, incluindo sobrecarga e prazo perdido.
  Parcial (Refs #45, issue aberta): 10 arquivos em
  [`demoConfigs/`](../demoConfigs/README.md) (figuras 2.5/2.6 em RM e EDF,
  varias CPUs com CPU desligada e religada, preempcao/quantum/sorteio,
  aperiodica com periodo padrao e avisos, sobrecarga com perda de prazo,
  simulacao longa, dois arquivos com erros), cada um com descricao e
  resultado esperado no README e lido do disco por
  `src/main/demoConfigs.test.ts` (carga + simulacao; resultados derivados a
  mao; mutacao conferida no 07). Fora do pacote do aplicativo. Pendentes:
  conferencia de cada cenario na interface e roteiro de edicao e retrocesso
  (dependem de E3 e E5, #23 a #28 e #36 a #40).
- #80 Padronizar a versao do Node entre desenvolvimento, CI e release.
  Concluida no PR #81 (merged, `5a569db`), escopo ampliado para
  incluir o `npm run lint` global reprovado no Windows por CRLF: Node unico
  24.22.1 em `devEngines.runtime` no `package.json`, lido pelos workflows CI e
  release (`node-version-file`), e `.gitattributes` com `* text=auto eol=lf`.
  Verificado no Windows (`core.autocrlf=true`), com `npm ci` limpo do lockfile
  em Node 24.22.1, no worktree e em clone novo: `npm test` 242/242 em 14
  arquivos, `npm run lint` e `npm run typecheck` aprovados, `git diff --check`
  limpo, lockfile inalterado. Causa confirmada: antes, `oxfmt --check` acusava
  59 arquivos, todos CRLF; clone LF passava. Normalizacao dos arquivos
  rastreados: 0 (indice ja em LF). Limitacoes: workflows e Linux real nao
  executados (sem push; clone LF equivale ao checkout Linux), release nao
  exercitado. Checkouts Windows anteriores ao `.gitattributes` mantem CRLF
  ate um refresh unico dos arquivos (ou novo clone).

### Itens de documentacao

Issues `[Docs]`, sem fase no Project.

- #55 Padronizar descricoes das issues abertas. Concluida no PR #56
  (merged, `26020cc`): corpos das issues abertas de #14 a #45
  reescritos no template, revisados pelo usuario fase a fase; titulos vagos
  ajustados (#17, #22, #30, #33, #36, #37, #38); template e convencoes no
  repositorio. Verificacao (2026-10-17): corpos publicados iguais aos rascunhos
  aprovados; IDs (#N, REQ, DEC, Q), ancoras e links locais conferidos; titulos
  deste plano iguais aos do GitHub. Sem mudanca de codigo, testes nao
  executados. O template esta em `main` desde o merge.
- #88 Sincronizar plano e Project com o estado pos-E2. Concluida no PR #91
  (merged, `31a3212`, 2026-10-28): plano sincronizado com o GitHub (estados
  desatualizados de #20, #21, #35 e #63 corrigidos; itens concluidos movidos
  de "Trabalho atual" para suas entregas; #67 a #73 em E5, #80 em E6);
  `Fase` preenchida no Project para #51 (E1), #79 (E2), #67 a #73 (E5) e #80
  (E6, que tambem foi adicionada ao Project); issues `[Docs]` seguem sem
  fase. DEC-30 registra o limite pratico do comprimento da simulacao, com as
  medicoes da revisao e uma reproducao em Node 24.22.1. Verificacao
  (2026-10-28): links locais e ancoras dos documentos e do README (0
  quebrados); DEC-01 a DEC-30 unicas e sem referencia indefinida; estado de
  cada issue do plano (E1 a E6 e documentacao) conferido por script contra o
  GitHub, sem divergencia nem issue ausente; Project sem `Fase` apenas em #55
  e #88; `npm run lint` aprovado. `npm test` e `npm run typecheck` nao
  aplicaveis (sem mudanca de codigo).

## Trabalho atual

- #133 em andamento (iniciada 2026-11-01): ID de tarefa como texto livre.
  Objetivo: aceitar qualquer texto como ID, sem mudar configuracoes numericas.
  Feito no PR #134 (rascunho): DEC-48 (formato, unicidade sem caixa, ordem
  natural, inclusao com ID sugerido ou digitado, rotulos), criterios na
  [specification.md](specification.md#req-06-arquivo-texto), `TaskId` como
  texto no nucleo (parser, validacao, ordem natural, edicao) e no SVG (escape
  e rotulo longo). Verificacao: `npm test` 1143/1143 antes da inclusao (baseline 1067),
  `npm run lint` e `npm run typecheck` sem erros; trace e SVG de IDs
  numericos iguais aos de antes (testes de caracterizacao).
  Inclusao com ID sugerido ou digitado entregue depois do merge do PR #119
  (`usedTaskIds` no lugar de `maxTaskId`); `npm test` 1189/1189.
  Revisao do PR #134: corrigidos o limite da sugestao numerica e caracteres
  invalidos em XML no SVG; testes focados cobrem ambos. `npm test` 1192/1192,
  `npm run typecheck` e `npm run lint` aprovados.
  DEC-48 e escolhas da revisao aceitas pelo usuario em 2026-11-01.
  Falta: revisao final e ver a interface rodando.

- Estado (2026-11-01): E0, E1 e E2 concluidas, com evidencias nas entregas.
  E3: #23, #24 e #25 concluidas; #26 em andamento; #27 e #28 nao iniciadas. E4: #29, #30,
  #31, #32, #33, #34, #87, #89, #92, #93 e #94 concluidas. E5: #35, #67, #68, #69, #70, #71, #72 e #73
  concluidas; #36 parcial; #37 a #40 nao iniciados.
  E6: #80 concluida; demais abertas.
- #93 concluida no PR #120 (squash merge `220e35c`, 2026-11-01), evidencia
  em E4 e decisao em DEC-19.
- #92 concluida no PR #102 (merged, `3a6b948`, 2026-10-31), evidencia em E4.
- #69 e #71 concluidas nos PRs #103 e #104 (merged, `53e3a4c`, 2026-10-31),
  evidencia em E5.
- #33 concluida no PR #99 (merged, `616629d`, 2026-11-01), evidencia em E4.
- #34 concluida no PR #107 (merged, `9c97048`, 2026-11-01), evidencia em E4.
- #72 concluida no PR #100 (merged, `2efe280`, 2026-11-01), evidencia em E5.
- #45 parcial: arquivos e testes dos cenarios feitos; faltam conferencia na interface e roteiro de edicao/retrocesso (E3, E5), ver E6.
- #23 concluida no PR #109 (merged, `51dd7bf`, 2026-11-01), evidencia em
  E3 e contrato em DEC-35.
- #24 concluida no PR #112 (merged, `ba14179`, 2026-11-01), contrato em
  DEC-36; evidencia em E3.
- #25 concluida no PR #101 (squash merge `110e4ec`, 2026-11-01), evidencia
  em E3 e decisao em DEC-37.
- #26 em andamento (iniciada 2026-11-01):
  aplicar as edicoes de DEC-37 no nucleo (etapa de edicao no passo, recalculo
  do tick a partir de `t-1`, edicoes por tick no historico, estado por tarefa,
  eventos novos). Destrava #37 e o Gantt (#38). Entregue em uma serie de
  PRs pequenos (acordado com o usuario em 2026-11-01); o comando `edit` no
  adaptador fica na #37. Baseline `npm test` 669/669 em `b46d09b`; o
  caminho geral da edicao (algoritmo e quantum) foi entregue no PR #115
  (squash merge `45869c7`, 2026-11-01).
  Serie de PRs empilhados (cada um sobre o anterior; so o ultimo fecha a
  #26):
    1. #114 revisao de DEC-37, em que so o resultado final das edicoes de
       um tick conta (squash merge `6f5a3ae`, 2026-11-01; so documental,
       `oxfmt --check` ok e CI `test` aprovado);
    2. #115 (mergeado, `45869c7`, 2026-11-01) etapa de edicao no passo, edicoes por tick no historico, descarte do
       futuro, recusa atomica por item, algoritmo e quantum. Baseline
       `npm test` 669/669, lint e typecheck sem erros; escopo e criterios no
       corpo do PR; motivo da recusa de regra da configuracao vem de `validateConfig`
       (escolha do usuario). Codigo integrado na `main` pelo PR #115:
       `src/core/edit.ts` (itens algoritmo e quantum, dobra, mudanca
       liquida), `EditRefusal` em `refusal.ts`, `rewrite` e edicoes por
       passo em `history.ts`, `Simulator.edit`/`getEdits` com recalculo a
       partir de `t-1` e politica pelo algoritmo vigente, fatias vencidas
       depois das ativacoes (DEC-22). Forma registrada em DEC-39
       (proposta); DEC-14, DEC-22, DEC-25 e DEC-35 revistas. Evidencia
       (2026-11-01): `npm test` 711/711 em 44 arquivos, `npm run lint` e
       `npm run typecheck` sem erros; testes em `edit.test.ts`,
       `history.test.ts`, `simulator.edit.test.ts` e bloco `policy source`
       de `simulator.test.ts`. Testes que passaram de primeira (recusa
       atomica, mudanca liquida, descarte do futuro) conferidos com
       mutacoes: nao restaurar o estado na falha, sorteio de `t` em vez de
       `t-1`, `rewrite` que mantem passos seguintes e recalculo a partir de
       `t`; todas derrubam testes. Nao verificado: interface (comando
       `edit` fica na #37) e pacote. Depois de integrar a `main`
       (`220e35c`, com #113 e #120): `npm test` 733/733 em 47 arquivos,
       lint e typecheck sem erros. DEC-39 aceita pelo usuario em 2026-11-01 (registrado ao abrir o #117);
    3. #116 mergeado em `44d9595` (2026-11-01), somente preparacao
       documental. Implementacao de CPUs em PR de continuacao na branch
       `feat/26-3-cpus-implementation`: item `cpuCount`, eventos de existencia e
       mudanca liquida; `wasRunning` derivado de `executions` no primeiro
       desempate; `summarizeCpuOff` preserva IDs historicos e exclui ausencia;
       consistencia por ID. Forma em DEC-40 (aceita pelo usuario em 2026-11-01, registrado ao abrir o #117).
       Nao foi necessario mudar `Simulator` nem `SnapshotHistory`.
       Evidencia local: `npm test` 794/794 em 48 arquivos, `npm run lint` e
       `npm run typecheck` aprovados. Testes novos/estendidos em
       `policy.test.ts`, `policies.test.ts`, `cpuOff.test.ts`,
       `consistency.test.ts`, `edit.test.ts`, `simulator.cpuEdits.test.ts`
       e projecoes de sistema/inspecao. RED -> GREEN conferido por tarefa;
       regressao das projecoes conferida com a consulta antiga e revertida.
       Revisao do PR #124 em 2026-11-01 (pr-review-toolkit): nenhum problema
       critico; achados importantes corrigidos no proprio PR. Interface
       interativa e pacote nao verificados; PR #124 integrado em `aaaa5f0`.
       Limite de CPUs contra forcadas entregue no #117 (DEC-43);
    4. #117 (rascunho), implementacao local: estado por tarefa, eventos,
       limite de forcadas, interrupcao de jobs e recusas em portugues.
       DEC-43 proposta; DEC-39/40 aceitas pelo usuario. Testes de matriz,
       pendentes, quantum, prazos, mudanca liquida, historico e consistencia.
       Baseline 794/794; verificacao local 875/875 testes, `npm run lint` e
       `npm run typecheck` sem erros (2026-11-01). Revisao com
       pr-review-toolkit (5 agentes) aplicada: inspecao de tarefa concluida,
       lacunas de testes conferidas por mutacao, invariantes de consistencia,
       identificador de tarefa inteiro, forcar tarefa terminada recusado e
       comentarios. Interface e pacote nao verificados; commit `WIP` ja
       enviado ao PR;
    5. #118 (rascunho, implementacao local concluida; PR ainda nao marcado
       pronto) caracteristicas da tarefa. Itens `taskColor`, `taskDuration`,
       `taskDeadline`, `taskArrival` e `taskPeriod`, `EditTarget.definitions`,
       `Job.duration`, `TaskControlBlock.nextActivation` e `src/core/activation.ts`
       (`activateDueJobs`, `activateTask`, `rescheduleNextActivation`);
       ativacao causada por edicao registrada depois dos eventos de estado da
       tarefa e antes dos de CPU (decisao do usuario). Forma em DEC-44
       (proposta, aguarda aceite) e DEC-45 (envios do mesmo tick e
       conclusao, decisoes do usuario na revisao). Baseline 932/932; evidencia
       local (2026-11-01): `npm test` 1067/1067 em 54 arquivos, `npm run lint`,
       `npm run typecheck` e `npx oxfmt --check` sem erros. Testes em
       `edit.test.ts`, `activation.test.ts`, `simulator.taskEdits.test.ts` e
       `consistency.test.ts`. Mutacoes temporarias: remover o
       `max(..., clock)` de `rescheduleNextActivation` derruba 5 testes; fazer
       a ativacao gravar duracao fixa derruba 100; fazer a conclusao usar
       `definition.duration` em vez de `job.duration` passou de primeira (0 falhas
       em 1053), lacuna fechada pelo commit `d9b6426`: agora 2 testes
       derrubam essa mutacao. DEC-45: remover a recusa de conclusao com
       caracteristica derruba 3 testes; remover a guarda de job criado por
       envio anterior derruba 4. `npm test` 54 arquivos / 1067 testes. Lacuna
       conhecida (O3) de `projectJob` tratada na #131 (ver abaixo). Editar
       periodo 0 (aperiodica) fica fora do Projeto A (DEC-29). Nao verificado: interface e pacote. Acompanhamento em issues
       novas (#131; refactors do `edit.ts`); Project e corpo do PR
       #118 a atualizar com o aceite do usuario;
    6. #119 (rascunho) inclusao e exclusao de tarefas e verificacao final da #26.
       #118 mergeado na `main` (`1559d97`). Implementacao local sobre ela,
       dividida em duas etapas: este PR traz a inclusao (DEC-46, proposta:
       item `addTask`, `maxTaskId` no estado, cor padrao deterministica,
       ativacao na etapa de edicao); a exclusao (`removeTask`, DEC-47) vem
       depois do merge deste, num PR que fecha a #26 com a conferencia final
       dos criterios contra os PRs 2 a 6. Testes em
       `simulator.addTask.test.ts`, `defaultColor.test.ts` e
       `consistency.test.ts`; mutacoes temporarias (ativacao, `maxTaskId`,
       lista de inclusoes na validacao, TCB provisorio) derrubam testes.
       Interface e pacote nao verificados.
    7. Ajustes de revisao da inclusao (branch `chore/26-ajustes-inclusao`,
       sobre `4e43467`, `Refs #26`, sem fechar a issue): comentarios de
       `createTcb` e de `defaultTaskColor` corrigidos; limite de 894 cores
       registrado na DEC-46 (algoritmo mantido); `applyNetChange` sem
       `isNew`, com comportamento identico (testes existentes sem alteracao);
       dois testes novos em `simulator.addTask.test.ts` (cor repetida na mesma
       edicao; entradas invalidas recusadas como `EditRefusal`). Mutacao
       temporaria em `liveDefinitions` (sem as incluidas da mesma edicao)
       derruba o teste de cor repetida; revertida. Verificacao (2026-11-01):
       `npm test` 1098 passam e 1 ignorado em 56 arquivos antes de integrar a
       `main` (baseline 1096 mais os 2 testes novos); depois de integrar
       `1be7da1` (#135): 1099 passam e 1 ignorado em 56 arquivos;
       `npm run lint` e `npm run typecheck` sem erros.
       Interface e pacote nao verificados.
- #131 em andamento (iniciada 2026-11-01, PR #135 em rascunho): o inspetor
  do sistema mostra a duracao de cada job a partir de `Job.duration`
  (DEC-44); detalhes da tarefa seguem com a duracao vigente. Teste em
  `system.test.ts` com edicao real de duracao: falhou antes (7 em vez de 4)
  e passa depois. Evidencia local (2026-11-01): `npm test` 1068/1068 em 54
  arquivos, `npm run lint` e `npm run typecheck` sem erros. Nao verificado:
  interface interativa e pacote. Proximo passo: revisao do usuario e PR
  pronto.
- Em andamento: #44 (pacote Windows verificado, macOS com ediasv; ver E6).
- #39 parte 1 (gravacao e SVG, sem suspenso/forcado) em andamento, `Refs #39`; ver E5.
- #36 parte 1 entregue no PR #113 (mergeado, `9594d2d`): App com
  simulador, navegacao e paineis; a issue continua aberta para o restante.
- #117 em implementacao local: estado por tarefa, suspensao, forcamento,
  encerramento, recusas em portugues e testes; DEC-39 e DEC-40 aceitas
  pelo usuario. Baseline: 794/794 testes. #124 ja integrado na branch.
- Proximo passo: o usuario revisa o #118 e decide sobre DEC-44 e DEC-45; depois seguir para #119 (inclusao; a exclusao
  fecha a #26 num PR seguinte). DEC-34 segue pendente de aceite.
- Pendencias: Q-06 resolvida por DEC-49, implementacao na #27 (Q-02 resolvida por DEC-37); Q-08
  resolvida por DEC-29 (sem confirmacao do professor sobre A.4.4). Q-05 resolvida e DEC-08 aceita na
  #35.
- Bloqueios: a integracao de selecao futura com historico/cursor real depende
  de #36 (#23 e #24 concluidas); a apresentacao isolada com dados tipados foi
  verificada.

## Como registrar uma entrega

Ao iniciar um item, mover sua issue para `In Progress`. Ao concluir, fechar a
issue (ou usar `Closes #N` no PR) e atualizar trabalho atual; registrar aqui
arquivos/PR relevantes, verificacao executada e resultado, limitacoes e proximo
passo. Nao marcar teste como aprovado por existir arquivo de teste.

Para iniciar trabalho, substituir "Trabalho atual" por objetivo, escopo, passos
pendentes e bloqueios concretos. Ao pausar, deixar o proximo passo executavel e
dizer o que foi realmente verificado.
