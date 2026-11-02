# Especificacao do frontend do Projeto A

Registro parcial da discussao com o usuario, atualizado em 2026-10-23.
Este documento especifica somente a apresentacao e as interacoes do renderer.
Nao afirma que os comportamentos estejam implementados nem encerra as decisoes
pendentes. O andamento permanece no [plano do projeto](../../../docs/plan.md).
Modulos, contratos de apresentacao, ferramentas e ordem de implementacao ficam
na [arquitetura do renderer](architecture.md), sem outro plano de andamento.
O escopo deste planejamento e somente o frontend. Referencias aos documentos
gerais sao de consulta: este registro nao cria DECs, APIs ou regras do nucleo
e nao declara resolvidas suas questoes abertas.

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
- Escopo: apresentacao do Projeto A, RM e EDF, respeitando os contratos
  vigentes. DEC-29 (#87) reconciliou A.4.4: periodo zero ou ausente no
  arquivo recebe o periodo padrao (15) com aviso; telas partem desse padrao e
  rejeitam periodo zero com o motivo. O nucleo continua aceitando periodo
  zero (DEC-09, DEC-17). O renderer exibe os avisos da carga e nao implementa
  filtro ou conversao de tipo proprios nem exclui tarefas. Conversoes e reabertura por conversao nao ganharam contrato
  aprovado nesta discussao e nao devem ser implementadas por inferencia.
- A interface nao exibe testes de escalonabilidade (utilizacao, limites de
  RM/EDF); texto de ajuda que os citar traz a ressalva de DEC-26.
- Os itens FE abaixo registram acordos de apresentacao. As pendencias PEND
  distinguem decisoes ainda abertas de formalizacao externa de comportamentos
  ja discutidos; nao significam que todo acordo precise ser decidido de novo.
  Bibliotecas, componentes concretos e APIs sao tratados na arquitetura
  propria, distinguindo diretrizes acordadas de propostas tecnicas.

## Organizacao de apresentacao acordada

O frontend permanece em `src/renderer/`, com documentacao propria. Os nomes
abaixo delimitam responsabilidades aprovadas na discussao; nao indicam pastas
ou funcionalidades ja implementadas, nem obrigam criar arquivos antecipadamente.

| Area           | Responsabilidade de apresentacao                           |
| -------------- | ---------------------------------------------------------- |
| `docs/`        | Requisitos, decisoes e pendencias especificos do frontend. |
| `components/`  | Elementos visuais reutilizaveis, sem regras do simulador.  |
| `features/`    | Fluxos de execucao, inspecao, edicao e visualizacao.       |
| `composables/` | Integracao com Vue e estado de apresentacao.               |
| `adapters/`    | Consumo da API publica do nucleo e da ponte Electron.      |

Esta separacao nao exige servidor, microfrontends ou releases independentes.
O planejamento tecnico esta na arquitetura propria; a dependencia do renderer
para o nucleo nunca se inverte. Esse registro nao cria pastas antecipadamente.

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

## Expectativas de integracao com o nucleo

O nucleo ainda nao esta completo. As interacoes de FE-05 a FE-08, FE-11 a
FE-16 e FE-19 foram planejadas com base nos resultados que esperamos consumir,
nao como especificacao de como o nucleo deve funcionar ou ser implementado.
Os acordos da conversa orientam a experiencia pretendida; nao constituem
contratos de dominio aprovados por este PR.

| Expectativa para a interface                                                                   | Dependencia a conferir antes da integracao                                                                                          |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Exibir os valores efetivos de cada job e o alcance de uma edicao para proximas ativacoes.      | Dados e resultado da operacao precisam estar disponiveis; nao prescrever campos ou estrutura interna de Job.                        |
| Mostrar a previa da proxima ativacao e o efeito informado sobre a disputa por CPU.             | Calendario, limites e selecao sao calculados pelo nucleo, nao pelo formulario.                                                      |
| Apresentar suspensao, retomada, ajuste de progresso, inclusao e remocao aceitos ou rejeitados. | Comandos, motivos e registros observaveis ainda precisam ser confrontados com a API real.                                           |
| Preservar selecao e identificar o historico apos editar um ID.                                 | Correspondencia entre identidades e referencias precisa ser fornecida pelo contrato disponivel, sem reescrita de snapshots pela UI. |
| Apresentar resultado final e explicar falta de progresso, sem cancelamento (DEC-49).           | A execucao precisa fornecer o resultado, o snapshot e os jobs envolvidos; a interface nao detecta bloqueio por conta propria.       |

Se a API real nao suportar uma dessas expectativas, registrar a dependencia
e nao habilitar a operacao como funcional. Dados de exemplo podem verificar
a apresentacao isolada, mas nao comprovam que o nucleo atende ao cenario.
Nao compensar ausencias implementando regras de dominio no renderer. Eventuais
mudancas do nucleo pertencem a outro escopo, sem alterar seus documentos aqui.

## Preparacao e ciclo de vida

### FE-02: Preparar antes de iniciar

Origem: REQ-05; fluxo aprovado pelo usuario.

- Abrir diretamente a area de trabalho em preparacao, com os padroes definidos
  pelo dominio: RM, quantum 5, uma CPU e nenhuma tarefa. Sem pagina de entrada.
- Oferecer carregar configuracao, adicionar tarefa e configurar sistema.
  Preparar dados nao inicia o motor.
- Iniciar simulacao somente com configuracao valida, ao menos uma tarefa
  e nenhuma edicao pendente de aplicacao. Nao filtrar tarefas por tipo.
  Exigir uma tarefa para habilitar o inicio e regra de apresentacao acordada,
  nao mudanca na validacao do nucleo, que aceita lista vazia (DEC-12). O
  inicio e a acao "Avancar tick" quando nao ha snapshot valido, sem botao
  "Iniciar" separado (FE-DEC-14).
- Ao iniciar, apresentar o snapshot zero fornecido pelo nucleo. Ele ja pode
  conter ativacoes e CPUs atribuidas; nao inventar um estado anterior a t=0.
- Aceitacao: carregar ou cadastrar dados nao avanca ticks. Iniciar publica o
  snapshot zero, sem executar automaticamente o primeiro intervalo: o primeiro
  clique em "Avancar tick" mostra o tick `0`, nao `1` (FE-DEC-14).

### FE-03: Validar durante a preparacao

Origem: REQ-05, REQ-06, REQ-10.

- Mostrar erros antes de iniciar, permitindo valores temporariamente
  incompletos enquanto o usuario digita.
- Validar antes de aceitar uma tarefa ou configuracao. Rejeicao preserva os
  dados anteriormente validos e o rascunho para correcao.
- O frontend nao duplica regras semanticas: apresenta os diagnosticos do
  nucleo e do parser. A validacao final do nucleo continua obrigatoria.
- Aceitacao: configuracao invalida nao habilita o inicio ("Avancar tick" sem
  snapshot valido, FE-DEC-14) nem precisa de uma
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
  ou rascunho anterior. Uma importacao valida ainda exige o inicio por
  "Avancar tick" (FE-DEC-14).

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

### FE-07: Execucao completa

Origem: REQ-04, REQ-10 e DEC-49; integracao pela #27 e #36.

- Executar sem exibicao da progressao tick a tick nem botao de cancelamento;
  apresentar o resultado final ou o bloqueio informado pelo nucleo.
- Guardar todo o historico para inspecao posterior e manter o estado vivo no
  nucleo. A forma tecnica de integracao fica para as issues de implementacao.
- Aceitacao: apos concluir, poder navegar pelos passos registrados.

### FE-08: Apresentar falta de progresso

Origem: REQ-04, REQ-10; expectativa de integracao relacionada a Q-06.

- Quando a execucao informar bloqueio sem possibilidade de progresso,
  abrir painel explicativo com o resultado informado.
- Mostrar o tick alcancado, o motivo e os jobs que impedem o termino.
  CPUs desligadas isoladamente nao permitem inferir bloqueio: podem existir
  ativacoes futuras. A deteccao pertence a execucao, nao ao componente.
- Cenario esperado para o painel: a execucao informa que nao ha jobs elegiveis
  nem ativacoes futuras, mas restam jobs suspensos ou bloqueados por eles.
  Isso e uma expectativa para planejar a mensagem, nao uma definicao de
  algoritmo de deteccao. A UI nao recalcula elegibilidade, calendario ou um
  timeout para concluir bloqueio. Distinguir o resultado recebido de conclusao
  normal e erro; Q-06 foi resolvida por DEC-49, pendente de implementacao.
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
- Ao selecionar job que so existe no futuro registrado, manter o destaque e
  o tick, identificar tarefa/job e informar que ainda nao foi ativado naquele
  snapshot, com o tick de ativacao registrado. Nao mostrar progresso ou estado
  futuro como atual; mudancas de estado e de caracteristicas pela selecao desse
  job ficam indisponiveis enquanto ele nao existir no snapshot inspecionado.
- Aceitacao: estando em 20, clicar no trecho de 5 mantem relogio e CPUs de 20.
  Estando em 8, selecionar job ativado em 12 mostra "Ainda nao ativado no
  tick 8. Ativacao registrada no tick 12", sem restaurar 12.

### FE-11: Rascunhos e aplicacao atomica

Origem: REQ-05, REQ-10; #25 e #26.

- Abrir um formulario nao altera o snapshot. Cancelar descarta so o rascunho.
- Mostrar os motivos da rejeicao, manter os valores digitados e permitir
  corrigir. Nenhuma alteracao parcial pode aparecer como aplicada.
- Ao editar no passado, explicar antes de aplicar quais ticks futuros serao
  descartados. A invalidacao so ocorre apos aceitacao da edicao inteira.
- A edicao e referida ao tick selecionado, sem avancar o relogio. Tarefas
  concluidas continuam inspecionaveis; delas so a cor e editavel (DEC-37).
- Aceitacao: rejeitar um campo preserva integralmente snapshot e futuro,
  inclusive se outros campos do mesmo formulario estavam validos.

### FE-12: Expor o alcance das alteracoes de tarefa

Origem: REQ-05, REQ-07, REQ-08; expectativas de integracao relacionadas a
Q-02 e #25/#26.

- Explicitar o alcance recebido do contrato de edicao, distinguindo valores
  atuais da tarefa dos valores efetivos dos jobs existentes. A interface
  apresenta o resultado do comando; nao define sua semantica de dominio.
- Mostrar que duracao e prazo novos valem somente para proximas ativacoes,
  nunca para jobs ja ativados (DEC-37). Periodo novo vale ja para a
  prioridade RM dos jobs incompletos; no EDF, com as dez ativacoes feitas, avisar que fica guardado
  sem efeito visivel.
- Para periodo, apresentar a proxima ativacao e a previa do calendario
  fornecidas pelo nucleo, inclusive ativacao imediata quando aplicavel e
  esgotamento do teto. Nao calcular ativacoes nem congelar prioridade RM.
- Aceitacao: o formulario nao sobrescreve jobs existentes nem implementa as
  regras de calendario. A integracao precisa disponibilizar os valores
  efetivos para apresentacao; nao assumir que a duracao atual da tarefa ainda
  descreve jobs anteriores, nem prescrever como o nucleo guarda esses dados.
- Cenarios de apresentacao (DEC-37): ultima ativacao em 10, edicao em 12 e
  periodo 8 mostram proxima ativacao em 18; ultima ativacao em 10 com
  periodo antigo 10, edicao em 17 e periodo 4: 14 ja passou, entao a
  ativacao ocorre em 17 e a seguinte em 21. A ativacao segue o calendario
  mesmo com job anterior incompleto, que fica pendente (DEC-02).

### FE-13: Mudar o estado da tarefa

Origem: REQ-01, REQ-05, REQ-08; DEC-37 (#25).

- O estado e da tarefa (pronta, executando forcada, suspensa, concluida),
  vale para o job mais antigo incompleto e tambem para os jobs seguintes,
  ate nova mudanca (DEC-37). Jobs pendentes continuam pendentes (DEC-02).
- Apresentar que progresso e prazo sao preservados, o prazo nao pausa e
  retomar nao garante CPU imediata. Distinguir tarefa forcada de tarefa
  pronta que executa por prioridade. Encerrar pede confirmacao e informa
  que interrompe os jobs incompletos e impede novas ativacoes.
- Aceitacao: controles refletem os comandos disponiveis no snapshot e seus
  erros. A UI nao transforma o job em executando para simular uma retomada.

### FE-14: Ajustar progresso como intervencao de debugger

Origem: REQ-05, REQ-09; controle de apresentacao discutido; dependencia de #25/#26.

> Fora do Projeto A por DEC-37 (#25): ticks executados nao sao editaveis; o
> progresso so muda executando. Os itens abaixo ficam como registro da proposta.

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

Origem: REQ-05, REQ-09; expectativas relacionadas a Q-02 e #25/#26.

- Inclusao usa formulario validado; ingresso pode ser o tick selecionado ou
  um futuro. Para adicionar em momento anterior, navegar ate ele e editar ali.
- Se o ingresso solicitado for anterior ao tick selecionado, mostrar a
  rejeicao e seu motivo sem aplicar parcialmente a inclusao.
- Mostrar a primeira ativacao fornecida pelo nucleo, imediata ou futura.
- Excluir so tarefa nunca ativada (DEC-37); para tarefa ja ativada, mostrar
  a recusa e indicar encerrar (FE-13). Nao mostrar job interrompido pelo
  encerramento como concluido normalmente.
- Aceitacao: inclusao ou remocao nao modifica o passado; jobs removidos nao
  continuam em CPU, conforme o resultado atomico devolvido pelo nucleo.

### FE-16: Editar parametros do sistema

Origem: REQ-02, REQ-05, REQ-07; expectativas relacionadas a Q-02.

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
- A escolha RM/EDF pertence a preparacao, conforme A.4.1, e tambem pode ser
  trocada durante a simulacao (DEC-37); a troca vale a partir da selecao no
  tick da edicao.

## Visualizacao e exportacao

### FE-17: Gantt consistente com os dados

Origem: REQ-02, REQ-09; DEC-08 aceita em 2026-10-24 (#35).

- Raias de tarefas por ID decrescente, ordem natural de DEC-48; identificar CPU e job nos trechos
  executados. Um job posterior ainda nao elegivel mostra so o marcador de
  ativacao. Mostrar tambem intervalos de CPUs desligadas, inclusive de CPUs
  historicas, em faixas por CPU; o intervalo aberto termina no instante atual.
- Usar cor da tarefa em execucao; pronta sem preenchimento, com contorno
  tracejado na cor da tarefa; suspensa com hachura sobre fundo escuro. Tarefa
  nao ativada ou terminada fica vazia. Cores de amostra do prototipo nao sao um
  ciclo fixo de quatro opcoes nem substituem as cores configuradas.
- Mostrar eventos distintos e legenda: ingresso/ativacao, termino do job, fim da
  tarefa, perda de prazo, sorteio, preempcao, quantum vencido e instante atual.
  Cada numero da regua identifica a celula do tick, centralizado nela; fronteiras
  dos intervalos e marcadores ficam nas fronteiras exatas dos instantes.
- Marcadores coincidentes na mesma raia ficam empilhados verticalmente,
  mantendo a posicao horizontal exata do tick. Preservar forma e descricao
  identificaveis por mouse e teclado, sem deslocar o instante representado.
- Preservar a cor da tarefa e escolher texto preto ou branco sobre ela para
  contraste minimo de 4,5:1 em texto comum. Estados e eventos tambem usam
  formas, padroes e rotulos, sem depender apenas de cor.
- Permitir zoom e rolagem para consultar todos os dados; o viewport nao
  determina a extensao do historico nem da exportacao.
- Aceitacao: evento em t=5 fica na fronteira 5, nao no centro da celula.
  Estado suspenso exige registros de suspensao/retomada do nucleo; nao pode ser
  inferido somente de ausencia de execucao.

### FE-18: Exportar historico valido integral

Origem: REQ-09, REQ-10; extensao parcial aprovada pelo usuario; #39.

- Formato SVG, a partir dos dados, nunca captura da janela, conforme DEC-08
  (aceita na #35).
- Incluir todo o historico valido: tarefas, intervalos, CPUs, eventos e legenda,
  sem corte pelo cursor, zoom ou rolagem e sem controles da interface.
- Nao atenuar no arquivo o trecho posterior ao cursor da tela. Nao impor um
  teto arbitrario de ticks para conseguir exportar.
- Permitir resultado parcial, identificado como tal quando o ultimo estado
  calculado ainda nao representa termino. A classificacao nao usa o cursor.
- Aceitacao: cursor em 8 e historico ate 20 exporta 0-20. Se 20 representa
  termino, a imagem e final; caso contrario, parcial. Falha de gravacao e
  explicada e nao altera a sessao; cancelamento nao e erro.

### FE-19: Apresentar ID, cor e ingresso editaveis

Origem: REQ-05, REQ-06, REQ-09; apresentacao discutida em 2026-10-23 e
expectativas de integracao relacionadas a Q-02.

- Na criacao pela interface, a diretriz discutida e gerar o ID pelo sistema,
  sugerido pelo sistema (proximo numero livre) e aceitando um ID digitado
  (DEC-48, revisao de DEC-37).
  No arquivo, ID e cor sao entradas obrigatorias; preservar os
  valores recebidos, sem renumeracao ou substituicao silenciosa de cores.
- ID nao e editavel no Projeto A (DEC-37); o ID gerado nunca repete o de uma
  tarefa da simulacao, inclusive removida.
- Cor aceita recolore todo o historico valido da tarefa, inclusive a
  exportacao; nao apenas trechos posteriores a edicao. Fazer isso na projecao
  de apresentacao, sem mutar snapshots antigos ou alterar fatos de CPU.
  Sugerir uma cor automaticamente ao criar pela UI permanece uma proposta,
  nao substitui a obrigatoriedade do campo no TXT.
- Antes da primeira ativacao, mostrar a possibilidade de reagendar ingresso
  para o tick inspecionado ou futuro, quando o resultado da validacao permitir.
  Depois do ingresso, o campo fica bloqueado, com a explicacao ao passar o
  cursor: "O ingresso nao pode ser alterado pois a tarefa ja ingressou."
  (DEC-37); apresentar o motivo recebido e manter o ingresso consultavel,
  sem implementar essa validacao no componente. Nao confundir ingresso da
  tarefa com ativacoes posteriores de jobs.
- Aceitacao: uma cor aceita atualiza os trechos antigos sem alterar eventos;
  um ID duplicado ou ingresso rejeitado preserva rascunho, estado e futuro.
  Aplicacao e validacao semantica seguem FE-11 e o contrato do nucleo.

### FE-20: Consultar todos os diagnosticos

Origem: REQ-06, REQ-10; DEC-19, DEC-24 e acordo de 2026-10-23.

- Mostrar a quantidade total e permitir consultar todos os diagnosticos em
  lista com rolagem e acesso por teclado. Nao ocultar mensagens essenciais
  nem usar "e mais N problemas" sem acesso aos restantes.
- Preservar mensagens e contexto recebidos, incluindo linha, campo, valor
  e motivo quando fornecidos. Falhas de leitura nao ganham linha inventada.
- Seguir DEC-24: erros corrigiveis aparecem no contexto da acao; o banner
  global continua destinado a falhas inesperadas, nao a toda rejeicao.
- Aceitacao: doze problemas recebidos permitem consultar os doze, mantendo
  os dados anteriores e o rascunho sem tentar corrigir o arquivo na UI.

## Decisoes de apresentacao registradas

FE-DEC-01 a FE-DEC-06 registradas em 2026-10-18; complementos e novos
acordos registrados em 2026-10-23; FE-DEC-14 em 2026-10-31. Nao constituem
evidencia de codigo.
Os IDs desta tabela sao decisoes de apresentacao; resultados esperados de
operacoes do nucleo continuam condicionados as expectativas de integracao.

| ID        | Decisao e justificativa                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Vinculos                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| FE-DEC-01 | Spec propria do renderer; manter nucleo agnostico da interface e evitar duas fontes de regras do dominio.                                                                                                                                                                                                                                                                                                                                                                                 | FE-01; REQ-04, REQ-05, REQ-10               |
| FE-DEC-02 | Preparar e validar antes de iniciar explicitamente; separar rascunho de snapshot zero.                                                                                                                                                                                                                                                                                                                                                                                                    | FE-02 a FE-04; REQ-05, REQ-06               |
| FE-DEC-03 | Reiniciar preserva o cenario inicial; Limpar volta aos padroes sem tarefas. Evitar uma acao ambigua.                                                                                                                                                                                                                                                                                                                                                                                      | FE-05; REQ-04, REQ-05                       |
| FE-DEC-04 | Revisto por DEC-49: sem cancelamento; bloqueio tem uma unica saida para passo a passo e preserva o historico.                                                                                                                                                                                                                                                                                                                                                                             | FE-07, FE-08; REQ-04, REQ-10                |
| FE-DEC-05 | Selecao nao muda o tick; futuro valido fica visivel e so edicao aceita o descarta. Separar inspecao de navegacao.                                                                                                                                                                                                                                                                                                                                                                         | FE-06, FE-10, FE-11; REQ-04, REQ-05, REQ-09 |
| FE-DEC-06 | SVG integral, inclusive parcial, independente da janela; formalizado pela DEC-08 (#35).                                                                                                                                                                                                                                                                                                                                                                                                   | FE-18; REQ-09                               |
| FE-DEC-07 | ID fixo (DEC-37), recolorir o historico valido e distinguir ingresso futuro de ingresso ocorrido; validar a integracao sem definir regras do nucleo.                                                                                                                                                                                                                                                                                                                                      | FE-19; REQ-05, REQ-06, REQ-09               |
| FE-DEC-08 | Selecao futura conserva o tick e informa ausencia do job naquele snapshot, sem comandos sobre ele.                                                                                                                                                                                                                                                                                                                                                                                        | FE-10; REQ-04, REQ-09                       |
| FE-DEC-09 | Todos os diagnosticos ficam consultaveis com total, rolagem e teclado, sem perder mensagens do nucleo/parser.                                                                                                                                                                                                                                                                                                                                                                             | FE-20; REQ-06, REQ-10                       |
| FE-DEC-10 | Empilhar marcadores coincidentes sem deslocar o tick; texto adaptativo preto/branco com contraste minimo de 4,5:1, preservando a cor da tarefa.                                                                                                                                                                                                                                                                                                                                           | FE-17; REQ-09, REQ-10                       |
| FE-DEC-11 | Tooltip nao foi encontrado como componente definido no material inspecionado e nao integra a entrega 1. Manter nome acessivel dos botoes de icone; nao introduzir Reka UI para tooltip.                                                                                                                                                                                                                                                                                                   | Arquitetura do renderer; REQ-10             |
| FE-DEC-12 | Gantt conforme o Figma: numeros da regua no centro da celula do tick, marcadores nas fronteiras; pronta com contorno tracejado na cor da tarefa; suspensa hachurada em fundo escuro.                                                                                                                                                                                                                                                                                                      | FE-17; DEC-08; REQ-09                       |
| FE-DEC-13 | Controles e mensagens da entrega 1 (#70): icones sao os SVGs do Figma aplicados como mascara, sem biblioteca; foco pelo anel global de base.css, nao pela borda de 2 px do Figma; `UiAlert` usa `role="alert"` em danger/warning e `role="status"` em success/info, nao move foco e so tem botao de fechar quando dispensavel; devolver o foco apos dispensar cabe a composicao; textos da interface em portugues.                                                                        | FE-20; DEC-24; REQ-10                       |
| FE-DEC-14 | Composicao vazia em preparacao (#72): "Avancar tick" e a acao de inicio quando nao ha snapshot valido (sem botao "Iniciar"), e o primeiro clique publica o snapshot zero sem executar `[0, 1)`; o tick atual aparece como `–` antes de iniciar; o titulo da barra e so `os-sim`, sem nome de arquivo; acoes ainda sem implementacao ficam desabilitadas na posicao do Figma ate a issue que as implementa; "(DEC-10)" nao aparece para o usuario; `App` nao cria simulador na preparacao. | FE-02; FE-DEC-02; REQ-05, REQ-10; DEC-23    |

## Conferencia dos acordos da conversa

Conferencia documental atualizada em 2026-10-23. A matriz aponta onde cada acordo final
esta registrado, nao comprova implementacao. Os efeitos de dominio descritos
em FE-12 a FE-16 e FE-19 sao expectativas para a experiencia de apresentacao,
nao uma segunda especificacao do nucleo. "Acordado" nesta matriz refere-se
ao fluxo planejado para a interface; compatibilidade, API e suporte real
permanecem dependencias externas. Os documentos gerais nao sao alterados.

| Acordo final conferido                                                                                                                      | Registro                                      | Situacao                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Documentacao e responsabilidades em renderer, com nucleo agnostico.                                                                         | FE-01; FE-DEC-01; organizacao de apresentacao | Acordado; bibliotecas e contratos concretos abertos em PEND-07.                                                                    |
| Preparar e validar antes do inicio explicito; snapshot zero nao e primeiro tick executado.                                                  | FE-02, FE-03; FE-DEC-02                       | Acordado.                                                                                                                          |
| Importar primeiro valida, depois confirma substituicao e retorna a preparacao.                                                              | FE-04                                         | Acordado; cancelar ou falhar preserva a sessao.                                                                                    |
| Reiniciar usa o cenario inicial; Limpar retorna aos padroes sem apagar arquivos.                                                            | FE-05; FE-DEC-03                              | Acordado.                                                                                                                          |
| Retroceder conserva futuro visivel, resultados e sorteios; so edicao aceita o descarta.                                                     | FE-06, FE-11; FE-DEC-05                       | Acordado.                                                                                                                          |
| Execucao completa preserva todo o historico e nao oferece cancelamento (DEC-49).                                                            | FE-07; FE-DEC-04                              | Acordado; depende da execucao.                                                                                                     |
| Falta de progresso explica jobs bloqueadores e oferece uma saida para passo a passo.                                                        | FE-08; FE-DEC-04                              | Acordado; deteccao e contrato externos.                                                                                            |
| Inspecao separa tarefa, job, elegibilidade e perda de prazo.                                                                                | FE-09                                         | Acordado; nao inventar ranking da politica.                                                                                        |
| Clicar no Gantt seleciona tarefa/job sem mudar tick ou estado.                                                                              | FE-10; FE-DEC-05, FE-DEC-08                   | Acordado; selecao futura identifica ausencia no snapshot atual e nao habilita comandos.                                            |
| Formularios sao rascunhos; aplicar e atomico, sem avancar o relogio.                                                                        | FE-11                                         | Acordado; tarefa concluida aceita so a cor (DEC-37).                                                                               |
| Duracao editada afeta somente proximas ativacoes, nao jobs ja ativados.                                                                     | FE-12                                         | Decidido na #25 (DEC-37): sempre a partir da proxima ativacao.                                                                     |
| Prazo relativo editado afeta proximas ativacoes; prazos absolutos e perdas existentes permanecem.                                           | FE-12                                         | Acordado; contrato externo.                                                                                                        |
| Novo periodo conta da ultima ativacao; se ja passou, uma ativacao no tick editado e calendario a partir dela.                               | FE-12                                         | Decidido na #25 (DEC-37); sem reinicio da contagem de dez jobs.                                                                    |
| RM usa novo periodo ja na selecao do tick editado, inclusive para jobs ja ativados.                                                         | FE-12                                         | Decidido na #25 (DEC-37); nao congela prioridade por job.                                                                          |
| Suspensao e retomada por tarefa, sem pausar prazo; tarefa pode ser forcada a executar ou encerrada.                                         | FE-13                                         | Decidido na #25 (DEC-37); retomar nao garante CPU imediata.                                                                        |
| Progresso ajustavel e intervencao registrada; nao reescreve CPU anterior; atingir duracao conclui naquele tick.                             | FE-14                                         | Fora do Projeto A por DEC-37 (#25).                                                                                                |
| Inclusao aceita ingresso atual/futuro; exclusao so de tarefa nunca ativada; encerrar interrompe os jobs incompletos, preservando historico. | FE-15                                         | Decidido na #25 (DEC-37); interrupcao nao e conclusao normal.                                                                      |
| Quantum preserva consumo; novo limite pode vencer fatia no tick editado.                                                                    | FE-16                                         | Acordado; sem configuracao agendada para proximo tick.                                                                             |
| Alterar CPUs refaz selecao global, permite migracao e conserva trabalho e raias historicas.                                                 | FE-16                                         | Decidido na #25 (DEC-37): CPUs de maior ID saem; seus jobs mantem o primeiro desempate; IDs reusados ao aumentar, raia com lacuna. |
| Gantt por tarefa, CPU e job nos trechos, eventos, faixas de CPU, zoom e rolagem.                                                            | FE-17; FE-DEC-12; DEC-08                      | Acordado na #35; detalhes de escala em PEND-04.                                                                                    |
| SVG inclui historico valido inteiro, independente do cursor; parcial permitido e identificado.                                              | FE-18; FE-DEC-06                              | Acordado (DEC-08); gravacao pela infraestrutura.                                                                                   |
| Recorte somente periodico discutido apos consultar A.4.4.                                                                                   | Escopo; DEC-29                                | Reconciliado na #87: periodo padrao e aviso na carga (#89); UI exibe o aviso e rejeita periodo zero.                               |
| ID fixo; sugerido como proximo numero livre ou digitado, sem reutilizar o de tarefa removida.                                               | FE-19; DEC-37; DEC-48                         | Decidido na #25; revisto na #133.                                                                                                  |
| Cor aceita recolore todo o historico valido.                                                                                                | FE-19; FE-DEC-07                              | Acordado; nao mutar snapshots antigos.                                                                                             |
| Ingresso pode mudar antes da primeira ativacao, para o tick atual ou futuro; depois, campo bloqueado.                                       | FE-19                                         | Decidido na #25 (DEC-37).                                                                                                          |
| Lista completa de diagnosticos com total, rolagem e teclado.                                                                                | FE-20; FE-DEC-09                              | Acordado; sem truncamento inacessivel.                                                                                             |
| Marcadores simultaneos empilhados verticalmente e texto sobre cor com contraste de 4,5:1.                                                   | FE-17; FE-DEC-10                              | Acordado; demais detalhes de escala e acessibilidade continuam pendentes.                                                          |
| Base visual antes da inspecao isolada e da primeira integracao funcional.                                                                   | Arquitetura do renderer                       | Planejamento registrado; nomes e escolhas de bibliotecas sao propostas, sem implementacao.                                         |
| Sem tooltip na entrega 1 e sem Reka UI apenas para essa finalidade.                                                                         | FE-DEC-11                                     | Acordado; aria-label nao e tooltip visual.                                                                                         |
| Iniciar pela acao "Avancar tick" (snapshot zero no primeiro clique), tick `–` antes do inicio, acoes inertes desabilitadas.                 | FE-02; FE-DEC-14                              | Acordado em 2026-10-31; #72 so renderiza, o comportamento e da #36.                                                                |

Alternativas superadas que nao devem voltar como requisitos implicitos:

- Iniciar automaticamente ao carregar/cadastrar dados: prevalece inicio explicito.
- Cancelar execucao completa: alternativa retirada por DEC-49.
- Ocultar o futuro ao retroceder: prevalece manter todo futuro ainda valido.
- Contar novo periodo desde a edicao: prevalece ultima ativacao, com o caso
  vencido explicitado em FE-12.
- Agendar parametros do sistema para proximo tick ou renovar a fatia por editar
  quantum: prevalece aplicacao no tick editado, preservando consumo da fatia.
- Aplicar duracao/prazo tambem ao job atual: alternativa expressamente
  recusada; prevalecem somente proximas ativacoes.
- Tratar o recorte periodico como revogacao implicita de DEC-09/DEC-17:
  nao autorizado; reconciliacao explicita continua pendente.
- Importar tooltip ou Reka UI como se fossem exigencias do prototipo:
  tooltip foi retirado da entrega 1, e sua biblioteca nao e necessaria nela.

## Dependencias e pendencias

Os itens abaixo registram o que esperamos consumir do nucleo ou da
infraestrutura para viabilizar os fluxos da interface. Nao sao contratos
impostos por este PR. Nao criar implementacoes alternativas no renderer,
alterar os documentos gerais ou declarar funcionalidades prontas para fechar
essas dependencias. Conferir compatibilidade antes da integracao, sem perder
o registro da experiencia discutida ou decidir silenciosamente outro fluxo.

| Dependencia             | O que a apresentacao precisa receber                                                                                                                | Referencias                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Historico e edicao      | Cursor, limite valido, snapshots restauraveis, comandos atomicos, resultado e diagnosticos; estado do sorteio preservado.                           | E3, #23 a #26; DEC-06, DEC-14      |
| Parametros por ativacao | Valores efetivos dos jobs, previa de ativacoes e possibilidades de edicao, sem prescrever a representacao do dominio.                               | Q-02, #25/#26; FE-12               |
| Intervencoes            | Resultados e registros observaveis de suspensao, retomada, inclusao/remocao e mudanca manual de estado, conforme a API que vier a estar disponivel. | Q-02, #25/#26; FE-13 a FE-19       |
| Execucao completa       | Snapshot de resultado ou bloqueio, com tick, motivo e jobs envolvidos; sem cancelamento.                                                            | Q-06, #27; FE-07 e FE-08           |
| Arquivos                | Dialogos autorizados, configuracao analisada e diagnosticos de conteudo/acesso; gravacao com resultado ou cancelamento.                             | E4, #33/#34, #39; DEC-19           |
| Aperiodicas (A.4.4)     | Avisos de periodo padrao aplicado no resultado da carga, com ID, linha e motivo, para exibicao; o renderer nao filtra nem converte tarefas.         | DEC-29; #89, #33/#36               |
| CPU desligada           | Intervalos e totais obtidos pela consulta publica do nucleo, sem rederivar sequencias no renderer.                                                  | DEC-21; #15 concluida              |
| Comandos e erros        | Usar load/tick e CommandResult existentes; reconciliar inicializacao em t=0 com preparacao antes de integrar FE-02/FE-04.                           | DEC-23, DEC-24; #17/#65 concluidas |

- PEND-01: resolvida por DEC-37 (#25). ID nao e editavel; o gerado e o
  sugerido e o proximo numero livre ou digitado, e nunca reutiliza o de
  tarefa removida (revisto por DEC-48, #133).
- PEND-02 (compatibilidade externa): confrontar as expectativas de edicao,
  calendario, progresso, quantum, CPUs, inclusao/remocao, ID, ingresso e
  bloqueio com as capacidades e contratos reais do nucleo quando estiverem
  disponiveis. Q-02 foi resolvida por DEC-37 e Q-06 por DEC-49.
  A reconciliacao de A.4.4 com REQ-03, DEC-09 e DEC-17 saiu desta pendencia:
  resolvida por DEC-29 na #87 (2026-10-28), implementacao na #89.
- PEND-03 (resolvida na apresentacao): comportamento de selecao futura em
  FE-10/FE-DEC-08. Integracao e testes ainda nao executados.
- PEND-04 (parcial): empilhamento e texto adaptativo acordados em FE-17.
  Restam muitos jobs/CPUs, colisoes entre ticks proximos em zoom reduzido,
  redimensionamento completo, navegacao por teclado, foco de dialogos e
  contraste geral da UI. Tooltip nao integra a entrega 1; nao criar biblioteca
  por essa finalidade. Os cenarios iniciais estao na arquitetura propria.
- PEND-05 (resolvida na apresentacao): consulta completa em FE-20/FE-DEC-09.
  Implementacao e testes permanecem nas entregas correspondentes.
- PEND-06: conferir disponibilidade dos comandos em preparacao, execucao,
  navegacao no passado, bloqueio, termino e erro. Nao habilitar
  comandos sem contrato implementado nem prometer capacidade via mocks.
- PEND-07 (parcial): arquitetura interna, fronteiras e ordem registradas na
  arquitetura propria, com detalhamento das entregas 1 e 2. Nomes concretos,
  bibliotecas propostas e contratos das demais entregas ainda precisam de
  fechamento conforme a implementacao se aproxime. Nenhuma dependencia nova
  foi instalada ou imposta ao nucleo.

## Estado da discussao

Em 2026-10-23, os acordos de ID, cor, ingresso, selecao futura, diagnosticos,
empilhamento e contraste complementam os fluxos anteriores. Duracao e prazo
continuam afetando somente proximas ativacoes; incluir o job atual foi
explicitamente recusado. PEND-03 e PEND-05 estao resolvidas apenas como
especificacao; as demais pendencias permanecem totais ou parciais como acima.

O planejamento tecnico passa a orientar a sequencia de codigo, usando os
frames de Telas como referencia, sem exigir novas aprovacoes de cada detalhe
ja visivel. So conflitos concretos ou lacunas exigem nova discussao. Proximo
passo: conferir as propostas das entregas 1/2 e os contratos atuais, depois
detalhar a primeira integracao funcional; implementar apenas apos autorizacao.

Esta entrega limita-se aos documentos do renderer e a referencia do frontend
no plano geral. Nao altera codigo, dependencias, regras ou documentos do
nucleo. Q-02 foi resolvida por DEC-37 e Q-06 por DEC-49; Q-05 e DEC-08 foram resolvidas na #35 e
aperiodicas nao
sao excluidas por uma decisao implicita da camada de apresentacao.

## Rastreabilidade e verificacao futura

- #35: Q-05 e DEC-08 resolvidas em 2026-10-24; esta spec foi alinhada (FE-17,
  FE-18, FE-DEC-12).
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
