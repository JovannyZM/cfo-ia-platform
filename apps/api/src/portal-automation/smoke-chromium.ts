import { runChromiumSmokeTest } from './playwright-browser.provider';

async function main(): Promise<void> {
  const result = await runChromiumSmokeTest();
  process.exitCode = result.launched && result.closed ? 0 : 1;
  console.log(JSON.stringify(result));
}

void main();
