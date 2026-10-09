#!/usr/bin/env node
/**
 * Generates src/assets.js and src/show.js from assets/550C-source.html.
 *
 * The animation is PORTED MECHANICALLY, never retyped: the original page's
 * stylesheet, markup and script are copied verbatim and then adapted for a
 * shadow root. Every rewrite is listed below with its reason. Anything not
 * rewritten stays byte-identical to the original file, so the port cannot
 * drift from the animation the author actually tuned.
 *
 * Outputs plain top-level `const`/`function` declarations (no import/export):
 * scripts/build.mjs concatenates the generated files with the hand-written
 * src/client.js into the single module the client loader expects.
 *
 * Usage: node scripts/extract.mjs [path/to/550C-source.html]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const sourcePath = process.argv[2] ?? resolve(root, 'assets/550C-source.html')
const html = readFileSync(sourcePath, 'utf8')

/** Slice one `<div …>` element out of the page by counting nested div tags. */
function sliceElement(source, startMarker) {
  const start = source.indexOf(startMarker)
  if (start === -1) throw new Error(`extract: marker not found: ${startMarker}`)
  const open = source.indexOf('>', start) + 1
  const tag = /<div\b|<\/div>/g
  tag.lastIndex = open
  let depth = 1
  let match
  while ((match = tag.exec(source)) !== null) {
    depth += match[0] === '</div>' ? -1 : 1
    if (depth === 0) return source.slice(start, match.index + '</div>'.length)
  }
  throw new Error(`extract: unbalanced element: ${startMarker}`)
}

function must(condition, message) {
  if (!condition) throw new Error(`extract: ${message}`)
}

// ── stylesheet ──────────────────────────────────────────────────────────────
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/)
must(styleMatch !== null, 'no <style> block found')
let css = styleMatch[1]

