# Arquitetura e decisoes

Leia a [especificacao](specification.md) para requisitos e o [plano](plan.md)
para andamento. Este documento descreve responsabilidades e escolhas, nao
afirma que os modulos planejados ja existem.

## Base existente

- [Simulator](../src/core/simulator.ts): apenas relogio e copia do snapshot.
- [useSimulation](../src/renderer/composables/useSimulation.ts): mantem instancia
  privada e publica snapshots via `shallowRef`.
- [Processo principal](../src/main/main.ts): janela Electron.
- [Preload](../src/preload/preload.ts): ainda sem API de arquivos.

## Modulos planejados

Os nomes abaixo indicam responsabilidades; criar arquivos somente conforme a
entrega precisar, sem gerar toda a estrutura antecipadamente.

| Modulo | Responsabilidade | Dependencias permitidas |
| --- | --- | --- |
| Dominio | TCBs, jobs, CPUs, configuracao, estados e eventos | TypeScript puro |
| Motor | Ativacoes, ticks, execucao, quantum e prazos | Dominio, contrato de politica |
| Politicas | Prioridade RM/EDF e selecao com desempates | Visao somente de leitura do dominio |
| Despacho | Elegibilidade, preempcao e atribuicao de CPUs | Dominio, resultado da politica |
| Historico | Snapshots, cursor, restauracao e ramificacao por edicao | Estado completo do motor |
| Configuracao | Parser texto e validacao semantica | Dominio |
| Adaptador Vue | Comandos e publicacao de snapshots | Vue e core |
| Visualizacao | Gantt, inspecao, edicao e imagem exportavel | Snapshots e eventos |
| Arquivos | Dialogos, leitura e gravacao autorizadas | Electron main, preload e tipos shared |

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

## Fluxo proposto de um passo

1. No instante t, registrar ativacoes devidas e atualizar elegibilidade.
2. Selecionar jobs e despachar nas CPUs, considerando contexto anterior.
3. Executar um tick em cada CPU ocupada e registrar intervalos [t, t+1).
4. Em t+1, contabilizar conclusoes, detectar perdas de prazo e fatias vencidas.
5. Publicar snapshot completo; ativacoes de t+1 entram antes do proximo despacho.

Fixar em testes a convencao exata do snapshot inicial e das fronteiras antes de
expor a API. Historico deve guardar tambem resultados de edicoes no mesmo tick.
Questao de dez jobs e matriz de edicao permanecem na especificacao, nao sao
resolvidas implicitamente por este fluxo.