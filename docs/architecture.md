# Arquitetura e decisoes

Leia a [especificacao](specification.md) para requisitos e o [plano](plan.md)
para andamento. Este documento descreve responsabilidades e escolhas, nao
afirma que os modulos planejados ja existem.

## Base existente

- [Dominio](../src/core/domain.ts): tipos de configuracao, TCB, job, CPU,
  intervalos, eventos e snapshot (DEC-12).
- [Configuracao](../src/core/config.ts): `validateConfig` com as regras de DEC-10.
- [Snapshot](../src/core/snapshot.ts): estado inicial e copia profunda congelada.
- [Consistencia](../src/core/consistency.ts): `findInconsistencies` confere os
  fatos registrados em dobro no dominio (DEC-12).
- [Elegibilidade](../src/core/eligibility.ts): seleciona o job incompleto mais
  antigo de cada tarefa, sem liberar jobs posteriores quando ele esta suspenso
  (DEC-02).
- [Politica](../src/core/policy.ts): contrato da politica injetada, visao
  congelada e conferencia da decisao (DEC-13); RM/EDF continuam para E2.
- [Simulator](../src/core/simulator.ts): valida configuracao, registra ativacoes
  nos limites de tick, executa jobs, registra conclusoes/perdas de prazo e faz
  despacho global pela politica injetada antes de publicar snapshots completos.
  A politica e obrigatoria no construtor, inclusive para configuracoes sem
  tarefas; a UI nao instancia o motor antes de receber configuracao e politica.
- [useSimulation](../src/renderer/composables/useSimulation.ts): mantem o
  simulador privado; cria uma instancia somente ao receber configuracao e
  politica obrigatoria, e publica snapshots via `shallowRef`.
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
  desempate. Continuidade sem interrupcao preserva consumo da fatia.
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

- Estado: proposta. Requisitos: REQ-02, REQ-07.
- Decisao proposta: consultar politica a cada tick; preservar CPU de jobs que
  continuam selecionados e preencher vagas com os demais selecionados.
- Justificativa: detectar preempcao antes do quantum sem migracoes desnecessarias.
- Consequencia: distinguir selecao global de atribuicao por CPU; nao tornar
  permanencia na CPU um criterio superior a prioridade da politica.

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
  de ativacao. Prioridade RM para periodo zero fica em Q-07.

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
  aplicacao parcial; o parser (E4) apenas acrescenta linha e campo ao erro.
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
  `deadline-miss`. `findInconsistencies` exige que cada par concorde (um job em
  no maximo uma CPU, uma unica perda registrada por job); testes do motor
  (#13, #15) devem verificar lista vazia apos cada passo.
- Pendencias conhecidas do modelo, registradas no plano:
    - CPU ociosa (resolvida na #13): CPUs sem trabalho iniciam desligadas desde
      o tick 0 (`offSince: 0`); despacho registra religamento/desligamento e
      `findInconsistencies` e aplicado apos cada despacho. Testes conferem a
      consistencia em cada snapshot inspecionado (REQ-02, DEC-05).
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
  candidatas, repetido ou quantidade errada) como erro da politica. Com a
  lista vazia, o motor guarda somente `selectedRefs(decision)`, copias
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
    - O motor monta a visao antes de liberar as CPUs. Se job com quantum vencido
      conta como "executava antes da selecao" fica para #14/#18.
    - Sorteio do empate residual entra no contrato com a #20, em nova decisao
      que estende visao e decisao; esta decisao nao reserva campos para ele.
    - Q-04 e Q-07 continuam abertas: a visao expoe job e definicao para que
      #18/#19 escolham os campos sem mudar o contrato.
- Justificativa: conjunto selecionado basta ao despacho e so exige sorteio
  quando o empate cruza o corte; copia congelada garante, tambem em tempo de
  execucao, o invariante "Politicas nao modificam estado".
- Consequencia: custo de copiar as candidatas a cada selecao, pequeno frente
  ao snapshot completo por passo. `freezeCopy` (em `helpers/`) e
  reutilizada.
- Alternativas descartadas: ordenacao completa das candidatas (forca sorteios
  sem efeito alem do corte) e visao apenas tipada sobre o estado vivo (um cast
  permitiria mutar o motor).

## Fluxo proposto de um passo

1. No instante t, registrar ativacoes devidas e atualizar elegibilidade.
2. Selecionar jobs e despachar nas CPUs, considerando contexto anterior.
3. Executar um tick em cada CPU ocupada e registrar intervalos [t, t+1).
4. Em t+1, contabilizar conclusoes, detectar perdas de prazo e fatias vencidas.
5. Publicar snapshot completo; ativacoes de t+1 entram antes do proximo despacho.

Snapshot inicial e fronteiras seguem DEC-11; quantidade de jobs e termino seguem
DEC-09. Fixar ambos em testes antes de expor a API. Historico deve guardar
tambem resultados de edicoes no mesmo tick. Matriz de edicao (Q-02) permanece
na especificacao e nao e resolvida implicitamente por este fluxo.
