# Arquitetura e decisoes

Leia a [especificacao](specification.md) para requisitos e o [plano](plan.md)
para andamento. Este documento descreve responsabilidades e escolhas, nao
afirma que os modulos planejados ja existem.

## Base existente

- [Dominio](../src/core/domain.ts): tipos de configuracao, TCB, job, CPU,
  intervalos, eventos e snapshot (DEC-12).
- [Configuracao](../src/core/config.ts): `validateConfig` com as regras de DEC-10
  e `ConfigValidationError`, que carrega os problemas encontrados (DEC-15);
  `requireValidConfig` e o unico ponto que lanca esse erro (DEC-28).
- [Parser](../src/core/parser.ts): converte a estrutura do arquivo em configuracao
  e diagnostica erros sintaticos com as linhas originais (DEC-19, DEC-20);
  entrega algoritmo e cor como escritos, para o nucleo valida-los, e periodo
  vazio como zero (DEC-31).
  `analyzeConfig` devolve os erros de sintaxe ou, sem eles, a configuracao com
  linhas e textos recebidos; `parseConfig` descarta os textos.
- [Carregamento](../src/core/loadConfig.ts): `loadConfig` envia ao
  `validateConfig` somente arquivo sem erros de sintaxe e acrescenta linha e
  campo aos problemas do nucleo, cujas mensagens ja citam o valor (DEC-19); nao repete regras
  semanticas. Antes do `validateConfig`, aplica o periodo padrao a tarefa com
  periodo zero e devolve `warnings` no sucesso ou junto dos problemas do nucleo
  (DEC-29, DEC-34).

- [Snapshot](../src/core/snapshot.ts): estado inicial e copia profunda congelada.
- [Consistencia](../src/core/consistency.ts): `findInconsistencies` confere os
  fatos registrados em dobro no dominio (DEC-12, DEC-21).
- [CPUs desligadas](../src/core/cpuOff.ts): `summarizeCpuOff` deriva de um
  snapshot os intervalos e o total desligado de cada CPU, inclusive
  removida, sem contar ausencia como desligamento (DEC-21, DEC-40).
- [Elegibilidade](../src/core/eligibility.ts): seleciona o job incompleto mais
  antigo de cada tarefa, sem liberar jobs posteriores quando ele esta suspenso
  (DEC-02).
- [Politica](../src/core/policy.ts): contrato da politica injetada, visao
  congelada e conferencia da decisao (DEC-13).
- [Politicas](../src/core/policies.ts): RM e EDF (DEC-17) com os desempates
  de DEC-16/DEC-18, relatando o empate residual (DEC-27), e o registro
  `DEFAULT_POLICIES`, que associa cada algoritmo a sua politica (DEC-25).
- [Sorteio](../src/core/draw.ts): gerador pseudoaleatorio com semente fixa e
  sorteio dos vencedores do empate residual (DEC-06, DEC-27).
- [Fabrica do simulador](../src/core/createSimulator.ts): `createSimulator`
  confere que o registro tem `config.algorithm` e constroi o `Simulator` com o
  registro inteiro (DEC-25, DEC-39).
- [Historico](../src/core/history.ts): `SnapshotHistory` guarda os snapshots
  congelados (passo k no indice k), a lista de edicoes de cada passo e o
  cursor; so acrescenta com o cursor no ultimo passo, e `rewrite` troca um
  passo editado e descarta os seguintes com suas edicoes (DEC-35, DEC-39).
- [Edicao](../src/core/edit.ts): tipos de item (algoritmo, quantum,
  quantidade de CPUs e estado da tarefa), dobra em ordem sobre o alvo pedido, validacao por
  item e aplicacao da mudanca liquida do tick (DEC-37, DEC-39, DEC-40).
- [Simulator](../src/core/simulator.ts): valida configuracao, registra ativacoes
  nos limites de tick, executa jobs, registra conclusoes/perdas de prazo
  (ordem dos eventos em DEC-22) e faz despacho global pela politica do
  algoritmo vigente (DEC-39),
  sorteando o empate residual relatado (DEC-27), antes de publicar snapshots
  completos (DEC-07, DEC-14); rejeita configuracao invalida com
  `ConfigValidationError` e expoe os jobs elegiveis somente para leitura
  (DEC-15); mantem cursor sobre o historico e restaura passos registrados
  (`restore`, `getCursor`, `getCurrentSnapshot`, DEC-35); navega por eles sem
  recalcular (`forward`, `backward`, `canForward`) e recusa pedido impossivel com
  `SimulationRefusal` (DEC-36); edita o tick do cursor recalculando-o a
  partir de `t-1` (`edit`, `getEdits`) e recusa edicao invalida com
  `EditRefusal`, um motivo por item (DEC-37, DEC-39).
- [useSimulation](../src/renderer/composables/useSimulation.ts): mantem instancia
  privada, publica o snapshot do cursor via `shallowRef` e oferece os comandos
  `load`, `tick`, `forward`, `backward` e `next`, que devolvem resultado
  (DEC-23, DEC-36).
- [Erros da interface](../src/renderer/errors.ts): banner global e
  `commandFailure`, que classifica erros dos comandos (DEC-24).
- [Processo principal](../src/main/main.ts): janela Electron e canal IPC que
  abre o dialogo nativo da configuracao, sem filtro de extensao (DEC-33).
- [Leitura do arquivo](../src/main/configFile.ts): le o arquivo escolhido,
  decodifica UTF-8 estrito e converte cancelamento e falhas de leitura em
  resultado, sem lancar (DEC-19, DEC-32, DEC-33).
- [Preload](../src/preload/preload.ts) e
  [API de arquivo](../src/preload/configFileApi.ts): expoem somente
  `window.configFile.openConfigFile()`, sem argumentos (DEC-33).
- [Contrato compartilhado](../src/shared/configFile.ts): canal e tipos do
  resultado da carga, usados por main, preload e interface (DEC-33).

## Modulos planejados

Os nomes abaixo indicam responsabilidades; criar arquivos somente conforme a
entrega precisar, sem gerar toda a estrutura antecipadamente.

| Modulo        | Responsabilidade                                        | Dependencias permitidas               |
| ------------- | ------------------------------------------------------- | ------------------------------------- |
| Dominio       | TCBs, jobs, CPUs, configuracao, estados e eventos       | TypeScript puro                       |
| Motor         | Ativacoes, ticks, execucao, quantum e prazos            | Dominio, contrato de politica         |
| Politicas     | Prioridade RM/EDF e selecao com desempates              | Visao somente de leitura do dominio   |
| Despacho      | Elegibilidade, preempcao e atribuicao de CPUs           | Dominio, resultado da politica        |
| Historico     | Snapshots, cursor, restauracao e ramificacao por edicao | Estado completo do motor              |
| Configuracao  | Parser texto e validacao semantica                      | Dominio                               |
| Adaptador Vue | Comandos e publicacao de snapshots                      | Vue e core                            |
| Visualizacao  | Gantt, inspecao, edicao e imagem exportavel             | Snapshots e eventos                   |
| Arquivos      | Dialogos, leitura e gravacao autorizadas                | Electron main, preload e tipos shared |

Regras existentes permanecem: `core/` nao importa Vue, Electron, Node ou outras
camadas; renderer nao importa Node/main/preload; main/preload nao importam
renderer. Criar `src/shared/` somente quando a API de arquivos precisar de tipos
comuns. O estado vivo pertence ao motor, nunca aos componentes Vue.

## Registro de decisoes

Estados: **aceita**, **proposta**, **substituida**, **retirada**. Alteracoes
significativas recebem novo ID e indicam qual decisao substituem; nao apagar a
justificativa anterior. Proposta retirada antes do aceite mantem um registro
curto com o motivo, e seu ID nao e reutilizado. Data inicial dos registros:
2026-10-12.

### DEC-01: Motor independente da politica

- Estado: aceita. Requisitos: REQ-01, REQ-07.
- Contexto: RM/EDF nao devem controlar a estrutura do simulador.
- Decisao: politica recebe candidatas/contexto somente de leitura e devolve
  selecao; motor controla mutacoes, tempo e validacao do despacho.
- Consequencia: testar o motor com politica simples injetada antes de RM/EDF.
- Alternativa descartada: condicionar o ciclo principal ao nome do algoritmo.

### DEC-02: Jobs separados com elegibilidade sequencial

- Estado: aceita. Requisitos: REQ-03, REQ-08.
- Contexto: novas ativacoes podem chegar antes de anteriores terminarem.
- Decisao: TCB concentra definicao e jobs; cada ativacao mantem progresso e prazo
  proprios. Apenas o job mais antigo incompleto da tarefa pode executar.
- Justificativa: acompanhar a hipotese da secao 2.5.3; fila e prioridade sozinhas
  nao impedem execucao simultanea da mesma tarefa em CPUs diferentes.
  Complementada em 2026-11-01 com o
  [material de tempo real](references/como-funciona-escalonamento-em-tempo-real.pdf):
    - Ativacoes no calendario: a tarefa periodica tem "uma so ativacao por
      intervalo regular chamado de Periodo" (secao 2.2), e o prazo absoluto
      da k-esima ativacao e `(k-1) * P + D`, sem depender da conclusao da
      anterior. A.3.3 diz o mesmo: ativacao "a cada n ticks" e prazo contado
      "a partir do momento que a tarefa for ativada".
    - Chegada e liberacao sao instantes distintos (secao 2.2): a liberacao,
      entrada na fila de prontos, "pode ou nao coincidir" com a chegada. O job
      posterior chega no calendario, com prazo correndo, e so e liberado
      quando o anterior conclui.
    - Execucao serializada (secao 2.5.3): "a execucao de qualquer liberacao
      de uma tarefa sera atrasada ate que liberacoes anteriores da mesma
      tarefa sejam executadas completamente". O texto chama a espera de
      interferencia interna, e o exemplo da secao mostra uma ativacao
      "empurrada para fora de seu periodo interferindo com a ativacao
      seguinte".
    - Independente da quantidade de CPUs: o material e monoprocessador, mas
      a serializacao vem de a tarefa ser uma entidade sequencial, com um
      TCB (A.1.3), uma linha no Gantt (A.2.1, A.2.5) e o primeiro desempate
      por "a tarefa que esta executando" (A.4.3). Com varias CPUs livres,
      jobs da mesma tarefa continuam sem executar em paralelo.
- Consequencia: jobs posteriores ficam pendentes, com prazo correndo. Suspender
  o anterior nao libera o posterior. Distinguir elegibilidade de estado pronto.
  O job pendente nao esta na fila de prontos, entao uma CPU desligada enquanto
  ele espera nao contraria A.1.2. Atraso de um job aparece como perdas de prazo
  nos seguintes, o que o Gantt deve mostrar (A.3.3).
- Alternativas descartadas: sobrescrever progresso ou executar jobs da mesma
  tarefa em paralelo. O enunciado nao explicita essa restricao; e interpretacao.
  Tambem descartado em 2026-11-01 (DEC-38, proposta no PR #101 como DEC-36
  e retirada antes do aceite): ativar o job seguinte so na
  conclusao do anterior, com prazo contado dessa ativacao adiada. Deslocaria
  ativacoes e prazos do calendario e esconderia as perdas de prazo causadas
  por acumulo de trabalho. O estado editavel por tarefa (DEC-37) nao exige
  isso, pois vale para o job mais antigo incompleto, o unico elegivel.

### DEC-03: Fatias e preservacao de contexto

- Estado: aceita. Requisitos: REQ-01, REQ-07.
- Decisao: quantum vencido devolve job incompleto para selecao sem reiniciar
  progresso ou prazo. Nova fatia renova quantum, inclusive se escolher o mesmo
  job. Interrupcao e retomada tambem iniciam nova fatia.
- Consequencia: preservar quem executava imediatamente antes da selecao para
  desempate, inclusive o job cuja fatia acabou de vencer (DEC-18). Continuidade
  sem interrupcao preserva consumo da fatia.
- Registrar vencimento mesmo sem troca de tarefa; nao registrar troca ficticia.
- Justificativa: interpretacao acordada do quantum junto a politicas preemptivas.

### DEC-04: Fronteiras dos ticks e prazos

- Estado: aceita. Requisitos: REQ-01, REQ-08.
- Decisao: trabalho ocupa [t, t+1); na fronteira, contabilizar conclusoes antes
  de verificar prazos vencidos. Conclusao no prazo e valida.
- Hipoteses: ingresso e tempos inteiros; primeira ativacao no ingresso; custos
  de preparacao, migracao e troca de contexto nulos; sem release jitter.
- Consequencia: testar tick zero e eventos simultaneos. Perda de prazo e evento
  unico por job, nao estado terminal; enunciado exige continuar a execucao.
  Ordem dos eventos de uma fronteira na lista: DEC-22.

### DEC-05: CPUs logicas sem teto arbitrario

- Estado: aceita. Requisito: REQ-02.
- Decisao: aceitar quantidade inteira positiva sem teto de 16; CPU sem trabalho
  fica logicamente desligada e pode reativar sem custo.
- Consequencia: registrar intervalos e totais; nao simular energia ou latencia.
  Intervalos e totais sao derivados dos eventos de cada snapshot (DEC-21).
- Limitacao: recursos reais e representacao numerica continuam finitos; tratar
  falhas claramente, sem prometer capacidade infinita. Limite pratico do
  comprimento da simulacao, com medicoes, em DEC-30.

### DEC-06: Historico restauravel e sorteio reproduzivel

- Estado: aceita. Requisitos: REQ-04, REQ-05, REQ-07.
- Decisao: snapshots independentes incluem estado do gerador pseudoaleatorio;
  avancar no historico restaura, editar invalida o futuro.
- Consequencia: validar edicao antes de mutar/descartar historico. Nao sortear
  dentro de comparadores de ordenacao; sortear somente no empate residual e
  registrar resultado. Estruturas concretas do historico (cursor e restauracao)
  definidas na #23, em DEC-35.
- Alternativa descartada: usar sorteio nao restauravel a cada revisita do tick.

### DEC-07: Reavaliacao preemptiva e estabilidade de CPU

