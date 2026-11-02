# Cenarios de demonstracao (Projeto A, #45)

Arquivos de configuracao no formato do REQ-06 (`algoritmo;quantum;qtde_cpus`,
depois `id;cor;ingresso;duracao;periodo;prazo;lista_eventos`), para abrir pelo
seletor de arquivo do aplicativo na Defesa A (enunciado A.3.3.7). O formato nao
define comentarios, entao as descricoes ficam aqui. Os arquivos nao entram no
pacote do aplicativo; ficam no repositorio.

Cada arquivo e lido do disco, carregado e simulado por
[`src/main/demoConfigs.test.ts`](../src/main/demoConfigs.test.ts), que confere
os resultados abaixo. Os instantes foram derivados a mao das regras (DEC-04,
DEC-09, DEC-16, DEC-18, DEC-22) e das figuras 2.5 e 2.6 do enunciado.
`[a, b)` e o intervalo executado: de `a` ate `b`, sem incluir `b`. Tarefas
sao citadas por ID; `J(t, i)` e o job `i` da tarefa `t`, contado de 0.

**Nao verificado:** a conferencia de cada cenario na interface do aplicativo e
o roteiro de edicao e retrocesso. Dependem de E3 e E5 (#23 a #28, #36 a #40) e
continuam pendentes na #45.

## Ordem sugerida e resultado esperado

| Arquivo                            | O que mostra                                                                                                            | Resultado esperado                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-rm-figura-2-5.txt`             | RM, 1 CPU, tabela 2.1 (A, B, C), quantum 100.                                                                           | Ate t=360: C = J(3,0) e preemptada em 100, 150 e 200 por A e B; C conclui em 240; CPU desligada em [240, 300); nenhuma perda de prazo nem quantum vencido.                                                                                                                                      |
| `02-edf-figura-2-6.txt`            | EDF, 1 CPU, utilizacao 100%, quantum 25.                                                                                | Ate t=55: nenhuma perda de prazo; B = J(2,0) e preemptada em 20 e executa [10, 20) e [30, 45); A executa [0, 10), [20, 30) e [45, 55).                                                                                                                                                          |
| `03-rm-figura-2-6.txt`             | Mesmas tarefas sob RM.                                                                                                  | Perda de prazo de J(2,0) em t=50, registrada antes da ativacao de J(2,1) no mesmo instante; B ainda executa [50, 55) e conclui em 55.                                                                                                                                                           |
| `04-multi-cpu-desliga-religa.txt`  | RM, 2 CPUs, CPU desligada e religada, preempcao na CPU de menor prioridade.                                             | Ate t=13: preempcao de J(2,0) na CPU 2 em t=2; J(2,0) retoma na CPU 1 em t=4; CPU 2 desligada em [4, 12), CPU 1 em [8, 12); ambas religadas em 12.                                                                                                                                              |
| `05-preempcao-quantum-sorteio.txt` | RM, quantum 2, 1 CPU: sorteio de empate, preempcao e quantum vencido.                                                   | Ate t=14: um `tie-break` em t=0 entre J(3,0) e J(4,0), cujo vencedor executa [0, 2) e o outro em [2, 3) e [5, 6); J(2,0) preempta em 3; J(1,0) executa [6, 10) com quantum vencido em 8 e 10; em 10 J(2,1) a preempta e J(1,0) retoma em [12, 14). O vencedor depende da semente fixa (DEC-27). |
| `06-aperiodica-periodo-padrao.txt` | Tarefas 1 (periodo vazio) e 2 (periodo 0) recebem o periodo padrao 15 (DEC-29).                                         | Carrega com 2 avisos: linha 2, campo `periodo`, sem valor, tarefa 1; linha 3, campo `periodo`, valor `0`, tarefa 2. Tarefa 1 reativa em 15 e tarefa 2 em 17; CPU desligada em [11, 15).                                                                                                         |
| `07-sobrecarga-prazo-perdido.txt`  | Sobrecarga (DEC-10): prazo 3 menor que a duracao 5 e carga acima de 100%. Carrega sem erro.                             | Ate t=12: perdas de prazo de J(3,0) em 3, J(2,0) em 6 e J(2,1) em 12; os jobs atrasados continuam e J(2,0) conclui em 12.                                                                                                                                                                       |
| `08-simulacao-longa.txt`           | 5 tarefas, 10 jobs cada, 2 CPUs, para exportar um Gantt longo. Aprovar uma simulacao finita nao prova escalonabilidade. | Termina em t=457 (ultima ativacao em 450, mais duracao 7); 10 jobs por tarefa; nenhuma perda de prazo. Simulacoes longas custam memoria (DEC-30); esta usa cerca de 460 ticks.                                                                                                                  |
| `09-erros-diagnosticos.txt`        | Arquivo rejeitado com varios problemas semanticos, cada um com linha, campo e valor (DEC-19).                           | 6 diagnosticos, em ordem: linha 1 `quantum` (0); linha 3 `ingresso` (-1) e `cor` (E41A1C, ja usada pela 1ª tarefa); linha 4 `duracao` (0), `prazo` (0) e `id` (1, ja usado pela 1ª tarefa).                                                                                                     |
| `10-erros-sintaxe.txt`             | Erros de sintaxe: enquanto houver linha quebrada, so eles aparecem (DEC-19).                                            | 2 diagnosticos: linha 3 `ingresso`, valor "x" (esperado um numero); linha 4 `prazo` ausente (esperados 6 campos, recebidos 5).                                                                                                                                                                  |

Para ver os problemas semanticos de `10` depois de corrigi-lo, corrija as duas
linhas e recarregue.
