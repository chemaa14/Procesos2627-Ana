// Puestos por segmento, resumen, orden de splits y CSV (no usa DOM).
import test from "node:test";
import assert from "node:assert/strict";
import { tiempoDeSegmento, construirSplits, ordenarSplits, mejoresDelSegmento, resumenCarrera, csvSplits } from "../../client/js/segmentos.js";
import { indiceTrasTecla } from "../../client/js/navegacionPestanas.js";

const f = (id, nombre, posicion, parciales, total, estado = "finalizado", club = "C") =>
  ({ estado, posicion, parciales, tiempoTotal: total, dorsal: id, atleta: { id, nombre }, club: club ? { nombre: club } : null });
const clasificacion = [
  f("1", "Ana", 1, [600, 30, 1900, 25, 1080], 3635),
  f("2", "Beto", 2, [540, 20, 1950, 30, 1100], 3640),
  f("3", "Carla", 3, [600, 25, 1900, 20, 1200], 3745, "finalizado", null),
  f("4", "Dani", null, [560, 25], null, "dnf"),
  f("5", "Eva", null, null, null, "dns"),
  f("6", "Fran", 4, null, 3800), // finalista con parciales incompletos
];

test("tiempoDeSegmento solo devuelve tiempos fiables de finalistas", () => {
  assert.equal(tiempoDeSegmento(clasificacion[0], 2), 1900);
  assert.equal(tiempoDeSegmento(clasificacion[3], 0), null, "abandono");
  assert.equal(tiempoDeSegmento(clasificacion[5], 0), null, "sin parciales");
  assert.equal(tiempoDeSegmento(f("x", "X", 1, [0, 1, 2, 3, 4], 10), 0), null, "cero no es un tiempo");
});

test("construirSplits da una fila por finalista con el puesto en cada segmento (empates comparten puesto)", () => {
  const s = construirSplits(clasificacion);
  assert.deepEqual(s.map((x) => x.nombre), ["Ana", "Beto", "Carla", "Fran"]);
  assert.deepEqual(s[0].puestos, [2, 3, 1, 2, 1]); // natación: Beto 540 < Ana=Carla 600; T1: Beto 20 < Carla 25 < Ana 30
  assert.deepEqual(s[2].puestos, [2, 2, 1, 1, 3]); // Carla empata con Ana en natación y bici
  assert.deepEqual(s[3].puestos, [null, null, null, null, null]);
  assert.equal(s[2].club, "");
});

test("ordenarSplits ordena por columna, en ambos sentidos, y deja sin dato al final", () => {
  const s = construirSplits(clasificacion);
  const nombres = (x) => x.map((r) => r.nombre);
  assert.deepEqual(nombres(ordenarSplits(s, 0)), ["Beto", "Ana", "Carla", "Fran"]);
  assert.deepEqual(nombres(ordenarSplits(s, 0, true)), ["Ana", "Carla", "Beto", "Fran"]);
  assert.deepEqual(nombres(ordenarSplits(s, "nombre", true)), ["Fran", "Carla", "Beto", "Ana"]);
  assert.deepEqual(nombres(ordenarSplits(s, "total")), ["Ana", "Beto", "Carla", "Fran"]);
  assert.deepEqual(nombres(ordenarSplits(s, "posicion")), ["Ana", "Beto", "Carla", "Fran"]);
  assert.deepEqual(nombres(ordenarSplits(s, "club")).at(-1), "Carla", "el club vacío va al final");
});

test("mejoresDelSegmento devuelve los n mejores con su puesto", () => {
  const m = mejoresDelSegmento(construirSplits(clasificacion), 0, 2);
  assert.deepEqual(m.map((x) => [x.nombre, x.tiempo, x.puesto]), [["Beto", 540, 1], ["Ana", 600, 2]]);
});

test("resumenCarrera: salidos, finalizados, medias y podio", () => {
  const r = resumenCarrera(clasificacion);
  assert.equal(r.salieron, 5, "el DNS no salió");
  assert.equal(r.finalizados, 4);
  assert.deepEqual(r.medias.map((m) => m && Math.round(m)), [580, 25, 1917, 25, 1127]);
  assert.deepEqual(r.podio.map((p) => p.nombre), ["Ana", "Beto", "Carla"]);
  assert.deepEqual(resumenCarrera([]).medias, [null, null, null, null, null]);
});

test("csvSplits usa ; , escapa comillas y trae cabecera con los segmentos", () => {
  const filas = [{ ...construirSplits(clasificacion)[0], nombre: 'Ana "la Rápida"; López' }];
  const csv = csvSplits(["Nat", "T1", "Bici", "T2", "Carrera"], filas, (s) => `${s}s`).split("\r\n");
  assert.equal(csv[0], "Pos;Dorsal;Atleta;Club;Nat;Puesto Nat;T1;Puesto T1;Bici;Puesto Bici;T2;Puesto T2;Carrera;Puesto Carrera;Total");
  assert.ok(csv[1].includes('"Ana ""la Rápida""; López"'));
  assert.ok(csv[1].endsWith("3635s"));
});

