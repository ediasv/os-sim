# Especificacao do frontend do Projeto A

Registro parcial da discussao com o usuario, atualizado em 2026-10-18.
Este documento especifica somente a apresentacao e as interacoes do renderer.
Nao afirma que os comportamentos estejam implementados nem encerra as decisoes
pendentes. O andamento permanece no [plano do projeto](../../../docs/plan.md).

## Escopo e fontes

- A [especificacao geral](../../../docs/specification.md) e o
  [enunciado v0.6](../../../docs/references/objetivo-do-trabalho.pdf) definem
  os requisitos do projeto. Este documento deriva requisitos de apresentacao,
  sem substituir as regras do dominio.
- A [arquitetura geral](../../../docs/architecture.md) define os limites
  entre nucleo, renderer e infraestrutura Electron.
- O [prototipo Figma](https://www.figma.com/design/h2kssKC2KiSuN4iAg4K1yU?node-id=0-1)
  e referencia visual, nao autoridade para resolver conflitos com o enunciado
  ou escolhas que ainda nao foram acordadas.
- Escopo desta interface: Projeto A, tarefas periodicas, RM e EDF. Controles
  de tarefas aperiodicas e conversoes de tipo ficam fora deste recorte.
  A.4.4 manda ignorar aperiodicas e informar o usuario. Ha divergencia com
  REQ-03, DEC-09 e DEC-17 atuais; a reconciliacao pertence ao dominio, nao a
  um filtro implementado exclusivamente na apresentacao.
- Os itens FE abaixo registram acordos de apresentacao. As pendencias PEND
  distinguem decisoes ainda abertas de formalizacao externa de comportamentos
  ja discutidos; nao significam que todo acordo precise ser decidido de novo.
  Bibliotecas, componentes concretos, APIs e organizacao interna ainda nao sao
  definidos por esta spec.

## Organizacao de apresentacao acordada

O frontend permanece em `src/renderer/`, com documentacao propria. Os nomes
abaixo delimitam responsabilidades aprovadas na discussao; nao indicam pastas
ou funcionalidades ja implementadas, nem obrigam criar arquivos antecipadamente.

| Area | Responsabilidade de apresentacao |
| --- | --- |
| `docs/` | Requisitos, decisoes e pendencias especificos do frontend. |
| `components/` | Elementos visuais reutilizaveis, sem regras do simulador. |
| `features/` | Fluxos de execucao, inspecao, edicao e visualizacao. |
| `composables/` | Integracao com Vue e estado de apresentacao. |
| `adapters/` | Consumo da API publica do nucleo e da ponte Electron. |

Esta separacao nao exige servidor, microfrontends ou releases independentes.
Ferramentas, bibliotecas e contratos concretos permanecem para planejamento
posterior; a dependencia do renderer para o nucleo nunca se inverte.

## Limites de responsabilidade

### FE-01: Independencia do nucleo

Origem: REQ-04, REQ-05, REQ-10; separacao solicitada pelo usuario.

- O renderer apresenta dados e envia intencoes pela API publica do nucleo.
  Nunca implementa escalonamento, ativacoes, sorteios, restauracao ou edicoes
  semanticas para compensar uma capacidade ausente no nucleo.
- Selecao, zoom, rolagem, dialogos e rascunhos sao estado de apresentacao;
  relogio, jobs, CPUs, eventos e historico pertencem ao dominio.
- Somente o adaptador mantem a instancia privada do simulador. Componentes
  nao recebem estado vivo nem o modificam diretamente.
- Arquivos sao acessados pela ponte autorizada da infraestrutura Electron;
  renderer nao importa Node, main ou preload.
- Aceitacao: selecionar, ampliar o Gantt ou editar um rascunho nao modifica o
  snapshot. O nucleo continua utilizavel sem Vue e sem conhecimento de telas.

## Preparacao e ciclo de vida

### FE-02: Preparar antes de iniciar

Origem: REQ-05; fluxo aprovado pelo usuario.

- Abrir diretamente a area de trabalho em preparacao, com os padroes definidos
  pelo dominio: RM, quantum 5, uma CPU e nenhuma tarefa. Sem pagina de entrada.
- Oferecer carregar configuracao, adicionar tarefa e configurar sistema.
  Preparar dados nao inicia o motor.
- Iniciar simulacao somente com configuracao valida, ao menos uma tarefa
  admitida no escopo e nenhuma edicao pendente de aplicacao.
- Ao iniciar, apresentar o snapshot zero fornecido pelo nucleo. Ele ja pode
  conter ativacoes e CPUs atribuidas; nao inventar um estado anterior a t=0.
- Aceitacao: carregar ou cadastrar dados nao avanca ticks. Iniciar publica o
  snapshot zero, sem executar automaticamente o primeiro intervalo.

### FE-03: Validar durante a preparacao

Origem: REQ-05, REQ-06, REQ-10.

- Mostrar erros antes de iniciar, permitindo valores temporariamente
  incompletos enquanto o usuario digita.
- Validar antes de aceitar uma tarefa ou configuracao. Rejeicao preserva os
  dados anteriormente validos e o rascunho para correcao.
- O frontend nao duplica regras semanticas: apresenta os diagnosticos do
  nucleo e do parser. A validacao final do nucleo continua obrigatoria.
- Aceitacao: configuracao invalida nao habilita Iniciar nem precisa de uma
  tentativa de inicio para revelar problemas ja conhecidos.

### FE-04: Importar e substituir configuracao

Origem: REQ-05, REQ-06, REQ-10; #33 e #34.

- Permitir escolher o arquivo sem nome ou caminho fixo. Cancelar a escolha
  nao e erro e nao altera a sessao.
- Ler e validar antes de substituir qualquer dado. Apresentar diagnosticos
  com o contexto devolvido pelo parser; falha de acesso identifica caminho e
  motivo quando disponiveis, sem inventar linha ou campo.
- Se o arquivo for valido e houver sessao ou preparacao a perder, pedir
  confirmacao. Cancelar a confirmacao preserva tudo.
- Apos confirmar, retornar a preparacao preenchida, sem iniciar o motor.
- Aceitacao: um arquivo invalido ou ilegivel nunca apaga tarefas, historico
  ou rascunho anterior. Uma importacao valida ainda exige Iniciar.

### FE-05: Reiniciar e limpar sao acoes distintas

Origem: REQ-04, REQ-05; distincao aprovada pelo usuario.

- Reiniciar simulacao: descartar a execucao e apresentar novo snapshot zero
  com a configuracao usada no inicio da sessao, nao a configuracao editada
  posteriormente.
- Limpar sessao: descartar dados da sessao e retornar a preparacao vazia com
  os padroes do dominio. Nao apagar arquivos importados ou exportados do disco.
- Pedir confirmacao quando houver trabalho a perder. Cancelar preserva tudo.
- Aceitacao: Reiniciar preserva o cenario inicial; Limpar remove as tarefas.
  Nao prometer repeticao dos sorteios de um reinicio sem contrato do nucleo.

## Execucao e historico

### FE-06: Navegar sem apagar o futuro

Origem: REQ-01, REQ-04, REQ-05.

- Avancar solicita um passo de um tick. Retroceder restaura o snapshot
  correspondente; avancar pelo futuro valido reutiliza o resultado registrado.
- Mostrar tick selecionado e maior tick registrado, por exemplo, 8 de 20.
- Manter todo o historico valido visivel no Gantt, inclusive os ticks 9-20
  quando o cursor esta em 8. Diferenciar esse trecho do estado inspecionado.
- Somente uma edicao validada e aplicada descarta o futuro anterior.
  Rascunhos, cancelamentos, selecoes e rejeicoes nao o descartam.
- Aceitacao: voltar de 20 para 8 mantem o trecho futuro; avancar novamente
  restaura resultados e sorteios, sem recalcula-los na apresentacao.

### FE-07: Execucao completa e cancelamento

Origem: REQ-04, REQ-10; Q-06 e #27.

- Mostrar andamento e permitir cancelar sem exigir desenhar os snapshots
  intermediarios no Gantt ou no inspetor.
- Enquanto a operacao estiver em andamento, impedir comandos concorrentes
  de edicao e navegacao. O cancelamento precisa permanecer acessivel.
- Cancelar exibe o ultimo snapshot processado com sucesso e preserva seu
  historico. Nao volta ao estado anterior a execucao nem publica meio passo.
- Permitir continuar a partir desse estado. Cancelamento nao significa que
  todos os jobs terminaram.
- Aceitacao: cancelando apos avancar de 8 a 20, inspecionar 20 e poder voltar
  pelo historico. O renderer nao tenta desfazer nem completar o passo sozinho.

### FE-08: Apresentar falta de progresso

Origem: REQ-04, REQ-10; Q-06.

- Quando a execucao informar bloqueio sem possibilidade de progresso,
  interromper a apresentacao de andamento e abrir painel explicativo.
- Mostrar o tick alcancado, o motivo e os jobs que impedem o termino.
  CPUs desligadas isoladamente nao permitem inferir bloqueio: podem existir
  ativacoes futuras. A deteccao pertence a execucao, nao ao componente.
- O caso acordado a apresentar e: nao ha jobs elegiveis nem ativacoes futuras,
  mas restam jobs suspensos ou bloqueados por eles. Se todos os jobs terminaram,
  apresentar conclusao, nao falta de progresso. Esse resultado deve vir do
  contrato de execucao, sem um timeout arbitrario inferido pelo renderer.
- Oferecer uma unica saida, Voltar ao passo a passo, preservando estado e
  historico para inspecao e edicao. Nao declarar conclusao normal.
- Aceitacao: nao oferecer simultaneamente um Cancelar que desfaz o trabalho.
  Esse comportamento substitui a alternativa de rollback mostrada no Figma.

## Inspecao e edicao

### FE-09: Distinguir tarefa, job e condicao de prazo

Origem: REQ-02, REQ-03, REQ-04, REQ-08; DEC-02 e DEC-12.

- Apresentar caracteristicas da tarefa e registros individuais de seus jobs:
  identidade, ativacao, prazo absoluto, progresso e estado.
- Mostrar CPUs com o job atribuido ou a condicao desligada, fila global de
  prontos e jobs pendentes conforme os dados fornecidos pelo nucleo.
- Distinguir job concluido de tarefa aguardando proxima ativacao ou terminada.
  Perda de prazo e uma indicacao separada, nao substitui pronto, executando,
  suspenso ou concluido.
- Aceitacao: um job suspenso que perdeu prazo apresenta ambas as informacoes.
  Nao inventar ordenacao por prioridade a partir da ordem de uma selecao.

### FE-10: Selecionar nao navega no tempo

Origem: REQ-04, REQ-09; interacao aprovada pelo usuario.

- Clicar em trecho do Gantt seleciona a tarefa/job correspondente sem alterar
  o tick ou invalidar historico. A navegacao temporal e uma acao explicita.
- O inspetor identifica o tick do snapshot cujos dados esta apresentando.
  Nao apresentar dados do futuro como se fossem o estado atual.
- Aceitacao: estando em 20, clicar no trecho de 5 mantem relogio e CPUs de 20.
  A apresentacao de job existente somente no futuro esta em PEND-03.

### FE-11: Rascunhos e aplicacao atomica

Origem: REQ-05, REQ-10; #25 e #26.

- Abrir um formulario nao altera o snapshot. Cancelar descarta so o rascunho.
- Mostrar os motivos da rejeicao, manter os valores digitados e permitir
  corrigir. Nenhuma alteracao parcial pode aparecer como aplicada.
- Ao editar no passado, explicar antes de aplicar quais ticks futuros serao
  descartados. A invalidacao so ocorre apos aceitacao da edicao inteira.
- A edicao e referida ao tick selecionado, sem avancar o relogio. Tarefas
  concluidas continuam inspecionaveis e editaveis conforme o contrato do nucleo.
- Aceitacao: rejeitar um campo preserva integralmente snapshot e futuro,
  inclusive se outros campos do mesmo formulario estavam validos.

### FE-12: Expor o alcance das alteracoes de tarefa

Origem: REQ-05, REQ-07, REQ-08; dependencia de Q-02 e #25/#26.

- Ao editar duracao e prazo relativo, deixar claro que os novos valores valem
  para proximas ativacoes. Jobs ja criados conservam os valores de sua ativacao.
- Isso inclui jobs prontos, suspensos ou pendentes que nunca receberam CPU:
  a referencia e a ativacao, nao o inicio da execucao. O alcance da edicao de
  duracao foi aceito pelo usuario como regra provisoria, valida ate revisao
  explicita; nao aplicar uma alternativa diferente enquanto ela nao ocorrer.
- Na edicao de periodo positivo, mostrar a proxima ativacao resultante
  devolvida pelo nucleo. A regra discutida usa a ultima ativacao, nao o tick
  da edicao; eventuais ativacoes vencidas nao podem ser fabricadas no passado.
- Se esse calculo ja estiver vencido, a previa precisa informar a unica
  ativacao no tick da edicao e o calendario contado a partir dela, sem zerar
  a contagem total. A apresentacao nao gera jobs para implementar essa regra.
- A edicao nao concede mais dez ativacoes: o limite total de dez jobs da
  tarefa periodica continua valendo. Se ele ja foi atingido, nao anunciar
  uma proxima ativacao inexistente; editar continua possivel conforme o nucleo.
- Informar o efeito sobre a prioridade RM sem apresentar a prioridade de jobs
  antigos como congelada. A selecao permanece responsabilidade da politica.
- Aceitacao: o formulario nao recalcula nem sobrescreve parametros de jobs
  existentes por conta propria. Regras de calendario e valores por ativacao
  precisam estar disponiveis no contrato do nucleo antes da integracao.
- Cenarios de apresentacao: ultima ativacao em 10, edicao em 12 e periodo 8
  mostram proxima ativacao em 18; ultima ativacao em 10, edicao em 17 e
  periodo 4 mostram ativacao em 17 e a seguinte em 21, quando autorizadas
  pelo nucleo e ainda houver ativacoes disponiveis.

### FE-13: Suspender e retomar por job

Origem: REQ-01, REQ-05, REQ-08; DEC-02 e dependencia de Q-02.

- A acao identifica explicitamente o job selecionado ainda incompleto.
  Nao suspender automaticamente todas as proximas ativacoes da tarefa.
- Apresentar que progresso e prazo sao preservados, o prazo nao pausa e
  retomar nao garante CPU imediata nem permite ultrapassar job anterior.
- Aceitacao: controles refletem os comandos disponiveis no snapshot e seus
  erros. A UI nao transforma o job em executando para simular uma retomada.

### FE-14: Ajustar progresso como intervencao de debugger

Origem: REQ-05, REQ-09; controle aprovado pelo usuario; #25/#26.

- Permitir ajustar o progresso inteiro de job incompleto entre zero e a duracao
  daquele job, conforme a validacao do nucleo.
- Apresentar o ajuste como intervencao no tick da edicao. Nao apagar nem
  inventar intervalos anteriores de CPU para fazer os numeros coincidirem.
- Ao aceitar um ajuste que completa o job, mostrar a conclusao registrada
  pelo nucleo naquele tick. Perdas de prazo anteriores nao sao apagadas.
- Aceitacao: mudar progresso de 3 para 1 em job de duracao 6 mostra 5 restantes,
  mantendo o uso de CPU anterior e identificando a intervencao. O modelo de
  ajuste e seus eventos sao dependencias do dominio, ainda nao uma API definida.

### FE-15: Adicionar e remover durante a sessao

Origem: REQ-05, REQ-09; dependencia de Q-02 e #25/#26.

- Inclusao usa formulario validado; ingresso pode ser o tick selecionado ou
  um futuro. Para adicionar em momento anterior, navegar ate ele e editar ali.
- Se o ingresso solicitado for anterior ao tick selecionado, mostrar a
  rejeicao e seu motivo sem aplicar parcialmente a inclusao.
- Mostrar a primeira ativacao fornecida pelo nucleo, imediata ou futura.
- Remover exige confirmacao e informa que encerra jobs incompletos e impede
  futuras ativacoes. Cancelar a confirmacao preserva a tarefa e o historico.
- Manter identificavel o historico anterior da tarefa removida. Nao mostrar
  jobs cancelados pela remocao como concluidos normalmente.
- Aceitacao: inclusao ou remocao nao modifica o passado; jobs removidos nao
  continuam em CPU, conforme o resultado atomico devolvido pelo nucleo.

### FE-16: Editar parametros do sistema

Origem: REQ-02, REQ-05, REQ-07; dependencia de Q-02.

- Apresentar quantum e quantidade de CPUs, unidades e diagnosticos. Nao impor
  tetos arbitrarios de CPUs, quantum ou tarefas.
- Mostrar o resultado da edicao no tick selecionado, sem uma configuracao
  pendente para o proximo tick. Essa alternativa foi descartada na discussao.
- A interface informa que editar quantum preserva o consumo da fatia atual e
  pode causar vencimento imediato; nunca zera o contador por conta propria.
- Quando o nucleo informar vencimento, apresentar a nova selecao, que pode
  escolher o mesmo job com uma nova fatia. Nao confundir consumo da fatia
  com progresso total do job nem presumir troca obrigatoria de tarefa.
- Ao alterar CPUs, atualizar as raias e a inspecao, preservando os trechos
  historicos das CPUs retiradas. Reduzir CPUs nao significa cancelar tarefas.
- CPUs vigentes sao identificadas de 1 a N, conforme DEC-12. Na reducao de
  quatro para duas, manter CPU 1 e CPU 2 vigentes e os trechos anteriores de
  CPU 3 e CPU 4 consultaveis. A selecao global pode migrar um job prioritario
  da CPU 4 para a CPU 1 e devolver outro a fila, sem apagar progresso ou prazo.
- Aceitacao: a apresentacao reflete a nova selecao global, incluindo migracoes;
  nao decide quais jobs vao parar a partir apenas do ID das CPUs retiradas.
- Cenarios de apresentacao: consumo de fatia 3 e novo quantum 2 mostram o
  vencimento informado pelo nucleo no tick da edicao; novo quantum 5 mostra
  2 ticks restantes na fatia preservada. Nenhum caso avanca o relogio nem
  diminui o progresso total do job.
- A escolha RM/EDF pertence a preparacao, conforme A.4.1. Troca durante a
  execucao nao foi acordada como parte da edicao de quantum/CPUs.

## Visualizacao e exportacao

### FE-17: Gantt consistente com os dados

Origem: REQ-02, REQ-09; DEC-08 ainda proposta nos documentos gerais.

- Raias de tarefas por ID decrescente; identificar CPU nos trechos executados.
  Mostrar tambem intervalos de CPUs desligadas, inclusive de CPUs historicas.
- Usar cor da tarefa em execucao, pronta sem preenchimento e suspensa em
  preto com padrao distinto. Cores de amostra do prototipo nao sao um ciclo
  fixo de quatro opcoes nem substituem as cores configuradas.
- Mostrar eventos distintos e legenda. Numeros da regua, fronteiras dos
  intervalos e marcadores devem compartilhar o mesmo alinhamento temporal.
- Permitir zoom e rolagem para consultar todos os dados; o viewport nao
  determina a extensao do historico nem da exportacao.
- Aceitacao: evento em t=5 fica na fronteira 5, nao no centro da celula.
  Estado suspenso exige registros de suspensao/retomada do nucleo; nao pode ser
  inferido somente de ausencia de execucao.

### FE-18: Exportar historico valido integral

Origem: REQ-09, REQ-10; extensao parcial aprovada pelo usuario; #39.

- Formato inicial SVG, a partir dos dados, nunca captura da janela.
- Incluir todo o historico valido: tarefas, intervalos, CPUs, eventos e legenda,
  sem corte pelo cursor, zoom ou rolagem e sem controles da interface.
- Nao atenuar no arquivo o trecho posterior ao cursor da tela. Nao impor um
  teto arbitrario de ticks para conseguir exportar.
- Permitir resultado parcial, identificado como tal quando o ultimo estado
  calculado ainda nao representa termino. A classificacao nao usa o cursor.
- Aceitacao: cursor em 8 e historico ate 20 exporta 0-20. Se 20 representa
  termino, a imagem e final; caso contrario, parcial. Falha de gravacao e
  explicada e nao altera a sessao; cancelamento nao e erro.

## Decisoes de apresentacao registradas

Todas registradas em 2026-10-18. Sao acordos funcionais, nao evidencia de codigo.

| ID | Decisao e justificativa | Vinculos |
| --- | --- | --- |
| FE-DEC-01 | Spec propria do renderer; manter nucleo agnostico da interface e evitar duas fontes de regras do dominio. | FE-01; REQ-04, REQ-05, REQ-10 |
| FE-DEC-02 | Preparar e validar antes de iniciar explicitamente; separar rascunho de snapshot zero. | FE-02 a FE-04; REQ-05, REQ-06 |
| FE-DEC-03 | Reiniciar preserva o cenario inicial; Limpar volta aos padroes sem tarefas. Evitar uma acao ambigua. | FE-05; REQ-04, REQ-05 |
| FE-DEC-04 | Cancelar preserva ultimo tick valido; bloqueio tem uma unica saida para passo a passo. Nao desfazer trabalho implicitamente. | FE-07, FE-08; REQ-04, REQ-10 |
| FE-DEC-05 | Selecao nao muda o tick; futuro valido fica visivel e so edicao aceita o descarta. Separar inspecao de navegacao. | FE-06, FE-10, FE-11; REQ-04, REQ-05, REQ-09 |
| FE-DEC-06 | SVG integral do historico valido, inclusive parcial, independente da janela. | FE-18; REQ-09 |

## Conferencia dos acordos da conversa

Conferencia documental em 2026-10-18. A matriz aponta onde cada acordo final
esta registrado, nao comprova implementacao. Os efeitos de dominio descritos
em FE-12 a FE-16 sao dependencias observaveis do renderer; esta conferencia
nao altera contratos ou decisoes da arquitetura geral.

| Acordo final conferido | Registro | Situacao |
| --- | --- | --- |
| Documentacao e responsabilidades em renderer, com nucleo agnostico. | FE-01; FE-DEC-01; organizacao de apresentacao | Acordado; bibliotecas e contratos concretos abertos em PEND-07. |
| Preparar e validar antes do inicio explicito; snapshot zero nao e primeiro tick executado. | FE-02, FE-03; FE-DEC-02 | Acordado. |
| Importar primeiro valida, depois confirma substituicao e retorna a preparacao. | FE-04 | Acordado; cancelar ou falhar preserva a sessao. |
| Reiniciar usa o cenario inicial; Limpar retorna aos padroes sem apagar arquivos. | FE-05; FE-DEC-03 | Acordado. |
| Retroceder conserva futuro visivel, resultados e sorteios; so edicao aceita o descarta. | FE-06, FE-11; FE-DEC-05 | Acordado. |
| Cancelar execucao completa preserva ultimo tick valido e historico, sem rollback. | FE-07; FE-DEC-04 | Acordado; depende da execucao. |
| Falta de progresso explica jobs bloqueadores e oferece uma saida para passo a passo. | FE-08; FE-DEC-04 | Acordado; deteccao e contrato externos. |
| Inspecao separa tarefa, job, elegibilidade e perda de prazo. | FE-09 | Acordado; nao inventar ranking da politica. |
| Clicar no Gantt seleciona tarefa/job sem mudar tick ou estado. | FE-10; FE-DEC-05 | Acordado; selecao de job somente futuro em PEND-03. |
| Formularios sao rascunhos; aplicar e atomico, sem avancar o relogio. | FE-11 | Acordado; tarefas concluidas nao ficam inacessiveis para edicao. |
| Duracao editada afeta somente proximas ativacoes, nao jobs ja criados. | FE-12 | Acordo provisoriamente aceito, nao decisao novamente em aberto. |
| Prazo relativo editado afeta proximas ativacoes; prazos absolutos e perdas existentes permanecem. | FE-12 | Acordado; contrato externo. |
| Novo periodo conta da ultima ativacao; se vencido, uma ativacao na edicao e calendario a partir dela. | FE-12 | Acordado; sem retroatividade ou reinicio da contagem de dez jobs. |
| RM usa novo periodo na proxima selecao, inclusive para jobs existentes. | FE-12 | Consequencia acordada; nao congela prioridade por job. |
| Suspensao e retomada por job incompleto, sem pausar prazo nem liberar ultrapassagem. | FE-13 | Acordado; retomar nao garante CPU imediata. |
| Progresso ajustavel e intervencao registrada; nao reescreve CPU anterior; atingir duracao conclui naquele tick. | FE-14 | Acordado; contrato e eventos externos. |
| Inclusao aceita ingresso atual/futuro; remocao cancela jobs incompletos e futuras ativacoes, preservando historico. | FE-15 | Acordado; cancelamento nao e conclusao normal. |
| Quantum preserva consumo; novo limite pode vencer fatia no tick editado. | FE-16 | Acordado; sem configuracao agendada para proximo tick. |
| Alterar CPUs refaz selecao global, permite migracao e conserva trabalho e raias historicas. | FE-16 | Acordado; nao escolher quem para pelo ID da CPU retirada. |
| Gantt por tarefa, CPU nos trechos, eventos e regua alinhados, zoom e rolagem. | FE-17 | Requisitos e referencia acordados; detalhes visuais em PEND-04. |
| SVG inclui historico valido inteiro, independente do cursor; parcial permitido e identificado. | FE-18; FE-DEC-06 | Acordado; gravacao pela infraestrutura. |
| Aperiodicas, conversoes e reabertura por conversao fora deste recorte. | Escopo; PEND-02 | Decisao final de escopo apos consultar A.4.4. |

Alternativas superadas que nao devem voltar como requisitos implicitos:

- Iniciar automaticamente ao carregar/cadastrar dados: prevalece inicio explicito.
- Cancelar e restaurar estado anterior a execucao: prevalece ultimo tick valido.
- Ocultar o futuro ao retroceder: prevalece manter todo futuro ainda valido.
- Contar novo periodo desde a edicao: prevalece ultima ativacao, com o caso
  vencido explicitado em FE-12.
- Agendar parametros do sistema para proximo tick ou renovar a fatia por editar
  quantum: prevalece aplicacao no tick editado, preservando consumo da fatia.
- Regras discutidas de conversao/reabertura de aperiodicas: foram retiradas do
  recorte; nao sao requisitos ativos desta interface.

## Dependencias e pendencias

Os contratos abaixo sao responsabilidade do nucleo ou da infraestrutura.
Nao criar implementacoes alternativas no renderer para antecipar sua entrega.
Comportamento acordado nao significa contrato formalizado ou funcionalidade
implementada; as dependencias nao devem ser listadas como novas escolhas do
usuario quando o efeito funcional ja foi decidido.

| Dependencia | O que a apresentacao precisa receber | Referencias |
| --- | --- | --- |
| Historico e edicao | Cursor, limite valido, snapshots restauraveis, comandos atomicos, resultado e diagnosticos; estado do sorteio preservado. | E3, #23 a #26; DEC-06, DEC-14 |
| Parametros por ativacao | Duracao e prazo efetivos dos jobs existentes; proxima ativacao e possibilidades de edicao fornecidas pelo dominio. | Q-02, #25/#26; FE-12 |
| Intervencoes | Registros de suspensao, retomada, ajuste de progresso e remocao; historico de tarefas e CPUs retiradas. | Q-02, #25/#26; FE-13 a FE-17 |
| Execucao completa | Andamento, cancelamento no ultimo passo valido e motivo de bloqueio com jobs envolvidos. | Q-06, #27; FE-07 e FE-08 |
| Arquivos | Dialogos autorizados, configuracao analisada e diagnosticos de conteudo/acesso; gravacao com resultado ou cancelamento. | E4, #33/#34, #39; DEC-19 |
| Escopo periodico | Tratamento de aperiodicas com aviso, coerente com A.4.4, sem o frontend filtrar tarefas por conta propria. | Divergencia com REQ-03, DEC-09 e DEC-17 |

- PEND-01: definir edicao/reutilizacao de ID, efeito de mudar cor no historico
  e edicao de ingresso de tarefa existente. Esses campos ainda nao foram
  acordados; nao transforma-los em somente leitura por conveniencia.
- PEND-02 (dependencia externa, nao nova decisao de apresentacao): formalizar
  os contratos independentes de dominio para os efeitos ja discutidos de
  duracao, prazo, calendario, suspensao, progresso, quantum, CPUs, inclusao e
  remocao, bem como cancelamento/bloqueio da execucao completa. Nao declarar
  Q-02/Q-06 resolvidas nem presumir que o modelo atual ja os representa.
  Reconciliar tambem o escopo periodico com REQ-03, DEC-09 e DEC-17. Aperiodicas,
  conversoes e reabertura por conversao deixaram o escopo desta interface.
- PEND-03: definir o que o inspetor mostra ao selecionar trecho de um job que
  ainda nao existe no tick inspecionado. Nao navegar automaticamente nem
  apresentar o estado futuro como atual.
- PEND-04: detalhar colisao de marcadores, muitos jobs/CPUs, redimensionamento,
  navegacao por teclado, foco de dialogos, tooltips e contrastes. A revisao do
  Figma encontrou contraste insuficiente em algumas combinacoes e texto fixo
  inadequado para cores de tarefa escuras; as solucoes ainda precisam de acordo.
- PEND-05: definir consulta completa de muitos diagnosticos. O limite visual
  de cinco erros do Figma nao justifica ocultar o restante sem acesso.
- PEND-06: conferir disponibilidade dos comandos em preparacao, execucao,
  navegacao no passado, bloqueio, cancelamento, termino e erro. Nao habilitar
  comandos sem contrato implementado nem prometer capacidade via mocks.
- PEND-07: detalhar a arquitetura interna de apresentacao, contratos entre
  componentes/composables/adaptadores, tokens, bibliotecas e estrategia de
  testes/entregas. As responsabilidades de pastas foram aceitas, mas propostas
  anteriores de MVVM, bibliotecas ou ferramentas nao constituem escolhas
  aprovadas por essa aceitacao. Planejar sem impor dependencias ao nucleo.

## Estado da discussao

Em 2026-10-18, os fluxos FE-02 a FE-18 foram discutidos com o usuario,
incluindo o ajuste manual de progresso e a redistribuicao global ao alterar
CPUs. O registro e parcial: PEND-01 a PEND-07 permanecem abertos e os
contratos externos ainda precisam ser reconciliados nos escopos de dominio.

Proximo passo da conversa: revisar ID, cor e ingresso de tarefa existente;
depois conferir a matriz consolidada e os estados de apresentacao pendentes.
Nao considerar aprovadas as propostas ainda nao discutidas, como tratamento
de selecao futura, colisoes de marcadores e detalhes de acessibilidade.

Nao ha nesta entrega implementacao visual, mudanca de API do nucleo,
adocao de bibliotecas ou alteracao das specs gerais. A discussao sobre
aperiodicas, conversoes e reabertura por conversao ficou fora do recorte
apos a conferencia de A.4.4; nao deve voltar como requisito implicito.

## Rastreabilidade e verificacao futura

- #35: alinhar esta spec, Q-05 e DEC-08 antes da implementacao visual.
- #36: FE-02 a FE-08, FE-11 e FE-16 (controles e ciclo de vida).
- #37: FE-09 a FE-16 (inspecao e formularios), apos os contratos de E3/E4.
- #38: FE-06, FE-10 e FE-17 (Gantt e eventos).
- #39: FE-18 (imagem integral, incluindo dados fora do viewport).
- #40: cenarios de aceitacao acima, legibilidade e estados ainda em PEND.
- E6: verificar o aplicativo empacotado no ambiente-alvo; esta spec nao valida
  distribuicao nem antecipa a implementacao visual ao fechamento do nucleo.

Os criterios acima orientam testes futuros de apresentacao e integracao.
Registrar execucoes e evidencias somente no plano e nas issues, nao marcar um
criterio como atendido pela mera existencia deste documento.