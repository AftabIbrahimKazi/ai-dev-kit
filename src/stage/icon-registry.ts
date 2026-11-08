import { Bot, FileCode, FileText, Folder, Keyboard, Library, Map as MapIcon, Puzzle, Server, ShieldCheck, Sparkles, Terminal, User, Webhook, Wrench, type LucideIcon } from "lucide-react";

export type IconName =
  | "user"
  | "bot"
  | "sparkles"
  | "shield"
  | "webhook"
  | "terminal"
  | "server"
  | "puzzle"
  | "library"
  | "fileText"
  | "fileCode"
  | "folder"
  | "keyboard"
  | "map"
  | "wrench";

export const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  user: User,
  bot: Bot,
  sparkles: Sparkles,
  shield: ShieldCheck,
  webhook: Webhook,
  terminal: Terminal,
  server: Server,
  puzzle: Puzzle,
  library: Library,
  fileText: FileText,
  fileCode: FileCode,
  folder: Folder,
  keyboard: Keyboard,
  map: MapIcon,
  wrench: Wrench,
};

export const ICON_NAMES = Object.keys(ICONS) as IconName[]; // keys of a Record<IconName, ...> literal are exactly IconName

export const ACTOR_ICONS: readonly IconName[] = ["user", "bot", "webhook", "wrench"];

export const MODULE_ICONS: Readonly<Record<string, IconName>> = {
  skills: "sparkles",
  commands: "terminal",
  mods: "webhook",
  "coding-standards": "shield",
  mcp: "server",
  "add-ons": "puzzle",
  libraries: "library",
};

const CODE_EXTENSIONS: readonly string[] = [".ts", ".js", ".json", ".mjs", ".cjs"];
const TEXT_EXTENSIONS: readonly string[] = [".md", ".txt"];

export function iconForNode(label: string): IconName {
  const lower = label.toLowerCase();
  if (CODE_EXTENSIONS.some((extension) => lower.endsWith(extension))) return "fileCode";
  if (TEXT_EXTENSIONS.some((extension) => lower.endsWith(extension))) return "fileText";
  return "folder";
}
