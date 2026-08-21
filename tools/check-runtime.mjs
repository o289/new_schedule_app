import process from "node:process";

const expectedNode = "v22.23.1";
const expectedPnpm = "11.20.0";
const errors = [];

if (process.version !== expectedNode) {
  errors.push(
    `Node.js ${expectedNode} is required; received ${process.version}`,
  );
}

const userAgent = process.env.npm_config_user_agent;
if (userAgent?.startsWith("pnpm/")) {
  const actualPnpm = userAgent.slice("pnpm/".length).split(" ")[0];
  if (actualPnpm !== expectedPnpm) {
    errors.push(`pnpm ${expectedPnpm} is required; received ${actualPnpm}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`Runtime OK: Node.js ${process.version}, pnpm ${expectedPnpm}`);
