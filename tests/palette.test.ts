import test from 'node:test';import assert from 'node:assert/strict';
import {hsvToHex,hexToHsv,parsePalette,DEFAULT_PALETTE} from '../src/palette';
import {validate,Engine} from '../src/engine';
test('hex survives an HSV roundtrip for defaults, greys and primaries',()=>{for(const hex of [...DEFAULT_PALETTE,'#000000','#ffffff','#808080','#ff0000','#00ff00','#0000ff','#ffff00'])assert.equal(hsvToHex(hexToHsv(hex)),hex);});
test('mixed colours are lowercase six-digit hex accepted by drawing validation',()=>{const e=new Engine();for(let h=0;h<360;h+=37){const hex=hsvToHex({h,s:.73,v:.41});assert.match(hex,/^#[0-9a-f]{6}$/);e.drawing.color=hex;validate(e.snapshot());}});
test('palette falls back to defaults on missing, corrupt or malformed storage',()=>{for(const raw of [null,'{','[]','["#fff","#000000","#000000","#000000"]','[1,2,3,4]','"x"'])assert.deepEqual(parsePalette(raw),DEFAULT_PALETTE);const custom=['#123456','#abcdef','#000000','#ffffff'];assert.deepEqual(parsePalette(JSON.stringify(custom)),custom);});
