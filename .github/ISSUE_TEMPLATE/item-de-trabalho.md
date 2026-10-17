---
name: Item de trabalho
about: Entrega de uma fase do plano (E1-E6) ou outro item acompanhado no Project
title: '[E?] '
---

<!--
Descreva O QUE precisa estar verdadeiro ao final e POR QUE; o COMO fica com
quem implementa.

- Pode: estado atual, lacuna, comportamento observavel, restricoes de REQ/DEC e
  dos invariantes do nucleo, criterios de pronto e limites explicitos. Citar
  codigo, tipos ou eventos existentes so para descrever o que ja existe ou um
  contrato que precisa ser respeitado.
- Nao pode: prescrever arquivos ou funcoes a criar, algoritmos, estruturas de
  dados, nomes ou codigo de testes, passo a passo.
- Sem decisoes novas: cada item de "O que precisa ser feito" vem de um REQ, DEC,
  Q, nota do plano ou comentario. Interpretacao vira proposta em "Dependencias e
  questoes em aberto", a combinar com o usuario.
- Resuma as DECs na parte que importa e cite o ID; nao copie o texto inteiro.
- Titulo: verbo no infinitivo que nomeia a entrega, com prefixo `[E#]`.
- Remova estes comentarios e as secoes opcionais sem conteudo.
-->

**Fase:** E#: <nome da fase>
**Requisitos:** <!-- somente os REQ-xx que esta issue atende -->
**Decisoes e questoes:** <!-- DEC-xx e Q-xx que restringem ou afetam a issue -->

## Contexto

<!-- Por que existe; o que ja existe hoje (codigo/documentos); o que falta. -->

## O que precisa ser feito

<!--
Resultados observaveis: comportamentos, regras, contratos ou documentos
entregues. Em issues de decisao: perguntas a responder e opcoes conhecidas; a
entrega e uma DEC acordada com o usuario e os documentos/issues afetados
atualizados. Em issues de teste: cenarios que precisam ser cobertos.
-->

## Criterios de aceitacao

- [ ] <!-- verificavel por um revisor: comportamento, teste ou documento -->
- [ ] Verificacao registrada: codigo com `npm test`, `npm run lint` e
      `npm run typecheck`; documentos com links locais e IDs cruzados.

## Fora do escopo

- <!-- item excluido (#N, onde sera tratado) -->

## Dependencias e questoes em aberto

- <!-- Depende de #N / bloqueia #N: motivo. -->
- <!-- Questao ou proposta a combinar com o usuario antes de implementar. -->

## Referencias

<!-- Opcional: secoes do enunciado, figuras, comentarios relevantes. -->

Origem: [docs/plan.md](https://github.com/ediasv/os-sim/blob/main/docs/plan.md#<ancora-da-fase>).
Marcar como entregue somente com evidencia de verificacao.
