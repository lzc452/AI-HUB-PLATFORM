import { access, readFile } from "node:fs/promises";

const readme = await readFile("README.md", "utf8");
const links = [...readme.matchAll(/\]\(([^)]+\.md)\)/g)].map(
  (match) => match[1],
);
const failures = [];

for (const link of links) {
  try {
    await access(link);
  } catch {
    failures.push(link);
  }
}

if (failures.length > 0) {
  throw new Error(`Broken Markdown links: ${failures.join(", ")}`);
}
