import { spawn } from 'node:child_process';

/**
 * @typedef {object} RunOptions
 * @property {string} [cwd]
 * @property {Record<string, string | undefined>} [env]
 * @property {number} [timeout] milliseconds
 * @property {AbortSignal} [signal]
 * @property {string | Buffer} [input] written to stdin
 * @property {(line: string) => void} [onLine] called for each stdout/stderr line
 * @property {boolean} [binary] resolve stdout as a Buffer
 * @property {boolean} [shell] run through the platform shell (needed for .cmd launchers on Windows)
 */

/**
 * Runs a program without a shell and resolves its output. Rejects with the tail of
 * stderr when it exits non-zero, so callers can surface a useful message.
 * @param {string} command
 * @param {string[]} args
 * @param {RunOptions} [options]
 * @returns {Promise<{ stdout: string, stderr: string, buffer: Buffer, code: number }>}
 */
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const quote = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a);
    const child = options.shell
      ? spawn([command, ...args].map(quote).join(' '), {
          cwd: options.cwd,
          env: options.env ? { ...process.env, ...options.env } : process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          shell: true,
        })
      : spawn(command, args, {
          cwd: options.cwd,
          env: options.env ? { ...process.env, ...options.env } : process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
    /** @type {Buffer[]} */
    const out = [];
    /** @type {Buffer[]} */
    const err = [];
    let partial = '';
    const lines = (chunk) => {
      if (!options.onLine) return;
      partial += String(chunk);
      const parts = partial.split(/\r?\n|\r/);
      partial = parts.pop() || '';
      for (const line of parts) if (line.trim()) options.onLine(line);
    };
    child.stdout.on('data', (d) => {
      out.push(d);
      lines(d);
    });
    child.stderr.on('data', (d) => {
      err.push(d);
      lines(d);
    });
    let timer;
    const kill = (reason) => {
      child.kill();
      reject(reason);
    };
    if (options.timeout)
      timer = setTimeout(
        () => kill(new Error(`${command} timed out after ${Math.round((options.timeout || 0) / 1000)} s`)),
        options.timeout,
      );
    const onAbort = () => kill(options.signal?.reason || new Error('Aborted'));
    options.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
          ? new Error(`${command} was not found. Is it installed and on PATH?`)
          : error,
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (partial.trim()) options.onLine?.(partial);
      const buffer = Buffer.concat(out);
      const stdout = options.binary ? '' : buffer.toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code === 0) resolve({ stdout, stderr, buffer, code });
      else {
        const detail = (stderr.trim() || stdout.trim()).split(/\r?\n/).slice(-12).join('\n');
        const error = new Error(`${command} exited with ${code}${detail ? `:\n${detail}` : ''}`);
        Object.assign(error, { stdout, stderr, code });
        reject(error);
      }
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    else child.stdin.end();
  });
}

/**
 * Starts a long-running program that reads from stdin (for example FFmpeg reading an image pipe).
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string | undefined> }} [options]
 */
export function pipeTo(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true,
  });
  /** @type {string[]} */
  const err = [];
  child.stderr.on('data', (d) => {
    err.push(String(d));
    if (err.length > 60) err.shift();
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(undefined) : reject(new Error(`${command} exited with ${code}: ${err.join('').slice(-1200)}`)),
    );
  });
  return {
    /** Writes one chunk, honouring backpressure. @param {Buffer} data */
    write(data) {
      return new Promise((resolve, reject) => {
        child.stdin.write(data, (error) => (error ? reject(error) : resolve(undefined)));
      });
    },
    /** Closes stdin and waits for the program to finish. */
    async end() {
      child.stdin.end();
      await done;
    },
    kill: () => child.kill(),
  };
}

/** Runs async jobs with at most `limit` in flight; results keep input order. */
/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} job
 * @returns {Promise<R[]>}
 */
export async function pool(items, limit, job) {
  /** @type {R[]} */
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await job(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
