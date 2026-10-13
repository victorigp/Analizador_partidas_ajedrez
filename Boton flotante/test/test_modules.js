// Suite de pruebas unitarias para los módulos del analizador de ajedrez
import assert from 'assert';
import { parseHeaders, parseEval, parseMetadata, parsePgn } from '../src/lichess/parsers.js';
import { MOVE_TYPES, TYPE_ORDER } from '../src/lichess/constants.js';
import { getMoveTypeIconHtml } from '../src/lichess/icons.js';
import { getServerPort } from '../src/utils/helpers.js';
import { eyeOpenSvg, eyeClosedSvg, gearSvg, backSvg } from '../src/ui/svgs.js';
import { tampermonkeyHeader } from '../src/config/tampermonkey.js';

console.log('--- Iniciando suite de pruebas ---');

// 1. Pruebas de tampermonkeyHeader
console.log('1. Verificando TamperMonkey Header...');
assert(tampermonkeyHeader.includes('// ==UserScript=='), 'Debe incluir // ==UserScript==');
assert(tampermonkeyHeader.includes('// ==/UserScript=='), 'Debe incluir // ==/UserScript==');
assert(tampermonkeyHeader.includes('@name         Analizador Ajedrez (Chess.com y Lichess)'), 'Debe tener el nombre correcto');
assert(tampermonkeyHeader.includes('GM_xmlhttpRequest'), 'Debe solicitar GM_xmlhttpRequest');
console.log('✓ TamperMonkey Header verificado correctamente.');

// 2. Pruebas de parseHeaders
console.log('2. Verificando parseHeaders...');
const samplePgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.10.12"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]
[WhiteElo "1800"]
[BlackElo "1750"]
[Annotator "Stockfish, WhiteEloAccuracy: 88.5, BlackEloAccuracy: 75.2"]

1. e4 e5 2. Nf3 Nc6 1-0`;

const headers = parseHeaders(samplePgn);
assert.strictEqual(headers.White, 'Player1');
assert.strictEqual(headers.Black, 'Player2');
assert.strictEqual(headers.WhiteElo, '1800');
assert.strictEqual(headers.WhiteEloAccuracy, '88.5');
assert.strictEqual(headers.BlackEloAccuracy, '75.2');

const commentPgn = `1. e4 e5 2. Nf3 Nc6 { WhiteEloAccuracy: 92.1, BlackEloAccuracy: 88.0, WhiteEloAccuracyApertura: 95.0 } 1-0`;
const commentHeaders = parseHeaders(commentPgn);
assert.strictEqual(commentHeaders.WhiteEloAccuracy, '92.1');
assert.strictEqual(commentHeaders.BlackEloAccuracy, '88.0');
assert.strictEqual(commentHeaders.WhiteEloAccuracyApertura, '95.0');
console.log('✓ parseHeaders verificado correctamente.');

// 3. Pruebas de parseEval
console.log('3. Verificando parseEval...');
assert.strictEqual(parseEval('1.25'), 1.25);
assert.strictEqual(parseEval('-0.50'), -0.5);
assert.strictEqual(parseEval('#3'), 12);
assert.strictEqual(parseEval('#-3'), -12);
assert.strictEqual(parseEval(''), null);
assert.strictEqual(parseEval(null), null);
console.log('✓ parseEval verificado correctamente.');

// 4. Pruebas de parseMetadata
console.log('4. Verificando parseMetadata...');
const comment1 = '{ [%eval 0.35] [#BEST#] }';
const meta1 = parseMetadata(comment1);
assert.strictEqual(meta1.evaluation, 0.35);
assert.strictEqual(meta1.type, 'BEST');

const comment2 = '{ [#LOCAL_EVAL: -2.10#] [#BLUNDER#] }';
const meta2 = parseMetadata(comment2);
assert.strictEqual(meta2.evaluation, -2.1);
assert.strictEqual(meta2.type, 'BLUNDER');

const comment3 = '{ [%eval #1] [#BRILLIANT#] }';
const meta3 = parseMetadata(comment3);
assert.strictEqual(meta3.evaluation, 12);
assert.strictEqual(meta3.type, 'BRILLIANT');
console.log('✓ parseMetadata verificado correctamente.');

// 5. Pruebas de parsePgn
console.log('5. Verificando parsePgn...');
const pgnWithComments = `[Event "Test"]
[White "White"]
[Black "Black"]

1. e4 { [%eval 0.20] [#BOOK#] } 1... e5 { [%eval 0.25] [#BEST#] } 2. Nf3 { [%eval 0.30] [#EXCELLENT#] } (2. Bc4 Nc6) 2... Nc6 { [%eval 0.15] [#GOOD#] } 1-0`;

const parsed = parsePgn(pgnWithComments);
assert.strictEqual(parsed.moves.length, 4);
assert.strictEqual(parsed.moves[0].san, 'e4');
assert.strictEqual(parsed.moves[0].type, 'BOOK');
assert.strictEqual(parsed.moves[0].evaluation, 0.2);

assert.strictEqual(parsed.moves[1].san, 'e5');
assert.strictEqual(parsed.moves[1].type, 'BEST');

assert.strictEqual(parsed.moves[2].san, 'Nf3');
assert.strictEqual(parsed.moves[2].type, 'EXCELLENT');

assert.strictEqual(parsed.moves[3].san, 'Nc6');
assert.strictEqual(parsed.moves[3].type, 'GOOD');
console.log('✓ parsePgn verificado correctamente.');

// 6. Pruebas de constants y icons
console.log('6. Verificando constants e icons...');
assert(TYPE_ORDER.length >= 10, 'Debe haber al menos 10 clasificaciones de jugadas');
for (const type of TYPE_ORDER) {
    const def = MOVE_TYPES[type];
    assert(def.label, `Tipo ${type} debe tener label`);
    assert(def.color, `Tipo ${type} debe tener color`);
    const icon = getMoveTypeIconHtml(type);
    assert(icon, `Tipo ${type} debe tener icono o símbolo`);
}
assert(getMoveTypeIconHtml('WHITE_CROWN').includes('svg'), 'WHITE_CROWN debe devolver svg');
assert(getMoveTypeIconHtml('BLACK_CROWN').includes('svg'), 'BLACK_CROWN debe devolver svg');
console.log('✓ constants e icons verificados correctamente.');

// 7. Pruebas de svgs
console.log('7. Verificando svgs...');
assert(eyeOpenSvg.includes('<svg') && eyeOpenSvg.includes('eye-open'));
assert(eyeClosedSvg.includes('<svg') && eyeClosedSvg.includes('eye-closed'));
assert(gearSvg.includes('<svg'));
assert(backSvg.includes('<svg'));
console.log('✓ svgs verificados correctamente.');

// 8. Pruebas de getServerPort
console.log('8. Verificando getServerPort fallback...');
assert.strictEqual(getServerPort('8765'), '8765');
assert.strictEqual(getServerPort(9000), '9000');
console.log('✓ getServerPort verificado correctamente.');

console.log('=== Todas las pruebas unitarias pasaron con éxito ===');
