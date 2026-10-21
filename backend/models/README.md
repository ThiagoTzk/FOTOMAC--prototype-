# Modelos de reconhecimento facial

O FOTOMAC usa **YuNet** (detecção de rostos) + **SFace** (vetor de 128 dimensões), executados pelo
OpenCV. Os arquivos não vão para o git (38 MB): `infra/setup_local.sh` baixa os arquivos oficiais
do [opencv_zoo](https://github.com/opencv/opencv_zoo) e confere o SHA-256.

| Arquivo | Licença | SHA-256 |
|---|---|---|
| `face_detection_yunet_2023mar.onnx` | MIT | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| `face_recognition_sface_2021dec.onnx` | Apache 2.0 | `0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79` |

São os mesmos arquivos medidos no Teste 1 do fotomac-lab (nota 89,5/100). Se um arquivo for
diferente, a API recusa carregar o modelo: vetores de um arquivo diferente não se comparam com os
já guardados. Trocar de modelo é feito pelo painel do administrador (Reconhecimento facial), que
reindexa o acervo.
