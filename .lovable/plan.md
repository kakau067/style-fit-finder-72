# Auditoria de erros (somente leitura) — 28/09/2026

Nada foi alterado, publicado ou gerado. Nenhuma prova paga foi feita. Checkpoint GitHub indisponível (403).

## Verificações executadas agora
| Item | Resultado |
|---|---|
| Build | OK (último registro 20:01 UTC) |
| Typecheck | OK, 0 erros |
| Lint | 815 erros: 814 de formatação (prettier), 1 real (`prefer-const`, variável `timer`) + 6 avisos de fast-refresh |
| Testes automatizados | Não existem no projeto |
| Erros de runtime/console do preview | Nenhum registrado |
| Serviços de prova (health) | Fal.ai ativo, Gemini configurado, modo "auto" |
| Área do Lojista | Página responde 200 |
| Chaves no navegador | Nenhuma chave secreta no código do frontend; só a chave pública do banco |

## Problemas confirmados
**ALTO — Endpoint de prova visual público e sem limite.** `src/routes/api/public/tryon.ts` aceita qualquer requisição e dispara Fal.ai/Gemini (custo por uso). Impacto: qualquer um pode gastar os créditos da loja. Correção: limite por IP/sessão e verificação de origem.

**MÉDIO — Mensagens técnicas vazam.** O mesmo endpoint devolve textos com nomes de chaves (`FAL_KEY`, `GEMINI_API_KEY`) e trechos da resposta do provedor (até 250 caracteres). A tela traduz os casos comuns, mas casos novos podem aparecer crus. Correção: devolver códigos neutros e registrar o detalhe só no servidor.

**MÉDIO — Health expõe configuração.** `?health` revela quais provedores estão ativos. Baixo risco, mas desnecessário em público.

**BAIXO — Lint quebrado.** 814 correções automáticas de formatação + 1 `const`. Não afeta o usuário.

**BAIXO — Sem testes automatizados.** Regressões só são pegas manualmente (ex.: ranking de preferências e cálculo de tamanho em `src/lib/sizing.ts`).

## Limitações externas (não são bugs)
- Análise automática da foto: depende de créditos Lovable AI (último teste: 402). O fallback manual funciona.
- Prova padrão Lovable AI: também depende de créditos; o modo "auto" usa Fal.ai primeiro, então hoje não é acionada.
- Gemini/Fit Check: configurado, nunca testado ao vivo.

## Status por fluxo (última validação no navegador, rodada anterior; não repetida agora para não gastar créditos)
- Foto (exemplo/upload) + fallback manual: OK. Câmera: não testável no navegador de teste.
- Medidas editáveis e salvas localmente: OK.
- Preferências mudam o ranking (estilo, cor, orçamento): OK.
- Imagens do catálogo e cards: OK.
- 3 abas do modal + Escape: OK.
- Fal.ai real: OK (antes/depois).
- Manequim 360°: ilustrativo, rotulado como tal: OK.
- Celular: NÃO testado.
- Cadastro novo no painel do lojista: NÃO testado (evitado para não criar dados).

## Divergências UI x implementação
- "Nada é salvo em servidor" (tela da foto): verdadeiro para a foto, mas ela é enviada ao provedor externo de IA — vale deixar explícito.
- Manequim 360° não mostra a roupa real (já avisado na tela).

## Prioridades
- **P0:** proteger o endpoint de prova visual (limite de uso).
- **P1:** remover detalhes técnicos das respostas; esconder health; testar no celular; testar Gemini uma vez.
- **P2:** corrigir lint; criar testes para tamanho/ranking; ajustar texto sobre privacidade da foto.

## Próximo passo sugerido (após aprovação)
Implementar P0 e P1 sem mudar o visual, depois validar build e jornada no navegador.