const filaCsv = (nombre, club, total = 0) => ({
  posicion: 1, dorsal: 2, nombre, club,
  tiempos: [null, null, null, null, null], puestos: [null, null, null, null, null], total,
});
const csvCelda = (nombre, club, nombres = ["Nat", "T1", "Bici", "T2", "Carrera"]) =>
  csvSplits(nombres, [filaCsv(nombre, club)], (s) => `${s}s`);

test("csvSplits neutraliza fórmulas en nombre y club sin tocar números ni vacíos", () => {
  for (const peligro of ["=1+1", "+1+1", "-1+1", "@SUM(1)"]) {
    assert.ok(csvCelda(peligro, peligro).includes(`;"'${peligro}";"'${peligro}";`), peligro);
  }
  assert.ok(csvCelda(" =1+1", "  +1+1").includes(';"\' =1+1";"\'  +1+1";'), "espacios iniciales");
  assert.ok(csvCelda("\t=1+1", "\t@A1").includes(';"\'\t=1+1";"\'\t@A1";'), "tab inicial");

  const normal = { posicion: 3, dorsal: 42, nombre: "Ana", club: "", tiempos: [600, null, null, null, null], puestos: [1, null, null, null, null], total: 3635 };
  const linea = csvSplits(["Nat", "T1", "Bici", "T2", "Carrera"], [normal], (s) => `${s}s`).split("\r\n")[1];
  assert.ok(linea.startsWith("3;42;Ana;;600s;1;"), "números y vacíos intactos");
  assert.ok(linea.endsWith(";3635s"));
  assert.ok(!linea.includes("'"), "sin apóstrofo en valores normales");
});

test("csvSplits neutraliza textos que empiezan por tab, CR o LF y los escapa", () => {
  assert.ok(csvCelda("\tTexto", "").includes(';"\'\tTexto";'));
  assert.ok(csvCelda("\r=1+1", "").includes(`;"'\r=1+1";`));
  assert.ok(csvCelda("\n@SUM(1)", "").includes(`;"'\n@SUM(1)";`));
});

test("csvSplits neutraliza variantes Unicode de ancho completo de =, +, - y @", () => {
  for (const peligro of ["\uFF1D1+1", "\uFF0B1+1", "\uFF0D1+1", "\uFF201+1"]) {
    assert.ok(csvCelda(peligro, peligro).includes(`;"'${peligro}";"'${peligro}";`), peligro);
  }
});

test("csvSplits no prefija números negativos reales y deja null/undefined vacíos", () => {
  const fila = { posicion: -1, dorsal: -2, nombre: null, club: undefined, tiempos: [null, null, null, null, null], puestos: [null, null, null, null, null], total: -3 };
  const linea = csvSplits(["Nat", "T1", "Bici", "T2", "Carrera"], [fila], (s) => s).split("\r\n")[1];
  assert.ok(linea.startsWith("-1;-2;;"), "negativos numéricos sin apóstrofo y vacíos intactos");
  assert.ok(linea.endsWith(";-3"));
  assert.ok(!linea.includes("'"), "sin apóstrofo en números negativos reales");
  assert.ok(!linea.includes("null") && !linea.includes("undefined"), "null/undefined quedan vacíos");
});

test("csvSplits neutraliza cabeceras de segmento peligrosas", () => {
  const cabecera = csvSplits(["=1+1", "T1", "Bici", "T2", "Carrera"], [], (s) => `${s}s`);
  assert.ok(cabecera.includes(';"\'=1+1";Puesto =1+1;'));
});

test("csvSplits escapa comillas, punto y coma y saltos después de neutralizar", () => {
  const csv = csvSplits(["Nat", "T1", "Bici", "T2", "Carrera"], [filaCsv('=1+1;"x"', "a;b\nc")], (s) => `${s}s`);
  assert.ok(csv.includes('"\'=1+1;""x"""'), "fórmula neutralizada y comillas duplicadas");
  assert.ok(csv.includes('"a;b\nc"'), "punto y coma y salto dentro de la celda");
});

test("las flechas, Inicio y Fin navegan entre pestañas", () => {
  assert.equal(indiceTrasTecla(0, 4, "ArrowRight"), 1);
  assert.equal(indiceTrasTecla(3, 4, "ArrowRight"), 0);
  assert.equal(indiceTrasTecla(0, 4, "ArrowLeft"), 3);
  assert.equal(indiceTrasTecla(2, 4, "Home"), 0);
  assert.equal(indiceTrasTecla(1, 4, "End"), 3);
  assert.equal(indiceTrasTecla(1, 4, "a"), null);
  assert.equal(indiceTrasTecla(0, 0, "ArrowRight"), null);
});
