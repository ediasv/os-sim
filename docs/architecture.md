# Arquitetura e decisoes

Leia a [especificacao](specification.md) para requisitos e o [plano](plan.md)
para andamento. Este documento descreve responsabilidades e escolhas, nao
afirma que os modulos planejados ja existem.

## Base existente

- [Dominio](../src/core/domain.ts): tipos de configuracao, TCB, job, CPU,
  intervalos, eventos e snapshot (DEC-12).
- [Configuracao](../src/core/config.ts): `validateConfig` com as regras de DEC-10
  e `ConfigValidationError`, que carrega os problemas encontrados (DEC-15).
- [Parser](../src/core/parser.ts): converte a estrutura do arquivo em configuracao
  e diagnostica erros sintaticos com as linhas originais (DEC-19, DEC-20).
- [Snapshot](../src/core/snapshot.ts): estado inicial e copia profunda congelada.
- [Consistencia](../src/core/consistency.ts): `findInconsistencies` confere os
  fatos registrados em dobro no dominio (DEC-12, DEC-21).
- [CPUs desligadas](../src/core/cpuOff.ts): `summarizeCpuOff` deriva de um
  snapshot os intervalos e o total desligado de cada CPU (DEC-21).
- [Elegibilidade](../src/core/eligibility.ts): seleciona o job incompleto mais
  antigo de cada tarefa, sem liberar jobs posteriores quando ele esta suspenso
  (DEC-02).
- [Politica](../src/core/policy.ts): contrato da politica injetada, visao
  congelada e conferencia da decisao (DEC-13); RM/EDF continuam para E2.
- [Simulator](../src/core/simulator.ts): valida configuracao, registra ativacoes
  nos limites de tick, executa jobs, registra conclusoes/perdas de prazo
  (ordem dos eventos em DEC-22) e faz
  despacho global pela politica injetada antes de publicar snapshots completos
  (DEC-07, DEC-14); rejeita configuracao invalida com `ConfigValidationError` e
  expoe os jobs elegiveis somente para leitura (DEC-15).
- [useSimulation](../src/renderer/composables/useSimulation.ts): mantem instancia
  privada e publica snapshots via `shallowRef`.
- [Processo principal](../src/main/main.ts): janela Electron.
- [Preload](../src/preload/preload.ts): ainda sem API de arquivos.

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

Estados: **aceita**, **proposta**, **substituida**. Alteracoes significativas
recebem novo ID e indicam qual decisao substituem; nao apagar a justificativa
anterior. Data inicial dos registros: 2026-10-12.

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
- Consequencia: jobs posteriores ficam pendentes, com prazo correndo. Suspender
  o anterior nao libera o posterior. Distinguir elegibilidade de estado pronto.
- Alternativas descartadas: sobrescrever progresso ou executar jobs da mesma
  tarefa em paralelo. O enunciado nao explicita essa restricao; e interpretacao.

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

### DEC-05: CPUs logicas sem teto arbitrario

- Estado: aceita. Requisito: REQ-02.
- Decisao: aceitar quantidade inteira positiva sem teto de 16; CPU sem trabalho
  fica logicamente desligada e pode reativar sem custo.
- Consequencia: registrar intervalos e totais; nao simular energia ou latencia.
  Intervalos e totais sao derivados dos eventos de cada snapshot (DEC-21).
- Limitacao: recursos reais e representacao numerica continuam finitos; tratar
  falhas claramente, sem prometer capacidade infinita.

### DEC-06: Historico restauravel e sorteio reproduzivel

- Estado: aceita. Requisitos: REQ-04, REQ-05, REQ-07.
- Decisao: snapshots independentes incluem estado do gerador pseudoaleatorio;
  avancar no historico restaura, editar invalida o futuro.
- Consequencia: validar edicao antes de mutar/descartar historico. Nao sortear
  dentro de comparadores de ordenacao; sortear somente no empate residual e
  registrar resultado. Definir estruturas concretas na entrega do historico.
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

