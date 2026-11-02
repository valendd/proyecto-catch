# Pulso laboral · Centro de mando (proyecto Catch)

Dashboard de la encuesta laboral industrial de Querétaro (40 empresas, 7 bimestres, jul 2024 – ago 2025).

## Archivos
- `datos/BASE_HISTORICA.xlsx`: archivo original.
- `procesamiento.ipynb`: limpieza, auditoría de calidad y catálogo de las 926 preguntas. Genera `datos/datos_dashboard.json`.
- `plantilla.html`: dashboard sin datos (HTML, CSS y JavaScript).
- `construir_dashboard.py`: junta el JSON con la plantilla y crea `index.html`.
- `index.html`: dashboard final, un solo archivo.
- `server.js`, `package.json`, `.env.example`: servidor para la consulta con IA.

## Cómo reproducirlo
1. Instalar dependencias: `pip install pandas numpy openpyxl jupyter`
2. Abrir `procesamiento.ipynb` en VS Code o Jupyter y ejecutar todas las celdas.
3. Ejecutar `python construir_dashboard.py`.
4. Abrir `index.html` en el navegador (o con la extensión Live Server de VS Code).

## Notas
- El procesamiento de datos se hace en Python (pandas). El dashboard solo calcula medianas, percentiles, rankings y correlaciones sobre datos ya limpios.
- Pensado para pantalla de laptop o monitor (ancho mínimo 1280 px).

## Consulta con IA (Gemini)
La pestaña "Consulta con IA" necesita el servidor `server.js`, que guarda la clave y llama a Gemini. No hay que instalar paquetes, solo Node.js 18 o superior.

1. Crear una clave en Google AI Studio (aistudio.google.com).
2. Copiar `.env.example` como `.env` y pegar la clave en `GEMINI_API_KEY`.
3. Ejecutar `node server.js` (o `npm start`).
4. Abrir http://localhost:3000 y usar la pestaña "Consulta con IA".

Si el servidor no está corriendo, la pestaña solo muestra las preguntas de la encuesta relacionadas con lo que escribas. El archivo `.env` no debe subirse a GitHub (ya está en `.gitignore`).

Para publicarlo (Railway, Render, etc.) se sube la carpeta y la clave se guarda como variable de entorno `GEMINI_API_KEY` en el panel del servicio.

## Código QR para la presentación
En el dashboard, el botón "Código QR" (arriba a la derecha) genera el QR de la dirección que escribas y permite descargarlo en PNG. Necesita internet para cargar el generador. Primero hay que publicar el dashboard en una dirección pública (Railway, Render, Vercel) y pegar esa dirección en el cuadro; una dirección `localhost` solo abre en tu computadora.
