#!/usr/bin/env node
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const args = parseArgs(argv);

const homeDir = os.homedir();
const codexDir = args.codexHome
  ? path.resolve(args.codexHome)
  : process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(homeDir, ".codex");
const skillsDir = args.skillsDir
  ? path.resolve(args.skillsDir)
  : args.legacyAgentsDir
    ? path.join(homeDir, ".agents", "skills")
    : process.env.CODEX_SKILLS_DIR
      ? path.resolve(process.env.CODEX_SKILLS_DIR)
      : path.join(codexDir, "skills");
const skillTarget = path.join(skillsDir, "shimplify");
const skillSource = path.join(rootDir, "shimplify");
const agentsDir = path.join(codexDir, "agents");
const reviewAgents = [
  {
    name: "simplify-reuse",
    label: "Reuse",
    description: "Read-only shimplify reviewer that finds existing helpers, APIs, and patterns to reuse."
  },
  {
    name: "simplify-quality",
    label: "Quality",
    description: "Read-only shimplify reviewer that removes AI-shaped code noise and avoidable complexity."
  },
  {
    name: "simplify-efficiency",
    label: "Efficiency",
    description: "Read-only shimplify reviewer that catches wasted work, hot-path bloat, and timing risks."
  }
].map((agent) => ({
  ...agent,
  target: path.join(agentsDir, `${agent.name}.toml`),
  template: path.join(rootDir, "templates", "agents", `${agent.name}.toml`)
}));
const configPath = path.join(codexDir, "config.toml");
const completedSteps = [];

if (args.help) {
  printHelp();
  process.exit(0);
}

await assertPackageShape();
await installSkill();
await installReviewAgents();
await updateCodexConfig();
printSummary();

async function assertPackageShape() {
  if (!existsSync(path.join(skillSource, "SKILL.md"))) {
    throw new Error(`Missing bundled skill at ${skillSource}`);
  }
  for (const agent of reviewAgents) {
    if (!existsSync(agent.template)) {
      throw new Error(`Missing agent template at ${agent.template}`);
    }
  }
}

async function installSkill() {
  await mkdir(skillsDir, { recursive: true });
  await rm(skillTarget, { force: true, recursive: true });
  await copyDir(skillSource, skillTarget);
  completedSteps.push("shimplify skill installed");
}

async function installReviewAgents() {
  await mkdir(agentsDir, { recursive: true });
  for (const agent of reviewAgents) {
    await copyFile(agent.template, agent.target);
    completedSteps.push(`${agent.name} subagent installed`);
  }
}

async function updateCodexConfig() {
  await mkdir(codexDir, { recursive: true });

  let config = "";
  if (existsSync(configPath)) {
    config = await readFile(configPath, "utf8");
  }

  for (const agent of reviewAgents) {
    const agentBlock = [
      `[agents.${agent.name}]`,
      `description = ${JSON.stringify(agent.description)}`,
      `config_file = "agents/${agent.name}.toml"`,
      "",
      ""
    ].join("\n");
    config = replaceTomlTable(config, `agents.${agent.name}`, agentBlock);
  }

  await writeFile(configPath, ensureTrailingNewline(config), "utf8");
  completedSteps.push("Codex config updated");
  for (const agent of reviewAgents) {
    completedSteps.push(`Added [agents.${agent.name}]`);
  }
}

function replaceTomlTable(input, tableName, replacement) {
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tableRegex = new RegExp(`(^|\\n)\\[${escaped}\\]\\s*\\n`, "m");
  const match = tableRegex.exec(input);

  if (!match) {
    const trimmed = input.trimEnd();
    return `${trimmed}${trimmed ? "\n\n" : ""}${replacement}`;
  }

  const tableStart = match.index + match[1].length;
  const restStart = tableStart + match[0].length - match[1].length;
  const nextTableRegex = /\n\[[^\n]+\]\s*\n/g;
  nextTableRegex.lastIndex = restStart;
  const nextMatch = nextTableRegex.exec(input);
  const tableEnd = nextMatch ? nextMatch.index + 1 : input.length;

  return `${input.slice(0, tableStart)}${replacement}${input.slice(tableEnd)}`;
}

async function copyDir(source, target) {
  await mkdir(target, { recursive: true });

  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") {
      continue;
    }

    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function parseArgs(values) {
  const parsed = {
    codexHome: undefined,
    help: false,
    legacyAgentsDir: false,
    skillsDir: undefined
  };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--help" || value === "-h") {
      parsed.help = true;
    } else if (value === "--legacy-agents-dir") {
      parsed.legacyAgentsDir = true;
    } else if (value === "--codex-home") {
      parsed.codexHome = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith("--codex-home=")) {
      parsed.codexHome = value.slice("--codex-home=".length);
    } else if (value === "--skills-dir") {
      parsed.skillsDir = requireValue(values, index, value);
      index += 1;
    } else if (value.startsWith("--skills-dir=")) {
      parsed.skillsDir = value.slice("--skills-dir=".length);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
  }

  return parsed;
}

