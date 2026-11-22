# AgroIA - Sistema Agropecuario Online y Offline

Aplicación web progresiva (PWA) para celular y PC con redes neuronales en PyTorch e IA estructurada para cultivos (**maíz, yuca, ñame, plátano**) y animales (**gallinas, pollos, cerdo, vaca y reses**).

## Ejecución en VS Code
1. `python -m venv venv` y activar entorno virtual.
2. `pip install -r requirements.txt`
3. `python -m models.train_models`
4. `python -m backend.app`
5. Abrir `http://localhost:5000` e instalar como App desde el navegador.