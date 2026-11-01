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
  `validateConfig` somente arquivo sem erros de sintaxe e acrescenta linha,
  campo e valor recebido aos problemas do nucleo (DEC-19); nao repete regras
  semanticas. Antes do `validateConfig`, aplica o periodo padrao a tarefa com
  periodo zero e devolve `warnings` no sucesso ou junto dos problemas do nucleo
  (DEC-29, DEC-34).

- [Snapshot](../src/core/snapshot.ts): estado inicial e copia profunda congelada.
- [Consistencia](../src/core/consistency.ts): `findInconsistencies` confere os
  fatos registrados em dobro no dominio (DEC-12, DEC-21).
- [CPUs desligadas](../src/core/cpuOff.ts): `summarizeCpuOff` deriva de um
  snapshot os intervalos e o total desligado de cada CPU (DEC-21).
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
  resolve `config.algorithm` no registro e constroi o `Simulator` (DEC-25).
- [Simulator](../src/core/simulator.ts): valida configuracao, registra ativacoes
  nos limites de tick, executa jobs, registra conclusoes/perdas de prazo
  (ordem dos eventos em DEC-22) e faz despacho global pela politica injetada,
  sorteando o empate residual relatado (DEC-27), antes de publicar snapshots
  completos (DEC-07, DEC-14); rejeita configuracao invalida com
  `ConfigValidationError` e expoe os jobs elegiveis somente para leitura
  (DEC-15).
- [useSimulation](../src/renderer/composables/useSimulation.ts): mantem instancia
  privada, publica snapshots via `shallowRef` e oferece os comandos `load` e
  `tick`, que devolvem resultado (DEC-23).
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
  desenhado com os eventos de suspensao e retomada de DEC-35, registrados
  pela #26.
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
  a tarefa durante a simulacao tambem a termina (DEC-35, proposta).
