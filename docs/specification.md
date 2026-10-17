# Especificacao do Projeto A

## Escopo e fontes

Implementar um simulador preemptivo de tempo compartilhado com tarefas
periodicas e aperiodicas de ativacao unica, multiplas CPUs, RM e EDF. Comecar
pelo nucleo e testes; construir a interface depois. Projeto B, DM, mutex, E/S e comunicacao nao fazem parte desta
entrega.

- [Enunciado v0.6](references/objetivo-do-trabalho.pdf): fonte normativa dos requisitos.
- [Escalonamento de tempo real](references/como-funciona-escalonamento-em-tempo-real.pdf):
  referencia teorica, especialmente secoes 2.2, 2.4 e 2.5.3.
- [Arquitetura e decisoes](architecture.md): como atender aos requisitos.
- [Plano e andamento](plan.md): estado das entregas, nao da especificacao.

Requisitos abaixo sao obrigatorios. Decisoes de interpretacao estao identificadas
como aceitas ou propostas na arquitetura; nao substituir o enunciado por uma
hipotese silenciosamente. Aprovacao de uma simulacao finita nao constitui prova
de escalonabilidade para todas as ativacoes futuras.

## Requisitos e criterios de aceitacao

### REQ-01: Relogio e execucao preemptiva

Fonte: gerais 1; A.1.1, A.1.4.

- Relogio global em ticks inteiros, independente do tempo real.
- Examinar acoes relevantes a cada tick; respeitar ingresso e duracao.
- Interromper e retomar preservando progresso, trabalho restante e prazo do job.
- Aceitacao: executar, interromper e retomar um job sem reiniciar sua execucao.

### REQ-02: Multiplas CPUs e fila global

Fonte: gerais 2; A.1.2.

- Quantidade inteira positiva configuravel; sem teto arbitrario de 16 CPUs.
- Uma fila global; nao deixar CPU desligada havendo trabalho elegivel.
- Desligar logicamente CPUs sem trabalho; registrar e exibir seus intervalos.
- Aceitacao: distribuir jobs distintos entre CPUs, sem duplicar um job, e
  reativar uma CPU quando surgir trabalho elegivel.

### REQ-03: Tarefas, ativacoes e termino

Fonte: A.1.3, A.1.4, A.4.4.

- Um TCB por tarefa concentra suas caracteristicas e registros de ativacoes.
- Cada ativacao e um job separado, com identidade, progresso e prazo proprios.
- Tarefa periodica gera no maximo dez jobs; tarefa aperiodica (periodo zero ou
  ausente) gera um unico job no ingresso. Ver DEC-09.
- Todo job executa ate completar a duracao, mesmo com prazo perdido; a tarefa
  termina quando seu ultimo job conclui.
- Aceitacao: ativar conforme ingresso e periodo, mantendo jobs anteriores intactos
  quando novas ativacoes chegarem; nao gerar 11a ativacao periodica nem segunda
  ativacao aperiodica. Ver DEC-02 para elegibilidade sequencial.

### REQ-04: Modos de execucao e historico

Fonte: gerais 4; A.1.5 a A.1.5.3.

- Passo a passo permite inspecionar sistema e tarefas, avancar e retroceder.
- Guardar estado de cada passo na memoria e restaurar relogio e contexto completo.
- Execucao completa apresenta apenas o resultado final, sem exigir renderizar
  passos intermediarios.
- Aceitacao: voltar a um estado anterior e avancar novamente sem alterar os
  resultados ja registrados, inclusive sorteios.

### REQ-05: Configuracao e edicao

Fonte: gerais 4; A.3.1, A.3.2, A.3.4.

- Oferecer valores padrao substituiveis pelo arquivo e pela interface; valores e
  limites validos em DEC-10.
- Permitir configurar sistema e editar caracteristicas/estado de qualquer tarefa
  durante a simulacao, respeitando validacao semantica.
- Rejeitar alteracoes invalidas com motivo claro, sem aplicacao parcial.
- Aceitacao: editar no passado descarta o futuro anterior e recalcula a partir do
  estado editado; edicao invalida preserva integralmente o estado.

### REQ-06: Arquivo texto

Fonte: A.3.3 a A.3.3.7.

```text
algoritmo_escalonamento;quantum;qtde_cpus
id;cor;ingresso;duracao;periodo;prazo;lista_eventos
```

- Pelo menos cabecalho e uma tarefa, sem limite arbitrario de tarefas.
- IDs unicos; cores RGB hexadecimais distintas por tarefa.
- Strings sem distincao entre maiusculas/minusculas; aceitar `;` final opcional.
- Ignorar espacos irrelevantes e linhas em branco; nao remover separadores ou
  conteudo interno do campo de eventos indiscriminadamente.
- Periodo negativo e erro; periodo zero ou ausente indica tarefa aperiodica.
  Faixas dos demais campos e campos opcionais em DEC-10.
- Carregar arquivo de qualquer nome/caminho escolhido pelo usuario.
- Preservar lista de eventos sem executa-la no Projeto A (A.3.3.5).
- Aceitacao: variantes validas produzem configuracao equivalente; erros indicam
  linha/campo/motivo, e falhas de acesso explicam o problema ao usuario.