// Shadow-DOM adaptation. The original page styles the document itself; inside a
// shadow root those selectors match nothing, so each becomes the host element.
// `:root` is the load-bearing one: the palette custom properties (--amber, --bg,
// --text, …) live there and every rule below reads them.
const cssRewrites = [
  [/html\s*,\s*body\s*\{/g, ':host{'],
  [/:root\s*\{/g, ':host{'],
  [/body::before\s*\{/g, ':host::before{'],
  [/body::after\s*\{/g, ':host::after{'],
  [/(^|\n)(\s*)body\s*\{/g, '$1$2:host{'],
]
for (const [pattern, replacement] of cssRewrites) {
  must(pattern.test(css), `stylesheet did not contain ${pattern}`)
  css = css.replace(pattern, replacement)
}
must(!/(^|\n)\s*(html|body)\b/.test(css), 'stylesheet still targets html/body')

// 10. DeepSeek additions to that same sheet: the opening's self-writing wordmark
//     and the full-frame stage the finale video plays on. Appended — never
//     merged into the rules above — so the original stylesheet stays
//     byte-identical and a re-extract cannot drift.
//
//     The opening is ported from the reference page `index-scifi-futuristic`:
//     every glyph draws its own OUTLINE (stroke-dashoffset → 0) and the fill
//     catches up 0.12 s later with a growing blue drop-shadow, one letter every
//     0.10 s; a steel-blue tagline fades in after, over a low-saturation blue
//     aura. The dash length is the reference's ratio (600 at font-size 76 ≈
//     8 × font-size) so the draw takes the same share of its 0.48 s here.
const EXTRA_CSS = `
  /* ===== 开头：DeepSeek 字标的自我书写（描边 → 填充 → 辉光）===== */
  .boot-stage{flex-direction:column;}
  .boot-aura{position:absolute;left:50%;top:50%;width:64vw;height:44vh;max-width:48rem;transform:translate(-50%,-50%);border-radius:9999px;background:#3b82f6;opacity:.12;filter:blur(120px);pointer-events:none;}
  #logo text{font-family:"Orbitron","Exo 2","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,"Noto Sans SC","Microsoft YaHei",sans-serif;font-size:138px;font-weight:700;letter-spacing:0;}
  .glyph{fill:#3b82f6;stroke:#3b82f6;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;paint-order:stroke fill;stroke-dasharray:1100;stroke-dashoffset:1100;fill-opacity:0;}
  .boot-stage.writing .glyph{animation:draw-outline .48s cubic-bezier(.22,.61,.36,1) forwards,fill-letter .34s cubic-bezier(.22,.61,.36,1) .12s forwards;}
  .boot-stage.writing .glyph-2{animation-delay:.10s,.22s;}
  .boot-stage.writing .glyph-3{animation-delay:.20s,.32s;}
  .boot-stage.writing .glyph-4{animation-delay:.30s,.42s;}
  .boot-stage.writing .glyph-5{animation-delay:.40s,.52s;}
  .boot-stage.writing .glyph-6{animation-delay:.50s,.62s;}
  .boot-stage.writing .glyph-7{animation-delay:.60s,.72s;}
  .boot-stage.writing .glyph-8{animation-delay:.70s,.82s;}
  @keyframes draw-outline{from{stroke-dashoffset:1100;}to{stroke-dashoffset:0;}}
  @keyframes fill-letter{0%{fill-opacity:.03;filter:drop-shadow(0 0 0 rgba(59,130,246,0));}55%{fill-opacity:.76;filter:drop-shadow(0 0 10px rgba(59,130,246,.45));}100%{fill-opacity:1;filter:drop-shadow(0 0 5px rgba(59,130,246,.35));}}
  @keyframes fade-in-up{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
  #tagline{margin-top:clamp(22px,3.2vh,34px);padding-left:.4em;color:transparent;background:linear-gradient(180deg,#aab6c6 0%,#8b9aaf 52%,#748399 100%);-webkit-background-clip:text;background-clip:text;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;font-size:clamp(12px,1.45vw,15px);font-weight:500;line-height:1.6;letter-spacing:.4em;white-space:nowrap;opacity:0;}
  .boot-stage.writing #tagline{animation:fade-in-up .8s cubic-bezier(.22,.61,.36,1) 1.35s forwards;}

  /* ===== 结尾视频（SYSTEM IS REWRITTEN 之后）===== */
  .finale{position:fixed;inset:0;z-index:3000;display:flex;align-items:center;justify-content:center;background:#000;opacity:0;transition:opacity .5s ease;pointer-events:none;}
  .finale.show{opacity:1;}
  .finale-video{display:block;width:100%;height:100%;object-fit:cover;}
`
css += EXTRA_CSS
must(css.includes('.finale-video'), 'the finale stylesheet did not land in the bundle')
must(css.includes('.boot-stage.writing .glyph'), 'the opening stylesheet did not land in the bundle')

// ── markup ──────────────────────────────────────────────────────────────────
const appMarkup = sliceElement(html, '<div id="app">')
const dimMarkup = sliceElement(html, '<div id="dim">')
const finalMarkup = sliceElement(html, '<div id="final">')
// `#hint` ("— REFRESH TO REPLAY —") is deliberately dropped: in the plugin the
// overlay fades out instead of inviting a page refresh.

// 9. Opening lettering: 550C → DeepSeek.
//
//    The page draws its logotype as seven hand-tuned <path> elements and
//    reveals them one at a time, sorted by x (see the wrapper's playBoot). The
//    wordmark keeps that mechanism untouched — one <text> node per letter,
//    tagged `data-w` — and src/show.js lays the row out from the real glyph
//    boxes before the wipe starts, so it stays centred on whatever font the
//    machine resolves instead of depending on metrics this script cannot know.
//    Each glyph carries `data-w` (the layout pass needs it) and a per-letter
//    class: the opening is a self-writing outline now, so the letters are
//    sequenced by the stylesheet instead of by JavaScript.
const WORDMARK_TEXT = 'DeepSeek'
const wordmarkMarkup =
  '<g id="logo">\n' +
  Array.from(WORDMARK_TEXT)
    .map(
      (glyph, index) =>
        `        <text class="glyph glyph-${String(index + 1)}" data-w="${String(index)}" x="0" y="162">${glyph}</text>`,
    )
    .join('\n') +
  '\n      </g>'

let bootMarkup = sliceElement(html, '<div id="boot">')
const logoOpen = bootMarkup.indexOf('<g id="logo"')
const logoClose = bootMarkup.lastIndexOf('</g>', bootMarkup.lastIndexOf('</svg>'))
must(logoOpen !== -1 && logoClose > logoOpen, 'the #logo group was not found in the boot markup')
bootMarkup = bootMarkup.slice(0, logoOpen) + wordmarkMarkup + bootMarkup.slice(logoClose + '</g>'.length)
must(bootMarkup.includes('data-w="0"'), 'the DeepSeek wordmark did not land in the markup')
must(bootMarkup.includes('550C SYSTEM BOOT'), 'the boot caption was not found')
bootMarkup = bootMarkup.replace('550C SYSTEM BOOT', 'DEEPSEEK SYSTEM BOOT')
// Two more pieces of the reference opening: an ambient blue aura behind the mark
// and its tagline underneath. Both are inert without the stylesheet above.
must(bootMarkup.includes('<svg '), 'the boot markup has no <svg to decorate')
bootMarkup = bootMarkup.replace('<svg ', '<div class="boot-aura" aria-hidden="true"></div>\n    <svg ')
bootMarkup = bootMarkup.replace('    </svg>\n', '    </svg>\n    <p id="tagline">探索未至之境</p>\n')
must(bootMarkup.includes('id="tagline"'), 'the tagline did not land in the boot markup')

// ── script ──────────────────────────────────────────────────────────────────
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)
must(scriptMatch !== null, 'no <script> block found')
let js = scriptMatch[1].trim()

// 1. Unwrap the page's IIFE; createShow() supplies the enclosing scope instead.
must(js.startsWith('(() => {'), 'script does not start with the expected IIFE')
must(js.endsWith('})();'), 'script does not end with the expected IIFE')
js = js.slice('(() => {'.length, -'})();'.length).trim()

// 2. Drop the page-level boot trigger and the auto-start glue: the overlay owns
//    when the show starts, and the page-level Space handler would double-fire.
js = js.replace(
  /\n*window\.addEventListener\("keydown", e => \{\n\s*if \(e\.code === "Space" \|\| e\.key === " "\)\{ e\.preventDefault\(\); bootUp\(\); \}\n\}\);\n*/,
  '\n',
)
js = js.replace(/\n*\/\* 自动开机[\s\S]*?document\.addEventListener\("touchstart", bootUp, \{ passive: true \}\);\n*/, '\n')
// Element-level listeners (the popup close button) stay: only the page-level
// ones belong to the overlay.
must(
  !/window\.addEventListener|document\.addEventListener/.test(js),
  'a page-level listener survived the rewrite',
)

// 3. Rebind every lookup to the shadow-root stage.
js = js.replace(
  'const $ = s => document.querySelector(s);',
  'const $ = s => stage.querySelector(s);',
)
must(js.includes('stage.querySelector'), '$ helper was not rebound')
js = js.replace(/document\.getElementById\('(\w+)'\)/g, "stage.querySelector('#$1')")
js = js.replace(
  'document.body.appendChild(el); activeWindows.push(el);',
  'stage.appendChild(el); activeWindows.push(el);',
)
// Popup windows are appended to the stage, not to document.body: they must stay
// inside the shadow root or the scoped stylesheet would not reach them.

// 4. sleep() and setTimeout() become cancellable, so one skip unwinds the whole
//    async run instead of leaving orphaned timers behind the fade.
js = js.replace(
  'const sleep = ms => new Promise(r => setTimeout(r, ms));',
  '/* sleep() comes from the wrapper: cancellable. */',
)
must(!/const sleep = ms =>/.test(js), 'sleep() was not replaced')
js = js.replace(/(?<![\w.])setTimeout\(/g, 'later(')

// 5. Track the two untracked intervals so cancel() can stop them.
js = js.replace('function startClock(){ setInterval(', 'function startClock(){ clockTimer = setInterval(')
js = js.replace('function startFps(){ setInterval(', 'function startFps(){ fpsTimer = setInterval(')
must(js.includes('clockTimer = setInterval('), 'startClock was not tracked')
must(js.includes('fpsTimer = setInterval('), 'startFps was not tracked')

// 6. Remove bootUp(): the wrapper's start() owns that sequence and additionally
//    handles simple mode (where no #app exists) and the end-of-show beat.
js = js.replace(/async function bootUp\(\)\{[\s\S]*?\n\}\n/, '')
must(!/bootUp/.test(js), 'bootUp() was not removed')

// 7. Drop the replay hint: the markup no longer contains #hint, so this line
//    would throw on null.
js = js.replace(/\n\s*\$\(["']#hint["']\)\.classList\.add\(["']show["']\);/, '')
must(!/#hint/.test(js), '#hint reference survived the rewrite')

// 8. `#final` and the phase machine stay exactly as written, except for the two
//    DeepSeek rewrites below.

// 11. playBoot becomes a stylesheet-driven opening. The 550C mark walked seven
//     <path> elements and wiped each one in with an inline clip-path; the
//     reference opening writes glyph OUTLINES instead, which is a CSS animation
//     on the letters themselves — so JavaScript only lays the row out (centred,
//     from real glyph boxes) and keeps the two beats the page had: the caption,
//     and the "finished" mark. One class on the stage starts the cascade.
js = js.replace(
  `  const paths = Array.from(logo.querySelectorAll('path'));

  paths.forEach(p => {
    p.style.opacity = '0.08';
    p.style.clipPath = 'inset(0 0 0 0)';
    p.style.webkitClipPath = 'inset(0 0 0 0)';
  });

  const sorted = paths.map(p => ({el: p, x: p.getBBox().x})).sort((a, b) => a.x - b.x);

  sorted.forEach((item, i) => {
    const delay = 250 + i * 300;
    later(() => {
      const p = item.el;
      p.style.clipPath = 'inset(0 100% 0 0)';
      p.style.webkitClipPath = 'inset(0 100% 0 0)';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          p.style.transition = 'clip-path .6s cubic-bezier(.4,0,.2,1), opacity .35s ease';
          p.style.opacity = '1';
          p.style.clipPath = 'inset(0 0 0 0)';
          p.style.webkitClipPath = 'inset(0 0 0 0)';
        });
      });
    }, delay);
  });

  later(() => bootText.classList.add('show'), 2400);
  const totalMs = 250 + sorted.length * 300 + 400;
  later(() => logo.classList.add('finished'), totalMs);
  return totalMs + 600;`,
  `  layoutWordmark();

  const bootStage = stage.querySelector('.boot-stage');
  const totalMs = 2300;
  later(() => { if (bootStage !== null) bootStage.classList.add('writing'); }, 120);
  later(() => bootText.classList.add('show'), 1400);
  later(() => logo.classList.add('finished'), totalMs);
  return totalMs;`,
)
must(js.includes('layoutWordmark();'), 'playBoot no longer lays the wordmark out')
must(js.includes("classList.add('writing')"), 'playBoot no longer starts the writing animation')
must(!js.includes("querySelectorAll('path')"), 'playBoot still walks the 550C paths')

// 12. The finale. SYSTEM IS REWRITTEN keeps its beat, and then the user's
//     DeepSeek intro plays full-frame; the run ends when the video does. The
//     function itself is appended below (FINALE_FUNCTIONS) so this stays a
//     one-line handover and the phase machine above reads as it always did.
js = js.replace(
  '  $("#final").classList.add("show");\n  await sleep(900);',
  '  $("#final").classList.add("show");\n  await sleep(900);\n  await playFinale();',
)
must(js.includes('await playFinale();'), '#final no longer hands over to the finale')

// 13. Branding: every "550C" the page prints becomes "DSH" — the terminal
//     speaker tags, the HUD brand, the firmware listing's CA_550C, the operator
//     copy. Applied to the EXTRACTED pieces only (never to this script, and
//     never to the hand-written halves), so the archived source page stays the
//     author's original and a re-extract cannot lose the rebrand. The counts are
//     asserted because a rewrite that silently stops matching is worse than one
//     that fails loudly.
const occurrences = (haystack) => haystack.split('550C').length - 1
const rebrand = (source, where) => {
  const found = occurrences(source)
  must(found > 0, `no 550C text found in ${where}`)
  return { text: source.replaceAll('550C', 'DSH'), found: found }
}
// The boot markup and the stylesheet are already rebranded by step 9 (the
// wordmark replaced the whole logotype group and the caption with it), so both
// are asserted to be clean rather than rewritten.
must(occurrences(css) === 0, 'the stylesheet unexpectedly mentions 550C')
must(occurrences(bootMarkup) === 0, 'the boot markup still mentions 550C')
const jsRebrand = rebrand(js, 'the ported script')
const appRebrand = rebrand(appMarkup + dimMarkup + finalMarkup, 'the app markup')
js = jsRebrand.text
const appMarkupRebranded = appRebrand.text
process.stdout.write(
  `extract: rebranded 550C → DSH (js ${String(jsRebrand.found)}, app ${String(appRebrand.found)})\n`,
)

/**
 * Appended to the ported script: the wordmark layout and the finale video.
 *
 * Both lean on the wrapper's scope (`stage`, `later`, `finaleVideo`,
 * `finaleSettle`), which is why they are injected here rather than living in a
 * file of their own: they are part of the port, not of the plugin's shell.
 */
const FINALE_FUNCTIONS = `
/* ===== DeepSeek 结尾视频（由 scripts/extract.mjs 注入）===== */

/** 宿主半边注册的同源路由，见 lib/index.js。 */
const FINALE_SRC = "/dsh-550c-boot/media/intro.mp4";
/** 看门狗：视频 7.05 s，媒体事件不来时也必须收场。 */
const FINALE_MAX_MS = 9000;

/**
 * 把 data-w 的字形按真实字宽排成一行并居中。
 * 用 ink box 而不是 advance width，所以换任何字体都不会撞字或留缝。
 */
function layoutWordmark(){
  const glyphs = Array.from(stage.querySelectorAll("#logo [data-w]"));
  if (glyphs.length === 0) return;
  const gap = 18;
  const boxes = glyphs.map(el => {
    const box = el.getBBox();
    return { el: el, x: box.x, w: box.width };
  });
  const total = boxes.reduce((sum, item) => sum + item.w, 0) + gap * (boxes.length - 1);
  let cursor = (800 - total) / 2;
  for (const item of boxes){
    const current = Number(item.el.getAttribute("x")) || 0;
    item.el.setAttribute("x", String(current + (cursor - item.x)));
    cursor += item.w + gap;
  }
}

/**
 * 播放结尾视频：淡入 → 播完 → resolve。
 * 媒体事件不来（文件未安装 / 解码失败 / 自动播放被拒）时由看门狗收场，
 * 所以片头永远不会因为视频而卡住。跳过由 wrapper 的 cancel() 接手。
 */
function playFinale(){
  return new Promise(resolve => {
    const wrap = document.createElement("div");
    wrap.className = "finale";
    const video = document.createElement("video");
    video.className = "finale-video";
    video.src = FINALE_SRC;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    wrap.appendChild(video);
    stage.appendChild(wrap);
    finaleVideo = video;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      finaleSettle = null;
      resolve();
    };
    finaleSettle = settle;

    const reveal = () => requestAnimationFrame(() => wrap.classList.add("show"));
    if (video.readyState >= 2) reveal();
    else video.addEventListener("canplay", reveal, { once: true });

    later(settle, FINALE_MAX_MS);
    video.addEventListener("ended", settle, { once: true });
    video.addEventListener("error", settle, { once: true });

    const started = video.play();
    if (started && typeof started.catch === "function") {
      // A refused autoplay (or a detached element) means there is nothing to
      // show: hand the screen back at once instead of holding a black frame for
      // the whole watchdog.
      started.catch(() => { settle(); });
    }
  });
}
`

const wrapperHead = `/**
 * GENERATED by scripts/extract.mjs — do not edit by hand.
 *
 * The original page's script, wrapped for the plugin. The wrapper supplies the
 * scope the page used to get from its IIFE plus the three things a plugin needs
 * that a page does not:
 *
 *   - every lookup is rebound to \`stage\` (the shadow-root container),
 *   - \`sleep\`/\`later\` are cancellable, so one skip unwinds the whole run,
 *   - \`start()\` splits the page's bootUp() into simple mode (logo only) and
 *     full mode (logo → HUD → the override phases), and never touches #app in
 *     simple mode, where that markup is not mounted at all.
 */
function createShow(stage, options) {
  const mode = options.mode === 'full' ? 'full' : 'simple';
  const CANCELLED = options.cancelled;
  let cancelled = false;
  const pending = new Set();
  let clockTimer = null, fpsTimer = null;
  let finaleVideo = null, finaleSettle = null;

  /** Cancellable sleep: rejects with CANCELLED once the show is skipped. */
  function sleep(ms) {
    return new Promise((resolve, reject) => {
      if (cancelled) { reject(CANCELLED); return; }
      const entry = { reject: reject, timer: 0 };
      entry.timer = setTimeout(() => {
        pending.delete(entry);
        if (cancelled) reject(CANCELLED); else resolve();
      }, ms);
      pending.add(entry);
    });
  }

  /** Cancellable setTimeout for the fire-and-forget beats (path draw-in …). */
  function later(fn, ms) {
    const entry = { reject: null, timer: 0 };
    entry.timer = setTimeout(() => {
      pending.delete(entry);
      if (!cancelled) fn();
    }, ms);
    pending.add(entry);
    return entry.timer;
  }

  /** Skip: unwind every awaited step, then stop the intervals the show started. */
  function cancel() {
    if (cancelled) return;
    cancelled = true;
    for (const entry of pending) {
      clearTimeout(entry.timer);
      if (entry.reject !== null) entry.reject(CANCELLED);
    }
    pending.clear();
    try { stopCode(); } catch (error) { /* not started yet */ }
    try { stopLink(); } catch (error) { /* not started yet */ }
    // The finale video is not a timer, so a skip has to stop it by hand and
    // settle its promise — otherwise the awaited phase would never return.
    if (finaleVideo !== null) {
      try { finaleVideo.pause(); } catch (error) { /* already detached */ }
      finaleVideo = null;
    }
    if (finaleSettle !== null) {
      const settle = finaleSettle;
      finaleSettle = null;
      settle();
    }
    if (clockTimer !== null) clearInterval(clockTimer);
    if (fpsTimer !== null) clearInterval(fpsTimer);
  }

  /** Run the show; resolves when it has played out, rejects when skipped. */
  async function start() {
    if (booting || launched) return;
    booting = true;
    const totalMs = playBoot();
    await sleep(totalMs + 300);
    if (mode === 'simple') {
      // Simple mode: the logo draw-in IS the show. One beat on the finished
      // mark, then the overlay fades.
      await sleep(600);
      return;
    }
    const boot = $("#boot");
    if (boot !== null) {
      boot.classList.add("fade");
      await sleep(600);
      if (boot.parentNode) boot.parentNode.removeChild(boot);
    }
    const app = $("#app");
    if (app !== null) app.classList.add("visible");
    launched = true;
    await run();
  }
`

const wrapperTail = `
  return { start: start, cancel: cancel };
}
`

const banner = (name, note) =>
  `/* ${name} — ${note} */\n/* Generated by scripts/extract.mjs from assets/550C-source.html. */\n`

const assetsOut =
  banner('assets', 'stylesheet + markup extracted from the original page') +
  `const CSS_550C = ${JSON.stringify(css)};\n\n` +
  `const BOOT_MARKUP = ${JSON.stringify(bootMarkup)};\n\n` +
  `const APP_MARKUP = ${JSON.stringify(appMarkupRebranded)};\n`

const showOut =
  banner('show', 'the original animation script, adapted for a shadow root') +
  wrapperHead +
  js +
  FINALE_FUNCTIONS +
  wrapperTail

for (const [file, text] of [['src/assets.js', assetsOut], ['src/show.js', showOut]]) {
  writeFileSync(resolve(root, file), text)
  process.stdout.write(`extract: wrote ${file} (${text.length} chars)\n`)
}

// Report the shape so a rewrite that silently stops matching is visible.
process.stdout.write(
  `extract: css=${css.length} boot=${bootMarkup.length} app=${appMarkup.length} js=${js.length}\n`,
)
