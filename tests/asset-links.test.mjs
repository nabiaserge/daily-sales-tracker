import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Android autofill only offers the site's saved credentials inside the app when both sides
// declare the link: the app's asset_statements and the site's assetlinks.json.
test("the site publishes Digital Asset Links for the Android app", async () => {
  const statements = JSON.parse(await read(".well-known/assetlinks.json"));
  const gradle = await read("android/app/build.gradle");
  const applicationId = gradle.match(/applicationId '([^']+)'/)[1];
  const app = statements.find((statement) => statement.target?.namespace === "android_app");
  assert.ok(app, "an android_app statement is required");
  assert.equal(app.target.package_name, applicationId);
  assert.ok(app.relation.includes("delegate_permission/common.get_login_creds"));
  assert.ok(app.target.sha256_cert_fingerprints.length >= 1);
  for (const fingerprint of app.target.sha256_cert_fingerprints) {
    assert.match(fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  }
});

test("the Android app declares the site it belongs to", async () => {
  const manifest = await read("android/app/src/main/AndroidManifest.xml");
  const strings = await read("android/app/src/main/res/values/strings.xml");
  const activity = await read("android/app/src/main/java/com/nabia/suiviventes/MainActivity.java");
  const site = activity.match(/APP_URL = "(https:\/\/[^/]+)\//)[1];
  assert.match(manifest, /android:name="asset_statements"\s+android:resource="@string\/asset_statements"/);
  assert.ok(strings.includes(`${site}/.well-known/assetlinks.json`));
});

test("the Netlify build publishes assetlinks.json as JSON", async () => {
  const config = await read("netlify.toml");
  assert.match(config, /cp \.well-known\/assetlinks\.json dist\/\.well-known\//);
  assert.match(config, /for = "\/\.well-known\/assetlinks\.json"[\s\S]*?Content-Type = "application\/json"/);
});
