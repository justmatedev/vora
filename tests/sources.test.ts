import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaSource, normalizeMediaUrl, safeThumbnail } from '../shared/sources';

test('normaliza somente Reels e preserva fontes YouTube', () => {
  for (const input of [
    'https://www.instagram.com/reels/Df2T11TxZQr/?igsh=test',
    'http://instagram.com/reel/Df2T11TxZQr#test',
  ]) {
    assert.equal(normalizeMediaUrl(input), 'https://www.instagram.com/reel/Df2T11TxZQr/');
    assert.equal(mediaSource(input).platform, 'instagram');
  }
  assert.equal(
    normalizeMediaUrl('https://youtu.be/BaW_jenozKc'),
    'https://www.youtube.com/watch?v=BaW_jenozKc',
  );
  assert.equal(
    mediaSource('https://youtube.com/playlist?list=PL1234567890abcdef').kind,
    'playlist',
  );
  assert.equal(
    mediaSource('https://youtube.com/watch?v=BaW_jenozKc&list=PL1234567890abcdef').kind,
    'mixed',
  );
});

test('rejeita fotos, carrosséis, Stories, perfis e links suspeitos', () => {
  for (const input of [
    'https://instagram.com/p/Df2T11TxZQr/',
    'https://instagram.com/stories/test/123/',
    'https://instagram.com/test/',
    'https://instagram.com/reel/',
    'https://instagram.com/reel/abc/extra',
    'https://instagram.com/reel/abc%2Fdef/',
    'https://instagram.com.evil.test/reel/Df2T11TxZQr/',
    'https://instagram.com@evil.test/reel/Df2T11TxZQr/',
    'https://user@instagram.com/reel/Df2T11TxZQr/',
    'https://instagram.com:444/reel/Df2T11TxZQr/',
    'file:///etc/passwd',
    '--exec=evil',
  ])
    assert.throws(() => mediaSource(input), { name: 'Error' }, input);
});

test('miniaturas usam HTTPS e limites exatos de domínio por plataforma', () => {
  assert.equal(
    safeThumbnail('https://instagram.test.fbcdn.net/a.jpg', 'instagram'),
    'https://instagram.test.fbcdn.net/a.jpg',
  );
  assert.ok(safeThumbnail('https://scontent.cdninstagram.com/a.jpg', 'instagram'));
  for (const value of [
    'http://test.fbcdn.net/a',
    'https://fbcdn.net.evil.test/a',
    'https://evilfbcdn.net/a',
    'https://user@test.fbcdn.net/a',
    'https://i.ytimg.com/a',
  ])
    assert.equal(safeThumbnail(value, 'instagram'), undefined);
  assert.equal(safeThumbnail('https://test.fbcdn.net/a', 'youtube'), undefined);
});