- Excecao (DEC-35, proposta): periodo editado depois do ingresso recalcula
  as ativacoes restantes a partir da ultima ativacao, e a formula
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
    - Estado do gerador pseudoaleatorio entra no snapshot como `drawState`
      (#20, DEC-27).
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
    - Suspensao: `JobState` tem `suspended`, mas ainda nao ha eventos de
      suspensao e retomada; a partir dos eventos e intervalos registrados nao
      se reconstroem os trechos suspensos que o Gantt exige (REQ-09). Eventos
      definidos em DEC-35 (#25); registro na #26 e consumo no Gantt (#38).
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
      #23 junto com DEC-12. Efeito medido na memoria do historico em DEC-30.
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

- Estado: aceita em 2026-10-17 e revista em 2026-10-18 e em 2026-10-28 (revisao
  do PR #84, #31, e decisao da #94) pelo usuario. Requisitos: REQ-06, REQ-10. Resolve Q-03;
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
       original de cada mensagem do nucleo o contexto da linha e do campo (e
       o valor recebido quando disponivel), sem alterar nem reescrever a
       mensagem. Em particular,
       referencias ordinais a outras tarefas permanecem como o nucleo as
       produziu; nao sao substituidas pela linha original da tarefa referida.
       A linha e o campo adicionados correspondem a tarefa que tem o problema,
       associados pelo indice da tarefa (DEC-10, DEC-15). Problema causado
       por varios campos juntos (o nucleo o marca como `combined`, por
       exemplo o prazo da ultima ativacao) recebe linha e campo, sem valor
       recebido, porque o texto de um so campo apontaria um valor que pode
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
    - Regra do nucleo: `Linha 6, campo id (valor 2): O id 2 já foi usado
      pela 1ª tarefa; cada tarefa precisa de um id único.`
    - Falha de acesso: `Nao foi possivel abrir o arquivo "<caminho>":
      permissao negada.`
- Justificativa: linhas originais permitem localizar erros mesmo quando o
  parser ignora linhas em branco; acumular problemas reduz ciclos de correcao.
  Preservar a mensagem do nucleo mantem a explicacao semantica aprovada e evita
  alterar referencias ordinais. O nucleo numera as tarefas pela posicao na
  lista que recebe; validar sem uma linha descartada deslocaria esses
  ordinais e esconderia conflitos com ela, entao uma segunda rodada de
  correcao e preferivel a mensagens enganosas (revisao de 2026-10-28). O
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
    - Trocar o algoritmo durante a simulacao foi permitido por DEC-35 (#25);
      a fabrica concentra a resolucao e vira resolvedor na #26.
    - Empate de prioridade no corte de CPUs segue DEC-16 e, se residual, o
      sorteio de DEC-27 (#20); nao cai mais na ordem do arquivo.

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

### DEC-35: Matriz de edicao durante a simulacao

- Estado: proposta em 2026-10-31 na #25, com as escolhas do usuario;
  revista em 2026-11-01 com a revisao do PR #101 (periodo apos a ultima
  ativacao, fatia nova apos edicao do estado ou remocao de CPU, desvios do
  enunciado explicitados); aguardando aceite. Requisitos: REQ-05, REQ-08, REQ-09. Resolve Q-02 e a
  pendencia de suspensao de DEC-12. Detalha DEC-02, DEC-09, DEC-10 e DEC-29.
- Contexto: o enunciado permite modificar o estado atual ou as
  caracteristicas de qualquer tarefa em qualquer passo (A.1.5.2, A.3.4) e
  configurar o sistema durante a simulacao (A.3.1); mudanca invalida e
  recusada com o motivo. REQ-05 exige rejeicao sem aplicacao parcial e
  recalculo a partir do estado editado.
- Principio: nenhuma edicao altera o historico do que ja executou. Trechos,
  eventos e jobs anteriores a edicao permanecem como foram registrados,
  inclusive os de tarefas e CPUs removidas. A unica excecao e a cor, que e
  apresentacao e nao fato da simulacao.
- Momento: a edicao e feita sobre o estado do instante atual `t`, entre
  passos. Editar um instante do passado descarta o futuro anterior (REQ-05,
  #24). Varias edicoes no mesmo instante sao aplicadas em ordem, e o
  historico guarda o resultado de cada uma.
- Matriz das caracteristicas da tarefa:

    | Item             | Editavel           | Efeito                                      |
    | ---------------- | ------------------ | ------------------------------------------- |
    | ID               | nao                | identidade da tarefa e ordem do Gantt       |
    | Cor              | sim                | todo o Gantt da tarefa, inclusive o passado |
    | Ingresso         | antes de ingressar | reagenda a primeira ativacao                |
    | Duracao          | sim                | somente ativacoes posteriores a edicao      |
    | Periodo          | sim                | ativacoes posteriores e prioridade RM       |
    | Prazo relativo   | sim                | somente ativacoes posteriores a edicao      |
    | Ticks executados | nao                | progresso so muda executando                |
    1. Ingresso so muda enquanto a tarefa nao ingressou (antes da primeira
       ativacao) e nunca para antes de `t`; igual a `t` ativa o primeiro job
       em `t`. Depois do ingresso, a edicao e recusada e a tela (#37) mostra o
       campo bloqueado, com a explicacao ao passar o cursor: "O ingresso nao
       pode ser alterado pois a tarefa ja ingressou." O enunciado nao limita
       a edicao do ingresso; a restricao e decisao do projeto, porque mudar
       o ingresso de uma tarefa que ja ingressou reescreveria uma ativacao
       ocorrida, contra o principio acima.
    2. Jobs ja ativados mantem duracao e prazo absoluto que receberam; a tela
       precisa deixar isso claro ao usuario (#37).
    3. Com periodo editado, as ativacoes restantes passam a seguir o novo
       periodo (cenarios de FE-12). O limite de dez jobs (DEC-09) continua
       contado desde o ingresso. A formula `ingresso + k * periodo` de
       DEC-09 deixa de valer para tarefas com periodo editado depois do
       ingresso. A prioridade RM, porem, nao fica congelada por job: na
       selecao refeita em `t` (recalculo, abaixo) e nas seguintes, todos os
       jobs da tarefa, inclusive os ja ativados, usam o periodo vigente
       (FE-12). No EDF nada muda para jobs ja ativados, pois o prazo
       absoluto de cada um e fixo. Ativacoes restantes:
        - Tarefa que ainda nao ingressou: ativacoes em ingresso + k * novo
          periodo, com k de 0 a 9, como em DEC-09.
        - Tarefa que ja ativou algum job: a proxima ativacao e a ultima
          ativacao + novo periodo. Se esse instante e anterior a `t`, ha uma
          unica ativacao em `t`, e as seguintes vem a cada novo periodo a
          partir dela; ativacoes vencidas nao se acumulam.
    4. Cada item respeita os limites de DEC-10: duracao >= 1, prazo
       relativo >= 1 e tempos derivados na faixa de inteiros exatos. Periodo
       segue DEC-10 com a restricao de DEC-29 (itens 3 e 4) para o Projeto
       A: a validacao das telas recusa periodo zero e parte do padrao 15 em
       tarefa nova; o nucleo continua aceitando zero. Tornar uma tarefa
       aperiodica, ou o contrario, fica para o Projeto B. O limite de tempos
       derivados de DEC-10 (ingresso + 9 * periodo + prazo) passa a ser
       conferido sobre as ativacoes restantes com os valores editados.
    5. Tarefa terminada (DEC-09) nao aceita nenhuma edicao, inclusive de cor,
       e a recusa informa que a tarefa ja terminou; ela ainda pode ser
       removida (inclusao e remocao, abaixo).
    6. Tarefa que ja ativou todos os seus jobs, mas ainda nao terminou,
       recusa duracao e prazo, porque jobs ativados mantem os valores que
       receberam (item 2) e nao ha ativacao futura. Periodo continua aceito
       e guardado, sem gerar nova ativacao: no RM muda a prioridade dos jobs
       incompletos a partir da selecao refeita em `t` (item 3); no EDF nao
       muda a escala, mas o valor vigente vale se o algoritmo voltar a RM.

- Estado do job, mudado manualmente pelo usuario:

    | De \ Para  | pronto       | suspenso         | executando | concluido  |
    | ---------- | ------------ | ---------------- | ---------- | ---------- |
    | pronto     | sem efeito   | suspende         | recusado   | recusado   |
    | executando | libera a CPU | suspende, libera | sem efeito | recusado   |
    | suspenso   | retoma       | sem efeito       | recusado   | recusado   |
    | concluido  | recusado     | recusado         | recusado   | sem efeito |
    1. Somente o escalonador poe um job em execucao, e o job so conclui
       executando a duracao. Levar a tarefa inteira a concluido e a acao de
       encerrar tarefa, abaixo, e nao uma mudanca de estado de job. A
       mudanca para o proprio estado e aceita sem efeito e sem evento.
       Desvio do enunciado, decidido no projeto: o enunciado permite mudar o
       estado atual de qualquer tarefa (introducao do item 4, A.1.5.2,
       A.3.4); aqui executando fica com o escalonador e concluido so vem do
       encerramento da tarefa. Por em execucao a mao contornaria a selecao
       da politica, e concluir um job sem executar a duracao contradiria
       DEC-09; ambos quebrariam as invariantes do nucleo.
    2. Suspender nao pausa o prazo (REQ-08) e nao libera o job seguinte da
       tarefa (DEC-02). Pronto apenas devolve o job a disputa: job posterior
       continua esperando o mais antigo incompleto.
    3. Job que deixa a CPU por edicao encerra seu trecho em `t`.
    4. Job em execucao posto em pronto pode ser escolhido de novo ja na
       selecao refeita em `t`, na mesma ou em outra CPU. Se for, comeca uma
       fatia nova, com o quantum inteiro: a edicao do estado zera a fatia em
       curso.

- Encerrar tarefa (mover para concluido): permitido a qualquer instante
  para tarefa ainda nao terminada e vale de `t` em diante.
    1. O job em execucao, se houver, libera a CPU em `t`; jobs incompletos
       (pronto, executando ou suspenso) sao interrompidos em `t` e nao
       recebem `completion`, pois nao executaram a duracao; nao ha novas
       ativacoes.
    2. Registra `task-finished` em `t`, com o mesmo marcador de termino no
       Gantt, e a tarefa passa a terminada: nenhuma edicao e aceita depois
       (item 5 da matriz). Perdas de prazo anteriores a `t` permanecem; jobs
       interrompidos nao geram perdas depois de `t`.
    3. A inspecao (#37) nao mostra jobs interrompidos como concluidos
       normalmente.
    4. Revisa DEC-09 e DEC-12: a tarefa termina quando o ultimo job conclui
       ou quando e encerrada; o termino deixa de ser derivado apenas das
       ativacoes e conclusoes, e a forma de guarda-lo fica com a #26.
- Inclusao e remocao de tarefas:
    1. Incluir e permitido a qualquer instante, com os limites de DEC-10 e
       DEC-29 (periodo padrao 15, periodo zero recusado). Ingresso menor que
       `t` e recusado; ingresso igual a `t` ativa o primeiro job em `t`. O ID
       e gerado pelo sistema (FE-19) como maior ID ja usado + 1, e nunca
       repete o de uma tarefa da simulacao, inclusive removida.
    2. Remover e permitido a qualquer instante e vale de `t` em diante:
       encerra o job em execucao, se houver, liberando a CPU em `t`, e apaga
       a tarefa e todos os seus jobs do estado. Snapshots anteriores a `t`
       nao mudam, e o Gantt mantem o que a tarefa ja executou ate a remocao.
       Tarefa terminada tambem pode ser removida: remover nao e edicao e
       apenas a retira da lista de tarefas da interface, sem mudar o
       historico.
- Parametros do sistema:
    1. Algoritmo (RM ou EDF): escolhido antes da simulacao e editavel
       durante ela; vale a partir da selecao em `t`.
    2. Quantum (>= 1): vale imediatamente, inclusive para a fatia em curso.
       Fatia que ja usou o novo quantum vence em `t`, com `quantum-expired`
       em `t`, e o job volta a selecao (DEC-18).
    3. Quantidade de CPUs (>= 1): aumentar acrescenta CPUs com os IDs
       seguintes; reduzir remove as de maior ID, e o job em execucao nelas
       volta a pronto. O Gantt mantem o passado das CPUs removidas. Job que
       volta a pronto pela remocao e escolhido de novo em `t`, em outra CPU,
       comeca uma fatia nova, com o quantum inteiro.
- Recalculo: apos uma edicao valida, o motor refaz a selecao e o despacho de
  `t` (DEC-07, DEC-13, DEC-27) sobre o estado editado, para que CPU liberada,
  algoritmo novo ou tarefa ingressando em `t` tenham efeito ja em [t, t+1).
    1. O novo despacho substitui o anterior de `t`, que ainda nao executou:
       os eventos de despacho de `t` (`tie-break`, `preemption`, `cpu-on`,
       `cpu-off`) sao recalculados, nao acumulados. Assim uma CPU nao
       registra desligar e religar no mesmo instante (DEC-21).
    2. Preempcao e criterio "estava executando" (DEC-18) se referem aos jobs
       que executaram em [t-1, t), nao aos despachados em `t`. Job que
       deixou a CPU por edicao (`released`, `suspension` ou `cpu-removed`)
       nao registra `preemption` em `t`, seja ou nao escolhido de novo: o
       evento da edicao ja explica a saida.
    3. Mudanca so de cor, ou para o proprio estado, nao refaz a selecao nem
       o sorteio; as demais edicoes validas refazem ambos.
    4. Varias edicoes no mesmo `t` geram um snapshot por edicao; o tick `t`
       na navegacao mostra o ultimo deles, e editar de novo em `t` parte
       desse estado. Navegar entre edicoes intermediarias fica com a #24.
- Rejeicao: edicao com qualquer item invalido e recusada inteira, sem
  aplicacao parcial; a mensagem cita cada item recusado e o motivo.
- Eventos novos, todos com `time = t`:
    - `suspension` (`job`, `cpuId` ou `null`): job passa a suspenso; `cpuId`
      indica a CPU liberada.
    - `resumption` (`job`): job suspenso volta a pronto.
    - `released` (`job`, `cpuId`): job em execucao volta a pronto por edicao
      do estado.
    - `task-removed` (`taskId`).
    - `cpu-removed` (`cpuId`, `job` ou `null`): CPU removida e o job que
      voltou a pronto.
- Uso dos eventos: o Gantt (#38) reconstroi o trecho suspenso de
  `suspension` ate `resumption`, encerramento ou remocao da tarefa ou fim
  do historico. Nao
  ha campo de origem: no Projeto A toda mudanca vem de edicao; o Projeto B o
  acrescenta para a lista de eventos do arquivo (A.3.3.5). Os eventos da
  edicao seguem os do passo em `t` e precedem os do novo despacho (DEC-22).
- Justificativa: escolhas do usuario na #25. Aplicar edicoes so ao futuro
  mantem prazos e progresso de jobs ativados coerentes com o que o Gantt ja
  mostra; reservar execucao e conclusao ao escalonador preserva as
  invariantes do nucleo. Quantum imediato nao exige novo campo no modelo,
  pois `sliceElapsed` ja existe.
- Alternativas descartadas:
    - Fatia em curso terminar com o quantum antigo: coerente com a regra das
      ativacoes, mas exige guardar o quantum de cada fatia (muda DEC-12) e
      adia o efeito visivel.
    - Remover a tarefa tambem do Gantt passado: reescreveria o historico.
    - Redesenhar so as fatias futuras com a nova cor: a cor nao e fato da
      simulacao, e duas cores para a mesma tarefa confundiriam a legenda.
- Revisa DEC-09 e DEC-12 quanto ao termino da tarefa (encerrar tarefa,
  acima); revisa DEC-12 tambem porque cada job passa a guardar a duracao
  que recebeu, ja que a da tarefa pode mudar depois (forma com a #26).
- Revisa DEC-25: a troca de algoritmo durante a simulacao justifica a
  alternativa ali descartada de o motor resolver a politica pelo algoritmo
  vigente; a forma fica com a #26.
- Revisa DEC-21: CPUs removidas continuam com seus intervalos e eventos
  passados validos na consulta de CPU desligada e em `findInconsistencies`.
- Revisa expectativas do [renderer](../src/renderer/docs/specification.md):
  ajuste de progresso (FE-14) e edicao de ID (FE-19, FE-DEC-07) saem do
  Projeto A; reagendar o ingresso antes da primeira ativacao (FE-19) e
  mantido; troca de algoritmo durante a simulacao (FE-16) passa a
  ser permitida.
- Consequencia: #26 implementa a matriz, o encerramento de tarefa, o
  recalculo de `t` e os eventos;
  #37 oferece somente as mudancas permitidas e o aviso sobre jobs ja
  ativados; #38 desenha trechos suspensos e encerra as linhas de tarefas e
  CPUs removidas. Edicoes que deixam jobs suspensos indefinidamente, ou todas
  as tarefas removidas, alimentam a Q-06 (#27).

## Fluxo de um passo

1. Executar [t, t+1) em cada CPU ocupada e registrar os intervalos.
2. Avancar o relogio para t+1.
3. Contabilizar conclusoes antes das perdas de prazo (DEC-04) e das fatias
   vencidas (#14), em etapas globais na lista de eventos (DEC-22); job que
   conclui nao registra vencimento, e o job vencido mantem o primeiro
   desempate (DEC-18).
4. Registrar as ativacoes devidas em t+1.
5. Selecionar pela politica, sortear o empate residual e despachar (DEC-07,
   DEC-13, DEC-27).
6. Conferir `findInconsistencies` e publicar o snapshot t+1 (DEC-11, DEC-14).

Snapshot inicial e fronteiras seguem DEC-11; quantidade de jobs e termino seguem
DEC-09. Fixar ambos em testes antes de expor a API. Historico deve guardar
tambem resultados de edicoes no mesmo tick. Edicao valida em `t` refaz o passo
5 sobre o estado editado (DEC-35).
