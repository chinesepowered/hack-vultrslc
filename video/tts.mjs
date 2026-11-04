// Narration for the demo video: ElevenLabs text-to-speech with character timestamps.
// Each scene is synthesized once and cached by a hash of its text and settings, so edits
// only spend characters on the scenes that changed.
// usage: ELEVENLABS_API_KEY=... node video/tts.mjs <script.json> <outDir>
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [scriptFile, outDir] = process.argv.slice(2);
const script = JSON.parse(readFileSync(scriptFile, 'utf8'));
const voice = script.voice ?? 'cgSgspJ2msm6clMCkdW9'; // Jessica: playful, bright, warm
const model = script.model ?? 'eleven_multilingual_v2';
const settings = script.voice_settings ?? { stability: 0.42, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true, speed: 1.0 };
mkdirSync(outDir, { recursive: true });

const scenes = script.scenes.filter((s) => s.say);
let spent = 0;
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  const key = createHash('sha1').update(JSON.stringify([s.say, voice, model, settings])).digest('hex').slice(0, 10);
  const mp3 = path.join(outDir, `${s.id}.mp3`);
  const meta = path.join(outDir, `${s.id}.json`);
  if (existsSync(meta) && JSON.parse(readFileSync(meta, 'utf8')).key === key && existsSync(mp3)) { console.log('cached', s.id); continue; }
  const body = {
    text: s.say, model_id: model, voice_settings: settings,
    previous_text: scenes[i - 1]?.say, next_text: scenes[i + 1]?.say,
  };
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  const a = j.alignment;
  writeFileSync(meta, JSON.stringify({ key, text: s.say, chars: a.characters, start: a.character_start_times_seconds, end: a.character_end_times_seconds, duration: a.character_end_times_seconds.at(-1) }));
  spent += s.say.length;
  console.log('synthesized', s.id, `${a.character_end_times_seconds.at(-1).toFixed(2)}s`);
}
console.log('characters spent this run:', spent);
