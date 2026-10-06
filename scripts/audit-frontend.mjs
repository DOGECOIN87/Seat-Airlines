import { execFileSync } from 'node:child_process';

const expiry = new Date('2027-01-31T23:59:59Z');
if (Date.now() > expiry.getTime()) {
  console.error(`Frontend audit exception expired on ${expiry.toISOString()}; review the Solana wallet dependency chain.`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' }));
} catch (error) {
  try { report = JSON.parse(error.stdout); } catch { throw error; }
}
const allowed = new Set(['uuid', 'jayson', '@solana/web3.js', 'helius-wallet-kit']);
const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
if (vulnerabilities.length === 0) {
  console.log('Frontend audit passed; no production dependency vulnerabilities reported.');
  process.exit(0);
}
const unexpected = vulnerabilities.filter(([name]) => !allowed.has(name));
if (unexpected.length) {
  console.error('Unexpected production dependency advisories:');
  for (const [name, value] of unexpected) console.error(`- ${name}: ${value.severity}`);
  process.exit(1);
}
const uuid = report.vulnerabilities?.uuid;
const advisory = uuid?.via?.find((item) => typeof item === 'object' && item.url === 'https://github.com/advisories/GHSA-w5hq-g745-h8pq');
if (!advisory || vulnerabilities.some(([name, value]) => name !== 'uuid' && value.severity !== 'moderate')) {
  console.error('The allowed dependency exception no longer matches the reviewed uuid advisory chain.');
  process.exit(1);
}
console.log(`Frontend audit passed; documented upstream exception: ${vulnerabilities.filter(([name]) => allowed.has(name)).map(([name]) => name).join(', ') || 'none'}. Review by ${expiry.toISOString()}.`);
