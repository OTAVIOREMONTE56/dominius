const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'app-web');
if (path.dirname(output) !== root || path.basename(output) !== 'app-web') {
  throw new Error('Diretório de saída Android inválido.');
}

const files = [
  'styles.css', 'account.css', 'supabase-online.css', 'economy.css', 'tutorial.css', 'intro.css',
  'audioManager.js', 'bot.js', 'game-rules.js', 'app.js', 'tutorial.js',
  'supabase-config.js', 'supabase-client.js', 'economy.js', 'account.js',
  'supabase-online.js', 'intro.js', 'vendor/supabase.js', 'vendor/supabase-LICENSE'
];
const assetExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.mp3', '.wav', '.ogg', '.css']);

function copyAssetDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyAssetDirectory(source, target);
    else if (entry.isFile() && assetExtensions.has(path.extname(entry.name).toLowerCase())) fs.copyFileSync(source, target);
  }
}

async function build() {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output);
  for (const file of files) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  copyAssetDirectory(path.join(root, 'assets'), path.join(output, 'assets'));

  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('width=device-width, initial-scale=1.0', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
  html = html.replace('</head>', '  <link rel="stylesheet" href="app-shell.css" />\n  </head>');
  html = html.replace('</body>', '  <script src="app-shell.js"></script>\n  </body>');
  fs.writeFileSync(path.join(output, 'index.html'), html);
  fs.copyFileSync(path.join(root, 'android-app', 'app-shell.css'), path.join(output, 'app-shell.css'));

  // A versão Android não depende do Google Fonts para carregar offline.
  const stylesheet = path.join(output, 'styles.css');
  fs.writeFileSync(stylesheet, fs.readFileSync(stylesheet, 'utf8').replace(/^@import url\('https:\/\/fonts\.googleapis\.com\/[^\n]+\n/, ''));

  await esbuild.build({
    entryPoints: [path.join(root, 'android-app', 'app-shell.js')],
    outfile: path.join(output, 'app-shell.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    minify: true
  });
  console.log('Pacote Android criado em app-web/.');
}

build().catch(error => { console.error(error); process.exitCode = 1; });
