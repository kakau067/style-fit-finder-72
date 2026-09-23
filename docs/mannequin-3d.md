# Modelo 3D do manequim

## Objetivo

O passo de medidas usa o GLB `public/models/female-display-mannequin.glb` por padrão. Ele substitui o corpo de cápsulas enquanto mantém o fallback procedural se o carregamento falhar. O usuário pode girar, ampliar e mover a câmera e trocar entre o corpo sem roupa visual, quatro peças e três estados de acessórios.

O modelo incluído é uma escultura estática de vitrine (7.866 vértices, 124,7 KB, sem rig ou morph targets), feita por 3D Assets, sob [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). [Origem do asset](https://3dassets.dev/assets/retail-store-fixtures-and-mall-mannequin-female-standi-bd5d8738). A base metálica é ocultada no app. Ele não é um corpo fotográfico nem serve para validar caimento de roupas reais.

A origem do modelo é configurada por:

`VITE_MANNEQUIN_MODEL_URL`

Se a variável estiver vazia, o app usa o GLB incluído. Um erro de carregamento mantém o manequim procedural.

Altura escala o modelo por sua altura original. Em uma malha estática, busto, cintura e quadril deformam regiões da silhueta com limites conservadores; a edição usa sempre os vértices originais e não acumula distorção. Roupas e acessórios procedurais continuam visíveis e trocáveis sobre o GLB. São visualizações genéricas, não as fotografias do catálogo ou uma simulação de tecido. O motor de recomendação de tamanhos continua separado.

## Contrato recomendado para o GLB

Para a próxima etapa de ajuste corporal, o arquivo deve preferencialmente ter:

- corpo humano feminino realista/semi-realista;
- pose A ou T neutra;
- rig/skeleton limpo;
- UVs organizadas;
- materiais PBR;
- GLB pronto para web;
- sem roupas permanentes cobrindo o corpo-base;
- morph targets para busto, cintura, quadril, ombros e comprimento das pernas, quando possível.

O loader também reconhece métricas-base opcionais em `scene.userData.mannequinBaseMeasurements`:

```ts
{
  heightCm: 168,
  chestCm: 90,
  waistCm: 72,
  hipsCm: 98,
  shoulderCm: 40,
  inseamCm: 78
}
```

Esses valores devem representar as medidas reais do corpo-base usado pelo artista. Sem eles, o loader usa a referência aproximada do asset inicial: 178/90/72/98/40/82 cm. Não atribua precisão antropométrica ao asset padrão. Em modelos riggados com morph targets, as formas nomeadas `chest/bust`, `waist`, `hips`, `shoulder` e `inseam/leglength` são aplicadas antes da escala; sufixos `decrease/smaller/narrow/minus/reduce/negative` identificam formas de diminuição. O ponto neutro é influência zero. Malhas riggadas sem morph targets conservam apenas a escala da altura.

## Preparação para produção

Para uma apresentação comercial com zoom no tecido, o modelo padrão precisa ser substituído por um corpo de malha mais densa e por uma malha 3D para cada SKU e tamanho. Fotos frontal/traseira/detalhe do catálogo não contêm a geometria, o verso nem os mapas PBR necessários para construir essa peça automaticamente.

1. Produzir o corpo neutro com topologia contínua, UVs e morph targets calibrados para busto, cintura, quadril e ombros, usando escala em metros e pose A.
2. Digitalizar ou modelar cada roupa no mesmo rig e pose; entregar GLB com UVs, cor, normal e roughness para tornar trama e costura visíveis ao aproximar a câmera.
3. Preparar tamanhos/caimentos, evitar interseção com a pele e validar cada peça de frente, lado e costas. A geometria atual das roupas é apenas uma referência de tipo e cor.
4. Criar níveis de detalhe para celular, carregar peças sob demanda, comprimir malha e texturas e medir tempo de carregamento, memória e quadros por segundo em aparelhos reais.
5. Medir o corpo exportado contra a fita métrica; escala visual e deformação aproximada não validam tamanho de roupa.

Se o modelo futuro usar Draco, Meshopt ou KTX2, configure os decodificadores correspondentes no `GLTFLoader` antes de publicá-lo. O asset incluído usa `KHR_mesh_quantization` e não exige decodificador adicional.