- Estado: aceita em 2026-10-17 (acordado com o usuario na revisao do PR #50).
  Requisitos: REQ-02, REQ-07.
- Decisao: consultar politica a cada tick; preservar CPU de jobs que
  continuam selecionados e preencher vagas com os demais selecionados.
- Justificativa: detectar preempcao antes do quantum sem migracoes desnecessarias.
- Consequencia: distinguir selecao global de atribuicao por CPU; nao tornar
  permanencia na CPU um criterio superior a prioridade da politica. Implementada
  em `Simulator.dispatch` (#13): jobs que continuam selecionados mantem a CPU;
  os demais selecionados ocupam as CPUs livres na ordem da selecao e, depois,
  por ID de CPU.

### DEC-08: Gantt por tarefa e exportacao vetorial

- Estado: aceita em 2026-10-24 (#35). Requisito: REQ-09. Resolve Q-05.
- Decisao: linhas por tarefa em ID decrescente (menor ID junto ao eixo X) e, em
  secao propria, uma faixa por CPU para os intervalos desligados (DEC-21); o
  intervalo ainda aberto no instante atual termina nele. Cada trecho executado
  identifica a CPU e o job (por exemplo, "CPU 1 · #2"). Um job posterior ja
  ativado, mas nao elegivel por causa de DEC-02, mostra somente o marcador de
  ativacao ate se tornar elegivel.
- Estados (A.2.1): execucao com preenchimento na cor da tarefa, que e dado de
  entrada; pronta sem preenchimento, com contorno tracejado na cor da tarefa;
  suspensa com hachura sobre fundo escuro, lida como o "preto com preenchimento
  diferente" do enunciado no tema escuro. Tarefa ainda nao ativada ou ja
  terminada fica vazia, delimitada pelos marcadores. Estado suspenso so pode ser
  desenhado com os eventos de suspensao e retomada de DEC-37, registrados
  pela #26. DEC-37 acrescenta o trecho forcado e a lacuna de CPU
  removida.
- Eventos (A.2.2): marcadores com forma distinta e legenda para ingresso/ativacao,
  termino do job, fim da tarefa (ultimo job, DEC-09), perda de prazo, sorteio,
  preempcao e quantum vencido, alem do instante atual. "Termino" abrange job e
  tarefa; o ultimo job gera os dois marcadores no mesmo instante.
- Exportacao: SVG completo gerado a partir dos dados, com legenda e eventos.
- Referencia visual: Tela principal na [pagina Telas do Figma](https://www.figma.com/design/h2kssKC2KiSuN4iAg4K1yU?node-id=0-1),
  confirmada pelo usuario como similar as figuras da secao 6.4 do livro do
  Prof. Maziero (A.2.5, nao incluidas no repositorio). Detalhes de regua e
  empilhamento de marcadores ficam em FE-17 do
  [renderer](../src/renderer/docs/specification.md).
- Justificativa: atender eixo Y e multiplas CPUs sem depender de screenshot ou
  limites de dimensao de canvas para imagens rasterizadas.
- Consequencia: tela pode usar zoom/rolagem; exportacao nao depende do viewport.
  #38 e #39 passam a seguir esta decisao; nenhuma muda de escopo, e #38 inclui o
  rotulo de job e os marcadores de preempcao e quantum vencido.

### DEC-09: Ativacoes finitas e termino de tarefas

- Estado: aceita em 2026-10-16. Requisitos: REQ-03, REQ-08. Resolve Q-01.
- Decisao: tarefa periodica (periodo > 0) gera no maximo dez jobs, ativados em
  ingresso + k * periodo para k de 0 a 9; nao existe 11a ativacao. Tarefa
  aperiodica (periodo zero ou ausente) gera um unico job, ativado no ingresso.
  Todo job executa ate completar a duracao, mesmo apos perder o prazo; a perda
  e registrada e informada ao usuario. A tarefa termina quando seu ultimo job
  (10o ou unico) conclui.
- Justificativa: enunciado define periodo zero como tarefa "ativada apenas uma
  vez no momento da sua criacao"; interpretacao de "executar dez vezes" como
  dez jobs drenados foi decidida pelo usuario.
- Substitui: regra anterior de REQ-03 que ignorava aperiodicas com aviso.
  Revista por DEC-29 (2026-10-28): no Projeto A, periodo zero ou ausente
  recebe o periodo padrao com aviso na carga (A.4.4); o comportamento acima
  continua sendo o do nucleo.
- Consequencia: TCB conta ativacoes geradas; termino depende de conclusao, nao
  de ativacao. Prioridade RM para periodo zero definida por DEC-17. Encerrar
  a tarefa durante a simulacao tambem a termina (DEC-37).
- Excecao (DEC-37): periodo editado depois da primeira ativacao
  recalcula as ativacoes restantes a partir da ultima, e a formula
  `ingresso + k * periodo` deixa de valer para essa tarefa; o limite de dez
  jobs continua.

### DEC-10: Valores padrao e limites da configuracao

- Estado: aceita em 2026-10-16; texto do item Validacao ajustado em 2026-10-28
  ao codigo da #31, sem mudar a regra, e revisto em 2026-10-28 pela #94
  (algoritmo sem distincao de caixa no nucleo). Requisitos: REQ-02, REQ-05, REQ-06.
  Resolve a parte de Q-03 que afeta o modelo.
- Padrao sem arquivo: algoritmo RM, quantum 5, 1 CPU, nenhuma tarefa.
- Valores inteiros validos: CPUs >= 1, quantum >= 1, duracao >= 1, todos sem
  maximo (mantem DEC-05); ID >= 1 e unico; ingresso >= 0; periodo >= 0; prazo
  relativo >= 1. Prazo menor que duracao ou periodo e valido: sobrecarga gera
  perda de prazo registrada, nao erro de configuracao.
- Campos ausentes: somente periodo pode faltar (campo vazio na sua posicao,
  DEC-31) e equivale a zero; demais campos
  obrigatorios ausentes sao erro. No Projeto A, periodo ausente ou zero recebe
  o periodo padrao 15 com aviso (DEC-29). Lista de eventos e opcional, armazenada e
  nunca executada no Projeto A.
- Limites numericos: rejeitar valores e tempos derivados (por exemplo
  ingresso + 9 * periodo + prazo) fora da faixa de inteiros exatos, com mensagem
  descritiva.
- Validacao: o nucleo valida a configuracao inteira antes de aplica-la, sem
  aplicacao parcial; aceita o nome do algoritmo (RM ou EDF) sem distincao de
  caixa e o devolve em maiusculas (DEC-19, #94); o carregamento do arquivo (`loadConfig`, E4) apenas
  acrescenta linha e campo ao erro, a partir dos problemas que
  `validateConfig` devolve, os mesmos que o erro do construtor carrega
  (DEC-15).
- Justificativa: valores e limites definidos pelo usuario; sem tetos arbitrarios.
  O custo de memoria de simulacoes longas fica registrado em DEC-30.
- Revista por DEC-37: na edicao, periodo zero e recusado e os
  tempos derivados sao conferidos sobre as ativacoes restantes, com os
  valores editados. Forma na DEC-44.

### DEC-11: Passo de um tick e snapshot inicial

- Estado: aceita em 2026-10-16. Requisitos: REQ-01, REQ-04, REQ-08.
- Decisao: um passo avanca o relogio em exatamente um tick. Snapshot k
  representa o instante k apos processar a fronteira (conclusoes, perdas de
  prazo e fatias vencidas, conforme DEC-04; ativacoes devidas em k; selecao e
  despacho) e mostra quem executa em [k, k+1). Snapshot 0 ja mostra tarefas
  com ingresso 0 ativadas e atribuidas as CPUs.
- Justificativa: todo snapshot tem o mesmo significado, inclusive o inicial,
  e restaurar k basta para reexecutar a partir dele.
- Consequencia: avancar de k para k+1 executa [k, k+1) e processa a fronteira
  k+1. Nao existe snapshot de configuracao "antes de t=0". Ordem dos eventos
  de uma fronteira na lista: DEC-22.

### DEC-12: Modelo de dominio em dados simples

- Estado: aceita em 2026-10-16. Requisitos: REQ-01, REQ-02, REQ-03, REQ-05,
  REQ-06, REQ-08. Escopo acordado com o usuario na #9.
- Decisao: o dominio e feito de registros sem comportamento (`TaskDefinition`,
  `SystemConfig`, `TaskControlBlock`, `Job`, `CpuState`, `ExecutionSlice`,
  `SimulationEvent`, `SimulationState`). O motor muta somente seu estado
  privado; snapshots sao copias profundas congeladas (`DeepReadonly`).
- Detalhes:
    - Elegibilidade (DEC-02) e termino da tarefa (DEC-09) sao derivados, nao
      armazenados originalmente; DEC-43 acrescenta `TaskControlBlock.status`
      e `JobState.interrupted` para encerramento por edicao. `jobs.length`
      conta as ativacoes geradas.
      DEC-44 acrescenta `Job.duration` (duracao copiada na ativacao) e
      `TaskControlBlock.nextActivation` (proxima ativacao, ou nulo).
    - Eventos sao fatos com instante exato, uniao discriminada por `kind`
      (ativacao, conclusao, perda de prazo, quantum vencido, preempcao, sorteio,
      termino de tarefa, CPU desligada/religada, CPU adicionada/removida
      (DEC-40), suspensao, retomada, forcamento e fim do forcamento (DEC-43));
      execucao fica em intervalos
      [start, end) por CPU.
    - CPUs numeradas de 1 a `cpuCount`; cor em `RRGGBB` sem `#`, como no exemplo
      do enunciado (A.3.3), normalizada para maiusculas e comparada sem caixa.
    - `validateConfig` reune todos os problemas (campo, indice da tarefa e
      mensagem em portugues com o nome do campo no arquivo) e devolve copia
      normalizada congelada; nao muta a entrada. Lista de tarefas vazia e valida
      no nucleo; exigir ao menos uma tarefa e regra do arquivo (E4).
    - Estado do gerador pseudoaleatorio entra no snapshot como `drawState`
      (#20, DEC-27).
- Justificativa: dados simples tornam copia, congelamento e restauracao
  (DEC-06) triviais e impedem a UI de segurar objetos vivos.
- Consequencia: placeholders `task.ts` (classe com cor aleatoria e ID 0, em
  conflito com DEC-10) e `scheduler.ts` foram removidos; o contrato de politica
  e criado na #10. Copia integral por passo custa O(tamanho do estado); rever
  na #23 se o historico ficar grande (revisto na #23: mantida, DEC-30 e
  DEC-35).
- Fatos em dobro: execucao fica em `Job.state = running` e em
  `CpuState.running`; perda de prazo em `Job.deadlineMissed` e no evento
  `deadline-miss`; CPU desligada em `CpuState.offSince` e no intervalo aberto
  dos eventos `cpu-off`/`cpu-on` (DEC-21). `findInconsistencies` exige que cada
  par concorde (um job em no maximo uma CPU, uma unica perda registrada por
  job, `offSince` igual ao inicio do intervalo aberto; ver DEC-21 para as
  demais conferencias de CPU) e rejeita `executed > duration` (DEC-14); testes
  do motor (#13, #15) verificam lista
  vazia apos cada passo.
- Pendencias conhecidas do modelo, registradas no plano:
    - CPU ociosa (resolvida na #13): o estado pre-dispatch usa `offSince: null`;
      o primeiro despacho marca CPUs sem trabalho desligadas desde o tick 0
      (`offSince: 0`) e registra `cpu-off`. Despachos seguintes registram
      religamento/desligamento; `findInconsistencies` e aplicado apos cada
      despacho (REQ-02, DEC-05).
    - Suspensao: resolvida no nucleo do #117 por `TaskControlBlock.status`
      e eventos de tarefa (DEC-43); `JobState.suspended` segue por
      compatibilidade do modelo, mas a edicao nao o escreve. Consumo no Gantt (#38).
- Alternativa descartada: classes com estado privado por tarefa, que exigiriam
  clonagem especifica e expor metodos aos consumidores de snapshots.

### DEC-13: Contrato da politica injetada

- Estado: aceita em 2026-10-16; revista em 2026-10-27 (acordada com o usuario
  na revisao do PR #85). Requisitos: REQ-02, REQ-07. Detalha DEC-01; escopo
  acordado com o usuario na #10.
- Decisao: `SchedulingPolicy.select(view)` recebe uma `PolicyView` e devolve uma
  `PolicyDecision`. A visao tem `clock`, `cpuCount` e as candidatas; cada
  candidata traz o job, a definicao da tarefa e `previousCpu` (CPU que o possuia
  quando a visao foi montada, para o primeiro desempate de A.4.3).
  `buildPolicyView` copia somente os jobs elegiveis indicados pelo motor e
  congela a copia inteira; rejeita job inexistente, concluido, suspenso ou
  repetido.
- Decisao: `selected` traz exatamente min(`cpuCount`, candidatas) jobs, ou
  desse total menos as vagas de um empate residual relatado em `tie`
  (DEC-27), em ordem decrescente de prioridade (a ordem dos criterios da
  politica). Atribuir CPUs cabe ao despacho (DEC-07), que usa essa ordem para
  preencher as CPUs livres. A ordem nao e desempate: jobs empatados que
  cruzam o corte vao para `tie`, nao sao ordenados (DEC-27).
  O motor executa `checkDecision` e trata qualquer problema (job fora das
  candidatas, repetido ou quantidade errada) como erro da politica. Sem
  problemas, o motor guarda somente `selectedRefs(decision)`, copias
  `{taskId, index}`, nunca os objetos devolvidos pela politica: campos extras
  (por exemplo o job congelado da visao) vazariam para `CpuState.running` e um
  objeto compartilhado deixaria a politica alterar o estado depois (REQ-07,
  invariante "Politicas nao modificam estado").
- Detalhes:
    - Ordem das candidatas nao carrega prioridade; politica que dependa dela
      esconderia desempate por ID (REQ-07).
    - Elegibilidade (DEC-02) e responsabilidade exclusiva do motor na #12, nao
      da politica nem de `buildPolicyView`. As rejeicoes de `buildPolicyView`
      (job inexistente, concluido, suspenso ou repetido) nao cobrem a regra do
      job mais antigo incompleto: dois jobs da mesma tarefa passam pela visao e
      por `checkDecision`. Os testes da #12 devem garantir essa regra.
    - O motor monta a visao antes de liberar as CPUs. Job com quantum vencido
      continua contando como "executava antes da selecao": `previousCpu` traz
      a CPU que ele ocupava (DEC-18).
    - Sorteio do empate residual entra no contrato pela DEC-27 (#20): a
      decisao ganha `tie` e o motor sorteia; a visao nao muda.
    - Q-04 e Q-07 decididas na #18 (DEC-16, DEC-17) sem mudar o contrato: os
      campos usados ja estao na visao (`job.absoluteDeadline`,
      `job.activation`, `task.duration`, `task.period`).
- Justificativa: a selecao basta ao despacho e so exige sorteio quando o
  empate cruza o corte; copia congelada garante, tambem em tempo de execucao,
  o invariante "Politicas nao modificam estado". A ordem da selecao e
  contratual (revisao de 2026-10-27) porque DEC-07 ja preenche as CPUs livres
  "na ordem da selecao": sem ela, a CPU de cada job dependeria de um detalhe
  de implementacao da politica (REQ-07, REQ-02).
- Consequencia: custo de copiar as candidatas a cada selecao, pequeno frente
  ao snapshot completo por passo. `freezeCopy` (em `helpers/`) e
  reutilizada.
- Revista por DEC-37: jobs forcados recebem CPU antes da politica,
  que seleciona para as CPUs restantes; `cpuCount` da visao desconta esses
  jobs. Job cuja CPU de [t-1, t) foi removida continua com o primeiro
  desempate; a visao precisa representa-lo sem uma CPU vigente (forma na
  #26).
- Revista por DEC-40 (#116): `wasRunning` representa a execucao em
  [t-1, t), derivada de `executions`; `previousCpu` permanece como posse
  antes do despacho e pode ser nulo mesmo com `wasRunning: true`. RM/EDF
  usam `wasRunning` no primeiro desempate.
- Alternativas descartadas: ordenacao completa das candidatas, inclusive dos
  empates fora do corte (forca sorteios sem efeito alem do corte); visao
  apenas tipada sobre o estado vivo (um cast permitiria mutar o motor);
  `selected` sem ordem (versao de 2026-10-16), revista porque o despacho e os
  testes de varias CPUs dependem da ordem.

### DEC-14: Construcao e passo transacionais do Simulator

- Estado: aceita em 2026-10-17. Requisitos: REQ-01, REQ-04, REQ-07. Complementa
  DEC-13 e DEC-07; escopo acordado com o usuario na revisao do PR #50.
- Decisao:
    1. O construtor exige politica com `select` sempre que a configuracao tem
       tarefas, inclusive com ativacoes futuras. Sem tarefas usa a politica
       interna que nao seleciona nada, de modo que `new Simulator()` com
       `DEFAULT_CONFIG` funciona (adaptador Vue).
    2. A decisao deve ser um objeto com a lista `selected`. O motor le
       `selected` uma vez, copia as referencias (`selectedRefs`) e confere essa
       copia; o despacho usa somente a copia (complementa DEC-13). Entradas que
       nao sejam objetos sao rejeitadas, e apos `checkDecision` o motor guarda a
       referencia do proprio candidato (`{taskId, index}` numericos), nunca a
       tipada pela politica.
    3. `tick()` trabalha sobre uma copia do estado e a confirma somente depois
       que despacho e `findInconsistencies` passam. Em qualquer erro, estado vivo
       e historico ficam inalterados e o erro e propagado.
- Justificativa: um passo aplicado pela metade reexecutava jobs concluidos
  (`executed > duration`) e corrompia o historico (REQ-04).
- Consequencia:
    - Uma copia extra O(estado) por tick, da mesma ordem do snapshot; rever na
      #23 junto com DEC-12 (revisto na #23: mantida, DEC-30 e DEC-35). Efeito
      medido na memoria do historico em DEC-30.
    - `findInconsistencies` tambem rejeita `executed > duration`.
    - `deepCopy` compartilha subarvores congeladas (a configuracao) em vez de
      copia-las, o que preserva a guarda de imutabilidade e reduz o custo.
- Alternativa descartada: bloquear o simulador apos um erro, o que perde um
  estado valido que poderia continuar.
- Revista por DEC-39: `edit` tambem e transacional; recusa ou falha no
  recalculo deixam estado, cursor e historico inalterados.

### DEC-15: Rejeicao de configuracao e consultas do Simulator

- Estado: aceita em 2026-10-17. Requisitos: REQ-05, REQ-02. Detalha DEC-10;
  escopo acordado com o usuario na #51.
- Decisao:
    1. `new Simulator(config, policy)` valida com `validateConfig` antes de
       criar estado. Se a configuracao for invalida, lanca
       `ConfigValidationError` (subclasse de `Error`) com `issues` congelado
       (`field`, `taskIndex`, `message`) e `message` igual as mensagens unidas
       por quebra de linha. Nenhuma instancia nem estado parcial existe. A
       configuracao e conferida antes da politica (DEC-14), entao uma
       configuracao invalida sem politica gera esse erro, nao o da politica.
    2. `getEligibleJobs()` e uma consulta publica somente de leitura: devolve
       as refs congeladas de `findEligibleJobs` (DEC-02) e nao expoe estado
       vivo. Serve a inspecao da E5 e a testes de DEC-02 que nao dependem da
       politica.
- Justificativa: o parser da E4 associa `taskIndex` a linha sem validar duas
  vezes (DEC-10); `message` mantem o texto que a interface ja exibe.
- Alternativas descartadas: `Error` simples com validacao previa pelo chamador
  (duplica a validacao no parser) e construtor que recebe somente uma
  configuracao ja validada (muda a assinatura e o adaptador Vue e contraria a
  DEC-10, que manda o nucleo validar antes de aplicar).

### DEC-16: Desempates pelos valores do job

- Estado: aceita em 2026-10-17 (decidida pelo usuario na #18). Requisitos:
  REQ-07, REQ-08. Resolve Q-04.
- Decisao: empate de prioridade segue a ordem de A.4.3. Prazo e ingresso usam
  os valores do job candidato; duracao segue o texto do enunciado:
    1. job que executava antes da selecao, conforme DEC-18;
    2. menor prazo absoluto do job (`job.absoluteDeadline`);
    3. menor instante de ativacao do job (`job.activation`), que no primeiro
       job coincide com o ingresso da tarefa;
    4. menor duracao da tarefa (`task.duration`), como em A.4.3 ("duracao da
       tarefa: duracao menor deve ser escolhida"); nao o trabalho restante;
    5. sorteio registrado (DEC-06, DEC-27).
- Justificativa: cada ativacao e um job com prazo proprio (DEC-02, REQ-08);
  prazo relativo e ingresso sao iguais para todos os jobs de uma tarefa e nao
  distinguem um job atrasado de outro recem-ativado. Para a duracao o usuario
  escolheu seguir o enunciado literalmente.
- Alternativa descartada: trabalho restante do job (`task.duration -
  job.executed`) no criterio (4); seria um desempate por menor tempo restante
  que o enunciado nao pede.
- Consequencia: no EDF a prioridade ja e o prazo absoluto, entao o criterio
  (2) nunca separa um empate e a decisao passa ao (3). Nenhum criterio usa ID
  ou ordem das candidatas (DEC-13).
- Revista por DEC-37: o criterio (4) usa a duracao do proprio
  job, que pode diferir da duracao vigente da tarefa depois de uma edicao
  (DEC-44).

### DEC-17: Prioridade RM de tarefas aperiodicas

- Estado: aceita em 2026-10-17 (decidida pelo usuario na #18). Requisitos:
  REQ-07, REQ-03. Resolve Q-07; complementa DEC-09.
- Decisao: no RM, tarefa aperiodica (periodo zero, DEC-09) tem prioridade
  menor que qualquer tarefa periodica, como se o periodo fosse infinito.
  Aperiodicas empatam entre si e seguem os desempates de DEC-16.
- Justificativa: RM da prioridade maior a tarefas mais frequentes; uma tarefa
  ativada uma unica vez tem a menor frequencia possivel. Ler periodo zero
  literalmente como "menor periodo" daria a ela a maior prioridade.
- Consequencia: sob carga, o job aperiodico espera os periodicos; termina
  porque cada tarefa periodica gera no maximo dez jobs (DEC-09), e eventual
  perda de prazo e registrada (REQ-08). EDF nao e afetado: ordena por prazo
  absoluto do job. No Projeto A, periodo zero nao chega ao simulador
  (DEC-29); esta regra vale para o nucleo e seus testes.

### DEC-18: Quantum vencido e primeiro desempate

- Estado: aceita em 2026-10-17 (decidida pelo usuario na #18); revista pelo
  usuario em 2026-10-17 na #14. Requisitos: REQ-07, REQ-01. Detalha DEC-03 e
  DEC-13.
- Decisao: o criterio (1) de A.4.3 vale para o job que executava antes da
  selecao, inclusive quando a fatia dele vence na fronteira. Num empate de
  prioridade, o job vencido continua na CPU e inicia nova fatia (DEC-03); outro
  job so assume a CPU com prioridade maior. Depois da selecao, a permanencia na
  CPU segue DEC-07.
- Justificativa: A.4.3 (1) favorece quem ja executava para evitar troca de
  contexto, e o usuario decidiu na #14 que isso vale tambem no fim da fatia.
- Exemplo (teste para #16/#21): RM, 1 CPU, quantum 2, mesmo periodo; J ativado
  em 0 com duracao 4 e prazo absoluto 10; K ativado em 1 com duracao 2 e prazo
  absoluto 9. Em 1, J continua pelo criterio (1). Em 2, a fatia de J vence,
  registra `quantum-expired` e J continua pelo criterio (1) com nova fatia. Em
  4, J conclui na mesma fronteira em que a fatia venceria e registra so a
  conclusao: J [0, 4), K [4, 6).
- Consequencia:
    - Visao da politica sem mudanca (DEC-13): `previousCpu` do job vencido traz
      a CPU que ele ocupava, porque o motor monta a visao antes de liberar as
      CPUs. Revista por DEC-40: o primeiro desempate passou a vir de
      `wasRunning` (execucao em [t-1, t)), e `previousCpu` deixou de decidi-lo.
    - Como a politica e consultada a cada tick (DEC-07), job de prioridade maior
      ja preempta sem esperar o quantum, e no empate o job vencido fica pelo
      criterio (1). Com politicas por prioridade (RM, EDF), o vencimento renova
      a fatia e registra o evento, sem mudar a escala.
    - Eventos (decididos pelo usuario na #14): `quantum-expired` e registrado
      em todo vencimento (DEC-03); se outro job assume a CPU nessa fronteira,
      registra-se tambem `preemption` do job vencido. Job que conclui na
      fronteira em que a fatia venceria registra so a conclusao, pois DEC-03
      devolve a selecao apenas job incompleto.
- Alternativas descartadas:
    - Job vencido perder o criterio (1) e disputar a partir do (2) (versao
      aceita na #18): faria o quantum alternar jobs empatados; revista pelo
      usuario na #14 para manter o criterio (1) e evitar a troca de contexto.
    - Usar "executava antes" so para atribuir CPU: contraria A.4.3 (1); empates
      totais seriam sorteados a cada tick.
- Revista por DEC-37: job forcado nao tem quantum; o quantum
  editado vale ja para a fatia em curso.

### DEC-19: Diagnosticos do parser de configuracao

- Estado: aceita em 2026-10-17 e revista em 2026-10-18, em 2026-10-28 (revisao
  do PR #84, #31, e decisao da #94) e em 2026-11-01 (decisao da #93) pelo
  usuario. Requisitos: REQ-06, REQ-10. Resolve Q-03;
  detalha DEC-10, DEC-12 e DEC-15.
- Decisao:
    1. Diagnosticos de conteudo identificam linha original (base 1), campo,
       valor recebido e motivo. Valor ausente e indicado como tal. Para linha
       com quantidade incorreta de campos, indicar a estrutura da linha, a
       quantidade esperada e recebida; para campo faltante, identificar o campo
       esperado. Arquivo sem cabecalho aponta a linha 1 e o cabecalho/campo
       ausente; arquivo sem tarefa aponta a linha seguinte ao fim do arquivo e
       a tarefa ausente.
    2. Linhas em branco sao ignoradas na interpretacao, mas contam na
       numeracao, que sempre corresponde ao arquivo original.
    3. Conferir o arquivo inteiro e reunir todos os erros de sintaxe que
       possam ser recuperados, em vez de parar no primeiro. Quando o
       cabecalho e todas as linhas de tarefa forem lidos sem erro de sintaxe,
       incluir todos os problemas retornados pelo nucleo; havendo erro de
       sintaxe, reportar somente os erros de sintaxe (revisao de 2026-10-28).
       Nao repetir as regras semanticas do nucleo. Acrescentar ao texto
       original de cada mensagem do nucleo o contexto da linha e do campo,
       sem alterar nem reescrever a mensagem. O valor recebido nao entra no
       texto acrescentado, porque toda mensagem do nucleo ja cita o valor;
       o texto como escrito continua no campo `value` do diagnostico
       (decisao da #93, 2026-11-01). Em particular,
       referencias ordinais a outras tarefas permanecem como o nucleo as
       produziu; nao sao substituidas pela linha original da tarefa referida.
       A linha e o campo adicionados correspondem a tarefa que tem o problema,
       associados pelo indice da tarefa (DEC-10, DEC-15). Problema causado
       por varios campos juntos (o nucleo o marca como `combined`, por
       exemplo o prazo da ultima ativacao) recebe linha e campo, sem valor
       recebido nem `value`, porque o texto de um so campo apontaria um valor que pode
       ser valido. O parser entrega a cor como foi escrita; compara-la sem
       caixa e converte-la para maiusculas fica com o nucleo, para que a
       mensagem de cor invalida mostre o valor recebido; a de cor repetida
       cita a cor em maiusculas (revisao de 2026-10-28).
       A cor sem distincao de caixa exigida pela #30 vale para a
       configuracao carregada (`loadConfig`). Do mesmo modo, o parser
       entrega o nome do algoritmo como escrito e so exige que o campo
       exista; decidir se e RM ou EDF, sem distincao de caixa, e
       converte-lo para maiusculas fica com o nucleo (decisao da #94,
       2026-10-28).
    4. Falhas ao acessar ou ler o arquivo sao erros de leitura, nao erros de
       conteudo: informar caminho e motivo do sistema quando disponiveis, sem
       linha nem campo. Conteudo que nao esta em UTF-8 tambem e erro de
       leitura (DEC-32).
    5. Cancelar a escolha do arquivo no dialogo nao e erro: nao gera diagnostico
       de conteudo nem de leitura, conforme #33.
- Exemplos:
    - Sintaxe: `Linha 4, campo duracao, valor "x": esperado um numero.`
    - Regra do nucleo: `Linha 6, campo id: O id 2 já foi usado pela 1ª
      tarefa; cada tarefa precisa de um id único.`
    - Falha de acesso: `Nao foi possivel abrir o arquivo "<caminho>":
      permissao negada.`
- Justificativa: linhas originais permitem localizar erros mesmo quando o
  parser ignora linhas em branco; acumular problemas reduz ciclos de correcao.
  Preservar a mensagem do nucleo mantem a explicacao semantica aprovada e evita
  alterar referencias ordinais. O nucleo numera as tarefas pela posicao na
  lista que recebe; validar sem uma linha descartada deslocaria esses
  ordinais e esconderia conflitos com ela, entao uma segunda rodada de
  correcao e preferivel a mensagens enganosas (revisao de 2026-10-28).
  Repetir o valor no prefixo e na mensagem do nucleo
  (`campo quantum (valor 0): ... valor recebido: 0.`) so acrescenta ruido; o
  usuario preferiu mostrar o valor uma vez, inclusive quando o texto escrito
  e o numero convertido diferem (`2.50` e `2.5`, ou um inteiro alem do limite
  exato), caso em que fica o numero citado pelo nucleo. Mudar a mensagem do
  nucleo tiraria o valor da edicao durante a simulacao (DEC-15), que nao tem
  prefixo, entao a mudanca fica no carregamento (decisao da #93,
  2026-11-01). O
  algoritmo valido e uma regra semantica (DEC-10, DEC-15): checa-lo no parser
  duplicava a regra com outra mensagem e tornava inalcancavel a do nucleo
  para arquivos; com a cor, ficou uma so regra e uma so mensagem (#94). Falhas
  de acesso nao pertencem ao conteudo e nao podem ser localizadas por
  linha/campo; cancelar a escolha e uma acao voluntaria, nao uma falha.
- Consequencia: problemas do nucleo so aparecem para arquivo sem erros de
  sintaxe; com erro de sintaxe, o relatorio traz todos os erros de sintaxe
  recuperaveis e nenhum diagnostico semantico. Assim, algoritmo invalido so
  e reportado quando o arquivo nao tem erro de sintaxe (#94). O parser preserva o texto
  recebido para os diagnosticos e associa tarefas analisadas as linhas
  originais. O contexto acrescentado envolve a mensagem sem modifica-la.

### DEC-20: `;` final e fim da lista de eventos

- Estado: aceita em 2026-10-19 pelo usuario (revisao do PR #60). Requisitos:
  REQ-06. Detalha DEC-10 e DEC-19; resolve a questao aberta da #32 sobre o fim
  da lista de eventos e a proposta CRLF/BOM da #30.
- Decisao:
    1. Cada linha, sem espacos nas pontas, pode terminar com um `;` opcional,
       removido antes de separar os campos; `;;` final deixa um campo vazio.
    2. Na tarefa, os seis primeiros campos sao fixos; a lista de eventos e o
       texto apos o sexto `;`, aparado nas pontas, com separadores e espacos
       internos preservados; sem sexto `;` ela e vazia. Assim `...;7`, `...;7;`
       e `...;7;;` nao tem eventos, e `...;7;A;B;` guarda `A;B`.
    3. Fins de linha LF, CRLF e CR, e marca BOM inicial, sao aceitos.
    4. Campos numericos aceitam somente numerais decimais
       (`[+-]?digitos(.digitos)?`); inteiros e faixas continuam com o nucleo
       (DEC-10).
- Justificativa: A.3.3.3 exige tratar linhas com e sem `;` final; exigir o
  separador antes da lista de eventos rejeitaria arquivos validos, falha grave
  pela A.3.3.7. Notacoes nao decimais eram convertidas sem aviso (`0x10`
  virava 16).
- Consequencia: um `;` final que fizesse parte do conteudo dos eventos nao e
  preservado; o formato dos eventos vem no Projeto B, que pode rever esta
  decisao. Mensagens do parser usam acentuacao como as do nucleo; os exemplos
  desta documentacao seguem a convencao sem acentos.

### DEC-21: Intervalos de CPU desligada derivados do snapshot

- Estado: aceita em 2026-10-17 (decidida pelo usuario na #15). Requisitos:
  REQ-02, REQ-04 (qualquer snapshot do historico) e REQ-09 (consumo pelo
  Gantt, #38). Detalha DEC-05; nao acrescenta campos ao modelo de DEC-12,
  acrescenta um fato em dobro conferido.
- Decisao: `summarizeCpuOff(snapshot)` deriva, para cada CPU na ordem de
  `cpus`, os intervalos [start, end) em que esteve desligada e o total
  desligado, percorrendo os eventos `cpu-off`/`cpu-on`. Nada novo e guardado
  no estado; qualquer snapshot basta, inclusive um anterior do historico
  (DEC-06).
- Detalhes:
    - CPU ainda desligada no instante do snapshot tem o ultimo intervalo
      aberto (`end: null`). O total conta somente ticks ja decorridos
      (`clock - start` para o aberto), como `executions` guarda somente ticks
      ja executados; CPU ociosa no snapshot 0 tem total 0.
    - CPU que nunca desligou aparece com lista vazia e total 0.
    - Sequencia malformada (religar CPU ligada, desligar CPU desligada, CPU
      inexistente, evento antes do anterior da mesma CPU ou depois do clock do
      snapshot) lanca `CpuEventSequenceError` com mensagem descritiva em vez
      de adivinhar intervalos. `findInconsistencies` converte somente
      `CpuEventSequenceError` em problema relatado; qualquer outro erro
      propaga, por indicar defeito do codigo e nao do historico.
    - Desligar e religar no mesmo instante continua aceito: o motor nao gera
      esse par, e o intervalo `[t, t)` soma 0.
    - `offSince` e o intervalo aberto registram o mesmo fato:
      `findInconsistencies` exige que concordem, que a sequencia seja valida e
      que CPU com job nao esteja desligada. O motor confere isso a cada
      despacho (DEC-14).
- Justificativa: os eventos ja sao a fonte dos instantes exatos; guardar os
  intervalos criaria mais um fato em dobro, e deixar a derivacao para a
  interface obrigaria inspecao (#37) e Gantt (#38) a derivar por conta
  propria, podendo divergir.
- Consequencia: custo O(eventos) por consulta; a interface pode guardar o
  resultado por snapshot se necessario. O motor tambem paga O(eventos) por
  passo via `findInconsistencies`, como a conferencia de `deadline-miss`;
  rever na #23 junto com DEC-12/DEC-14.
- Alternativas descartadas: intervalos e totais guardados em `CpuState`
  (muda DEC-12 e duplica os eventos) e derivacao pela interface (regra do
  dominio fora do nucleo e sem `findInconsistencies`).
- Revista por DEC-37: `cpu-removed` e `cpu-added` delimitam os
  periodos em que a CPU existe. A remocao fecha o intervalo desligado aberto,
  o tempo fora do sistema nao conta como desligado, e a sequencia
  desligar/religar e conferida dentro de cada periodo de existencia; CPU
  removida deixa de ser "inexistente" para os eventos anteriores.
- Revista por DEC-40 (#116): retorno inclui todos os IDs historicos em
  ordem crescente; `cpu-removed` fecha o intervalo aberto sem `cpu-on`,
  `cpu-added` inicia outro periodo de existencia. `summarizeCpuOff` reconstroi a
  presenca inicial a partir das CPUs atuais e eventos de existencia.
  Consistencia compara `offSince` por ID, somente para CPUs vigentes.

### DEC-22: Ordem dos eventos numa fronteira

- Estado: aceita em 2026-10-23 (decidida pelo usuario na #16). Requisitos:
  REQ-01, REQ-08, REQ-09. Detalha DEC-04 e DEC-11.
- Contexto: o motor registrava conclusao e perda de prazo job a job; com
  varios jobs na mesma fronteira, a perda de uma tarefa listada antes podia
  aparecer antes da conclusao de outra, ao contrario das etapas de DEC-11.
- Decisao: os eventos de uma fronteira seguem etapas globais, nesta ordem:
  todas as conclusoes (cada uma seguida do `task-finished` da tarefa, quando
  for o ultimo job), todas as perdas de prazo, todas as fatias vencidas, todas
  as ativacoes e, por fim, os eventos do despacho: primeiro os `tie-break` do
  sorteio, na ordem sorteada (DEC-27), depois os eventos agrupados por CPU em
  ordem de ID (`preemption`, `cpu-on` ou `cpu-off` de cada CPU). Dentro de uma
  etapa, a ordem segue a lista de tarefas e o indice do job (ou o ID da CPU),
  sem significado de prioridade.
- Justificativa: a lista de eventos passa a refletir o fluxo documentado do
  passo e pode ser lida linearmente pela inspecao e pelo Gantt (#37, #38).
  DEC-04 continua garantindo, por job, que conclusao no prazo nao e perda.
- Consequencia: `completeJobsAndRecordDeadlineMisses` percorre os jobs em
  duas passadas. Nenhuma escala, intervalo ou estado de job muda; so a ordem
  da lista de eventos.
- Alternativa descartada: manter a ordem job a job e restringir DEC-04 a cada
  job; deixaria a ordem do log depender da posicao das tarefas na lista.
- Revista por DEC-37: os eventos de edicao formam uma etapa entre
  as ativacoes e as fatias vencidas, com a mudanca liquida do tick na ordem
  da lista de tarefas e depois das CPUs (revisao de 2026-11-01), e a etapa de
  fatias vencidas passa a vir depois das ativacoes; o despacho
  passa a incluir a `preemption` causada por job forcado.
- Revista por DEC-39: a ordem ativacoes, etapa de edicao e fatias vencidas
  esta implementada desde a #115; a #117 acrescenta os eventos de estado
  e a `preemption` por job forcado (DEC-43).

### DEC-23: Contrato do adaptador Vue

- Estado: aceita em 2026-10-23 (escolhas do usuario na #17 e na #65); revista
  pela DEC-25 em 2026-10-24 no PR #74. Requisitos: REQ-04, REQ-05, REQ-10.
  Complementa DEC-14; erros seguem DEC-24.
- Decisao:
    1. `useSimulation(policies?)` recebe somente o registro de politicas
       (padrao `DEFAULT_POLICIES`; testes passam o seu, DEC-25), comeca com
       `DEFAULT_CONFIG` e nao falha. Expoe somente `view` (`shallowRef` do
       ultimo snapshot congelado), `load(config)` e `tick()`; a instancia e o
       estado vivo ficam privados.
    2. `load` reconstroi a simulacao em t=0 quando uma configuracao inteira e
       carregada (arquivo, E4). Cria a simulacao com
       `createSimulator(config, policies)` (DEC-25), sem validar de novo, e
       cria a nova instancia antes de descartar a atual: em falha, instancia,
       `view` e historico ficam como estavam.
    3. `tick` avanca um tick; em falha `view` continua no ultimo snapshot
       valido, que DEC-14 garante ser o estado atual.
    4. Editar parametros durante a simulacao mantem a simulacao e o passado e
       altera somente a partir do tick k. E uma operacao do nucleo (REQ-05,
       Q-02/#25, #26), exposta pelo adaptador com o mesmo contrato.
- Justificativa: recarregar e uma simulacao nova, pois o snapshot 0 depende da
  configuracao (DEC-11); editar e ramificar o historico existente. O mesmo
  adaptador atende a configuracao carregada (E4) e a politica escolhida (E2).
- Alternativas descartadas: criar um adaptador novo a cada configuracao (a
  interface teria de trocar a referencia) e um `reset` no `Simulator`
  (repetiria a validacao e o estado inicial que o construtor ja garante).

### DEC-24: Arquitetura de erros da interface

- Estado: aceita em 2026-10-23 (escolhas do usuario na #65). Requisitos:
  REQ-10, REQ-05. Complementa DEC-14, DEC-15 e DEC-19.
- Decisao:
    1. Categorias:
        - corrigivel pelo usuario: configuracao invalida
          (`ConfigValidationError` com `issues`); diagnosticos do parser,
          falhas de leitura e edicoes rejeitadas entram nas #31, #33 e #26;
        - recusa: pedido impossivel no passo atual (`SimulationRefusal`,
          categoria `refused`), mostrado onde o usuario agiu, fora do banner
          (DEC-36);
        - inesperado: decisao invalida da politica, inconsistencia, politica
          ausente e qualquer outra excecao.
        - Cancelar a escolha do arquivo nao e erro (DEC-19).
    2. Comandos do adaptador nunca lancam: devolvem `CommandResult` (`ok` ou
       `ok: false` com `AppError`) e, em falha, o estado fica inalterado.
    3. Erro corrigivel vai somente no resultado, e o componente o mostra onde o
       usuario agiu (por campo ou linha).
    4. Erro inesperado vai no resultado e em `reportError` (banner e console).
       Os handlers do Vue e da janela continuam como ultima rede de seguranca.
    5. O nucleo continua lancando erros tipados e devolvendo os resultados de
       `validateConfig` e `parseConfig`; o renderer classifica num unico lugar
       (`commandFailure`).
- Justificativa: o chamador, inclusive a execucao automatica (E5), sabe que o
  comando falhou; erros por campo e linha (DEC-19) mantem o contexto; o banner
  continua significando falha do programa.
- Alternativas descartadas: tudo no banner (perde o contexto de campo e
  linha) e uma ref de erro publicada pelo adaptador (segunda fonte de verdade).

### DEC-25: Politica escolhida pelo algoritmo da configuracao

- Estado: aceita em 2026-10-24 (decidida pelo usuario no PR #74). Requisitos:
  REQ-07 (A.4.1, A.4.2). Detalha DEC-01 e DEC-13; revisa DEC-23.
- Decisao:
    1. `PolicyRegistry` associa cada `AlgorithmId` a uma `SchedulingPolicy`;
       `DEFAULT_POLICIES` registra RM e EDF. Um algoritmo novo entra
       estendendo `AlgorithmId` e registrando a politica; o tipo do registro
       exige a entrada em compilacao.
    2. `createSimulator(config, policies?)` resolve `config.algorithm` no
       registro e constroi o `Simulator` com a politica encontrada. O
       `Simulator` continua recebendo uma politica e nunca le o nome do
       algoritmo (DEC-01).
    3. O adaptador cria simulacoes somente pela fabrica, com o registro
       recebido na criacao (DEC-23): em producao o padrao, nos testes um
       registro proprio.
    4. Configuracao invalida tem precedencia e gera `ConfigValidationError`
       (DEC-15), mesmo quando o algoritmo nao tem politica, pela mesma funcao
       que o construtor usa (DEC-28). Registro sem a chave do algoritmo e erro
       inesperado (DEC-24).
- Justificativa: o algoritmo executado em producao e sempre o configurado
  (A.4.1); o motor e os testes do motor ficam intactos, e REQ-07 continua
  testavel com politicas de teste injetadas diretamente.
- Alternativas descartadas:
    - `policyFor(algorithm)` deixado a cargo do chamador: politica e
      algoritmo podiam divergir sem aviso.
    - Registro no construtor do `Simulator`: garantia estrutural, mas muda
      DEC-15 e todos os testes do motor.
    - Resolvedor `(algorithm) => politica` no motor: so se justifica com troca
      de algoritmo durante a simulacao, ainda indefinida (Q-02).
    - Politica com identificador conferido pelo motor: estende DEC-13.
- Consequencias:
    - `new Simulator(config, policy)` direto continua permitido para testes e
      pode divergir de `config.algorithm`; producao usa a fabrica.
    - Trocar o algoritmo durante a simulacao foi permitido por DEC-37 (#25);
      a fabrica concentra a resolucao e vira resolvedor na #26.
    - Empate de prioridade no corte de CPUs segue DEC-16 e, se residual, o
      sorteio de DEC-27 (#20); nao cai mais na ordem do arquivo.
- Revista por DEC-39: o item 2 muda. A fabrica passa o registro inteiro
  (`{ policies }`) e o `Simulator` busca a politica pelo algoritmo vigente a
  cada despacho; a alternativa "resolvedor no motor" foi adotada, porque a
  troca de algoritmo durante a simulacao passou a existir. O motor continua
  sem ramificar pelo nome (DEC-01), e a politica unica injetada continua
  valendo para os testes do motor.

### DEC-26: Sem testes de escalonabilidade

- Estado: aceita em 2026-10-24 (decidida pelo usuario na #22). Requisitos:
  REQ-07; afeta a apresentacao (REQ-09, REQ-10).
- Decisao:
    1. O simulador nao calcula nem exibe utilizacao, limite de RM
       (U <= n(2^(1/n) - 1)), limite de EDF (U <= 1) ou qualquer veredito de
       escalonabilidade. O resultado mostrado e a propria simulacao: Gantt,
       perdas de prazo e tempo de CPU desligada.
    2. Texto do aplicativo, da documentacao ou da demonstracao (#45) que
       citar esses testes deixa claro que os limites de um processador, com
       prazo igual ao periodo, nao garantem nada com varias CPUs, prazo
       diferente do periodo ou aperiodicas, e que uma simulacao finita sem
       perda de prazo nao prova escalonabilidade.
- Justificativa: o enunciado pede RM e EDF (A.4), nao testes de
  escalonabilidade. Com fila global e varias CPUs (REQ-02), prazo diferente
  do periodo e aperiodicas (DEC-09, DEC-10, DEC-17), os limites da secao 2.4
  da referencia teorica podem aprovar conjuntos que perdem prazo e reprovar
  conjuntos que cumprem; exibi-los convidaria a le-los como garantia.
- Alternativas descartadas:
    - Exibir so a utilizacao, com ressalva: informacao sem uso definido no
      enunciado.
    - Exibir utilizacao e limites de RM/EDF com aviso: mais trabalho na E5 e
      risco de leitura como garantia mesmo com o aviso.
- Consequencias:
    - A interface (E5) nao tem painel nem indicador de escalonabilidade.
    - Analise de escalonabilidade para varios processadores fica fora do
      escopo; exibir qualquer teste exige nova DEC.

### DEC-27: Sorteio do empate residual pelo motor

- Estado: aceita em 2026-10-24 (decidida pelo usuario na #20). Requisitos:
  REQ-07, REQ-04 (A.4.3). Detalha DEC-06, DEC-07, DEC-13, DEC-16 e DEC-22.
- Decisao:
    1. A politica so relata o empate: `PolicyDecision.tie` traz os jobs
       iguais em prioridade e nos quatro criterios de DEC-16 que cruzam o
       corte de CPUs e quantas vagas restam (`slots`). Sem `tie`, `selected`
       e completo. `checkDecision` confere que os empatados sao candidatas,
       sem repeticao, fora de `selected`, com `1 <= slots < empatados` e
       `selected + slots = min(cpuCount, candidatas)`.
    2. O motor sorteia: gerador mulberry32 em [draw.ts](../src/core/draw.ts),
       semente fixa `DRAW_SEED`, estado em `SimulationState.drawState`,
       copiado em todo snapshot. O grupo e ordenado por ID da tarefa e indice
       do job antes do sorteio, de modo que o resultado so depende dos membros
       e do estado.
    3. Um evento `tie-break` por vencedor, no instante da selecao, com todo o
       grupo em `candidates`, listado na mesma ordem (ordem de apresentacao,
       nao desempate); sempre registrado, inclusive quando o vencedor
       ja executava (varios jobs em execucao empatados em todos os
       criterios). Na lista, vem apos as ativacoes e antes dos eventos por
       CPU do despacho (DEC-22).
- Justificativa: o motor ja guarda tudo que entra no snapshot, e politicas
  continuam funcoes puras da visao congelada (DEC-13). Semente fixa repete os
  sorteios para a mesma configuracao sem mudar o formato do arquivo (REQ-06).
  Registrar todo sorteio deixa visivel cada escolha aleatoria (REQ-04).
- Consequencia: um passo que falha descarta tambem o avanco do gerador
  (DEC-14). Restaurar snapshots (#23, #24) repete os sorteios por levar
  `drawState`.
- Consequencia (acordada com o usuario em 2026-10-27, na revisao do PR #85):
  os vencedores sao acrescentados a selecao depois dos selecionados sem
  empate, na ordem sorteada. Pela DEC-07, um vencedor que ja executava mantem
  a CPU, e os demais ocupam as CPUs livres restantes nessa ordem, por ID de
  CPU. Justificativa: estende a ordem da selecao (DEC-13) ao sorteio, sem novo
  criterio. Coberta em `src/core/scenarios.test.ts` (#21).
- Alternativas descartadas:
    - Politica sorteia recebendo o gerador: poe estado mutavel no contrato,
      contra DEC-13.
    - Semente configuravel (muda o formato do arquivo e a edicao) ou derivada
      da configuracao (qualquer edicao muda todos os sorteios).
    - Evento com `winners[]`: muda o tipo do evento sem ganho para o Gantt.
    - Registrar so quando o vencedor (re)comeca: um sorteio que mantem o job
      na CPU ficaria sem marca.

### DEC-28: Validacao da configuracao em fonte unica

- Estado: aceita em 2026-10-27 (escolha do usuario na #79). Requisitos:
  REQ-05, REQ-07. Detalha DEC-15 e DEC-25; erros seguem DEC-24.
- Decisao:
    1. `requireValidConfig(config)`, em [config.ts](../src/core/config.ts),
       devolve a copia validada de `validateConfig` ou lanca
       `ConfigValidationError` com todos os problemas. E o unico ponto que
       converte configuracao rejeitada nesse erro.
    2. O construtor do `Simulator` e a fabrica `createSimulator`, quando o
       algoritmo nao tem politica no registro, chamam essa funcao antes de
       qualquer erro de politica. A fabrica nao valida no caminho de
       sucesso; o construtor continua validando (DEC-15).
- Justificativa: achado 7 da revisao do PR #75. A regra "configuracao
  invalida antes de politica ausente" vivia em dois lugares; se a validacao
  ou a classificacao do erro mudasse so em um, a fabrica podia relatar um
  erro diferente do `Simulator`.
- Alternativas descartadas:
    - Manter a duplicacao entre o construtor e a fabrica (estado antes
      desta decisao).
    - Registro ou resolvedor no `Simulator`: reabre DEC-01 e DEC-25 e muda
      os testes do motor.
    - Validar somente na fabrica e construir o `Simulator` sem revalidar:
      enfraquece a garantia de DEC-15 no construtor publico.

### DEC-29: Periodo padrao com aviso para aperiodicas no Projeto A

- Estado: aceita em 2026-10-28 (escolhas do usuario na #87, que tambem
  resolveram Q-08). Requisitos: REQ-03, REQ-06, REQ-10. Revisa DEC-09 na
  parte que substituia A.4.4 e DEC-10 quanto ao periodo ausente; mantem
  DEC-17 no nucleo. Confirmacao do professor sobre A.4.4 nao obtida.
- Decisao:
    1. Periodo padrao de tarefa no Projeto A: 15 ticks.
    2. Carga de configuracao (arquivo): tarefa com periodo ausente (campo
       vazio, DEC-10) ou zero explicito, que A.3.3 define como aperiodica,
       recebe o periodo padrao e passa a ser periodica (DEC-09: ate dez
       jobs). Cada caso gera um aviso, nao um erro: identifica a tarefa (ID
       e linha, DEC-19), diz que toda tarefa precisa de periodo maior que
       zero e que a tarefa usara o periodo padrao. A carga prossegue e as
       demais validacoes da tarefa seguem normalmente.
    3. Telas (A.3.2): tarefa criada parte do periodo padrao; periodo zero
       informado pelo usuario e rejeitado com o motivo, sem alterar o
       estado (REQ-10).
    4. A conversao fica na fronteira de carga e na validacao das telas, nao
       no nucleo nem como filtro do renderer. O nucleo continua aceitando
       periodo zero com um unico job (DEC-09) e a menor prioridade RM
       (DEC-17), base para o Projeto B; no Projeto A nenhuma configuracao do
       usuario chega a ele com periodo zero.
- Justificativa: A.4.4 manda que aperiodicas no Projeto A sejam "ignoradas e
  essa situacao deve ser reportada ao usuario de forma clara"; A.3.3 define o
  formato do arquivo, comum aos dois projetos, e o significado de periodo
  zero, nao que o Projeto A o execute. DEC-09 invocava A.3.3 sem discutir
  A.4.4 (achado da revisao pos-E2). O usuario escolheu ignorar a
  aperiodicidade, e nao a tarefa: a tarefa do arquivo continua demonstravel
  como periodica e o aviso cumpre o reporte claro exigido. Esta leitura se
  afasta da letra de A.4.4 ("ignoradas"), registrada aqui como divergencia
  consciente a confirmar com o professor.
- Alternativas descartadas:
    - Manter DEC-09/DEC-17 para o Projeto A: contraria A.4.4.
    - Descartar a tarefa aperiodica com aviso, com erro de "nenhuma tarefa"
      se todas fossem aperiodicas: proposta inicial desta decisao, trocada
      pelo usuario pelo periodo padrao.
    - Remover periodo zero do nucleo: reescreve DEC-09, DEC-17 e testes que o
      Projeto B precisara restaurar.
- Consequencia: o aviso faz parte do resultado da carga e precisa chegar a
  interface (#33, #36); periodo ausente deixa de indicar aperiodica no
  resultado da carga (#32). Implementacao: carga com periodo padrao e aviso
  na #89; padrao em tarefa nova, recusa de periodo zero e exibicao dos
  avisos na #36 (configuracao inicial); recusa em edicao e inclusao durante
  a simulacao na #37. Detalhe de implementacao da #89, sem nova decisao:
  `DEFAULT_TASK_PERIOD` em `domain.ts`; a conversao ocorre antes do
  `validateConfig`, que valida a tarefa ja com periodo 15 (inclusive o prazo
  da ultima ativacao); avisos `ConfigLoadWarning` (`taskId`, `line`, `field`,
  `value`, `message`) so no resultado de sucesso, pois so a configuracao
  carregada usa o padrao.

### DEC-30: Limite pratico do comprimento da simulacao

- Estado: aceita em 2026-10-28 (escolha do usuario na #88). Requisitos:
  REQ-04, REQ-09. Complementa DEC-05, DEC-10 e DEC-14; nao muda contrato nem
  comportamento.
- Decisao: simulacoes longas nao sao suportadas na pratica e o custo de
  memoria do historico nao sera otimizado. Nenhum limite e imposto no codigo:
  "sem teto arbitrario" (DEC-05, DEC-10, A.2.4) continua valendo como
  ausencia de corte artificial, e o limite real e o recurso da maquina,
  ja previsto na limitacao de DEC-05.
- Causa: cada tick guarda um snapshot completo (REQ-04, DEC-11) e o passo
  trabalha sobre uma copia (DEC-14). Eventos e trechos de execucao acumulam
  no estado, entao cada snapshot cresce com o comprimento da simulacao e a
  memoria do historico cresce de forma aproximadamente quadratica.
- Medicoes (heap apos a simulacao, RM, 2 CPUs, 3 tarefas):

    | ticks  | revisao pos-E2 (Node 24.21.0) | reproducao #88 (Node 24.22.1) |
    | ------ | ----------------------------- | ----------------------------- |
    | 1.000  | 0,2 s, 99 MB                  | 0,1 s, 39 MB                  |
    | 4.000  | 1,9 s, 454 MB                 | 1,1 s, 254 MB                 |
    | 10.000 | 10 s, 2,2 GB                  | 5,7 s, 1,3 GB                 |
    | 20.000 | abortado por falta de memoria | nao executado                 |

    A revisao pos-E2 (2026-10-27) nao registrou as tarefas usadas. A
    reproducao de 2026-10-28 usou tarefas com ingresso 0 e (duracao, periodo =
    prazo) de (300, 1000), (500, 1500) e (800, 2500), `createSimulator` e
    `tick()` repetido, heap medido apos `gc()`; script fora do repositorio. As
    duas series diferem em valor absoluto, mas crescem do mesmo modo.

- Justificativa: o Gantt exportado (REQ-09, DEC-08) fica ilegivel acima de
  cerca de 30 ticks, entao cenarios realistas de demonstracao ficam ordens
  de grandeza abaixo da faixa problematica. Otimizar o historico (snapshots
  incrementais, compartilhamento estrutural) custaria complexidade em REQ-04
  sem beneficio para esses cenarios.
- Alternativas descartadas:
    - Reduzir a memoria do historico agora: fora do escopo acordado na #88.
    - Impor teto de ticks no codigo: seria o teto arbitrario que DEC-05 e
      DEC-10 rejeitam.
- Consequencia: falta de memoria em simulacao muito longa e limitacao
  conhecida, nao defeito. Rever esta decisao se a #23 (estrutura do
  historico) ou a #27 (execucao completa) exigir simulacoes longas.

### DEC-31: Periodo ausente na linha da tarefa

- Estado: aceita em 2026-10-29 pelo usuario (#32). Requisitos: REQ-06,
  REQ-03. Detalha DEC-10 (somente periodo pode faltar e equivale a zero) e
  DEC-20 (campos por posicao).
- Decisao:
    1. Periodo ausente e o campo vazio, ou so com espacos, na sua posicao
       (`1;F0E0D0;0;5;;10`). O parser o entrega como zero, igual ao zero
       explicito, e os eventos apos o prazo continuam valendo
       (`1;F0E0D0;0;5;;10;ML1:3`).
    2. Linha com menos de seis campos continua erro de campo obrigatorio
       ausente (DEC-19), mesmo quando so o periodo poderia faltar.
- Justificativa: a posicao e o unico sinal sem ambiguidade. Em
  `1;F0E0D0;0;5;10` nao se sabe se faltou o periodo ou o prazo; adivinhar
  criaria uma tarefa diferente da pretendida sem aviso.
- Consequencia: o texto recebido do periodo no mapa do parser
  (`taskTexts`) fica vazio para essa tarefa. Periodo zero, ausente ou
  explicito, recebe o periodo padrao com aviso na carga pela #89 (DEC-29).

### DEC-32: Codificacao do arquivo de configuracao

- Estado: aceita em 2026-10-31 pelo usuario (#33); revisao da PR #99 (byte
  NUL) aceita em 2026-10-31. Requisitos: REQ-06, REQ-10. Detalha DEC-19 (item 4, falhas de leitura) e DEC-20 (item 3, BOM).
- Decisao:
    1. O arquivo de configuracao precisa estar em UTF-8. Texto so ASCII e
       UTF-8 valido. A marca BOM inicial continua aceita (DEC-20).
    2. A decodificacao e estrita: qualquer sequencia de bytes que nao seja
       UTF-8 valido rejeita o arquivo inteiro. Nenhum byte e trocado por
       `�` e nenhuma outra codificacao e tentada; arquivo em Latin-1,
       Windows-1252 ou UTF-16 e rejeitado. UTF-16 sem BOM so com caracteres
       ASCII forma bytes UTF-8 validos; por isso um byte NUL, que nunca
       aparece numa configuracao, tambem rejeita o arquivo (revisao da
       PR #99).
    3. A rejeicao e erro de leitura (DEC-19, item 4), nao de conteudo: informa
       o caminho e que o arquivo nao esta em UTF-8, sem linha nem campo, e o
       parser nao recebe texto. Exemplo: `Nao foi possivel ler o arquivo
       "<caminho>": o conteudo nao esta em UTF-8. Salve o arquivo como UTF-8
       e tente novamente.`
- Justificativa: A.3.3.6 exige mostrar o motivo da falha de carga. Decodificar
  com substituicao deixaria `�` em diagnosticos de conteudo (por exemplo,
  em cores ou eventos) e o usuario veria um erro de sintaxe que nao explica
  a causa real. Rejeitar indica a correcao direta: salvar em UTF-8.
- Alternativas descartadas:
    - Decodificar com substituicao (`�`): esconde a causa e pode carregar
      um arquivo diferente do que o usuario escreveu.
    - Detectar e converter outras codificacoes: heuristica sujeita a erro e
      exigiria dependencia extra, sem pedido no enunciado.
- Consequencia: o processo principal le os bytes e decodifica com um
  decodificador estrito (por exemplo, `TextDecoder('utf-8', { fatal: true })`);
  a interface recebe so o texto ou o motivo da falha. Arquivo vazio e UTF-8
  valido e segue para o parser.

### DEC-33: API de carga do arquivo de configuracao

- Estado: aceita em 2026-10-31 pelo usuario (#33, PR #99); revisao da PR #99
  (remetente, dialogo unico, `too-large` com limite de 1 MiB, motivo sem
  caminho) aceita em 2026-10-31. Requisitos: REQ-06, REQ-10. Detalha DEC-19 (itens 4 e 5), DEC-24 e DEC-32.
- Decisao:
    1. A interface recebe somente `window.configFile.openConfigFile()`, sem
       argumentos. O preload invoca o canal `config-file:open` sem argumentos
       e o processo principal nao le argumento do renderer: a interface so
       alcanca o arquivo escolhido no dialogo. O processo principal so atende
       o quadro principal da pagina do proprio app (servidor de
       desenvolvimento pela origem, pacote pelo `index.html` exato) e rejeita
       outros remetentes. Um pedido com o dialogo ainda aberto recebe o mesmo
       resultado, sem abrir outro dialogo (revisao da PR #99).
    2. O dialogo nativo aceita qualquer nome, sem filtro de extensao
       (A.3.3.4), e tem como pai a janela que pediu.
    3. O resultado (`ConfigFileResult` em `src/shared/configFile.ts`) e
       `loaded` (caminho e texto, sem BOM), `canceled` (cancelar, ou dialogo
       sem caminho) ou `failed` (caminho, motivo e mensagem pronta para
       exibir). A carga nunca rejeita por falha de leitura. Remetente nao
       confiavel (item 1) rejeita o pedido sem resultado: nao e falha de
       leitura e nao ocorre com a interface do app.
    4. Motivos e mensagens de `failed` (`<p>` e o caminho escolhido):

        | motivo              | causa             | mensagem                                                                                                            |
        | ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------- |
        | `not-found`         | `ENOENT`          | `Não foi possível abrir o arquivo "<p>": o arquivo não foi encontrado.`                                             |
        | `permission-denied` | `EACCES`, `EPERM` | `Não foi possível abrir o arquivo "<p>": permissão negada.`                                                         |
        | `is-directory`      | `EISDIR`          | `Não foi possível abrir o arquivo "<p>": o caminho é um diretório, não um arquivo.`                                 |
        | `too-large`         | mais de 1 MiB     | `Não foi possível abrir o arquivo "<p>": o arquivo tem mais de 1 MiB e não parece ser uma configuração.`            |
        | `not-utf8`          | UTF-8 invalido    | `Não foi possível ler o arquivo "<p>": o conteúdo não está em UTF-8. Salve o arquivo como UTF-8 e tente novamente.` |
        | `unknown`           | outro erro        | `Não foi possível ler o arquivo "<p>": <motivo do sistema>.`, ou `erro desconhecido` sem motivo                     |

        O limite de tamanho e checado antes da leitura e so evita carregar
        inteiro no processo principal, e enviar pela IPC, um arquivo grande
        escolhido por engano; uma configuracao real tem poucas linhas. O
        `<motivo do sistema>` omite o sufixo `, <syscall> '<caminho>'` do Node,
        pois o caminho ja esta na frase (revisao da PR #99).

    5. Falha do proprio dialogo (rejeicao de `showOpenDialog`) nao e falha de
       leitura: nao ha caminho, e o erro chega a interface como inesperado
       (DEC-24).
- Justificativa: sem caminho vindo da interface, um renderer comprometido nao
  le arquivos arbitrarios. A mensagem pronta mantem as frases de DEC-19 num
  so lugar, e o motivo em codigo permite a #36 tratar casos sem analisar
  texto. Cancelar como resultado proprio evita confundir com erro.
- Consequencia: o texto carregado segue para `loadConfig`; a #36 exibe
  `message` das falhas e ignora `canceled`.

### DEC-34: Diagnosticos tipados na fronteira de carga

- Estado: proposta em 2026-10-31 na #92. Requisitos: REQ-06, REQ-10. Preserva
  DEC-19 e complementa DEC-29; requer revisao do usuario antes de fechar a
  issue.
- Decisao: todo `ConfigParseIssue` expoe `origin` (`syntax`, `core` ou
  `default-period`) e `valueKind` (`received`, `missing` ou `combined`). O
  campo `value` permanece `string | null` e as mensagens de DEC-19 nao mudam.
  `loadConfig` preserva os avisos de conversao para periodo 15 no resultado de
  falha semantica, junto dos problemas do nucleo; falhas de sintaxe nao geram
  avisos porque a conversao nao e aplicada.
- Justificativa: `null` representa tanto valor ausente quanto a ausencia de um
  unico valor responsavel por um problema combinado. Metadados estruturais
  evitam que consumidores dependam do texto da mensagem e deixam explicita a
  origem do diagnostico. Transportar o aviso na falha informa qual periodo o
  nucleo validou, sem tratar a conversao como erro.
- Alternativas descartadas: trocar `value` por uma uniao estruturada, o que
  quebraria consumidores de DEC-19; alterar as mensagens para codificar a
  distincao; ou descartar avisos quando a validacao falha, como fazia DEC-29.
- Limite: a decisao cobre a fronteira `loadConfig`; falhas de leitura do
  arquivo e a ponte main/preload da #33 mantem seus contratos proprios, e a
  exibicao continua fora do escopo da #92 (#36).

### DEC-35: Historico com cursor e restauracao

- Estado: aceita em 2026-10-31 (acordado com o usuario na #23). Requisitos:
  REQ-04. Complementa DEC-06, DEC-11, DEC-12 e DEC-14.
- Decisao: o `Simulator` mantem privado um `SnapshotHistory`
  (`src/core/history.ts`) com os snapshots e o cursor, cujo indice e o
  relogio do snapshot (DEC-11). O historico so acrescenta passo com o cursor
  no ultimo e nunca altera nem descarta um passo; a classe nao conhece o
  motor, para que #24 e #26 mudem o historico num so lugar. `restore(step)`
  torna o estado vivo
  uma copia mutavel do snapshot (`restoreState`), sem alterar snapshots;
  passo nao registrado (nao inteiro, negativo ou alem do ultimo) e recusado
  com `RangeError` e nada muda. `getCursor()` e `getCurrentSnapshot()` leem a
  posicao; `getLatestSnapshot()` fica inalterado.
- Avanco: `tick()` com o cursor atras do ultimo passo e recusado; desde a #24
  a recusa e `SimulationRefusal` com a mensagem `O passo ${cursor + 1} já foi
  calculado; use forward() em vez de tick().` e o futuro registrado e
  reutilizado por `forward()` (DEC-36). Descartar o futuro fica na #26; a #23
  nao conhece edicoes.
- Prova: teste copia o estado vivo instalado por `restore(k)` num simulador
  novo cujo historico termina em k (`continueFrom`, acesso privado so no
  teste), avanca e compara com o k+1 registrado, inclusive eventos e
  `drawState`. Copiar o estado vivo, e nao recalcula-lo do snapshot, deixa a
  prova sensivel ao que `restore` instala. Roda em dois cenarios: empates
  residuais (muda `drawState` e registra `tie-break`) e progresso parcial
  (quantum 2, 2 CPUs, 4 tarefas: fatia e execucao parciais, preempcao,
  expiracao de quantum e perda de prazo). Mutacoes em `restore` conferidas:
  limpar eventos, semear `drawState`, nao restaurar, zerar `sliceElapsed` e
  zerar `executed` de jobs incompletos; todas derrubam a prova. A cobertura
  vale para os campos que esses cenarios exercitam.
- Memoria: copia integral por passo continua (DEC-30); a #23 nao acrescenta
  copias por passo (restaurar copia uma vez por chamada). `restoreState`
  compartilha a `config` e cada `definition` congeladas, em vez de usar
  `deepCopy`, que devolve valores congelados sem copiar. Medicao no branch
  da #23 (2026-11-01, Node 24.22.1 de `devEngines`), com a carga de DEC-30
  (RM, quantum 5, 2 CPUs, ingresso 0, (duracao, periodo = prazo) de
  (300, 1000), (500, 1500) e (800, 2500)), `createSimulator` e `tick()`
  repetido, heap apos `gc()`; script fora do repositorio:

    | ticks | tempo | heap   | media por snapshot |
    | ----- | ----- | ------ | ------------------ |
    | 30    | 0,0 s | 0,4 MB | 14 KB              |
    | 1.000 | 0,1 s | 24 MB  | 24 KB              |
    | 2.000 | 0,3 s | 75 MB  | 38 KB              |
    | 4.000 | 1,1 s | 248 MB | 62 KB              |

    Em 4.000 ticks o valor fica proximo dos 254 MB de DEC-30 (mesmas tarefas e
    versao); a media cresce com o comprimento, como DEC-30 descreve. Nas
    cerca de 30 ticks de uso realista o historico ocupa menos de 1 MB, o que
    mantem a decisao. A tabela do PR #106 (Node 25.8.0, codigo de outra
    abordagem, tarefas nao registradas) foi substituida por esta, por nao ser
    reproduzivel nas condicoes de `devEngines`.

- Revista por DEC-39: o historico guarda a lista de edicoes de cada passo e
  descarta passos so por `rewrite`, que troca o passo editado e apaga os
  seguintes com suas edicoes; "descartar o futuro fica na #26" foi feito na
  #115. `append` continua recusado com o cursor atras do ultimo passo.
- Alternativas descartadas: expor recalculo/descarte publico na #23 (fora do
  escopo; pertence a #24/#26). PR #106 (mesma issue) fazia `tick()` atras do
  cursor descartar os passos seguintes e `getLatestSnapshot()` devolver o
  passo do cursor; descartado por antecipar a #26, poder apagar passos
  registrados por um `tick()` e mudar o contrato usado pelo renderer. Dele
  foi aproveitada a classe de historico separada.

### DEC-36: Navegacao no historico e recusas

- Estado: aceita em 2026-11-01 (acordado com o usuario na #24). Requisitos:
  REQ-04, REQ-10. Complementa DEC-06, DEC-11, DEC-24 e DEC-35.
- Decisao: navegar e calcular sao comandos separados no `Simulator`.
  `forward()` move o cursor ao proximo passo registrado e `backward()` ao
  anterior, ambos por `restore` (DEC-35), reutilizando o snapshot gravado sem
  consultar a politica nem o sorteio. `canForward()` diz se ha passo
  registrado a frente do cursor. `tick()` so calcula a partir do ultimo
  passo (DEC-11).
- Recusas: pedido impossivel lanca `SimulationRefusal`
  (`src/core/refusal.ts`) antes de mudar qualquer coisa, com as mensagens:
    - `backward()` no passo 0: `O passo 0 é o primeiro passo registrado; não há passo anterior para voltar.`;
    - `forward()` no ultimo passo k: `O passo ${k} é o último passo registrado; use tick() para calcular o passo ${k + 1}.`;
    - `tick()` com o cursor k atras: `O passo ${k + 1} já foi calculado; use forward() em vez de tick().`.
- Interface: `AppError` ganha a categoria `refused` (DEC-24), que fica so no
  resultado do comando, fora do banner. `useSimulation` expoe `forward`,
  `backward` e `next`, que chama `forward` quando `canForward()` e `tick` no
  ultimo passo, para um unico botao "proximo" na #36; `view` e
  sempre o snapshot do cursor (`getCurrentSnapshot`).
- Fora: recusar `tick()` quando todas as tarefas terminaram (#27); botoes e
  atalhos (#36).
- Prova: `src/core/simulator.navigation.test.ts` retrocede ate 0 e avanca ate
  o fim no cenario de empates residuais, conferindo o mesmo objeto de cada
  passo, relogio igual ao cursor, nenhuma consulta a politica e snapshots
  iguais a copias tiradas antes (eventos `tie-break` e `drawState`); `tick()`
  apos navegar iguala uma execucao direta. Recusas testadas sem mudanca de
  cursor ou snapshot, inclusive repetidas e no simulador vazio.
  `useSimulation.test.ts` e `errors.test.ts` cobrem `next`, `refused` fora do
  banner, `load` apos retroceder e falha de `next` no ultimo passo.
- Alternativas descartadas: um unico "avancar" no nucleo que calcula no fim
  (o usuario separou navegar de calcular); ir direto a um passo k (nao
  necessario); recusa como `unexpected` (o banner e reservado a bugs).

### DEC-37: Edicao durante a simulacao

- Estado: aceita em 2026-11-01 pelo usuario no PR #101. Proposta em
  2026-10-31 na #25 e reescrita em 2026-11-01 com as escolhas do usuario,
  depois da revisao adversarial do PR #101, que achou contradicoes na
  versao anterior (despacho corrigido depois de feito, sorteio refeito a
  cada edicao, remocao de tarefa com historico, CPUs removidas); o estado
  por tarefa passou a valer para o job mais antigo incompleto quando a
  DEC-38 foi retirada. Numerada DEC-32 e depois DEC-35 durante o PR #101;
  renumerada no merge com a `main`, onde DEC-35 e o historico com cursor
  (#23). Referencias a "DEC-35" no PR #101, na #11, na #12 e nas issues
  #26, #37 e #38 anteriores a renumeracao sao a esta decisao. Revista em
  2026-11-01 pelo usuario na #26: dentro de um tick so o resultado final das
  edicoes conta (item 5 de "Quando e como a edicao vale"); antes cada edicao
  registrava seus eventos. Requisitos:
  REQ-05, REQ-07, REQ-08,
  REQ-09. Resolve Q-02 e a pendencia de suspensao de DEC-12. Mantem o
  calendario de DEC-09 e a elegibilidade de DEC-02.
- Contexto: o enunciado pede que o usuario mude o estado atual ou as
  caracteristicas de qualquer tarefa em qualquer passo (requisito geral 4,
  A.1.5.2, A.3.4) e configure o sistema durante a simulacao: conjunto de
  tarefas, caracteristicas de cada tarefa e algoritmo (A.3.1). Mudanca que
  nao faca sentido, nao possa ser aplicada ou seja semanticamente invalida e
  recusada com o motivo (A.3.1, A.3.4). Toda edicao abaixo pode ser pedida;
  cada pedido e aceito com efeito definido ou recusado com motivo. As
  recusas sao as previstas nesses itens do enunciado, nao desvios dele.
- Principio: o passado nao muda. Trechos, eventos e jobs anteriores ao
  instante da edicao ficam como foram registrados. A unica excecao e a cor,
  que e apresentacao e nao fato da simulacao.

#### Quando e como a edicao vale

1. Edicao feita no tick `t` vale de `t` em diante, inclusive em [t, t+1),
   que o snapshot `t` ja mostra planejado (DEC-11). Editar num tick anterior
   ao ultimo calculado descarta os snapshots posteriores (REQ-05).
2. O motor nao corrige o despacho ja feito em `t`: recalcula o passo de
   `t-1` para `t` a partir do snapshot `t-1`, com as edicoes de `t`
   aplicadas numa etapa propria (Fluxo de um passo), depois das conclusoes,
   perdas de prazo e ativacoes de `t`: a edicao e julgada sobre o estado que
   o usuario ve no snapshot `t` antes do despacho (FE-11, escolha do autor).
   Assim, o job ativado em `t` ja conta para as regras abaixo. No
   tick 0 parte do estado inicial. Estado do sorteio, CPU de cada job em [t-1, t) e consumo
   das fatias vem do snapshot `t-1`; o resultado depende so dele e das
   edicoes, nao de quantas vezes se editou (DEC-06, DEC-27).
3. Varias edicoes no mesmo tick acumulam: o historico guarda a lista de
   edicoes aceitas de cada tick, e cada nova edicao recalcula o tick com a
   lista inteira, na ordem em que foram aceitas. O tick `t` continua com um
   unico snapshot. Descartar o futuro descarta tambem as edicoes dos ticks
   descartados.
4. Uma edicao (um envio de formulario) pode ter varios itens, validados em
   ordem sobre o estado da etapa de edicao, depois das edicoes anteriores do
   tick. Qualquer item recusado recusa a edicao inteira, sem aplicacao
   parcial; a mensagem cita cada item recusado e o motivo (REQ-05).
5. Dentro de um tick so o resultado final das edicoes conta (escolha do
   usuario na #26). A etapa de edicao compara o estado de cada tarefa e os
   parametros do sistema antes das edicoes do tick com o estado depois de
   todas elas, e aplica e registra so essa mudanca liquida, com os efeitos
   e eventos da transicao liquida nas tabelas abaixo. Exemplos no tick `t`:
    - suspender e voltar a pronta: sem efeito e sem evento; o job mantem a
      CPU e a fatia;
    - forcar e depois suspender: pronta para suspensa, so `suspension`;
    - periodo 5 mudado para 8 e de volta para 5: sem efeito, nenhuma
      ativacao causada pela edicao;
    - suspender em `t` e retomar em `t+1`: ticks diferentes, `suspension`
      em `t` e `resumption` em `t+1`.

    Assim o snapshot `t` so depende do snapshot `t-1` e do estado final
    pedido, nao de quantas edicoes houve nem de como foram divididas.
    Excecao: o ID gerado por uma inclusao fica usado mesmo que a tarefa
    seja excluida no mesmo tick, e a tarefa nao deixa outro rastro
    (escolha do autor, para que a numeracao nao dependa de edicoes
    posteriores no mesmo tick).

#### Estado da tarefa

O estado editavel e o da tarefa, nao o do job. Ele vale para o job atual da
tarefa, o mais antigo incompleto, que e o unico elegivel (DEC-02). Jobs
posteriores ja ativados continuam pendentes, com prazo correndo, e herdam o
estado da tarefa quando passam a ser o job atual. O calendario de ativacoes
nao muda (DEC-09). Estados que o usuario escolhe:

| Estado     | Significado                                                                   |
| ---------- | ----------------------------------------------------------------------------- |
| pronta     | a politica decide; a tarefa pode estar executando por prioridade              |
| executando | forcada: o job atual ocupa uma CPU, sem passar pela politica                  |
| suspensa   | fora da disputa por CPU; o prazo dos jobs ativados continua correndo (REQ-08) |
| concluida  | encerrada: jobs incompletos interrompidos e nenhuma nova ativacao             |

| De \ Para  | pronta     | executando    | suspensa           | concluida  |
| ---------- | ---------- | ------------- | ------------------ | ---------- |
| pronta     | sem efeito | forca         | suspende           | encerra    |
| executando | desforca   | sem efeito    | desforca, suspende | encerra    |
| suspensa   | retoma     | retoma, forca | sem efeito         | encerra    |
| concluida  | recusado   | recusado      | recusado           | sem efeito |

1. Mudanca para o proprio estado e aceita sem efeito e sem evento. A tela
   distingue o estado escolhido do observado: tarefa pronta que executa por
   prioridade nao e forcada.
2. O estado vale tambem antes do ingresso e entre jobs: o proximo job ja
   nasce nele (suspenso, ou forcado e tomando CPU ao se tornar o job
   atual). Job ativado com a tarefa suspensa tem o prazo correndo desde a
   ativacao.
3. Suspensa: o job atual sai da disputa e, se ocupava CPU, a libera em `t`,
   sem `preemption` (a `suspension` explica a saida). Suspender a tarefa nao
   libera os jobs pendentes (DEC-02). Retomar devolve o job atual a disputa,
   sem garantir CPU.
4. Job que deixa sua CPU na etapa de edicao (suspensao, encerramento, CPU
   removida) perde a fatia em curso: se voltar a executar, inclusive no
   mesmo tick, comeca fatia nova (DEC-03), e a etapa de fatias vencidas nao
   o considera. Escolha do autor. Vale pela mudanca liquida do tick (item 5
   de "Quando e como a edicao vale"): suspender e retomar no mesmo tick nao
   tira o job da CPU.
5. Executando (forcada):
    1. Tarefas forcadas nao concluidas sao no maximo tantas quantas CPUs;
       forcar alem disso e recusado. Forcada sem job incompleto conta no
       limite. Forcar nao paraleliza a tarefa: so o job atual recebe CPU.
    2. Jobs forcados recebem CPU antes da politica. A politica escolhe entre
       os demais jobs elegiveis para as CPUs restantes (DEC-13 com o total de
       CPUs menos os jobs forcados). Job que perde a CPU para um forcado
       registra `preemption` por ele.
    3. Atribuicao (DEC-07): job forcado ou selecionado que ocupava uma CPU
       em [t-1, t) a mantem; os demais ocupam as CPUs livres, forcados
       primeiro e depois na ordem da selecao, por ID de CPU.
    4. Quantum nao se aplica ao job forcado: nao ha `quantum-expired`. Ao
       deixar de ser forcado, se continuar na CPU, comeca fatia nova.
    5. A tarefa continua forcada nos jobs seguintes, ate o usuario move-la
       para pronta ou suspensa, ou ate concluir. Perdas de prazo continuam
       registradas. Forcadas podem deixar as demais sem CPU; a simulacao
       termina porque cada tarefa tem no maximo dez jobs.
6. Concluida (encerrar): permitido a qualquer instante para tarefa nao
   concluida, inclusive antes do ingresso. Todos os jobs incompletos (o
   atual e os pendentes) sao interrompidos em `t`, sem `completion`, e o
   atual libera a CPU; nao ha novas ativacoes. Registra `task-finished` em
   `t` com os jobs interrompidos. Perdas de prazo registradas ate `t`,
   inclusive a de `t` (registrada antes da etapa de edicao), permanecem; um
   job ativado em `t` tambem e interrompido. Jobs interrompidos nao geram
   perdas depois. A inspecao mostra os jobs como interrompidos, nao
   concluidos. E final: nenhuma mudanca de estado depois, e das
   caracteristicas so a cor.
7. Primeiro desempate (A.4.3 (1), DEC-18): vale para o job que executou em
   [t-1, t) e continua na disputa, inclusive o que perdeu a CPU removida ou
   deixou de ser forcado. Nenhuma edicao retira esse criterio.

#### Caracteristicas da tarefa

| Item             | Editavel                      | Efeito                                      |
| ---------------- | ----------------------------- | ------------------------------------------- |
| ID               | nao                           | identidade da tarefa e ordem do Gantt       |
| Cor              | sim, inclusive concluida      | todo o Gantt da tarefa, inclusive o passado |
| Ingresso         | so antes da primeira ativacao | reagenda o calendario da tarefa             |
| Duracao          | sim                           | a partir da proxima ativacao                |
| Prazo relativo   | sim                           | a partir da proxima ativacao                |
| Periodo          | sim                           | proximas ativacoes; prioridade RM imediata  |
| Ticks executados | nao                           | progresso so muda executando                |

1. Cor: hexadecimal valida e diferente da cor de qualquer outra tarefa da
   simulacao, inclusive concluidas (A.2.1); tarefa excluida nao conta.
2. Ingresso: so antes da primeira ativacao; novo valor `>= t`, e igual a
   `t` ativa o primeiro job em `t`. Depois da primeira ativacao a edicao e
   recusada e a tela (#37) mostra o campo bloqueado, com a explicacao ao
   passar o cursor: "O ingresso nao pode ser alterado pois a tarefa ja
   ingressou."
3. Duracao e prazo relativo: jobs ja ativados (o atual e os pendentes)
   mantem a duracao e o prazo absoluto que receberam ao ativar; os novos
   valores valem a partir da proxima ativacao. Cada job guarda sua
   duracao. Tarefa que ja ativou seus dez jobs recusa duracao e prazo, pois
   nao ha proxima ativacao.
4. Periodo:
    - Antes da primeira ativacao: ativacoes em ingresso + k * novo periodo,
      com k de 0 a 9 (DEC-09).
    - Depois: proxima ativacao = ultima ativacao + novo periodo, e as
      seguintes somam o periodo vigente a anterior. A ativacao segue o
      calendario mesmo com job incompleto; o novo job fica pendente (DEC-02).
      Se a proxima ativacao ja passou, ha uma unica ativacao em `t`, e as
      seguintes vem a cada periodo a partir dela; ativacoes vencidas nao se
      acumulam. Exemplos: ultima ativacao em 10, periodo 5 mudado para 8 em
      13: proxima em 18. Mesma tarefa, periodo mudado para 2 em 13: 12 ja
      passou, entao a proxima ativa em 13 e a seguinte em 15.
    - No RM a prioridade usa o periodo vigente ja na selecao de `t`,
      inclusive para jobs ja ativados. No EDF so muda o calendario.
    - Aceito tambem depois das dez ativacoes: muda a prioridade RM dos jobs
      incompletos; no EDF fica guardado sem efeito visivel, e a tela informa.
5. Limites de DEC-10: duracao >= 1, prazo >= 1 e periodo >= 1. Periodo zero
   e recusado tambem pelo nucleo na edicao: tornar uma tarefa aperiodica
   fica para o Projeto B (DEC-29 continua valendo para a carga). O limite de
   tempos derivados e conferido sobre as ativacoes restantes, com os valores
   editados.
6. Tarefa concluida aceita somente a cor.

#### Inclusao e exclusao de tarefas

1. Incluir: a qualquer tick, com ingresso `>= t` (igual a `t` ativa em
   `t`), limites de DEC-10 e padroes de DEC-29 (periodo 15, zero recusado)
   e cor distinta. O ID e gerado: maior ID ja usado na simulacao + 1. A
   tarefa comeca pronta.
2. Excluir: somente tarefa nunca ativada. Ela sai do estado sem evento e
   sem rastro no Gantt; seu ID nao volta a ser usado. Tarefa ja ativada nao
   pode ser excluida: a recusa explica que encerrar (concluida) e o caminho,
   pois o historico dela precisa continuar no Gantt.

#### Parametros do sistema

1. Algoritmo (RM ou EDF): vale ja na selecao de `t`.
2. Quantum (>= 1): vale imediatamente. A fatia em curso conserva o consumo,
   e a etapa de fatias vencidas de `t` usa o valor novo: consumo >= novo
   quantum vence em `t`; um quantum maior pode evitar o vencimento que o
   valor antigo causaria.
3. Quantidade de CPUs (>= 1 e >= tarefas forcadas nao concluidas): aumentar
   acrescenta CPUs com os IDs seguintes ao maior vigente, reusando IDs de
   CPUs removidas; reduzir remove as de maior ID. Job de CPU removida volta
   a disputa com o primeiro desempate (item 7 do estado) e a selecao global
   decide; nao registra `preemption`, pois `cpu-removed` explica a saida.
   Como toda edicao (item 5 de "Quando e como a edicao vale"), conta somente
   a quantidade final das edicoes do tick, comparada com a de `t-1`: 4,
   depois 2, depois 4 no mesmo tick nao gera evento.
4. CPU removida: `cpu-removed` fecha o intervalo desligado aberto, se houver;
   `cpu-added` reabre a CPU, que comeca como no snapshot inicial (DEC-12:
   o despacho a marca desligada se nao tiver trabalho). O intervalo entre
   remocao e inclusao nao conta como desligado: a CPU nao existia. O Gantt
   mostra a raia com lacuna.

#### Eventos

Novos eventos, todos com `time = t`, registrados na etapa de edicao a partir
da mudanca liquida do tick (item 5 de "Quando e como a edicao vale"). Como
nas demais etapas (DEC-22), a ordem segue a lista de tarefas, com os eventos
de cada tarefa na ordem da sua transicao liquida, e depois os eventos de CPU
por ID (escolha do autor: a ordem nao depende da ordem das edicoes):

- `suspension` (`taskId`, `cpuId` ou `null`): tarefa suspensa; `cpuId` e a
  CPU liberada.
- `resumption` (`taskId`): tarefa suspensa volta a disputa.
- `forced` (`taskId`) e `unforced` (`taskId`): inicio e fim do estado
  forcado; forcada movida para suspensa registra `unforced` e depois
  `suspension`.
- `cpu-removed` (`cpuId`) e `cpu-added` (`cpuId`).
- `task-finished` ganha `interrupted` (lista de jobs): jobs incompletos
  interrompidos pelo encerramento, o atual e os pendentes; vazia no termino
  normal (DEC-09).

Sem campo de origem: no Projeto A toda mudanca de estado vem de edicao; o
Projeto B o acrescenta para a lista de eventos do arquivo (A.3.3.5). O
Gantt (#38) desenha o trecho suspenso de `suspension` ate `resumption`,
`task-finished` ou o fim do historico, e o forcado de `forced` ate
`unforced` ou `task-finished`. Ativacao em `t` causada por edicao (ingresso
ou inclusao em `t`, periodo cuja proxima ativacao ja passou) e registrada na etapa
de edicao, logo apos o evento da edicao; `quantum-expired` causado por
edicao do quantum fica na etapa de fatias vencidas, depois dela (DEC-22).

#### Fatos que o modelo passa a guardar (forma com a #26)

- Estado escolhido de cada tarefa (pronta, forcada, suspensa, concluida) e os
  jobs interrompidos pelo encerramento, sem confundi-los com jobs concluidos.
- Duracao de cada job e instante da proxima ativacao, que deixa de seguir
  `ingresso + k * periodo` depois de uma edicao de periodo. Forma na DEC-44 (`Job.duration`,
  `TaskControlBlock.nextActivation`).
- Maior ID de tarefa ja usado, inclusive de tarefa excluida, no estado de
  cada snapshot: descartar o futuro descarta tambem os IDs gerados nele
  (escolha do autor).
- No historico (#23/#24, DEC-35), a lista de edicoes aceitas de cada tick.

#### Revisoes de outras decisoes

- DEC-02: o estado da tarefa vale para o job atual; suspender ou forcar nao
  libera nem paraleliza os jobs pendentes.
- DEC-09: periodo editado recalcula as ativacoes restantes (item 4 das
  caracteristicas); termino tambem por encerramento. Forma na DEC-44.
- DEC-35 e DEC-36: o historico passa a guardar a lista de edicoes de cada
  tick e a descartar os passos e edicoes posteriores a uma edicao em tick
  anterior ao ultimo (#26, como DEC-35 ja previa); `forward()`/`backward()`
  continuam reutilizando snapshots sem recalcular.
- DEC-07 e DEC-13: jobs forcados recebem CPU antes da politica, que decide
  para as CPUs restantes; job cuja CPU foi removida continua com o primeiro
  desempate, e a visao precisa representa-lo mesmo sem a CPU.
- DEC-08: estados suspenso e forcado e lacunas de CPU no Gantt.
- DEC-10 e DEC-29: periodo zero recusado na edicao.
- DEC-12: eventos acima e estado por tarefa.
- DEC-16: o criterio (4) usa a duracao do job, que pode diferir da duracao
  vigente da tarefa. Forma na DEC-44.
- DEC-18: job forcado nao tem quantum.
- DEC-21: `cpu-removed`/`cpu-added` delimitam a existencia da CPU; a
  sequencia desligar/religar e conferida por periodo de existencia.
- DEC-22: etapa de edicao entre as ativacoes e as fatias vencidas.
- DEC-25: o motor resolve a politica pelo algoritmo vigente (forma na #26).
- Expectativas do [renderer](../src/renderer/docs/specification.md): FE-12
  (calendario do periodo), FE-13 (suspensao por tarefa), FE-14 (fora do
  Projeto A), FE-15 (exclusao so de tarefa nunca ativada), FE-19 (ID fixo).

#### Justificativa e alternativas

- Justificativa: escolhas do usuario na #25 (2026-11-01). Recalcular o tick
  a partir de `t-1`, em vez de corrigir o despacho feito (escolha do autor),
  torna o resultado independente da quantidade de edicoes e dispensa as
  excecoes da versao anterior ao primeiro desempate. Estado por tarefa
  segue o texto do enunciado e se aplica ao job atual, o unico elegivel por
  DEC-02, sem mudar o calendario de ativacoes.
- Alternativas descartadas:
    - Cada edicao do tick com seus proprios eventos (versao aceita no PR
      #101, item 4): suspender e retomar no mesmo tick deixaria dois
      marcadores de uma acao desfeita; o usuario quer so o resultado final
      (#26).
    - Estado e suspensao por job (versao de 2026-10-31): o enunciado fala
      do estado da tarefa; o usuario escolheu a tarefa inteira.
    - Edicao valendo so de `t+1`: mais simples, mas a edicao nao apareceria
      no tick em que foi feita.
    - Corrigir o despacho ja feito em `t` (versao anterior): exigia
      restaurar CPU, fatia e sorteio que o snapshot `t` nao guarda.
    - Forcar so por um tick: o usuario preferiu manter ate mudar o estado.
    - Duracao valendo de imediato, ou de imediato so quando possivel: o
      usuario preferiu uma regra unica, na proxima ativacao.
    - Excluir tarefa ja ativada: apagaria o historico que o Gantt mostra;
      encerrar cumpre o papel.
    - CPUs re-incluidas com IDs novos: o usuario preferiu manter a
      numeracao de 1 a N (DEC-12).
    - Encerrar so o job atual: o usuario quis encerrar a tarefa inteira.
    - Uma ativacao por vez, com o job seguinte ativado na conclusao do
      anterior (DEC-38, retirada em 2026-11-01): ver DEC-02.
- Consequencia: #26 implementa esta
  matriz, a etapa de edicao e os eventos; #23/#24 guardam as edicoes por
  tick; #37 oferece todas as edicoes, com as recusas e os avisos acima; #38
  desenha os trechos suspensos e forcados e as lacunas de CPU. Tarefas
  suspensas indefinidamente seguem para a Q-06 (#27).

### DEC-38: Uma ativacao por vez (retirada)

- Estado: retirada em 2026-11-01, antes do aceite (PR #101). ID nao
  reutilizado. Requisitos: REQ-03, REQ-08.
- Numeracao: proposta e retirada como DEC-36 no PR #101; renumerada no merge
  com a `main`, onde DEC-36 e a navegacao no historico (#24). Referencias a
  "DEC-36" na #11, na #12 e no PR #101 anteriores a renumeracao sao a esta
  decisao.
- Proposta: ativar o job seguinte so na conclusao do anterior, com prazo
  contado dessa ativacao adiada.
- Motivo da retirada e alternativa registrados em DEC-02; texto original no
  PR #101 (commit `37f80fa`). Reabriu e depois fechou de novo #11 e #12.

### DEC-39: Caminho da edicao no nucleo

- Estado: aceita em 2026-11-01 pelo usuario (PR #115, #26, 2 de 6). Requisitos: REQ-04, REQ-05, REQ-07. Detalha DEC-37;
  revisa DEC-14, DEC-22, DEC-25 e DEC-35.
- Contexto: DEC-37 define o que cada edicao faz, mas nao a forma no nucleo.
  A #26 sai em varios PRs; este cria o caminho geral, provado com algoritmo
  e quantum, para que os seguintes so acrescentem tipos de item.
- Decisao:
    1. API: `Simulator.edit(items)` edita o tick do cursor; `getEdits(step)`
       devolve as edicoes aceitas no passo, congeladas, na ordem em que foram
       aceitas (`RangeError` para passo nao registrado, como `restore`).
       `EditItem` (`src/core/edit.ts`) e uma uniao por `kind`; a #115 cria
       `algorithm` e `quantum`. Um tipo novo e um membro da uniao, um campo
       de `EditTarget` e um tratador em `HANDLERS`, cujo tipo exige um
       tratador por tipo, entao o compilador acusa o que faltar.
    2. Recalculo: `edit` recalcula o passo `t-1 -> t` a partir do snapshot
       `t-1` (no tick 0, do estado inicial da configuracao validada no
       construtor) com todas as edicoes de `t` mais a nova. `tick()`, o
       construtor e `edit` compartilham as etapas do Fluxo de um passo, com a
       etapa de edicao entre as ativacoes e as fatias vencidas (DEC-37).
    3. Mudanca liquida: os itens sao dobrados sobre um `EditTarget` (o que o
       usuario pediu), validados em ordem sobre o estado da etapa de edicao;
       a etapa aplica so a diferenca entre o alvo antes e depois das edicoes
       do tick (DEC-37 item 5). Item recusado nao entra na dobra, e os
       seguintes sao julgados sem ele, para que todos os recusados recebam
       motivo de uma vez (escolha do autor). Algoritmo e quantum trocam a
       `config` por um objeto novo congelado, nunca a mutam, pois snapshots e
       estados restaurados a compartilham (DEC-35); nao registram evento.
    4. Recusa: qualquer item recusado recusa a edicao inteira com
       `EditRefusal` (`src/core/refusal.ts`), subclasse de
       `SimulationRefusal` com `items` (`index` a partir de 0, `kind`,
       `reason`) e mensagem com uma linha por item, `Item ${index + 1}
       (${kind}): ${reason}`. Regra da configuracao (quantum, algoritmo) e
       julgada por `validateConfig`, e o motivo e a mensagem dele (fonte
       unica, DEC-28; escolha do usuario na #115). Toda recusa ao usuario e em portugues, incluindo falta de politica,
       tipo de item desconhecido e edicao vazia (`Uma edição precisa de pelo
       menos um item.`). O item citado pode depender da ordem dos itens
       (decisoes do usuario no #117). `Error`/`TypeError` por defeito do motor
       e os `TypeError` do construtor (DEC-25) continuam em ingles.
       Edicao ja registrada recusada ao ser refeita e defeito do motor
       (`Error`), pois o recalculo e deterministico.
    5. Atomicidade: `edit` e transacional como `tick()` (DEC-14): recusa ou
       falha da politica deixam estado, cursor e historico identicos.
    6. Historico: `SnapshotHistory.rewrite(step, snapshot, edits)` troca o
       passo, guarda copia congelada da lista de edicoes e descarta os passos
       seguintes com suas edicoes; `append` registra passo sem edicoes. Toda
       edicao aceita descarta o futuro, mesmo com mudanca liquida nula
       (DEC-37 item 1, decisao do usuario); o cursor fica no passo editado.
    7. Politica: o construtor recebe `SchedulingPolicy` ou `{ policies }`
       (`PolicySource`); a fabrica passa o registro inteiro. O motor busca a
       politica pelo `config.algorithm` vigente a cada despacho, sem guardar
       em cache, entao um passo restaurado usa o proprio algoritmo. Politica
       unica injetada (testes do motor) vale para qualquer algoritmo. Sem
       candidatas e sem politica para o algoritmo, usa a politica que nao
       seleciona nada. DEC-01 continua: o motor busca pelo nome, nao ramifica
       por ele.
- Nota para a #116: "executou em [t-1, t)" (primeiro desempate, DEC-18) ja e
  derivavel de `executions`, pelo trecho do job com `end === clock` que a
  execucao do passo recalculado escreve antes da etapa de edicao; nao e
  preciso guardar fato novo quando a CPU for removida.
- Justificativa: um caminho unico de edicao, com tipos de item isolados em
  tratadores, deixa os PRs seguintes da #26 sem mexer no recalculo, no
  historico nem na recusa. Dobrar sobre o alvo, e nao sobre o estado, e o
  que torna o snapshot `t` dependente so de `t-1` e do estado final pedido.
- Alternativas descartadas:
    - Registro direto como segundo argumento do construtor: `{}` ficaria
      ambiguo entre registro vazio e politica sem `select`, que DEC-14 manda
      rejeitar.
    - Guardar a politica escolhida no estado: duplicaria `config.algorithm`.
    - Parar a validacao no primeiro item recusado: a mensagem nao citaria
      cada item recusado (DEC-37 item 4).
    - Mensagens de recusa em ingles para as regras da configuracao:
      duplicariam o texto de `validateConfig` (DEC-28).
- Evidencia: `src/core/edit.test.ts`, `src/core/history.test.ts`,
  `src/core/simulator.edit.test.ts` e o bloco `policy source` de
  `src/core/simulator.test.ts`.

### DEC-42: Ambiente-alvo e formato da entrega empacotada

- Estado: proposta (2026-11-01, #44). Requisitos: REQ-10.
- Contexto: o enunciado exige software que execute sem instalar nada. Em
  discussao de turma, o professor respondeu "qualquer um" a quem perguntou
  qual sistema operacional focar; a fonte e essa resposta, nao o PDF. O portal
  do aluno veta arquivos compactados na submissao (zip, rar) e exige compilar
  o projeto na defesa com um sistema de automacao de build.
- Proposta: ambientes-alvo Windows x64 (testado por caiogbriel, na maquina da
  equipe) e macOS (decisao do usuario em 2026-11-01; ediasv rodou `npm run make` e
  relatou que funcionou, sem registro de abrir o app). No
  Windows o artefato e o `Setup.exe` do Squirrel (arquivo unico, nao
  compactado), gerado por `npm run make`; o zip portatil nao e usado. No
  macOS o unico maker e o zip, que o veto a compactados atinge se for o
  arquivo submetido; formato da entrega no macOS fica em aberto. Linux (deb,
  rpm) e o workflow de release permanecem, mas fora da entrega e sem
  verificacao.
- Build e execucao: compilar na defesa exige Node 24.22.1 e rede (`npm ci`) na
  maquina de build, que e a da equipe; a execucao do pacote nao exige Node
  (o runtime vem no Electron). Onde compilar nao e dito pelo portal; assumido
  na maquina da equipe, a confirmar com o professor.
- Alternativas: zip portatil no Windows (descartado pelo veto a compactados);
  Linux como alvo (ninguem da equipe o testa).
- Verificacao e achado: ver #44 no [plano](plan.md#e6-entrega-e-demonstracao).

## Fluxo de um passo

1. Executar [t, t+1) em cada CPU ocupada e registrar os intervalos.
2. Avancar o relogio para t+1.
3. Contabilizar conclusoes antes das perdas de prazo (DEC-04), em etapas
   globais na lista de eventos (DEC-22).
4. Registrar as ativacoes devidas em t+1 (DEC-09, DEC-37).
5. Aplicar a mudanca liquida das edicoes aceitas em t+1, validadas em ordem
   sobre o estado que o usuario ve (DEC-37); sem edicoes, ou com edicoes que
   se anulam, a etapa nao faz nada.
6. Registrar as fatias vencidas com o quantum vigente (#14); job que
   conclui nao registra vencimento, job forcado nao tem quantum, job que
   deixou a CPU na etapa 5 comeca fatia nova (DEC-37) e o job vencido
   mantem o primeiro desempate (DEC-18).
7. Dar CPU aos jobs forcados, selecionar os demais pela politica, sortear o
   empate residual e despachar (DEC-07, DEC-13, DEC-27, DEC-37).
8. Conferir `findInconsistencies` e publicar o snapshot t+1 (DEC-11, DEC-14).

Snapshot inicial e fronteiras seguem DEC-11; quantidade de jobs e termino seguem
DEC-09 e DEC-37. Fixar ambos em testes antes de expor a API. Editar em `t`
recalcula este passo a partir do snapshot `t-1` com a lista de edicoes de
`t` (DEC-37); no tick 0, o estado inicial passa pelas etapas 4, 5 e 7.

### DEC-40: Edicao de CPUs e execucao anterior independente da posse

- Estado: aceita em 2026-11-01 pelo usuario (PR #124, #26, 3 de 6); o #116 integrou somente documentacao. Requisitos: REQ-02, REQ-04, REQ-05,
  REQ-07 e REQ-09. Detalha DEC-37; revisa DEC-13 e DEC-21. Nao altera o
  estado de aceite de DEC-39.
- Contexto: remover CPU nao apaga o trabalho de [t-1, t), e uma CPU ausente
  nao esta desligada. A posse vigente e o array atual de CPUs nao bastam
  para derivar esses fatos.
- Decisao de implementacao:
    1. `EditItem` ganha `cpuCount` e `EditTarget` guarda a quantidade final.
       O tratador usa `validateConfig`, incluindo as mensagens existentes.
       `applyNetChange` troca a configuracao congelada, remove maiores IDs
       ou acrescenta os seguintes, reutilizando IDs, somente pela diferenca
       final do tick. Eventos `cpu-removed`/`cpu-added` saem por ID crescente
       na etapa de edicao; a remocao nao registra `cpu-off`/`cpu-on` nem
       `preemption` ficticios.
    2. CPU nova ou reincluida tem `running: null`, `sliceElapsed: 0` e
       `offSince: null`; o despacho a marca desligada se nao houver trabalho.
       Job incompleto da CPU removida volta a pronto, sem perder identidade,
       progresso ou prazo. Se selecionado em outra CPU, inicia fatia nova;
       CPUs sobreviventes preservam consumo, salvo vencimento real.
    3. `PolicyCandidate.wasRunning` e verdadeiro se `executions` tem trecho
       do job com `start < clock` e `end === clock`. O conjunto e montado uma
       vez por visao e congelado com ela; nao se guarda flag no snapshot.
       Em t=0 ninguem executou. `previousCpu` segue descrevendo a posse
       antes do despacho, nao o primeiro desempate. Prioridade RM/EDF vem
       antes de `wasRunning`; os criterios seguintes e sorteio nao mudam.
    4. `summarizeCpuOff` devolve todos os IDs que existiram naquele snapshot,
       em ID crescente, incluindo removidos e CPUs nunca desligadas. Deriva
       a presenca inicial desfazendo os eventos de existencia sobre os IDs
       atuais e depois percorre o historico de potencia/existencia. Remover
       fecha eventual intervalo aberto; reincluir nao soma o tempo ausente.
       Eventos futuros, tempos invalidos/regressivos, transicoes sem par e
       eventos de potencia durante ausencia lancam `CpuEventSequenceError`.
       Nao existe consulta ao historico futuro nem registro mutavel extra.
    5. `findInconsistencies` confere IDs atuais 1..`cpuCount` e compara
       intervalos abertos por ID, nao por indice; apenas CPUs vigentes podem
       ter intervalo aberto. Continua convertendo somente
       `CpuEventSequenceError` em inconsistencia.
- Justificativa: preservar o desempate de DEC-18 quando a CPU desaparece e
  manter toda a evidencia de CPU desligada para inspecao/Gantt, sem inventar
  desligamento durante ausencia. Historico e transacoes do #115 bastam:
  nao foi necessario mudar `Simulator`, `SnapshotHistory` ou o renderer.
- Alternativas descartadas: guardar outro fato por job/snapshot para execucao
  anterior (ja derivavel dos trechos); manter CPU removida no array vigente;
  filtrar resumos pelas CPUs atuais (apagaria evidencia); guardar intervalos
  desligados em paralelo aos eventos (mais um fato duplicado).
- Fora: limite contra tarefas forcadas (#117), comando no adaptador (#37) e
  desenho de lacunas no Gantt (#38). #26 permanece aberta.

### DEC-41: Exportacao do Gantt em SVG pelo processo principal

- Estado: aceita em 2026-11-01 pelo usuario, na revisao do PR #121 (#39).
  Requisitos: REQ-09, REQ-10. Detalha DEC-08 e DEC-19; nao altera o
  nucleo.
- Decisao:
    1. A imagem e gerada no renderer por funcao pura sobre o ultimo snapshot do
       historico (`features/export/ganttSvg.ts`): independe do cursor, de zoom,
       rolagem e janela, e nao tem teto de ticks. O layout segue o frame
       "Exportacao SVG" da pagina Telas do Figma (73 px por tick, eixo no topo,
       raias por tarefa, divisor de processadores, raias de CPU, legenda). Rotulo
       do trecho: "CPU n · #job" quando cabe, senao "CPU n".
    2. Exportar vale em qualquer passo, nao so no final (acordado com o usuario
       em 2026-11-01, proposta da #39); resultado sem todas as tarefas
       terminadas e identificado como parcial no cabecalho (FE-18).
    3. A gravacao fica no main (`main/imageFile.ts`), pelo canal
       `image-file:save`: o renderer envia so o texto do SVG, nunca o caminho; o
       destino vem do dialogo "salvar como" do main, que acrescenta `.svg` se o
       nome nao tiver extensao. Falha de gravacao devolve caminho e motivo
       (REQ-10); cancelar nao e erro; nao altera a sessao. Pedidos simultaneos
       aguardam o dialogo aberto. Mesma checagem de origem da DEC-19.
    4. Suspenso, forcado e lacuna de CPU removida ficam fora ate a #26 registrar
       os eventos de DEC-37; a legenda lista so o que e desenhado.
- Justificativa: SVG a partir dos dados evita captura de tela e limites de
  canvas (A.2.4); a gravacao exige o main (regras de importacao do README).
- Consequencia: o cabecalho traz nome do arquivo de configuracao e data da
  exportacao; o SVG e autonomo (cores literais do tema escuro, sem script nem
  referencia externa). Quando a #38 desenhar o Gantt na tela, alinhar as duas
  apresentacoes para nao manter duas.

### DEC-43: Estado editavel por tarefa e encerramento de jobs

- Estado: proposta em 2026-11-01 no #117 (#26, 4 de 6), para revisao.
  Requisitos: REQ-05, REQ-08, REQ-09. Implementa a matriz de DEC-37 e
  complementa DEC-12, DEC-13, DEC-22, DEC-39 e DEC-40.
- Modelo: `TaskControlBlock.status` guarda `ready`, `forced`, `suspended`
  ou `concluded`, inicialmente `ready`. E o estado escolhido; executar
  pela politica nao torna a tarefa forcada. `EditItem.taskState` recebe
  `taskId` e `state`; `EditTarget.taskStates` guarda o alvo por ID.
  Snapshots copiam e restauram esse estado. A tabela de transicoes valida
  itens em ordem; forcadas sem job atual contam no limite de CPUs.
- Aplicacao: somente a mudanca liquida do tick, em ordem de tarefas e
  depois de CPUs. Suspender libera o job atual sem preempcao; retomar
  devolve-o a disputa. O job mais antigo incompleto continua bloqueando
  os posteriores; prazo e calendario seguem correndo. Forcados recebem
  CPU antes da politica, cuja visao recebe apenas as vagas restantes.
  Nao vencem quantum; desforcar renova a fatia se mantiver a CPU.
- Encerramento: jobs incompletos passam a `interrupted`, sem `completion`
  nem perdas de prazo futuras; preservam progresso e perdas anteriores.
  Tarefa `concluded` nao ativa novos jobs nem aceita outro estado.
  Encerrar uma tarefa naturalmente terminada e aceito sem duplicar seu
  `task-finished`. `interrupted` e vazio no termino normal ou sem jobs
  incompletos; nos demais casos lista os jobs por indice. Forcar uma tarefa
  que ja terminou (todas as ativacoes concluidas) e recusado com motivo,
  porque reservaria uma CPU que ela nao pode usar (decisao do usuario no
  #117); suspende-la ou concluí-la continua aceito. Tarefa forcada que
  termina sozinha mantem `status: forced`, mas deixa de contar no limite de
  forcadas (na edicao e em `findInconsistencies`), pois nao usa mais CPU
  (decisao do usuario no #117).
- Eventos: `suspension` tem `taskId` e `cpuId`, a CPU que executava o job
  da tarefa (mesmo que ele tenha acabado de concluir no tick), ou `null`
  se nenhuma (decisao do usuario no #117);
  `resumption`, `forced` e `unforced` tem `taskId`. Todos tem `time`.
  Na mesma tarefa, `unforced` precede `suspension`, e `resumption`
  precede `forced` (ordem acordada com o usuario). Encerrar emite apenas
  `task-finished`, sem `unforced` ou `resumption` adicional.
- Consistencia: o limite de forcadas e a posse do job atual forcado sao
  conferidos; CPUs nao podem executar tarefas suspensas/concluidas nem
  jobs interrompidos; job interrompido so existe em tarefa concluida, tarefa
  concluida nao guarda job aberto e o `status` pertence ao conjunto
  conhecido. Identificador de tarefa que nao e inteiro e recusado na edicao.
  A inspecao rotula tarefa concluida como concluida. A inspecao exclui interrompidos das filas pendentes
  e os rotula como Interrompido; o restante da apresentacao fica na
  #37/#38.
- Justificativa: estado por tarefa atende A.3.4 e permite suspender/forcar
  antes do ingresso ou entre ativacoes sem inventar um job. O estado
  interrompido distingue encerramento de execucao completa.
- Alternativas descartadas: guardar a suspensao somente no job (nao
  representa intervalos sem job); marcar interrompido como `completed`
  (afirma execucao que nao ocorreu); duplicar `task-finished` ao encerrar
  tarefa naturalmente terminada (dois marcadores para o mesmo termino).
- Evidencia: matriz em `edit.test.ts`, cenarios em
  `simulator.taskState.test.ts`, invariantes em `consistency.test.ts`;
  testes de termino normal e projecoes existentes atualizados.

### DEC-44: Caracteristicas editaveis da tarefa e calendario de ativacoes

- Estado: proposta em 2026-11-01 no #118 (#26, 5 de 6), para revisao do
  usuario. Requisitos: REQ-05, REQ-07, REQ-08. Detalha DEC-37 (item
  "Caracteristicas da tarefa") e DEC-39; revisa DEC-09 e DEC-16 (ver abaixo).
- Itens: `EditItem` ganha `taskColor`, `taskDuration`, `taskDeadline`,
  `taskArrival` e `taskPeriod`, cada um com `taskId` e o valor novo. ID e
  ticks executados nao tem item (nao editaveis). `EditTarget.definitions`
  guarda a `TaskDefinition` desejada de cada tarefa por ID; cada edicao
  troca a definicao por um objeto novo congelado, nunca a muta, pois
  snapshots a compartilham. `applyNetChange` compara as definicoes antes e
  depois do tick (mudanca liquida, DEC-37 item 5): editar e desfazer no
  mesmo tick nao deixa efeito.
- Duracao do job: `Job.duration` e copiada de `definition.duration` na
  ativacao (`src/core/activation.ts`). Conclusao
  (`completeJobsAndRecordDeadlineMisses`), criterio (4) de DEC-16
  (`policies.ts`) e consistencia (`executed <= duration`) leem a duracao do
  job, nao a da definicao. Job ja ativado tambem mantem o prazo absoluto.
- Calendario: `TaskControlBlock.nextActivation` e o tick da proxima
  ativacao, ou `null` quando a tarefa recebeu todos os jobs. Substitui
  `ingresso + k * periodo` (DEC-09) e e conferido por `findInconsistencies`
  (nulo so com todas as ativacoes, e depois da ultima ativacao). `activation.ts`
  concentra `activateDueJobs` (todas as tarefas, no passo),
  `activateTask` (uma tarefa; tarefa concluida nunca ativa) e
  `rescheduleNextActivation`. Sem job, o calendario segue o ingresso da
  definicao; com jobs, `max(ultima ativacao + novo periodo, tick atual)`,
  de modo que uma proxima ativacao vencida vira uma unica ativacao em `t` e
  as seguintes seguem a cada periodo, sem acumular vencidas (exemplos de
  DEC-37 item 4). Nao ha caso aperiodico: periodo 0 e recusado na edicao e
  a edicao de tarefa aperiodica fica fora do Projeto A (DEC-29).
- Recusas (em portugues, citando o item): tarefa inexistente ou ID nao
  inteiro; tarefa concluida (so a cor), tambem a concluida por
  item anterior do mesmo envio, e conclusao no mesmo envio de uma mudanca
  de caracteristica, em qualquer ordem (DEC-45); ingresso de tarefa que ja
  ingressou, com valor diferente do atual (DEC-45), ou menor que o tick atual;
  duracao e prazo de tarefa sem ativacoes restantes; periodo menor que 1;
  prazo da ultima ativacao restante fora do inteiro exato (DEC-10),
  calculado sobre o alvo liquido (ingresso e periodo pendentes do mesmo
  envio) para nao depender da ordem dos itens. Regras de campo e mensagens
  vem de `validateConfig` (DEC-28). Cor repetida considera tarefas
  concluidas; a cor e normalizada para maiusculas.
- Ordem na etapa de edicao (decisao do usuario, O1): a ativacao causada por
  edicao (ingresso movido para `t`, periodo cuja proxima ativacao ja passou)
  e registrada depois dos eventos de estado da mesma tarefa e antes dos
  eventos de CPU, concretizando o texto de DEC-37 e DEC-22. Eventos de
  tarefas diferentes seguem a ordem das tarefas.
- Revisoes: DEC-09 (calendario guardado em `nextActivation`, nao derivado);
  DEC-16 (criterio 4 usa `Job.duration`, ja anotado em DEC-37).
- Semantica entre envios do mesmo tick: resolvida na DEC-45 (decisao do
  usuario em 2026-11-01); a primeira redacao, que julgava os jobs pelo
  estado de antes do tick, foi substituida.
- Lacuna conhecida (decisao do usuario, O3), fechada pela #131 (PR #135):
  `projectJob` em `src/renderer/features/system/system.ts` lia a duracao
  do job da definicao da tarefa, e `SystemInspector.vue` (CPUs, prontos,
  pendentes) mostrava o valor editado para jobs ja ativados. Agora
  `SystemJob.duration` vem de `Job.duration`. `copyDefinition`
  (`inspection.ts`) e `TaskDetails.vue` continuam mostrando a duracao
  vigente da tarefa, como devem.
- Fora do escopo (decisao do usuario, O4): editar periodo 0 (tarefa
  aperiodica) no Projeto A; inclusao e exclusao de tarefas, no PR 6/6 (#119).
- Justificativa: guardar a duracao no job e a proxima ativacao na tarefa
  e o minimo para que edicoes valham so para ativacoes futuras (DEC-37) sem
  reescrever jobs, e deixa a ativacao em um modulo compartilhado pelo passo
  e pela edicao.
- Alternativas descartadas: ler a duracao da definicao no job (alteraria
  jobs ja ativados); recalcular o calendario por `ingresso + k * periodo`
  (nao representa a edicao de periodo depois de ativar); acumular ativacoes
  vencidas (contraria DEC-37 item 4).
- Evidencia: `edit.test.ts`, `activation.test.ts`, `simulator.taskEdits.test.ts`
  e `consistency.test.ts`; resultados no plano (#26, 5 de 6).

### DEC-45: Envios do mesmo tick e conclusao de tarefa

- Estado: proposta em 2026-11-01 no #118 (#26, 5 de 6), decisao do usuario
  na revisao do PR. Requisitos: REQ-05, REQ-07. Fecha o ponto aberto da
  DEC-44 e esclarece DEC-37 itens 2 a 5 e DEC-43.
- Envios do mesmo tick: cada envio e julgado contra o estado que os
  anteriores deixaram, inclusive jobs criados por eles. O simulador monta,
  para cada envio depois do primeiro, uma copia do estado de `t-1` com a
  mudanca liquida dos envios anteriores aplicada; so a validacao a enxerga.
  A mudanca liquida continua sendo aplicada uma vez, ao estado de `t-1`
  (DEC-37 item 5): suspender e retomar em envios diferentes nao registra
  eventos. Consequencia: depois que um envio cria um job (ingresso movido
  para `t`, periodo cuja proxima ativacao ja passou), um envio seguinte
  recusa alterar ingresso, periodo, duracao ou prazo da tarefa com valor
  diferente do vigente, pois a definicao liquida alcancaria aquele job; o
  mesmo valor e a cor continuam aceitos. A validacao e deterministica na
  reexecucao dos envios gravados (voltar e editar de novo).
- Conclusao: um envio que muda uma caracteristica (ingresso, duracao,
  periodo ou prazo) e conclui a mesma tarefa e recusado por inteiro, em
  qualquer ordem dos itens, com o motivo "so a cor pode ser alterada"
  (DEC-43). Mudanca de caracteristica em um envio e conclusao em outro,
  posterior, e valida: cada envio e julgado em sequencia. Excecao: a
  conclusao e recusada se um envio anterior do mesmo tick criou um job da
  tarefa, pois concluir cancelaria a ativacao que ele ja tornou visivel
  (achado da revisao final; escolha do implementador, a confirmar).
- Ingresso inalterado: depois que a tarefa ingressou, um item de ingresso
  com o valor vigente e aceito sem efeito, como os demais campos; so uma
  mudanca real e recusada ("ja ingressou"). Assim o formulario pode enviar
  todos os campos (#37).
- Justificativa: o usuario fixou que o estado aceito pelo primeiro envio e o
  que o seguinte altera; a projecao so para validar preserva a mudanca
  liquida e os eventos de DEC-37 item 5 (escolha do implementador, a
  confirmar na revisao).
- Alternativas descartadas: aplicar cada envio ao estado real (registraria
  eventos de suspensao e retomada que a mudanca liquida omite); aceitar a
  conclusao e descartar em silencio a mudanca de caracteristica (o envio
  seria aceito sem valer por inteiro).
- Evidencia: `simulator.taskEdits.test.ts` (bloco "across submissions") e
  `edit.test.ts` (conclusao com caracteristica, ingresso inalterado).

### DEC-46: Inclusao de tarefas e ID gerado

- Estado: proposta em 2026-11-01 no #119 (#26, 6 de 6), para revisao.
  Requisitos: REQ-05, REQ-07. Detalha o item Incluir de DEC-37; a exclusao
  tem decisao propria (DEC-47), no PR seguinte. Complementa DEC-10, DEC-12, DEC-22, DEC-29, DEC-39 e DEC-44.
- Item: `EditItem` ganha `addTask` com `NewTask` (`arrival`, `duration`,
  `deadline`, `color` e `period` opcionais); o ID nunca vem do chamador.
  `rawEvents` fica vazio (eventos de arquivo so no Projeto B).
- Validacao, em ordem sobre o estado da etapa de edicao: ingresso `>= t`
  (mensagem propria); periodo ausente vira 15 (DEC-29) e zero e recusado; as
  demais regras de DEC-10 e a cor distinta de todas as tarefas, concluidas e
  incluidas no tick inclusive, vem de `validateConfig` sobre as definicoes
  desejadas mais a nova (fonte unica, DEC-28), filtrando os problemas dela.
  Reaproveita a mesma lista de definicoes que a validacao de caracteristicas
  de DEC-44 (`liveDefinitions`), entao uma edicao de cor do mesmo tick
  tambem enxerga a cor da tarefa incluida.
- Cor: se nao vier, o motor escolhe uma que nenhuma outra tarefa usa
  (`defaultTaskColor`, `src/core/defaultColor.ts`; pedido do usuario no
  #119). Parece aleatoria, mas e funcao do ID: cada edicao recalcula o tick
  a partir de `t-1`, e `Math.random` mudaria a cor a cada nova edicao do
  mesmo tick, quebrando DEC-37 item 2. Cor informada continua validada.
- ID: maior ID ja usado + 1. `SimulationState.maxTaskId` guarda o maior ID
  usado em cada snapshot e `EditTarget.maxTaskId` o acompanha dentro do
  tick; assim descartar o futuro descarta os IDs gerados nele (o recalculo
  parte do snapshot `t-1` ou da configuracao inicial). Varias inclusoes numa
  edicao recebem IDs consecutivos. `findInconsistencies` confere que o valor
  e inteiro e nao fica abaixo de nenhum ID.
- Aplicacao (mudanca liquida): a tarefa entra no alvo (`definitions` e
  `taskStates`) e, ao aplicar, no fim de `state.tasks`, nascendo pronta, sem
  jobs e com `nextActivation` igual ao ingresso (`createTcb`, o unico lugar
  onde um TCB nasce), sem evento proprio. Estado e caracteristicas pedidos no
  mesmo tick valem pela definicao e pelo estado liquidos: o estado parte de
  `ready` e gera os eventos de DEC-43, e o primeiro job usa a duracao e o
  prazo finais. Ingresso igual a `t` ativa o primeiro job na etapa de edicao
  (`activateTask`, DEC-44), depois dos eventos de estado da propria tarefa e
  antes dos de CPU; ingresso maior ativa no tick certo. Ate ser aplicada, a
  tarefa incluida age como tarefa nunca ativada nas validacoes de
  caracteristicas do mesmo tick.
- `config.tasks`: nao e atualizada, como ja nao e nas edicoes de
  caracteristicas (DEC-44); `tasks` e a fonte de verdade da simulacao e o
  nucleo nao le mais a lista da configuracao depois do estado inicial.
  A interface conta as tarefas de `snapshot.tasks` (`useWorkspace.taskCount`),
  nao de `config.tasks`, que ficaria atras apos uma inclusao.
- Justificativa: ID no estado, e nao derivado da lista, e o que permite a
  exclusao futura manter o ID gasto sem rastro.
- Alternativas descartadas: evento `task-added` (DEC-37 nao o lista; a
  ativacao ja marca a entrada); cor aleatoria de verdade (nao reproduzivel
  ao refazer o tick); ativar depois dos eventos de CPU (o evento de ativacao
  viria depois do `cpu-added` que o explica).
- Evidencia: `src/core/simulator.addTask.test.ts`,
  `src/core/defaultColor.test.ts`, `consistency.test.ts` e `edit.test.ts`.

### DEC-47: Exclusao de tarefas

- Estado: proposta em 2026-11-01 no PR 7/7 da #26, que fecha a #26, para
  revisao; aguarda aceite do usuario. Requisitos: REQ-05. Detalha o item
  Excluir de DEC-37 e completa DEC-46 (inclusao, que deixou a exclusao para
  este PR). Complementa DEC-43 (estado concluido e interrupcao) e DEC-44
  (`definitions` como fonte da caracteristica).
- Item: `EditItem` ganha `removeTask` com `taskId`; o handler e `HANDLERS`
  como os demais. Validacao, em ordem sobre o estado da etapa de edicao:
    - ID inteiro e existente em `target.definitions` (`refuseUnknownTask`, a
      mesma regra de DEC-44; ID de outra forma gera a mensagem de ID invalido);
    - tarefa com algum job recusada, inclusive a cujo primeiro job a etapa de
      ativacoes deste tick acabou de dar origem (as ativacoes rodam antes da
      etapa de edicao, DEC-22). A recusa aponta encerrar (estado concluida)
      como caminho:
      `A tarefa N já foi ativada e não pode ser excluída; encerre-a (estado concluída) para manter o histórico dela.`
    - excluir de novo, ou mudar a tarefa ja excluida na mesma edicao, e
      recusado como tarefa inexistente (ela sai de `target.definitions` e de
      `target.taskStates`).
- Tarefa incluida no mesmo tick ainda nao tem TCB; ela sai so do alvo, sem
  evento nem rastro. Incluir e excluir no mesmo tick deixa o estado igual ao
  de antes, e o ID gerado continua gasto (`maxTaskId` nunca diminui).
- Aplicacao (mudanca liquida, `applyNetChange`): ids presentes em
  `before.definitions` e ausentes em `after.definitions` sao excluidos. Os
  TCBs saem de `state.tasks` e os eventos que citam o ID saem de
  `state.events`. Se algum TCB excluido tiver job, a aplicacao lanca `Error`:
  e defeito do motor, nao recusa, porque a validacao ja barrou esse caso.
  O status e os eventos da tarefa excluida nao sao gerados.
- Eventos anteriores (decisao do autor do PR, aguardando aceite do usuario):
  `suspension`, `resumption`, `forced`, `unforced`, `task-finished` e
  qualquer evento com o mesmo `taskId` saem de `state.events` do snapshot do
  tick. Os snapshots anteriores mantem os seus eventos: voltar no historico
  mostra a tarefa como era, e `forward()` volta sem eles.
- Cor: uma tarefa excluida no tick nao conta para a cor distinta de DEC-10
  (`liveDefinitions` so considera as tarefas que ainda estao no alvo), entao
  uma inclusao ou mudanca de cor no mesmo tick pode reusar a cor dela.
- ID: nunca reutilizado. `maxTaskId` continua o maior ID ja usado, inclusive
  depois da exclusao; so volta a ser liberado quando a edicao que o gerou sai
  do futuro (DEC-46).
- `config.tasks` nao e atualizada (convencao de DEC-44 e DEC-46); a interface
  conta `snapshot.tasks`.
- Justificativa: excluir uma tarefa ja ativada apagaria o historico dela no
  Gantt (a tela so ve o estado e os eventos), contra o principio de DEC-37
  de que o passado nao muda. Excluir so a tarefa nunca ativada
  deixa o historico como ele aconteceu: ela nunca executou, e os eventos de
  estado que ela tenha (suspensao, forcamento) vem de uma edicao que tambem
  sai com ela.
- Alternativas descartadas:
    - Excluir tarefa ativada (apaga o historico, contra DEC-37).
    - Manter os eventos antigos da tarefa excluida no snapshot atual: o Gantt
      citaria uma tarefa que nao existe mais no estado.
    - Recusar a exclusao de tarefa que tenha evento sem job (suspensa,
      forcada ou concluida sem ativacao): recusaria a exclusao que DEC-37
      aceita, a de tarefa nunca ativada. Fica para o usuario decidir no
      aceite, junto com a decisao de eventos acima.
- Evidencia: `src/core/simulator.removeTask.test.ts` (15 testes, matriz de
  exclusao, recusa atomica, ID, historico, cor e CPUs); suite completa, lint
  e typecheck na entrega. Mutacoes (cada uma derrubou testes; revertidas):
    1. nao limpar eventos da tarefa excluida (2 falhas);
    2. aceitar tarefa com job (3 falhas);
    3. recalcular `maxTaskId` pela lista de tarefas (4 falhas);
    4. nao filtrar `definitions` ao excluir (11 falhas);
    5. considerar a tarefa excluida na cor distinta (1 falha).
- Nao verificado nesta decisao: o comando `edit` do adaptador e a tela de
  edicao (#37); o pacote (#26 nao o cobre).