- Estado: proposta. Requisito: REQ-09.
- Decisao proposta: linhas por tarefa em ID decrescente, CPU identificada em cada
  trecho, faixas complementares por CPU para intervalos desligados. Exportar SVG
  completo a partir dos dados, incluindo legenda e eventos.
- Justificativa: atender eixo Y e multiplas CPUs sem depender de screenshot ou
  limites de dimensao de canvas para imagens rasterizadas.
- Consequencia: tela pode usar zoom/rolagem; exportacao nao depende do viewport.

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
- Consequencia: TCB conta ativacoes geradas; termino depende de conclusao, nao
  de ativacao. Prioridade RM para periodo zero definida por DEC-17.

### DEC-10: Valores padrao e limites da configuracao

- Estado: aceita em 2026-10-16. Requisitos: REQ-02, REQ-05, REQ-06. Resolve a
  parte de Q-03 que afeta o modelo.
- Padrao sem arquivo: algoritmo RM, quantum 5, 1 CPU, nenhuma tarefa.
- Valores inteiros validos: CPUs >= 1, quantum >= 1, duracao >= 1, todos sem
  maximo (mantem DEC-05); ID >= 1 e unico; ingresso >= 0; periodo >= 0; prazo
  relativo >= 1. Prazo menor que duracao ou periodo e valido: sobrecarga gera
  perda de prazo registrada, nao erro de configuracao.
- Campos ausentes: somente periodo pode faltar e equivale a zero; demais campos
  obrigatorios ausentes sao erro. Lista de eventos e opcional, armazenada e
  nunca executada no Projeto A.
- Limites numericos: rejeitar valores e tempos derivados (por exemplo
  ingresso + 9 * periodo + prazo) fora da faixa de inteiros exatos, com mensagem
  descritiva.
- Validacao: o nucleo valida a configuracao inteira antes de aplica-la, sem
  aplicacao parcial; o parser (E4) apenas acrescenta linha e campo ao erro,
  a partir dos problemas carregados pelo erro do construtor (DEC-15).
- Justificativa: valores e limites definidos pelo usuario; sem tetos arbitrarios.

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
  k+1. Nao existe snapshot de configuracao "antes de t=0".

### DEC-12: Modelo de dominio em dados simples

- Estado: aceita em 2026-10-16. Requisitos: REQ-01, REQ-02, REQ-03, REQ-05,
  REQ-06, REQ-08. Escopo acordado com o usuario na #9.
- Decisao: o dominio e feito de registros sem comportamento (`TaskDefinition`,
  `SystemConfig`, `TaskControlBlock`, `Job`, `CpuState`, `ExecutionSlice`,
  `SimulationEvent`, `SimulationState`). O motor muta somente seu estado
  privado; snapshots sao copias profundas congeladas (`DeepReadonly`).
- Detalhes:
    - Elegibilidade (DEC-02) e termino da tarefa (DEC-09) sao derivados, nao
      armazenados: `JobState` tem apenas `ready`, `running`, `suspended` e
      `completed`; `jobs.length` conta as ativacoes geradas.
    - Eventos sao fatos com instante exato, uniao discriminada por `kind`
      (ativacao, conclusao, perda de prazo, quantum vencido, preempcao, sorteio,
      termino de tarefa, CPU desligada/religada); execucao fica em intervalos
      [start, end) por CPU.
    - CPUs numeradas de 1 a `cpuCount`; cor em `RRGGBB` sem `#`, como no exemplo
      do enunciado (A.3.3), normalizada para maiusculas e comparada sem caixa.
    - `validateConfig` reune todos os problemas (campo, indice da tarefa e
      mensagem em portugues com o nome do campo no arquivo) e devolve copia
      normalizada congelada; nao muta a entrada. Lista de tarefas vazia e valida
      no nucleo; exigir ao menos uma tarefa e regra do arquivo (E4).
    - Estado do gerador pseudoaleatorio entra no snapshot com #20/#23, sem campo
      provisorio antes disso.
- Justificativa: dados simples tornam copia, congelamento e restauracao
  (DEC-06) triviais e impedem a UI de segurar objetos vivos.
