const fs = require('fs');
const path = require('path');

const MANIFEST_TYPE = process.env.MANIFEST_TYPE || 'chrome-mv3';

// Done with fs rather than `exec('mkdir -p … && rm -rf …')`, which is POSIX
// syntax: on Windows it is handed to cmd.exe, which fails with
// "Error occurred while processing: -p." The build then carries on and webpack
// simply overwrites into an uncleaned directory, so stale artefacts from a
// previous build survive - silently, because the error is only logged.
const target = path.resolve(
  __dirname,
  '..',
  MANIFEST_TYPE.endsWith('-mv2') ? 'dist-mv2' : 'dist'
);

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
