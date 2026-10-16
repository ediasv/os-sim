# Orientacoes do repositorio

## Contexto antes de implementar

- Ler [especificacao](docs/specification.md), [arquitetura](docs/architecture.md)
  e "Trabalho atual" no [plano](docs/plan.md), nessa ordem.
- Escopo atual: somente Projeto A, nucleo/logica primeiro, interface depois.
- Distinguir requisitos do enunciado, decisoes aceitas e propostas abertas.
  Nao resolver ambiguidades silenciosamente nem ampliar escopo sem acordo.
- PDFs de referencia e comandos estao no [README](README.md).

## Implementacao e acompanhamento

- Preservar limites de importacao do README e estado privado do simulador.
- Trabalhar em incrementos pequenos, com teste focado antes de ampliar a entrega.
- Atualizar plano e status da issue no GitHub Project ao iniciar, concluir,
  bloquear ou pausar trabalho, deixando objetivo, escopo, verificacao realizada
  e proximo passo claros. Novos itens de trabalho viram issues no Project.
- Fechar issue somente com evidencia; registrar verificacoes nao executadas.
- Registrar mudancas de contrato/comportamento com DEC-ID e justificativa na
  arquitetura; vincular ao REQ-ID. Atualizar criterios se acordados com o usuario.
- Nao duplicar TODOs por agente nem copiar regras do dominio nestas instrucoes.
- Documentar responsabilidades de componentes/funcoes e razoes de decisoes
  relevantes conforme o enunciado, sem comentarios que apenas repetem o codigo.
- Nao reverter alteracoes do usuario, criar commits ou releases sem solicitacao.

## Verificacao

- Codigo: teste focado e gates aplicaveis (`npm test`, `npm run lint`,
  `npm run typecheck`); distinguir falhas preexistentes das novas.
- Documentacao: verificar links locais, IDs cruzados e consistencia entre estado
  real do codigo e checks do plano. Nao exigir build por mudanca so documental.
- Distribuicao so esta validada apos teste do pacote no ambiente-alvo.
