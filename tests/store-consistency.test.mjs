import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

// Eventually-consistent reads made fresh sessions unreadable right after login and let
// read-modify-write updates overwrite recent data, so every store must read strongly.
test("every Netlify Blobs store is opened with strong consistency", async () => {
  const files = [];
  for (const dir of ["netlify/functions", "netlify/lib"]) {
    for (const name of await readdir(new URL(`../${dir}/`, import.meta.url))) {
      if (name.endsWith(".mjs")) files.push(`${dir}/${name}`);
    }
  }
  const calls = [];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/getStore\(([^)]*)\)/g)) calls.push({ file, args: match[1] });
  }
  assert.ok(calls.length >= 4);
  for (const { file, args } of calls) {
    assert.match(args, /consistency:\s*"strong"/, `${file} opens a store without strong consistency: getStore(${args})`);
  }
});
