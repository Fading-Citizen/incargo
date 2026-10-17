const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const name of ['operaciones.html', 'incargo-app.js']) {
  test(`${name}: visible Spanish copy is valid UTF-8 without replacement characters`, () => {
    const bytes = fs.readFileSync(path.join(__dirname, '../../logistica-1.0.0', name));
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.doesNotMatch(source, /\uFFFD|Ã|Â|â€/, 'Corrupted text must not reach the UI');
    if (name.endsWith('.html')) {
      assert.match(source, /<meta charset="utf-8">/);
      assert.match(source, /Contraseña/);
      assert.match(source, /Placa del vehículo/);
      assert.match(source, /Datos de acceso de esta sesión/);
      assert.doesNotMatch(source, />\? INCARGO</);
    } else {
      assert.match(source, /Sesión activa en esta pestaña\./);
      assert.match(source, /Todavía no hay viajes\./);
      assert.match(source, /Asignación actualizada\./);
    }
  });
}
