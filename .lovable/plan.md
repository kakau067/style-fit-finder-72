# Corrigir roupas no manequim 3D e publicar

## Objetivo
Substituir as formas rígidas e deslocadas por roupas curvas, proporcionais e solidárias ao manequim anatômico, mantendo giro 360°, zoom e pan.

## Implementação
- Refatorar a construção das roupas em `Mannequin3D` para usar perfis radiais com `LatheGeometry`, superfícies tubulares/cápsulas arredondadas e curvas próprias por categoria.
- Eliminar `BoxGeometry` das peças principais e das lapelas; criar lapelas curvas e mangas orientadas entre ombro, cotovelo e punho.
- Derivar busto, cintura, quadril, ombros, entrepernas e comprimentos diretamente das medidas atuais.
- Colocar corpo GLB e roupa sob o mesmo grupo transformado, usando um único referencial local e a transformação calculada pelo modelo preparado; isso evita peças flutuando, atrás do corpo ou escaladas duas vezes.
- Renderizar exclusivamente a categoria do produto: tops no tronco, calça nas duas pernas, saia abaixo da cintura e vestido contínuo do ombro à barra.
- Preservar os controles atuais de câmera e o fallback procedural caso o GLB não carregue.
- Corrigir os erros de tipos do Three.js que atualmente impedem o preview de compilar.

## Validação
- Conferir build e logs sem erros.
- Abrir o preview em desktop e celular, validar visualmente cada categoria, enquadramento, 360°, zoom e pan.
- Conferir que o GLB carrega e que nenhuma peça fica deslocada nas medidas padrão e em medidas alteradas.
- Publicar a versão validada em produção e retornar o identificador da revisão disponível e o status do deploy.

## Nota técnica
O ambiente gerencia o histórico do projeto internamente e não permite criar commits manualmente. Retornarei o identificador de revisão/deploy disponibilizado pela publicação; não inventarei um hash Git caso a plataforma não o exponha.
