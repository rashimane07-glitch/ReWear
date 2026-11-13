const test = require('node:test');
const assert = require('node:assert/strict');

const { samples } = require('./helpers/fakes');
const { detectImageType } = require('../src/utils/imageType');

test('detects JPEG, PNG and WebP from the real bytes', () => {
  assert.deepEqual(detectImageType(samples.jpeg()), { mime: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual(detectImageType(samples.png()), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(detectImageType(samples.webp()), { mime: 'image/webp', ext: 'webp' });
});

test('rejects other file types, however they are named', () => {
  assert.equal(detectImageType(samples.gif()), null);
  assert.equal(detectImageType(samples.pdf()), null);
  assert.equal(detectImageType(samples.text()), null);
  assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
});

test('rejects empty, tiny and non-buffer input without crashing', () => {
  assert.equal(detectImageType(Buffer.alloc(0)), null);
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8])), null); // too short to be a JPEG
  assert.equal(detectImageType(Buffer.from('RIFF....WEB')), null); // WebP header cut short
  assert.equal(detectImageType(null), null);
  assert.equal(detectImageType('not a buffer'), null);
});

test('a RIFF file that is not WebP (e.g. WAV) is rejected', () => {
  assert.equal(detectImageType(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1')), null);
});
