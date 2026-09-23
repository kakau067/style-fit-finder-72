# Visualização do manequim 3D

O passo de medidas usa por padrão `public/models/parametric-body.glb`: uma malha anatômica com 14.517 vértices, cerca de 26.756 triângulos e dez controles de forma. O arquivo compactado com Meshopt tem 358 KB. O modelo anterior de vitrine tinha 2.622 triângulos e apresentava facetas visíveis. O novo modelo acompanha altura, busto, cintura, quadril, ombros e a escolha entre silhuetas feminina e masculina. Câmera livre em 360°, zoom e controle por toque continuam disponíveis. A prévia de camisa, blazer, vestido ou calça acompanha a malha contínua do corpo, sem cilindros que a atravessem. Óculos e bolsa são acessórios genéricos posicionados junto ao corpo.

## Origem e licença

A malha e os alvos de forma são dados [MakeHuman/MPFB2 sob CC0 1.0](https://github.com/nirholas/three.ws/blob/main/avatar-sources/anny/README.md), disponibilizados pelo projeto [anny da NAVER](https://github.com/naver/anny). O GLB foi extraído do [modelo paramétrico do three.ws](https://github.com/nirholas/three.ws/blob/main/public/avatars/parametric-base.glb) mantendo somente os dez alvos de forma necessários. Veja também [a licença dos dados de origem](https://github.com/nirholas/three.ws/blob/main/avatar-sources/anny/LICENSE.md).

## Limites da prévia

A superfície colorida indica a região e a cor de uma categoria de roupa, com uma microtextura procedural aproximada. **Ela não é a malha da peça do catálogo, não mostra sua trama ou caimento reais e não prediz tamanho nem pressão.** Para vender prova fiel a grifes, cada produto precisa de peça digital com molde, dimensões, UV e mapas de textura/normal/roughness medidos, além de rig compatível e validação de caimento. A simulação de tecido físico e a prova fotográfica são etapas separadas. Medidas estimadas de uma foto devem ser conferidas com uma fita métrica.

`VITE_MANNEQUIN_MODEL_URL` pode apontar a outro GLB auto-hospedado. Quando o carregamento falha, entra o manequim procedural básico. A malha substituta deve ser orientada em Y, com os pés na base; alvos de forma `bustBigger`/`bustSmaller`, `waistWider`/`waistNarrower`, `hipsWider`/`hipsNarrower`, `shouldersWider`/`shouldersNarrower`, `bodyFeminine` e `bodyMasculine` são reconhecidos automaticamente. Uma URL personalizada sem essa topologia não receberá a prévia aderente de roupa; peça 3D externa deve ser preparada especificamente para o provador.