- Consequencia: placeholders `task.ts` (classe com cor aleatoria e ID 0, em
  conflito com DEC-10) e `scheduler.ts` foram removidos; o contrato de politica
  e criado na #10. Copia integral por passo custa O(tamanho do estado); rever
  na #23 se o historico ficar grande.
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
    - Suspensao: `JobState` tem `suspended`, mas nao ha eventos de suspensao e
      retomada; a partir dos eventos e intervalos registrados nao se
      reconstroem os trechos suspensos que o Gantt exige (REQ-09). Definir
      esses eventos com a matriz de edicao (Q-02, E3: #25/#26) e consumi-los no
      Gantt (E5: #38).
- Alternativa descartada: classes com estado privado por tarefa, que exigiriam
  clonagem especifica e expor metodos aos consumidores de snapshots.

### DEC-13: Contrato da politica injetada

- Estado: aceita em 2026-10-16. Requisitos: REQ-02, REQ-07. Detalha DEC-01;
  escopo acordado com o usuario na #10.
- Decisao: `SchedulingPolicy.select(view)` recebe uma `PolicyView` e devolve uma
  `PolicyDecision`. A visao tem `clock`, `cpuCount` e as candidatas; cada
  candidata traz o job, a definicao da tarefa e `previousCpu` (CPU que o possuia
  quando a visao foi montada, para o primeiro desempate de A.4.3).
  `buildPolicyView` copia somente os jobs elegiveis indicados pelo motor e
  congela a copia inteira; rejeita job inexistente, concluido, suspenso ou
  repetido.
- Decisao: `selected` e um conjunto sem ordem de exatamente
  min(`cpuCount`, candidatas) jobs; atribuir CPUs cabe ao despacho (DEC-07).
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
    - Sorteio do empate residual entra no contrato com a #20, em nova decisao
      que estende visao e decisao; esta decisao nao reserva campos para ele.
    - Q-04 e Q-07 decididas na #18 (DEC-16, DEC-17) sem mudar o contrato: os
      campos usados ja estao na visao (`job.absoluteDeadline`,
      `job.activation`, `task.duration`, `task.period`).
- Justificativa: conjunto selecionado basta ao despacho e so exige sorteio
  quando o empate cruza o corte; copia congelada garante, tambem em tempo de
  execucao, o invariante "Politicas nao modificam estado".
- Consequencia: custo de copiar as candidatas a cada selecao, pequeno frente
  ao snapshot completo por passo. `freezeCopy` (em `helpers/`) e
  reutilizada.
- Alternativas descartadas: ordenacao completa das candidatas (forca sorteios
  sem efeito alem do corte) e visao apenas tipada sobre o estado vivo (um cast
  permitiria mutar o motor).

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
      #23 junto com DEC-12.
    - `findInconsistencies` tambem rejeita `executed > duration`.
    - `deepCopy` compartilha subarvores congeladas (a configuracao) em vez de
      copia-las, o que preserva a guarda de imutabilidade e reduz o custo.
- Alternativa descartada: bloquear o simulador apos um erro, o que perde um
  estado valido que poderia continuar.

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
    5. sorteio registrado (DEC-06, #20).
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
  absoluto do job.

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
      CPUs.
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

### DEC-19: Diagnosticos do parser de configuracao

- Estado: aceita em 2026-10-17 e revista em 2026-10-18 pelo usuario. Requisitos:
  REQ-06, REQ-10. Resolve Q-03; detalha DEC-10, DEC-12 e DEC-15.
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
       possam ser recuperados, em vez de parar no primeiro. Quando houver
       estrutura suficiente para montar uma configuracao sem inventar valores,
       incluir tambem todos os problemas retornados pelo nucleo; nao repetir
       suas regras semanticas. Acrescentar ao texto original de cada mensagem
       do nucleo o contexto da linha e do campo (e o valor recebido quando
       disponivel), sem alterar nem reescrever a mensagem. Em particular,
       referencias ordinais a outras tarefas permanecem como o nucleo as
       produziu; nao sao substituidas pela linha original da tarefa referida.
       A linha e o campo adicionados correspondem a tarefa que tem o problema,
       associados pelo indice da tarefa (DEC-10, DEC-15).
    4. Falhas ao acessar ou ler o arquivo sao erros de leitura, nao erros de
       conteudo: informar caminho e motivo do sistema quando disponiveis, sem
       linha nem campo.
    5. Cancelar a escolha do arquivo no dialogo nao e erro: nao gera diagnostico
       de conteudo nem de leitura, conforme #33.
- Exemplos:
    - Sintaxe: `Linha 4, campo duracao, valor "x": esperado um numero.`
    - Regra do nucleo: `Linha 6, campo id (valor 2): O id 2 já foi usado
      pela 1ª tarefa; cada tarefa precisa de um id único.`
    - Falha de acesso: `Nao foi possivel abrir o arquivo "<caminho>":
      permissao negada.`
- Justificativa: linhas originais permitem localizar erros mesmo quando o
  parser ignora linhas em branco; acumular problemas reduz ciclos de correcao.
  Preservar a mensagem do nucleo mantem a explicacao semantica aprovada e evita
  alterar referencias ordinais. Falhas de acesso nao pertencem ao conteudo e
  nao podem ser localizadas por linha/campo; cancelar a escolha e uma acao
  voluntaria, nao uma falha.
- Consequencia: sintaxe recuperavel e validacao semantica aparecem juntas
  quando a configuracao parcial pode ser formada sem valores inventados. Se a
  estrutura invalida impedir essa formacao, reportar os erros de sintaxe sem
  produzir diagnosticos semanticos artificiais. O parser preserva o texto
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

### DEC-22: Ordem dos eventos numa fronteira

- Estado: aceita em 2026-10-23 (decidida pelo usuario na #16). Requisitos:
  REQ-01, REQ-08, REQ-09. Detalha DEC-04 e DEC-11.
- Contexto: o motor registrava conclusao e perda de prazo job a job; com
  varios jobs na mesma fronteira, a perda de uma tarefa listada antes podia
  aparecer antes da conclusao de outra, ao contrario das etapas de DEC-11.
- Decisao: os eventos de uma fronteira seguem etapas globais, nesta ordem:
  todas as conclusoes (cada uma seguida do `task-finished` da tarefa, quando
  for o ultimo job), todas as perdas de prazo, todas as fatias vencidas, todas
  as ativacoes e, por fim, os eventos do despacho (`preemption`, `cpu-on`,
  `cpu-off`, por CPU). Dentro de uma etapa, a ordem segue a lista de tarefas
  e o indice do job (ou o ID da CPU), sem significado de prioridade.
- Justificativa: a lista de eventos passa a refletir o fluxo documentado do
  passo e pode ser lida linearmente pela inspecao e pelo Gantt (#37, #38).
  DEC-04 continua garantindo, por job, que conclusao no prazo nao e perda.
- Consequencia: `completeJobsAndRecordDeadlineMisses` percorre os jobs em
  duas passadas. Nenhuma escala, intervalo ou estado de job muda; so a ordem
  da lista de eventos.
- Alternativa descartada: manter a ordem job a job e restringir DEC-04 a cada
  job; deixaria a ordem do log depender da posicao das tarefas na lista.

## Fluxo de um passo

1. Executar [t, t+1) em cada CPU ocupada e registrar os intervalos.
2. Avancar o relogio para t+1.
3. Contabilizar conclusoes antes das perdas de prazo (DEC-04) e das fatias
   vencidas (#14), em etapas globais na lista de eventos (DEC-22); job que
   conclui nao registra vencimento, e o job vencido mantem o primeiro
   desempate (DEC-18).
4. Registrar as ativacoes devidas em t+1.
5. Selecionar pela politica e despachar (DEC-07, DEC-13).
6. Conferir `findInconsistencies` e publicar o snapshot t+1 (DEC-11, DEC-14).

Snapshot inicial e fronteiras seguem DEC-11; quantidade de jobs e termino seguem
DEC-09. Fixar ambos em testes antes de expor a API. Historico deve guardar
tambem resultados de edicoes no mesmo tick. Matriz de edicao (Q-02) permanece
na especificacao e nao e resolvida implicitamente por este fluxo.
