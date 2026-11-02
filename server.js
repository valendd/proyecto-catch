const http = require("http");
const fs = require("fs");
const path = require("path");

try {
  for (const linea of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const CLAVE = process.env.GEMINI_API_KEY;
const MODELO = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const BASE = process.env.GEMINI_BASE || "https://generativelanguage.googleapis.com/v1beta";
const PUERTO = process.env.PORT || 3000;

const archivoDatos = [
  path.join(__dirname, "datos", "datos_dashboard.json"),
  path.join(__dirname, "datos_dashboard.json"),
].find(ruta => fs.existsSync(ruta));
if (!archivoDatos) {
  console.error("No se encontró datos_dashboard.json (ni en la carpeta datos ni junto a server.js)");
  process.exit(1);
}
const { CAT, NC, AL, CK, SES, R } = JSON.parse(fs.readFileSync(archivoDatos, "utf8"));
const BIMESTRES = ["Jul-Ago 24", "Sep-Oct 24", "Nov-Dic 24", "Ene-Feb 25", "Mar-Abr 25", "May-Jun 25", "Jul-Ago 25"];
const TIPOS = { n: "numérica", x: "opción múltiple", c: "opción única", o: "texto abierto" };

const suma = a => a.reduce((s, v) => s + (v || 0), 0);
const normalizar = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const respuestas = c => (c.k === "n" ? suma(c.p.map(z => (z ? z[0] : 0))) : suma(c.p));

function mediana(a) {
  a = a.filter(v => v != null).sort((x, y) => x - y);
  return a.length ? a[a.length >> 1] : null;
}

function buscar(texto) {
  const palabras = normalizar(texto).split(/\s+/).filter(p => p.length > 2);
  return CAT.map(c => {
    const t = normalizar(`${c.q} ${c.s} ${c.t}`);
    return [c, palabras.filter(p => t.includes(p)).length];
  })
    .filter(a => a[1] > 0)
    .sort((a, b) => b[1] - a[1] || respuestas(b[0]) - respuestas(a[0]))
    .slice(0, 8)
    .map(a => a[0]);
}

function resumir(c) {
  const base = { id: c.id, tema: c.t, pregunta: c.q.slice(0, 150), opcion: c.s || undefined, tipo: TIPOS[c.k], respuestas: respuestas(c) };
  if (c.k === "n") base.mediana_por_bimestre = c.p.map((z, i) => (z ? [BIMESTRES[i], z[1], "n=" + z[0]] : null)).filter(Boolean);
  if (c.k === "x") base.empresas_que_la_eligen_por_bimestre = c.p;
  if (c.k === "c") base.categorias = c.c.map(a => [a[0], suma(a[1])]);
  return base;
}

function ranking(c, periodo) {
  const m = NC[c.id];
  const v = [];
  for (let e = 1; e <= 40; e++) {
    const x = m[(e - 1) * 7 + periodo];
    if (x != null) v.push([e, x]);
  }
  v.sort((a, b) => b[1] - a[1]);
  return {
    pregunta: c.q.slice(0, 120),
    bimestre: BIMESTRES[periodo],
    mas_altas: v.slice(0, 5).map(z => `Empresa ${z[0]}: ${z[1]}`),
    mas_bajas: v.slice(-5).map(z => `Empresa ${z[0]}: ${z[1]}`),
  };
}

function armarContexto(pregunta) {
  const encontradas = buscar(pregunta);
  const conValores = encontradas.find(c => NC[c.id]);
  const rotacion = R.filter(r => r[1] === 6 && r[3] != null).sort((a, b) => b[3] - a[3]);
  return {
    resumen_por_bimestre: BIMESTRES.map((p, j) => {
      const f = R.filter(r => r[1] === j);
      return `${p}: bajas ${suma(f.map(r => r[5]))}, contrataciones ${suma(f.map(r => r[4]))}, rotación mediana ${mediana(f.map(r => r[3]))}%`;
    }),
    rotacion_mas_alta_ultimo_bimestre: rotacion.slice(0, 5).map(r => `Empresa ${r[0]}: ${r[3]}%`),
    preguntas_relacionadas: encontradas.map(resumir),
    ranking_de_la_primera_pregunta_numerica: conValores ? ranking(conValores, 6) : null,
    controles_de_calidad: CK.map(c => `${c[0]}: ${c[1]}`),
    empresas_con_alerta: Object.keys(AL).length,
    muestra: SES,
  };
}

const SISTEMA = `Eres el analista de datos de un dashboard de la encuesta laboral Catch: 40 empresas industriales de Querétaro, 7 bimestres (jul 2024 a ago 2025) y 926 preguntas. Responde en español, claro y breve (máximo 170 palabras), con cifras concretas tomadas solo del contexto que recibes. Si el contexto no alcanza para responder, dilo. Si la respuesta depende de datos con sesgos o errores de captura, menciónalo en una frase al final (muestra pequeña y autoseleccionada, autorreporte, cuestionario cambiante, errores de captura).`;

async function preguntarGemini(pregunta) {
  const contexto = JSON.stringify(armarContexto(pregunta));
  const r = await fetch(`${BASE}/models/${MODELO}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": CLAVE },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SISTEMA }] },
      contents: [{ role: "user", parts: [{ text: `Contexto:\n${contexto}\n\nPregunta: ${pregunta}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
    }),
  });
  if (!r.ok) throw new Error(`Gemini respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const texto = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
  if (!texto) throw new Error("Gemini no devolvió texto");
  return texto;
}

const visitas = new Map();
function limitado(ip) {
  const ahora = Date.now();
  const recientes = (visitas.get(ip) || []).filter(t => ahora - t < 60000);
  recientes.push(ahora);
  visitas.set(ip, recientes);
  return recientes.length > 20;
}

function responder(res, codigo, objeto) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(objeto));
}

const servidor = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(__dirname, "index.html")).pipe(res);
  }
  if (req.method === "POST" && req.url === "/api/preguntar") {
    if (!CLAVE) return responder(res, 500, { error: "Falta GEMINI_API_KEY en el archivo .env" });
    if (limitado(req.socket.remoteAddress)) return responder(res, 429, { error: "Demasiadas consultas, espera un minuto" });
    let cuerpo = "";
    req.on("data", d => {
      cuerpo += d;
      if (cuerpo.length > 10000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const pregunta = String(JSON.parse(cuerpo).pregunta || "").trim().slice(0, 500);
        if (!pregunta) return responder(res, 400, { error: "Escribe una pregunta" });
        responder(res, 200, { texto: await preguntarGemini(pregunta) });
      } catch (e) {
        console.error(e.message);
        responder(res, 502, { error: "No se pudo obtener la respuesta de Gemini" });
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("No encontrado");
});

servidor.listen(PUERTO, () => console.log(`Dashboard en http://localhost:${PUERTO}`));