### REQ-07: Politicas e desempates

Fonte: A.4 a A.4.3.

- Implementar RM preemptivo (menor periodo) e EDF preemptivo (menor prazo absoluto).
  No RM, tarefa aperiodica tem a menor prioridade (DEC-17).
- Politica substituivel, sem reescrever o ciclo de simulacao.
- Em empate de prioridade: quem executava antes da selecao, prazo, ingresso,
  menor duracao e sorteio, nessa ordem; prazo e ingresso do job, duracao da
  tarefa (DEC-16). Sem desempate escondido pelo ID.
- Registrar sorteio para marcacao no instante em que o escolhido (re)executar.
- Quantum limita uma fatia; vencimento devolve job incompleto a fila e reavalia,
  podendo selecionar o mesmo job. DEC-03 registra a interpretacao adotada; o job
  com fatia vencida perde o primeiro desempate (DEC-18).
- Aceitacao: politica de teste valida o motor independentemente de RM/EDF; testes
  separados conferem prioridades, preempcoes e cada nivel de desempate.

### REQ-08: Prazos

Fonte: A.3.3, definicao de prazo.

- Prazo relativo contado desde cada ativacao; prazo absoluto = ativacao + prazo.
- Espera, suspensao e preempcao nao pausam o prazo.
- Registrar perda de prazo sem descartar o job; continuar ate completar duracao.
- Aceitacao: conclusao exatamente no prazo e valida; job ainda incompleto no
  prazo recebe um unico registro de falha por ocorrencia (DEC-04).

### REQ-09: Gantt e exportacao

Fonte: gerais 3; A.2.1 a A.2.5.

- Exibir execucao na cor da tarefa, pronta sem preenchimento e suspensa em preto
  com padrao distinto; identificar CPU em cada trecho executado.
- Marcar ingresso, termino, perda de prazo, sorteio e demais eventos relevantes
  em seus instantes exatos, com elementos distintos e legenda.
- Menor ID mais proximo do eixo X; IDs decrescentes de cima para baixo.
- Atualizar a cada passo no modo interativo e exibir resultado no modo completo.
- Exportar imagem da simulacao inteira, nao captura da janela nem apenas area
  visivel, sem teto arbitrario de tempo. Preferencia por SVG em DEC-08.
- Aceitacao: exportacao inclui todos os intervalos, tarefas, CPUs e legenda,
  mesmo quando a tela precisa de rolagem ou zoom.

### REQ-10: Distribuicao, clareza e documentacao

Fonte: gerais 5 e 6; A.5.

- Aplicativo empacotado executa sem instalar runtime/bibliotecas extras.
- Interface intuitiva e erros com explicacao clara.
- Comentar componentes, funcoes e justificativas relevantes de implementacao.
- Aceitacao: testar entrega empacotada em ambiente-alvo sem Node instalado;
  documentar verificacao. Build configurado nao significa distribuicao validada.

## Questoes abertas antes das entregas afetadas

- Q-01: resolvida em 2026-10-16 por DEC-09 (no maximo dez jobs, todos drenados,
  inclusive atrasados).
- Q-02: definir matriz de edicao: progresso, duracao, periodo, ingresso, prazo,
  estado, inclusao/remocao de tarefas e efeito sobre jobs ja ativados. Nao
  reescrever retroativamente fatos anteriores a edicao. Incluir os eventos de
  suspensao e retomada que o Gantt (REQ-09) precisa para exibir trechos
  suspensos; o modelo atual ainda nao os tem (DEC-12).
- Q-03: valores padrao, zero, campos ausentes, IDs e limites numericos resolvidos
  em 2026-10-16 por DEC-10. Resta para E4 somente o formato dos diagnosticos do
  parser (linha, campo e texto de cada erro).
- Q-04: resolvida em 2026-10-17 por DEC-16: prazo absoluto e instante da
  ativacao do job; duracao da tarefa, como em A.4.3 (nao o trabalho restante).
- Q-05: confirmar apresentacao final com tarefas ordenadas e CPUs identificadas;
  figuras 2.5/2.6 sao referencias de comportamento, nao substituem A.2.5.
- Q-06: definir deteccao de falta de progresso e cancelamento no modo completo
  quando edicoes deixam jobs suspensos indefinidamente. Nao impor termino falso
  nem ignorar futuras ativacoes quando todas as CPUs estiverem desligadas.
- Q-07: resolvida em 2026-10-17 por DEC-17 (aperiodica tem a menor prioridade
  RM; aperiodicas empatam entre si).

## Invariantes do nucleo

- Um job executa em no maximo uma CPU por tick.
- Somente o job mais antigo incompleto de uma tarefa pode ser elegivel; suspensao
  desse job nao permite ao posterior ultrapassa-lo.
- Preempcao muda posse da CPU, nao identidade, progresso ou prazo do job.
- Snapshots nao compartilham dados mutaveis com o estado vivo.
- Restauracao inclui configuracao, jobs, CPUs, eventos e estado do sorteio.
- Politicas nao modificam estado; motor e despacho validam suas escolhas.
