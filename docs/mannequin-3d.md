# Modelo 3D do manequim

## Objetivo

O componente `Mannequin3D` agora aceita um modelo humano externo em GLB/GLTF sem remover o manequim procedural de fallback.

A origem do modelo é configurada por:

`VITE_MANNEQUIN_MODEL_URL`

Se a variável estiver vazia, o app continua usando o modelo procedural atual.

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

Esses valores devem representar as medidas reais do corpo-base usado pelo artista. Isso evita que os ajustes de busto/cintura/quadril sejam aplicados sobre uma referência incorreta.

## Preparação para produção

Antes de colocar o modelo definitivo no site, devemos otimizar o asset:

1. reduzir geometria sem perder detalhes visuais;
2. comprimir malha com Draco ou Meshopt;
3. converter texturas grandes para formatos web apropriados, como KTX2/Basis quando fizer sentido;
4. manter PBR e normal maps;
5. testar carregamento em celular;
6. validar escala real e posição dos pés no chão.

O `GLTFLoader` do Three.js suporta GLB/GLTF e extensões de compressão como Draco, Meshopt e KTX2, então a arquitetura atual permite adicionar essa otimização sem trocar o renderer. 
