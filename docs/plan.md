# Plano e acompanhamento

Atualizado em 2026-10-12. Fonte unica de andamento para humanos e agentes.
Leia a [especificacao](specification.md) e a [arquitetura](architecture.md).

## Convencoes

- `[ ]`: nao entregue; `[x]`: entregue com evidencia de verificacao.
- Trabalho parcial continua desmarcado e aparece em "Trabalho atual".
- Registrar bloqueios explicitamente; nao marcar uma fase inteira por ter
  implementado apenas parte dela. Propostas de arquitetura nao sao codigo pronto.
- Atualizar durante a implementacao e ao encerrar a sessao. Git guarda historico;
  este arquivo guarda estado atual, sem diarios separados por agente.

## Base existente

- [x] Estrutura Electron/Vue/TypeScript e comandos de qualidade configurados.
- [x] Contador de ticks, snapshots simples e adaptador Vue.
- [x] Testes existentes do contador e composable.

Evidencia: inspecao de [package.json](../package.json),
[simulator.ts](../src/core/simulator.ts),
[simulator.test.ts](../src/core/simulator.test.ts) e
[useSimulation.test.ts](../src/renderer/composables/useSimulation.test.ts).
Existencia verificada por leitura; testes nao executados nesta entrega documental.
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

- [ ] Definir TCBs, jobs, CPUs, configuracao, eventos e snapshots.
- [ ] Definir contrato somente de leitura para politica injetada.
- [ ] Resolver Q-01/Q-03 aplicaveis ao modelo e convencao inicial dos snapshots.
- [ ] Implementar ativacoes e elegibilidade sequencial por tarefa.
- [ ] Implementar despacho global e execucao por tick com politica de teste.
- [ ] Implementar quantum e preservacao de contexto na retomada/migracao.
- [ ] Implementar conclusao, perda de prazo e intervalos de CPUs desligadas.
- [ ] Testar fronteiras, sobreposicao, quantum, preempcao e multiplas CPUs.
- [ ] Verificar compatibilidade do contador/adaptador Vue durante a evolucao.

### E2: Politicas obrigatorias

Requisito: REQ-07.

- [ ] Resolver Q-04 e avaliar DEC-07 antes de definir selecao multiprocessador.
- [ ] Implementar RM e EDF separados do motor.
- [ ] Implementar desempates completos, sorteio com estado e evento correspondente.
- [ ] Testar exemplos das figuras 2.5/2.6 e casos de empate/multiplas CPUs.
- [ ] Nao apresentar limites teoricos uniprocessador como garantia multiprocessador.

### E3: Controle, historico e edicao

Requisitos: REQ-04, REQ-05.

- [ ] Armazenar/restaurar snapshots completos, cursor e estado dos sorteios.
- [ ] Implementar avancar/retroceder reutilizando futuro ainda valido.
- [ ] Resolver Q-02: matriz de alteracoes validas e seus efeitos.
- [ ] Aplicar edicoes atomicas e invalidar futuro somente apos validacao.
- [ ] Implementar execucao completa cancelavel e tratar Q-06.
- [ ] Testar restauracao, ramificacao, rejeicao de edicoes e falta de progresso.

### E4: Configuracao e arquivos

Requisitos: REQ-05, REQ-06.

- [ ] Resolver valores padrao e detalhes de validacao restantes de Q-03.
- [ ] Parser com linhas vazias, espacos, caixa e terminador opcional.
- [ ] Validar IDs, cores, tempos e parametros com diagnosticos precisos.
- [ ] Preservar eventos sem executa-los; avisar sobre tarefas aperiódicas ignoradas.
- [ ] Dialogo de arquivo via main/preload, com API pequena e tipos compartilhados.
- [ ] Testar arquivos validos/invalidos e falhas de leitura, sem caminho fixo.

### E5: Interface e Gantt

Requisitos: REQ-04, REQ-05, REQ-09, REQ-10.

- [ ] Resolver Q-05 e avaliar DEC-08 antes da implementacao visual.
- [ ] Controles de configuracao, execucao e navegacao pelo historico.
- [ ] Inspecao de TCBs/jobs/CPUs e edicao com erros claros.
- [ ] Gantt, IDs ordenados, cores, suspensao, CPUs, marcadores e legenda.
- [ ] Exportar imagem integral dos dados, sem screenshot nem corte temporal.
- [ ] Verificar visualmente estados, controles, legibilidade e exportacao extensa.

### E6: Entrega e demonstracao

Requisito: REQ-10; integracao de todos os anteriores.

- [ ] Revisar cada criterio de aceitacao e seus testes/evidencias.
- [ ] Revisar comentarios de componentes/funcoes e justificativas das decisoes.
- [ ] Executar testes, lint e typecheck; registrar falhas preexistentes separadamente.
- [ ] Gerar e testar pacote sem instalar runtime extra no ambiente-alvo.
- [ ] Preparar cenarios de demonstracao, incluindo sobrecarga e prazo perdido.

## Trabalho atual

- Estado: E0 concluida; nenhuma implementacao funcional em andamento.
- Proximo objetivo: E1, comecando pelos tipos e contrato de politica.
- Escopo do proximo incremento: dominio e testes; sem parser, UI nova ou RM/EDF.
- Proximo passo: ler REQ-01/02/03/07/08 e DEC-01 a DEC-05; fechar questoes que
  afetem o modelo antes de editar.
- Pendencias: Q-01 a Q-06 conforme fase; DEC-07/08 ainda propostas.
- Bloqueios de E0: nenhum.

## Como registrar uma entrega

Ao concluir uma etapa, atualizar seus checks e trabalho atual; registrar aqui
arquivos/PR relevantes, verificacao executada e resultado, limitacoes e proximo
passo. Nao marcar teste como aprovado por existir arquivo de teste.

Para iniciar trabalho, substituir "Trabalho atual" por objetivo, escopo, passos
pendentes e bloqueios concretos. Ao pausar, deixar o proximo passo executavel e
dizer o que foi realmente verificado.