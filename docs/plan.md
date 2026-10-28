# Plano e acompanhamento

Atualizado em 2026-10-28. Escopo, evidencias e trabalho atual para humanos e
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
  padrao com aviso na carga pela #89.
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
  da #37 em 2026-10-28.
- #33 Carregar arquivo escolhido pelo usuario via processo principal e preload.
- #34 Testar arquivos validos/invalidos e falhas de leitura, sem caminho fixo.
- #92 Distinguir valor ausente e origem nos diagnosticos de carga. Aberta;
  depende do merge do PR #84; resolver antes de a #36 consumir o diagnostico.
- #93 Decidir se o valor recebido aparece duas vezes nos diagnosticos do
  nucleo. Aberta (decisao sobre DEC-19); depende do merge do PR #84.
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
- #37 Exibir TCBs, jobs e CPUs e permitir edicao com erros claros.
- #38 Desenhar o Gantt com tarefas ordenadas, CPUs, eventos e legenda.
  Depende dos eventos de suspensao/retomada da E3 (#25/#26): sem eles os
  trechos suspensos nao podem ser reconstruidos (pendencia de DEC-12).
- #39 Exportar imagem integral dos dados, sem screenshot nem corte temporal.
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
- #69 Preparar os dados de apresentacao para a inspecao.
- #70 Implementar controles e mensagens reutilizaveis do renderer.
- #71 Apresentar tarefas e jobs com selecao independente do tempo.
- #72 Compor a area de trabalho vazia em preparacao.
- #73 Apresentar o estado do sistema e das CPUs sem alterar a simulacao.

### E6: Entrega e demonstracao

Requisito: REQ-10; integracao de todos os anteriores.

- #41 Revisar cada criterio de aceitacao e seus testes/evidencias.
- #42 Revisar comentarios de componentes/funcoes e justificativas das decisoes.
- #43 Executar testes, lint e typecheck; registrar falhas preexistentes separadamente.
- #44 Gerar e testar pacote sem instalar runtime extra no ambiente-alvo.
- #45 Preparar cenarios de demonstracao, incluindo sobrecarga e prazo perdido.
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

- Estado (2026-10-28): E0, E1 e E2 concluidas, com evidencias nas entregas.
  E3 nao iniciada. E4: #29, #30, #31, #87 e #94 concluidas;
  #32, #33, #34, #89, #92 e #93 abertas. E5: #35, #67 e #68 concluidas;
  implementacao visual (#36 a #40, #69 a #73) nao iniciada. E6: #80 concluida; demais abertas.
- Nenhum trabalho em andamento; #94 concluida no PR #95 (evidencia em E4).
- Proximo passo: #70
  (controles e mensagens do renderer) e #89 (periodo padrao com aviso na
  carga, DEC-29). Manter os diagnosticos de DEC-19 no escopo da #34.
- Pendencias: Q-02 e Q-06 conforme fase; Q-08 resolvida por DEC-29 (sem
  confirmacao do professor sobre A.4.4). Q-05 resolvida e DEC-08 aceita na
  #35.
- Bloqueios: nenhum.

## Como registrar uma entrega

Ao iniciar um item, mover sua issue para `In Progress`. Ao concluir, fechar a
issue (ou usar `Closes #N` no PR) e atualizar trabalho atual; registrar aqui
arquivos/PR relevantes, verificacao executada e resultado, limitacoes e proximo
passo. Nao marcar teste como aprovado por existir arquivo de teste.

Para iniciar trabalho, substituir "Trabalho atual" por objetivo, escopo, passos
pendentes e bloqueios concretos. Ao pausar, deixar o proximo passo executavel e
dizer o que foi realmente verificado.
