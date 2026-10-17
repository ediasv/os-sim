# Plano e acompanhamento

Atualizado em 2026-10-17. Escopo, evidencias e trabalho atual para humanos e
agentes; o estado de cada item fica no [GitHub Project](https://github.com/users/ediasv/projects/2).
Leia a [especificacao](specification.md) e a [arquitetura](architecture.md).

## Convencoes

- Itens das entregas E1-E6 sao issues (`#N`) no Project, com campos `Status`
  e `Fase`. Issue fechada ou `Done` exige evidencia de verificacao registrada.
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
- #10 Definir contrato somente de leitura para politica injetada. Em revisao no
  PR #48 (DEC-13); evidencia em "Trabalho atual".
- #11 Resolver Q-01/Q-03 aplicaveis ao modelo e convencao inicial dos snapshots.
  Concluida em 2026-10-16: DEC-09, DEC-10 e DEC-11; Q-07 aberta para E2.
- [x] #12 Implementar ativacoes e elegibilidade sequencial por tarefa (PR #49 merged).
      DEC-13: a regra do job mais antigo incompleto (DEC-02) e conferida somente
      aqui; `buildPolicyView` nao a verifica. Implementacao no PR #49: validacao da
      configuracao, ativacoes em cada fronteira (incluindo snapshot 0), prazo
      individual e elegibilidade de um job incompleto por tarefa. Evidencia:
      `npm test` 103/103, `npm run lint` e `npm run typecheck` aprovados.
- [x] #13 Implementar despacho global e execucao por tick com politica de teste.
      O motor injeta uma politica, valida a decisao, despacha globalmente, executa
      cada tick, registra conclusoes/perdas de prazo e desliga CPUs sem trabalho.
      CPUs iniciam com `offSince: null`; o despacho inicial define `0` e registra
      `cpu-off` quando ociosa. `findInconsistencies` deve ser vazio apos cada
      despacho. Politica e dependencia obrigatoria do construtor; a UI
      so instancia o motor ao iniciar com politica e configuracao. Evidencia
      (2026-10-17): `npm test` 112/112,
      `npm run lint` e `npm run typecheck` aprovados; RM/EDF seguem para E2.
- #14 Implementar quantum e preservacao de contexto na retomada/migracao.
- #15 Implementar conclusao, perda de prazo e intervalos de CPUs desligadas.
  A representacao inicial e as transicoes `cpu-off`/`cpu-on`, conclusoes e
  perdas de prazo foram antecipadas na #13 para executar ticks; manter na #15 o
  fechamento da verificacao de intervalos e dos criterios especificos dessa issue.
- #16 Testar fronteiras, sobreposicao, quantum, preempcao e multiplas CPUs.
- #17 Verificar compatibilidade do contador/adaptador Vue durante a evolucao.

### E2: Politicas obrigatorias

Requisito: REQ-07.

- #18 Resolver Q-04/Q-07 e avaliar DEC-07 antes de definir selecao multiprocessador.
- #19 Implementar RM e EDF separados do motor.
- #20 Implementar desempates completos, sorteio com estado e evento correspondente.
- #21 Testar exemplos das figuras 2.5/2.6 e casos de empate/multiplas CPUs.
- #22 Nao apresentar limites teoricos uniprocessador como garantia multiprocessador.

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

Requisitos: REQ-05, REQ-06.

- #29 Definir diagnosticos do parser restantes de Q-03 (valores em DEC-10).
- #30 Parser com linhas vazias, espacos, caixa e terminador opcional.
- #31 Validar IDs, cores, tempos e parametros com diagnosticos precisos.
- #32 Preservar eventos sem executa-los; tratar periodo ausente como aperiodica.
- #33 Dialogo de arquivo via main/preload, com API pequena e tipos compartilhados.
- #34 Testar arquivos validos/invalidos e falhas de leitura, sem caminho fixo.

### E5: Interface e Gantt

Requisitos: REQ-04, REQ-05, REQ-09, REQ-10.

- #35 Resolver Q-05 e avaliar DEC-08 antes da implementacao visual.
- #36 Controles de configuracao, execucao e navegacao pelo historico.
- #37 Inspecao de TCBs/jobs/CPUs e edicao com erros claros.
- #38 Gantt, IDs ordenados, cores, suspensao, CPUs, marcadores e legenda.
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

- Estado: E0, #9 (PR #46), #10 (PR #48), #11, #12 (PR #49) e #13
  implementados; evidencias registradas acima.
- #13 objetivo: implementar despacho global e execucao por tick com politica
  injetada, sem acoplar o motor a RM/EDF.
- Feito: selecao validada por politica, atribuicao global, execucao e intervalos
  por CPU, conclusao/prazo, transicoes de CPU ociosa e snapshots consistentes.
- Verificacao (2026-10-17): `npm test` 111/111, `npm run lint` e
  `npm run typecheck` aprovados. Aplicativo Electron nao executado; RM/EDF ainda
  nao existem e politicas sao exercitadas pelos testes.
- Proximo passo: resolver Q-04/Q-07 e quantum/contexto na #14/#18.
- Pendencias: Q-02 e Q-04 a Q-07 conforme fase; DEC-07/08 ainda propostas;
  quantum vencido e `previousCpu` (DEC-13) para #14/#18.
- Bloqueios: nenhum.

## Como registrar uma entrega

Ao iniciar um item, mover sua issue para `In Progress`. Ao concluir, fechar a
issue (ou usar `Closes #N` no PR) e atualizar trabalho atual; registrar aqui
arquivos/PR relevantes, verificacao executada e resultado, limitacoes e proximo
passo. Nao marcar teste como aprovado por existir arquivo de teste.

Para iniciar trabalho, substituir "Trabalho atual" por objetivo, escopo, passos
pendentes e bloqueios concretos. Ao pausar, deixar o proximo passo executavel e
dizer o que foi realmente verificado.
