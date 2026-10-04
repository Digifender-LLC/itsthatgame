#!/usr/bin/env node
// SEC-1 / ADR-0003: fail if any installed package is an ad, attribution, or tracking SDK.
// Scans the pnpm lockfile so transitive dependencies are covered too.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DENY = [
  /^@capacitor-community\/admob$/,
  /google-mobile-ads/,
  /^@react-native-firebase\/analytics$/,
  /^@firebase\/analytics/,
  /appsflyer/,
  /^(react-native-)?adjust(-sdk)?$/,
  /^@adjustcom\//,
  /^branch-sdk$/,
  /^react-native-branch$/,
  /applovin/,
  /ironsource/,
  /unity-ads/,
  /^facebook-.*sdk/,
  /^react-native-fbsdk/,
  /^mixpanel/,
  /^@amplitude\//,
  /^amplitude/,
  /^@segment\//,
];

export function findDenied(names) {
  return [...new Set(names)].filter((n) => DENY.some((re) => re.test(n))).sort();
}

export function packageNamesFromLockfile(text) {
  const names = [];
  // Matches keys such as "  /name@1.2.3:", "  name@1.2.3:", "  '@scope/name@1.2.3':"
  for (const m of text.matchAll(/^\s{2}'?\/?((?:@[^/@\s']+\/)?[^@\s':]+)@[^:\s]*'?:\s*$/gm)) {
    names.push(m[1]);
  }
  return names;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let lock;
  try {
    lock = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
  } catch {
    console.error("check_deps: pnpm-lock.yaml not found");
    process.exit(1);
  }
  const names = packageNamesFromLockfile(lock);
  const bad = findDenied(names);
  if (bad.length) {
    console.error(`check_deps: denylisted ad/tracking packages found (SEC-1): ${bad.join(", ")}`);
    process.exit(1);
  }
  console.log(`check_deps: OK (${new Set(names).size} packages scanned)`);
}