function requireValue(values, index, flag) {
  const value = values[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function printSummary() {
  const rows = [
    { kind: "title", text: "shimplify" },
    { kind: "muted", text: "Codex skill installer" },
    { kind: "blank" },
    { kind: "section", text: "Targets" },
    { kind: "item", label: "Skill", value: skillTarget },
    ...reviewAgents.map((agent) => ({ kind: "item", label: agent.label, value: agent.target })),
    { kind: "item", label: "Config", value: configPath },
    { kind: "blank" },
    { kind: "section", text: "Installing" },
    ...completedSteps.map((text) => ({ kind: "check", text })),
    { kind: "blank" },
    { kind: "done", text: "Done" }
  ];

  const plainRows = rows.map(formatPlainRow);
  const contentWidth = Math.max(44, ...plainRows.map((line) => line.length));
  const terminalWidth = process.stdout.columns || 96;
  const panelWidth = Math.min(Math.max(contentWidth + 4, 60), Math.max(60, terminalWidth - 4));
  const innerWidth = panelWidth - 2;

  console.log("");
  printPanelLine(`╭${"─".repeat(innerWidth)}╮`, panelWidth);
  for (const row of rows) {
    if (row.kind === "blank") {
      printPanelLine(`│${" ".repeat(innerWidth)}│`, panelWidth);
      continue;
    }

    const content = formatStyledRow(row, innerWidth - 2);
    printPanelLine(`│ ${content}${" ".repeat(Math.max(0, innerWidth - 2 - visibleLength(stripAnsi(content))))} │`, panelWidth);
  }
  printPanelLine(`╰${"─".repeat(innerWidth)}╯`, panelWidth);
  console.log("");
}

function formatPlainRow(row) {
  if (row.kind === "blank") {
    return "";
  }
  if (row.kind === "item") {
    return `  ${row.label.padEnd(10)} → ${row.value}`;
  }
  if (row.kind === "check") {
    return `  ✓ ${row.text}`;
  }
  return row.text;
}

function formatStyledRow(row, width) {
  if (row.kind === "title") {
    return `${style("bold")}${fit(row.text, width)}${style("reset")}`;
  }
  if (row.kind === "muted") {
    return `${style("muted")}${fit(row.text, width)}${style("reset")}`;
  }
  if (row.kind === "section") {
    return `${style("accent")}${fit(row.text, width)}${style("reset")}`;
  }
  if (row.kind === "item") {
    const label = row.label.padEnd(10);
    return `  ${style("muted")}${label}${style("reset")} ${style("accent")}→${style("reset")} ${fit(row.value, width - 15)}`;
  }
  if (row.kind === "check") {
    return `  ${style("success")}✓${style("reset")} ${fit(row.text, width - 4)}`;
  }
  if (row.kind === "done") {
    return `${style("success")}${fit(row.text, width)}${style("reset")}`;
  }
  return fit(row.text, width);
}

function printPanelLine(line, width) {
  if (useColor()) {
    console.log(line);
  } else {
    console.log(line.padEnd(width));
  }
}

function fit(value, width) {
  if (visibleLength(value) <= width) {
    return value;
  }
  if (width <= 1) {
    return "…";
  }
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function visibleLength(value) {
  return stripAnsi(value).length;
}

function stripAnsi(value) {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}

function useColor() {
  return process.env.NO_COLOR !== "1" && process.env.TERM !== "dumb";
}

function style(name) {
  if (!useColor()) {
    return "";
  }

  const styles = {
    accent: "\x1b[38;5;81m",
    bold: "\x1b[1m\x1b[38;5;231m",
    muted: "\x1b[38;5;145m",
    reset: "\x1b[0m",
    success: "\x1b[38;5;120m"
  };
  return styles[name] || "";
}

function printHelp() {
  console.log(`
Install the shimplify skill and three GPT-5.5 xhigh review subagents for Codex.

Usage:
  npx -y shimplify
  npx -y github:kirillshsh/shimplify
  shimplify --codex-home ~/.codex

Environment:
  CODEX_HOME        Defaults to ~/.codex
  CODEX_SKILLS_DIR  Defaults to $CODEX_HOME/skills

Options:
  --codex-home <path>       Override Codex config directory
  --skills-dir <path>       Override skill install directory
  --legacy-agents-dir       Install skill to ~/.agents/skills instead
  -h, --help                Show this help
`);
}
